"use client";

/* =====================================================================
   ผลการดำเนินงาน เก็บใน Supabase

   ตาราง (ดู supabase/schema.sql):
     kpi_results      no, actual
     project_results  uid, code, status, progress, note, output_result, output_issue,
                      outcome_result, outcome_issue
     monthly_reports  uid, month, output, outcome, issue, solution, spend
     budget_entries   id, uid, month, occurred_on, note, perdiem, lodging, travel, fuel, other, saved
     risk_reports     uid, month, level, situation, action

   คีย์ของโครงการใช้ uid = code + "#" + ลำดับแถว ไม่ใช่ code เปล่า ๆ
   เพราะไฟล์แผนมีรหัสซ้ำ 9 รหัส ถ้าใช้ code สองโครงการที่ชนกันจะเขียนทับกัน

   **ยอดเบิกจ่ายรายเดือนเป็นค่าที่คำนวณมา ไม่ใช่ค่าที่กรอกมือ**
   มาจากผลรวมของ budget_entries ในเดือนนั้น เพื่อให้รายงานงบประมาณโครงการ
   กับรายงานผลการดำเนินงานรายเดือนเป็นตัวเลขเดียวกันเสมอ
   คอลัมน์ monthly_reports.spend ยังอยู่เพื่อไม่ให้ยอดที่เคยกรอกมือไว้หาย
   จะถูกใช้ก็ต่อเมื่อเดือนนั้นไม่มีรายการงบประมาณเลย

   การเขียนกลับเป็นแบบ optimistic: อัปเดตหน้าจอทันที แล้วค่อยส่งขึ้น Supabase
   แบบหน่วงเวลา เพื่อไม่ให้ยิง request ทุกตัวอักษรที่พิมพ์
   ===================================================================== */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { currentFiscalMonth, MONTHS as MONTH_NAMES, applyPlanEdits } from "@/lib/plan";
/* rebuildRollups ต้องเรียกคู่กับ applyPlanEdits เสมอ — แยกกันเพราะ
   lib/plan.js import lib/rollup.js กลับไม่ได้ (จะเป็น import วงกลม) */
import { rebuildRollups } from "@/lib/rollup";
import { toNum } from "@/lib/format";

const ASOF_KEY = "raot-plan-2570/asof";
const FLUSH_MS = 800;

const emptyResults = () => ({ kpi: {}, project: {} });

/* ---------- ตัวช่วยที่ใช้ทั้งหน้าแจ้งเตือนและหน้ากรอกผล ----------
   แต่ละเดือนเก็บ
     o        ผลผลิต (Output)
     r        ผลลัพธ์ (Outcome) — ใช้เฉพาะโครงการที่ไม่มีกิจกรรมย่อย
     issue    ปัญหาอุปสรรค
     solution วิธีการแก้ปัญหา
     s        เบิกจ่าย (คำนวณจากรายการงบประมาณ ไม่ได้กรอกที่นี่) */
const REPORT_FIELDS = ["o", "r", "issue", "solution", "s"];

export function hasReport(e) {
  if (!e) return false;
  return REPORT_FIELDS.some((k) => e[k] != null && e[k] !== "");
}

export function monthlyOf(results, uid) {
  return ((results.project || {})[uid] || {}).monthly || {};
}

export function reportedMonths(results, uid) {
  const m = monthlyOf(results, uid);
  let n = 0;
  for (let i = 0; i < 12; i++) if (hasReport(m[i])) n++;
  return n;
}

export function spentTotal(results, uid) {
  const m = monthlyOf(results, uid);
  let sum = 0;
  for (let i = 0; i < 12; i++) if (m[i]) sum += toNum(m[i].s);
  return sum;
}

/* เบิกจ่ายสะสมถึงเดือนที่กำหนด (รวมเดือนนั้น) */
export function spentThrough(results, uid, month) {
  const m = monthlyOf(results, uid);
  let sum = 0;
  for (let i = 0; i <= month && i < 12; i++) if (m[i]) sum += toNum(m[i].s);
  return sum;
}

export function projectTrack(results, uid) {
  return (results.project || {})[uid] || {};
}

export function kpiActual(results, no) {
  return ((results.kpi || {})[no] || {}).actual;
}

/* ---------- รายการงบประมาณ ----------
   "อื่น ๆ" เป็นถังรวมของค่าใช้จ่ายที่ไม่เข้าสี่หมวดแรก
   (ค่าอาหาร ค่าลงทะเบียน ค่าวิทยากร ค่าอุปกรณ์ ค่าปัจจัยการผลิต ฯลฯ)
   ไม่แตกเป็นหมวดละคอลัมน์ เพราะรายการพวกนี้ไม่ได้มีทุกโครงการ
   แตกไปก็จะเป็นตารางที่ว่างเป็นส่วนใหญ่ ให้เขียนรายละเอียดในช่อง note แทน */
export const COST_FIELDS = [
  { key: "perdiem", label: "ค่าเบี้ยเลี้ยง" },
  { key: "lodging", label: "ค่าที่พัก" },
  { key: "travel", label: "ค่าเดินทาง" },
  { key: "fuel", label: "ค่าน้ำมันเชื้อเพลิง" },
  { key: "other", label: "ค่าใช้จ่ายอื่น ๆ", hint: "ค่าอาหาร ค่าลงทะเบียน ค่าวิทยากร ค่าอุปกรณ์ ค่าปัจจัยการผลิต" },
];

export function entryTotal(e) {
  if (!e) return 0;
  return COST_FIELDS.reduce((a, c) => a + toNum(e[c.key]), 0);
}

export function entriesOf(budget, uid, month) {
  const list = (budget || {})[uid] || [];
  return month == null ? list : list.filter((e) => Number(e.month) === Number(month));
}

export function entriesTotal(list) {
  return (list || []).reduce((a, e) => a + entryTotal(e), 0);
}

/* ยอดแยกตามหมวดค่าใช้จ่ายทุกหมวด ของรายการชุดหนึ่ง */
export function entriesByCost(list) {
  const sums = {};
  COST_FIELDS.forEach((c) => (sums[c.key] = 0));
  (list || []).forEach((e) => COST_FIELDS.forEach((c) => (sums[c.key] += toNum(e[c.key]))));
  return sums;
}

/* ---------------------------------------------------------------------
   รวมยอดงบของโครงการ = รายการของตัวเอง + รายการของกิจกรรมลูกทุกชั้น

   ต่างจากงบ "ตามแผน" ที่ห้ามบวกข้ามระดับ (งบกิจกรรมรวมอยู่ในงบโครงการแม่แล้ว)
   ส่วนงบ "ที่ใช้จริง" เป็นสิ่งที่ผู้ใช้กรอกเอง จะกรอกที่ระดับไหนก็ได้
   จึงต้องบวกทุกระดับ ไม่งั้นเงินที่กรอกไว้ที่กิจกรรมจะหายไปจากยอดโครงการ

   ข้อควรระวัง: อย่ากรอกยอดเดียวกันทั้งที่โครงการและที่กิจกรรม จะกลายเป็นนับซ้ำ
   --------------------------------------------------------------------- */
export function budgetRollup(budget, item, month) {
  const own = entriesOf(budget, item.uid, month);
  const byActivity = [];

  function walk(node) {
    (node._kids || []).forEach((k) => {
      const list = entriesOf(budget, k.uid, month);
      if (list.length) byActivity.push({ item: k, list, total: entriesTotal(list) });
      walk(k);
    });
  }
  walk(item);

  const ownTotal = entriesTotal(own);
  const kidsTotal = byActivity.reduce((a, x) => a + x.total, 0);

  return {
    own,
    ownTotal,
    byActivity,
    kidsTotal,
    total: ownTotal + kidsTotal,
    count: own.length + byActivity.reduce((a, x) => a + x.list.length, 0),
  };
}

/* ---------------------------------------------------------------------
   ขั้นตอนการดำเนินงาน — แผน/ผลรายเดือน และความคืบหน้าที่คำนวณจากสองอย่างนั้น

   แถวจากฐานข้อมูลผ่าน normStep ก่อนเสมอ ให้ plan/actual เป็นอาร์เรย์ 12 ช่อง
   ของข้อความ ไม่ใช่ null หรืออาร์เรย์สั้น ๆ ที่ค้างมาจากแถวเก่า
   ไม่งั้นโค้ดที่อ่าน plan[i] ตรง ๆ จะเจอ undefined แล้วช่องกรอกเปลี่ยน
   จาก uncontrolled เป็น controlled กลางทาง (React เตือนและเคอร์เซอร์กระโดด)
   --------------------------------------------------------------------- */
function arr12(v) {
  const src = Array.isArray(v) ? v : [];
  const out = [];
  for (let i = 0; i < 12; i++) out.push(src[i] == null ? "" : String(src[i]));
  return out;
}

function normStep(row) {
  return {
    id: row.id,
    uid: row.uid,
    ord: Number(row.ord) || 0,
    name: row.name || "",
    target: row.target == null ? "" : String(row.target),
    unit: row.unit || "",
    plan: arr12(row.plan),
    actual: arr12(row.actual),
  };
}

export function stepsOf(steps, uid) {
  return ((steps || {})[uid] || []).slice().sort((a, b) => a.ord - b.ord);
}

/* ---------------------------------------------------------------------
   ความคืบหน้าของขั้นตอนหนึ่ง

     total    ฐานที่ใช้หาร = ค่าเป้าหมายถ้าเป็นตัวเลข ไม่งั้นใช้ผลรวมแผน 12 เดือน
              (บางขั้นเขียนเป้าหมายเป็นคำ เช่น "1 ครั้ง" จึงต้องมีทางถอย)
     planPct  แผนถึงเดือน upto คิดเป็นกี่ % ของทั้งหมด = ควรไปถึงไหนแล้ว
     donePct  ผลที่ทำได้ถึงเดือน upto คิดเป็นกี่ % = ไปถึงไหนแล้วจริง
     gap      donePct - planPct  บวก = เร็วกว่าแผน  ลบ = ช้ากว่าแผน

   ตัดที่ 100% — ทำเกินเป้าไม่ได้ทำให้ขั้นอื่นเสร็จเร็วขึ้น
   ถ้าไม่ตัด ขั้นเดียวที่ทำเกินจะดึงค่าเฉลี่ยทั้งโครงการขึ้นจนดูเหมือนเสร็จแล้ว
   --------------------------------------------------------------------- */
export function stepProgress(step, upto) {
  const plan = step.plan || [];
  const actual = step.actual || [];
  const last = upto == null ? 11 : Math.max(0, Math.min(11, upto));

  let planAll = 0;
  let planTo = 0;
  let doneTo = 0;
  for (let i = 0; i < 12; i++) {
    const p = toNum(plan[i]);
    planAll += p;
    if (i <= last) {
      planTo += p;
      doneTo += toNum(actual[i]);
    }
  }

  const t = toNum(step.target);
  const total = t > 0 ? t : planAll;
  if (!total) return { total: 0, planPct: null, donePct: null, gap: null };

  const planPct = Math.min(100, (planTo / total) * 100);
  const donePct = Math.min(100, (doneTo / total) * 100);
  return { total, planPct, donePct, gap: donePct - planPct };
}

/* ความคืบหน้าทั้งโครงการ = ค่าเฉลี่ยของทุกขั้นที่คำนวณได้
   ถ่วงเท่ากันทุกขั้น ไม่ถ่วงตามค่าเป้าหมาย เพราะหน่วยนับของแต่ละขั้นต่างกัน
   (ขั้นหนึ่งนับเป็น "ราย" อีกขั้นนับเป็น "ครั้ง") เอามาบวกกันตรง ๆ ไม่ได้ */
export function stepsProgress(list, upto) {
  const each = (list || []).map((s) => stepProgress(s, upto)).filter((p) => p.donePct != null);
  if (!each.length) return { count: 0, planPct: null, donePct: null, gap: null };
  const avg = (k) => each.reduce((a, p) => a + p[k], 0) / each.length;
  const planPct = avg("planPct");
  const donePct = avg("donePct");
  return { count: each.length, planPct, donePct, gap: donePct - planPct };
}

/* ---------- รายงานความเสี่ยงรายเดือน ---------- */
export function riskOf(risk, uid) {
  return (risk || {})[uid] || {};
}

export function riskAt(risk, uid, month) {
  return riskOf(risk, uid)[month] || null;
}

/* ---------------------------------------------------------------------
   ผูกยอดเบิกจ่ายที่คำนวณจากรายการงบประมาณ กลับเข้าไปในผลรายเดือน
   ทำให้โค้ดเดิมทั้งหมด (spentThrough, กลไกแจ้งเตือน) ใช้ต่อได้โดยไม่ต้องแก้
   --------------------------------------------------------------------- */
function applyBudget(results, budget) {
  const next = { kpi: results.kpi, project: {} };

  const uids = new Set([
    ...Object.keys(results.project || {}),
    ...Object.keys(budget || {}),
  ]);

  uids.forEach((uid) => {
    const p = (results.project || {})[uid] || {};
    const monthly = {};

    for (let i = 0; i < 12; i++) {
      const src = (p.monthly || {})[i];
      const list = entriesOf(budget, uid, i);
      const hasEntries = list.length > 0;
      const derived = hasEntries ? entriesTotal(list) : null;

      if (!src && !hasEntries) continue;

      monthly[i] = {
        o: src ? src.o : "",
        r: src ? src.r : "",
        issue: src ? src.issue : "",
        solution: src ? src.solution : "",
        // มีรายการงบประมาณเมื่อไหร่ ให้ถือยอดที่คำนวณเป็นหลักเสมอ
        s: hasEntries ? String(derived) : src && src.sManual != null ? src.sManual : "",
        sManual: src ? src.sManual : null,
        fromEntries: hasEntries,
      };
    }

    next.project[uid] = { ...p, monthly };
  });

  return next;
}

/* ---------------------------------------------------------------------
   แปลข้อความ error ของ Postgres ให้บอกวิธีแก้ตรงจุด

   สองอาการนี้หน้าตาคล้ายกันแต่คนละสาเหตุ และแก้คนละที่:
   - permission denied  = role authenticated ไม่มีสิทธิ์ระดับตาราง (ขาด GRANT)
                          RLS ยังไม่ทันทำงานด้วยซ้ำ
   - RLS ไม่ผ่าน        = ได้ผลลัพธ์ว่าง 0 แถว ไม่ใช่ error
   --------------------------------------------------------------------- */
/* error ที่มักหายเองถ้าขอ token ใหม่ — ใช้ตัดสินใจว่าจะ refreshSession แล้วลองซ้ำไหม */
export function isAuthError(err) {
  const msg = (err && err.message ? err.message : String(err)) || "";
  return /JWT|issued at future|used before issued|not yet valid|token|expired|PGRST301|invalid claim/i.test(
    msg
  );
}

export function explainError(err) {
  const msg = err && err.message ? err.message : String(err);

  if (/permission denied/i.test(msg)) {
    return (
      msg +
      " — สาเหตุคือ role authenticated ยังไม่มีสิทธิ์ระดับตาราง (GRANT) ไม่ใช่เรื่อง RLS " +
      "ให้เปิด Supabase > SQL Editor แล้วรัน supabase/schema.sql ทั้งไฟล์อีกครั้ง " +
      "(ส่วนท้ายไฟล์มีคำสั่ง grant อยู่)"
    );
  }

  /* ขาดคอลัมน์ กับ ขาดตาราง แก้คนละแบบ จึงต้องแยกข้อความ
     ถ้าเหมารวมว่า "ยังไม่มีตารางนี้" ทั้งที่ตารางมีแล้ว จะพาไปหาผิดที่
     ต้องเช็คก่อน does not exist ทั่วไป เพราะข้อความคอลัมน์ก็มีคำนั้นอยู่ */
  const missingColumn = msg.match(/column ([\w.]+) does not exist/i);
  if (missingColumn || /Could not find the '.+' column/i.test(msg)) {
    const col = missingColumn ? missingColumn[1] : (msg.match(/'(.+?)' column/i) || [])[1];
    return (
      "โครงสร้างฐานข้อมูลยังไม่ตรงกับเว็บ — ไม่พบคอลัมน์ " + (col || "ที่ต้องการ") +
      " (ตารางมีแล้วแต่ยังขาดคอลัมน์) ให้รัน supabase/schema.sql ทั้งไฟล์ใน SQL Editor " +
      "แล้วสั่ง notify pgrst, 'reload schema'; ปิดท้าย เพื่อให้ Supabase โหลดโครงสร้างใหม่"
    );
  }

  if (/does not exist|schema cache|Could not find the table/i.test(msg)) {
    return (
      msg + " — ยังไม่มีตารางนี้ในฐานข้อมูล ให้รัน supabase/schema.sql ใน SQL Editor ให้ครบทั้งไฟล์"
    );
  }

  /* iat ของ token อยู่หลังเวลาปัจจุบันของฝั่งที่ตรวจ = นาฬิกาสองฝั่งไม่ตรงกัน
     ไม่ใช่เซสชันหมดอายุ บอกให้ตรงจะได้ไม่ไปแก้ผิดที่ */
  if (/issued at future|used before issued|not yet valid|nbf/i.test(msg)) {
    return (
      "นาฬิกาของเครื่องไม่ตรงกับเซิร์ฟเวอร์ ทำให้ token ใช้ไม่ได้ (" + msg + ") — " +
      "ให้ตั้งเวลาเครื่องเป็นอัตโนมัติ (Windows: Settings > Time & language > Date & time " +
      "แล้วกด Sync now) จากนั้นกดปุ่มด้านล่างเพื่อเข้าสู่ระบบใหม่"
    );
  }

  if (/JWT|not authenticated|invalid claim|token/i.test(msg)) {
    return "เซสชันหมดอายุหรือใช้ไม่ได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง (" + msg + ")";
  }

  return msg;
}

/* =====================================================================
   React context
   ===================================================================== */
const Ctx = createContext(null);

export function ResultsProvider({ children }) {
  const [raw, setRaw] = useState(emptyResults);      // ตามที่อยู่ในตาราง ยังไม่ผูกงบ
  const [budget, setBudget] = useState({});          // budget[uid] = [entry, ...]
  const [risk, setRiskState] = useState({});              // risk[uid][month] = { level, situation, action }
  /* submit[uid][month] = true เมื่อกด "ส่งข้อมูลงบประมาณ" ของเดือนนั้นแล้ว
     ปิดการเพิ่ม/แก้รายการของเดือนนั้น และเป็นเงื่อนไขให้รายงานผลโครงการได้ */
  const [submit, setSubmitState] = useState({});
  const [hasSubmitTable, setHasSubmitTable] = useState(true);

  /* ---------- ถังการแก้ไขข้อมูล ----------
     planEdits   ทุกแถวในถัง ทั้งร่างและที่อนุมัติแล้ว (ใช้แสดงประวัติ)
     planVersion นับขึ้นทีละหนึ่งทุกครั้งที่แผนถูกทับใหม่

     ต้องมี planVersion เพราะ ITEMS/PROJECTS เป็นตัวแปรระดับโมดูล
     ไม่ใช่ state ของ React — React จึงไม่รู้เองว่าต้องวาดใหม่
     ตัวเลขนี้ถูกใช้เป็น key ของ <main> ให้ทั้งหน้า remount
     ซึ่งล้าง useMemo(..., []) ที่จับค่าเก่าไว้ไปด้วยในตัว */
  const [planEdits, setPlanEdits] = useState([]);
  const [hasPlanEdits, setHasPlanEdits] = useState(true);
  const [planVersion, setPlanVersion] = useState(0);

  /* ขั้นตอนการดำเนินงาน — steps[uid] = [{ id, ord, name, target, unit, plan[12], actual[12] }]
     เรียงตาม ord เสมอ ตารางเพิ่มทีหลัง ฐานข้อมูลเก่าไม่มี = ตารางขึ้นแถบเตือนแทน */
  const [steps, setSteps] = useState({});
  const [hasStepsTable, setHasStepsTable] = useState(true);

  /* เปิด/ปิดการรายงานผล — ค่าเริ่มต้นเปิด ตรงกับ reporting_open() ในฐานข้อมูล
     ที่ถือว่า "ไม่มีแถว = เปิด" ระบบที่ยังไม่ได้รัน schema.sql จะได้ใช้ได้ตามเดิม */
  /* การเชื่อมโยง ESG/SDGs ที่บันทึกไว้ (uid -> แถวในตาราง project_esg)
     ข้อเสนอตั้งต้นอยู่ใน data/esg-sdg.json ไม่ได้เก็บที่นี่ */
  const [esg, setEsg] = useState({});
  const [hasEsgTable, setHasEsgTable] = useState(true);

  const [reportingOpen, setReportingOpenState] = useState(true);
  const [lastReset, setLastReset] = useState(null);
  const [hasSettings, setHasSettings] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedHint, setSavedHint] = useState("");
  const [userEmail, setUserEmail] = useState("");
  // ชื่อที่ตั้งไว้ใน profiles.full_name ใช้ทำตัวย่อบนแถบหัวเรื่อง
  const [userName, setUserName] = useState("");

  /* ---------------------------------------------------------------
     บทบาทและทะเบียนชื่อผู้ใช้

     role  — viewer / editor / admin จากตาราง profiles
     people — id ของผู้ใช้ → ชื่อที่เอาไปแสดงว่า "แก้ไขล่าสุดโดยใคร"
              (ตาราง auth.users ของ Supabase อ่านจากฝั่งเว็บไม่ได้
              จึงต้องมีสำเนาไว้ใน public.profiles)

     ฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุดจะไม่มีตาราง profiles
     กรณีนั้นถือว่าแก้ได้ทุกคนเหมือนเดิม ไม่ล็อกคนออกจากระบบตัวเอง
     --------------------------------------------------------------- */
  const [role, setRole] = useState(null);   // null = ยังไม่รู้
  const [people, setPeople] = useState({});
  const [hasRoles, setHasRoles] = useState(false);

  // ฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุดจะไม่มีคอลัมน์ saved
  // ปิดเฉพาะฟีเจอร์ล็อกรายการ ส่วนที่เหลือยังใช้ได้ตามปกติ
  const [budgetHasSaved, setBudgetHasSaved] = useState(true);
  // คอลัมน์ other เพิ่มมาทีหลัง saved อีกรอบหนึ่ง เช็คแยกกัน
  const [budgetHasOther, setBudgetHasOther] = useState(true);
  // คอลัมน์ org เพิ่มมาหลัง other อีกรอบ เช็คแยกกันเหมือนกัน
  const [budgetHasOrg, setBudgetHasOrg] = useState(true);
  // ฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุดจะไม่มี issue/solution
  const [monthlyHasIssue, setMonthlyHasIssue] = useState(true);
  const [hasIndicatorCols, setHasIndicatorCols] = useState(true);
  /* คอลัมน์รายงานผลรายข้อ (output_items/outcome_items) เพิ่มทีหลังอีกรอบ
     เช็คแยกจากสี่คอลัมน์เดิม ฐานข้อมูลที่มีของเดิมแต่ยังไม่มีอันนี้จะได้ใช้ของเดิมต่อได้ */
  const [hasKpiItemCols, setHasKpiItemCols] = useState(true);
  const hasSavedRef = useRef(true);
  hasSavedRef.current = budgetHasSaved;
  const hasOtherRef = useRef(true);
  hasOtherRef.current = budgetHasOther;
  const hasOrgRef = useRef(true);
  hasOrgRef.current = budgetHasOrg;

  /* ------------------------------------------------------------------
     ด่านฝั่งหน้าเว็บ ไม่ให้ผู้ดูอย่างเดียวยิงคำขอที่รู้อยู่แล้วว่า RLS จะปฏิเสธ

     ⚠️ **นี่ไม่ใช่ความปลอดภัย** anon key เป็นของสาธารณะ ใครก็ยิง API ตรงได้
     ด่านจริงคือ RLS ในฐานข้อมูล (supabase/schema.sql) ตรงนี้มีไว้เพื่อให้
     ผู้ใช้เห็นข้อความที่เข้าใจได้ แทนที่จะเจอ error ดิบ ๆ จาก Postgres

     ใช้ ref เพราะฟังก์ชันใน useMemo อ่านค่าตอนถูกเรียก ไม่ใช่ตอนถูกสร้าง
     ------------------------------------------------------------------ */
  const canEditRef = useRef(false);
  canEditRef.current = role === "editor" || role === "admin";

  function denyReadOnly() {
    if (canEditRef.current) return false;
    setSaveError(
      "บัญชีนี้เข้าใช้งานแบบดูอย่างเดียว จึงแก้ไขข้อมูลไม่ได้ — " +
        "ให้ผู้ดูแลระบบเปิดสิทธิ์ “ผู้กรอกข้อมูล” ให้ก่อน"
    );
    return true;
  }

  /* ด่านของการ "รายงานผล" โดยเฉพาะ — ต้องผ่าน denyReadOnly ก่อน
     แล้วถ้าปิดการรายงานผลอยู่ เฉพาะผู้ดูแลที่ยังเขียนได้ (ตรงกับ can_report()
     ในฐานข้อมูล) การแก้แผน (plan_edits) ไม่ผ่านด่านนี้ เพราะไม่ใช่การรายงาน
     ⚠️ ด่านนี้แค่กันไม่ให้กดแล้วเจอ error ด่านจริงคือ RLS ในฐานข้อมูล */
  const reportOpenRef = useRef(true);
  reportOpenRef.current = reportingOpen;
  const isAdminRef = useRef(false);
  isAdminRef.current = role === "admin";

  function denyReport() {
    if (denyReadOnly()) return true;
    if (reportOpenRef.current || isAdminRef.current) return false;
    setSaveError(
      "ขณะนี้ปิดการรายงานผลอยู่ — แก้ไขข้อมูลไม่ได้จนกว่าผู้ดูแลระบบจะเปิดการรายงานผล"
    );
    return true;
  }
  const hasIssueRef = useRef(true);
  hasIssueRef.current = monthlyHasIssue;
  const hasIndicatorRef = useRef(true);
  hasIndicatorRef.current = hasIndicatorCols;
  const hasKpiItemsRef = useRef(true);
  hasKpiItemsRef.current = hasKpiItemCols;

  /* "ณ เดือน" ที่ใช้เป็นฐานคำนวณการแจ้งเตือน — ใช้ร่วมกันทุกหน้า
     ค่าเริ่มต้นต้องคงที่ตอน render แรก ไม่งั้น hydration ฝั่งเซิร์ฟเวอร์กับเบราว์เซอร์ไม่ตรงกัน */
  const [asOf, setAsOfState] = useState(0);
  const [fyStarted, setFyStarted] = useState(true);

  /* คิวของแถวที่ยังไม่ได้ส่งขึ้น Supabase */
  const pending = useRef({
    kpi: new Set(),
    project: new Set(),
    monthly: new Set(),
    budget: new Set(),
    risk: new Set(),
    steps: new Set(),
  });
  const flushTimer = useRef(null);

  const results = useMemo(() => applyBudget(raw, budget), [raw, budget]);

  const snap = useRef({ raw, budget, risk, steps });
  snap.current = { raw, budget, risk, steps };

  /* โหลดข้อมูล ถ้าเจอ error เกี่ยวกับ token ให้ขอ token ใหม่แล้วลองอีกครั้งหนึ่ง
     กรณีนาฬิกาเครื่องเพี้ยนเล็กน้อย token ใบใหม่มักใช้ได้ทันที
     ผู้ใช้จึงไม่ต้องออกจากระบบเองทุกครั้งที่เจอ */
  async function loadAllWithRetry() {
    try {
      return await loadAll();
    } catch (err) {
      if (!isAuthError(err)) throw err;
      const { error: refreshErr } = await getSupabase().auth.refreshSession();
      if (refreshErr) throw err; // คืน error เดิม เพราะอธิบายสาเหตุได้ตรงกว่า
      return await loadAll();
    }
  }

  /* ---------- โหลดข้อมูลทั้งหมดจาก Supabase ---------- */
  async function loadAll() {
    const supabase = getSupabase();

    /* ---------------------------------------------------------------
       คอลัมน์ที่เพิ่มทีหลังจะยังไม่มีในฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุด
       ถ้าปล่อยให้ throw ทั้งเว็บจะใช้ไม่ได้เลย ทั้งที่ขาดแค่ฟีเจอร์เดียว

       จึงลอง select แบบเต็มก่อน ถ้าพังเพราะคอลัมน์ใหม่ ค่อยถอยไป select แบบเดิม
       แล้วปิดเฉพาะฟีเจอร์ที่ต้องใช้คอลัมน์นั้น
       --------------------------------------------------------------- */
    async function selectOptional(table, baseCols, optionalCols, order) {
      const build = (cols) => {
        const q = supabase.from(table).select(cols);
        return order ? q.order(order, { ascending: true }) : q;
      };

      let res = await build(baseCols + "," + optionalCols.join(","));
      if (res.error) {
        const msg = res.error.message || "";
        // พังเพราะคอลัมน์ที่เพิ่มทีหลังหรือเปล่า ถ้าใช่ค่อยถอย
        if (optionalCols.some((c) => new RegExp(c, "i").test(msg))) {
          return { res: await build(baseCols), supported: false };
        }
      }
      return { res, supported: true };
    }

    const [kpiRes, riskRes] = await Promise.all([
      supabase.from("kpi_results").select("no,actual"),
      supabase.from("risk_reports").select("uid,month,level,situation,action"),
    ]);

    /* ลองดึงพร้อมคอลัมน์รายข้อก่อน ถ้าฐานข้อมูลยังไม่มีค่อยถอยไปชุดเดิม
       ถอยทีเดียวทั้งหกคอลัมน์ไม่ได้ เพราะจะทำให้ฐานข้อมูลที่มีสี่คอลัมน์เดิมอยู่แล้ว
       กลายเป็นไม่มีช่องรายงานตัวชี้วัดไปด้วย ทั้งที่ของเดิมใช้ได้ปกติ */
    const INDICATOR_COLS = ["output_result", "output_issue", "outcome_result", "outcome_issue"];
    const ITEM_COLS = ["output_items", "outcome_items"];

    let projRes;
    let hasIndicator;
    let hasKpiItems;
    {
      const withItems = await selectOptional(
        "project_results",
        "uid,status,progress,note",
        INDICATOR_COLS.concat(ITEM_COLS)
      );
      if (withItems.supported) {
        projRes = withItems.res;
        hasIndicator = true;
        hasKpiItems = true;
      } else {
        const proj = await selectOptional("project_results", "uid,status,progress,note", INDICATOR_COLS);
        projRes = proj.res;
        hasIndicator = proj.supported;
        hasKpiItems = false;
      }
    }

    const mon = await selectOptional(
      "monthly_reports",
      "uid,month,output,outcome,spend",
      ["issue", "solution"]
    );
    const monRes = mon.res;
    const hasIssue = mon.supported;

    /* ---------------------------------------------------------------
       budget_entries มีคอลัมน์ที่เพิ่มมาคนละรอบสองตัว: saved แล้วก็ other
       ฐานข้อมูลจึงมีได้สามสภาพ ไม่มีทั้งคู่ / มีแต่ saved / มีครบ

       selectOptional ตัวเดิมตัดคอลัมน์เสริม**ทั้งชุดพร้อมกัน** ถ้าใช้กับสองตัวนี้
       เครื่องที่มี saved แต่ยังไม่มี other จะโดนตัด saved ไปด้วย
       แล้วรายการงบที่เคยล็อกไว้จะกลับมาแก้ได้ — ถอยหลังเข้าคลอง

       จึงตัดทีละตัวจากท้ายมาหน้า ตามลำดับที่เพิ่มเข้ามาจริง
       --------------------------------------------------------------- */
    const budOptional = ["saved", "other", "org"];
    let budRes = null;
    let budKept = budOptional.slice();
    for (let drop = 0; drop <= budOptional.length; drop++) {
      const keep = budOptional.slice(0, budOptional.length - drop);
      const cols =
        "id,uid,month,occurred_on,note,perdiem,lodging,travel,fuel" +
        (keep.length ? "," + keep.join(",") : "");
      const res = await supabase
        .from("budget_entries")
        .select(cols)
        .order("occurred_on", { ascending: true });

      if (!res.error) {
        budRes = res;
        budKept = keep;
        break;
      }
      // พังด้วยเหตุอื่นที่ไม่ใช่คอลัมน์หาย ก็ไม่ต้องไล่ตัดต่อ
      const msg = res.error.message || "";
      if (!keep.some((c) => new RegExp("\\b" + c + "\\b", "i").test(msg))) {
        budRes = res;
        budKept = keep;
        break;
      }
    }
    const hasSaved = budKept.indexOf("saved") >= 0;
    const hasOther = budKept.indexOf("other") >= 0;
    const hasOrg = budKept.indexOf("org") >= 0;

    const firstError =
      kpiRes.error || projRes.error || monRes.error || budRes.error || riskRes.error;
    if (firstError) throw firstError;

    const nextRaw = emptyResults();

    (kpiRes.data || []).forEach((row) => {
      nextRaw.kpi[row.no] = { actual: row.actual == null ? "" : row.actual };
    });

    (projRes.data || []).forEach((row) => {
      nextRaw.project[row.uid] = {
        status: row.status == null ? "" : row.status,
        progress: row.progress == null ? "" : row.progress,
        note: row.note == null ? "" : row.note,
        // สี่ช่องนี้เพิ่มทีหลัง ฐานข้อมูลที่ยังไม่ได้อัปเดตจะไม่มี
        outputResult: hasIndicator && row.output_result != null ? row.output_result : "",
        outputIssue: hasIndicator && row.output_issue != null ? row.output_issue : "",
        outcomeResult: hasIndicator && row.outcome_result != null ? row.outcome_result : "",
        outcomeIssue: hasIndicator && row.outcome_issue != null ? row.outcome_issue : "",
        /* รายงานผลรายข้อของตัวชี้วัดที่เขียนหลายข้อรวมกัน — [{r, i}, ...]
           เรียงตามลำดับข้อที่แยกได้จากข้อความตัวชี้วัด (ดู lib/kpi-items.js) */
        outputItems: hasKpiItems && Array.isArray(row.output_items) ? row.output_items : [],
        outcomeItems: hasKpiItems && Array.isArray(row.outcome_items) ? row.outcome_items : [],
        monthly: {},
      };
    });

    (monRes.data || []).forEach((row) => {
      if (!nextRaw.project[row.uid]) nextRaw.project[row.uid] = { monthly: {} };
      if (!nextRaw.project[row.uid].monthly) nextRaw.project[row.uid].monthly = {};
      nextRaw.project[row.uid].monthly[row.month] = {
        o: row.output == null ? "" : row.output,
        r: row.outcome == null ? "" : row.outcome,
        issue: hasIssue && row.issue != null ? row.issue : "",
        solution: hasIssue && row.solution != null ? row.solution : "",
        sManual: row.spend == null ? null : String(row.spend),
      };
    });

    const nextBudget = {};
    (budRes.data || []).forEach((row) => {
      if (!nextBudget[row.uid]) nextBudget[row.uid] = [];
      nextBudget[row.uid].push({
        id: row.id,
        uid: row.uid,
        month: row.month,
        occurred_on: row.occurred_on || "",
        note: row.note || "",
        perdiem: row.perdiem == null ? "" : String(row.perdiem),
        lodging: row.lodging == null ? "" : String(row.lodging),
        travel: row.travel == null ? "" : String(row.travel),
        fuel: row.fuel == null ? "" : String(row.fuel),
        other: hasOther && row.other != null ? String(row.other) : "",
        org: hasOrg && row.org != null ? row.org : "",
        // ถ้าฐานข้อมูลยังไม่มีคอลัมน์ saved ให้ถือว่าทุกแถวยังแก้ได้
        saved: hasSaved ? row.saved === true : false,
      });
    });

    /* การส่งข้อมูลงบประมาณรายเดือน — ตารางเพิ่มทีหลัง ฐานข้อมูลเก่ายังไม่มี
       ถ้าอ่านไม่ได้ให้ถือว่ายังไม่มีใครส่ง (ทุกเดือนเปิดให้กรอก) ดีกว่าล็อกทุกอย่างทิ้ง */
    let nextSubmit = {};
    let hasSubmit = true;
    {
      const res = await supabase.from("budget_submissions").select("uid,month,submitted");
      if (res.error) {
        hasSubmit = false;
      } else {
        (res.data || []).forEach((row) => {
          if (!nextSubmit[row.uid]) nextSubmit[row.uid] = {};
          nextSubmit[row.uid][row.month] = row.submitted === true;
        });
      }
    }

    /* ถังการแก้ไขข้อมูล — ตารางเพิ่มทีหลังเช่นกัน อ่านไม่ได้ = ยังไม่มีใครแก้แผน
       ต้องไม่ล้มทั้งหน้า ฐานข้อมูลที่ยังไม่ได้รัน schema.sql ต้องใช้เว็บได้ตามปกติ */
    let nextEdits = [];
    let hasEdits = true;
    {
      const res = await supabase
        .from("plan_edits")
        .select("id,kind,uid,status,data,prev,res_no,res_date,doc_no,doc_date,note,updated_at,updated_by")
        .order("updated_at", { ascending: true });
      if (res.error) hasEdits = false;
      else nextEdits = res.data || [];
    }

    /* ขั้นตอนการดำเนินงาน — อ่านไม่ได้ = ยังไม่ได้รัน schema.sql รอบนี้
       ต้องไม่ล้มทั้งหน้า แค่ตารางขั้นตอนจะขึ้นแถบบอกให้รันก่อน */
    const nextSteps = {};
    let hasSteps = true;
    {
      const res = await supabase
        .from("project_steps")
        .select("id,uid,ord,name,target,unit,plan,actual")
        .order("ord", { ascending: true });
      if (res.error) hasSteps = false;
      else {
        (res.data || []).forEach((row) => {
          if (!nextSteps[row.uid]) nextSteps[row.uid] = [];
          nextSteps[row.uid].push(normStep(row));
        });
      }
    }

    /* การเชื่อมโยง ESG/SDGs ที่เจ้าหน้าที่แก้หรือยืนยันแล้ว
       ตารางเล็ก (ไม่เกินจำนวนโครงการ) จึงโหลดมาทั้งก้อนพร้อมกันได้
       อ่านไม่ได้ = ยังไม่ได้รัน schema.sql → หน้าเว็บใช้ข้อเสนอใน data/esg-sdg.json ไปก่อน */
    const nextEsg = {};
    let hasEsgTbl = true;
    {
      const res = await supabase
        .from("project_esg")
        .select("uid,esg,sdg,note,confirmed,updated_at,updated_by");
      if (res.error) hasEsgTbl = false;
      else (res.data || []).forEach((row) => { nextEsg[row.uid] = row; });
    }

    /* ค่าตั้งของระบบ — เปิด/ปิดการรายงาน และการล้างข้อมูลครั้งล่าสุด
       ตารางไม่มี = ถือว่าเปิด ตรงกับ reporting_open() ในฐานข้อมูล */
    let nextOpen = true;
    let nextReset = null;
    let hasSet = true;
    {
      const res = await supabase.from("app_settings").select("key,value,updated_at,updated_by");
      if (res.error) hasSet = false;
      else {
        (res.data || []).forEach((row) => {
          if (row.key === "reporting") nextOpen = !(row.value && row.value.open === false);
          if (row.key === "last_reset") nextReset = row.value || null;
        });
      }
    }

    const nextRisk = {};
    (riskRes.data || []).forEach((row) => {
      if (!nextRisk[row.uid]) nextRisk[row.uid] = {};
      nextRisk[row.uid][row.month] = {
        level: row.level == null ? "" : String(row.level),
        situation: row.situation || "",
        action: row.action || "",
      };
    });

    return {
      raw: nextRaw,
      budget: nextBudget,
      risk: nextRisk,
      submit: nextSubmit,
      edits: nextEdits,
      hasEdits,
      steps: nextSteps,
      hasSteps,
      esg: nextEsg,
      hasEsgTable: hasEsgTbl,
      reportingOpen: nextOpen,
      lastReset: nextReset,
      hasSettings: hasSet,
      hasSaved,
      hasOther,
      hasOrg,
      hasSubmit,
      hasIssue,
      hasIndicator,
      hasKpiItems,
    };
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getUser();
        const me = data && data.user ? data.user : null;
        if (alive && me) setUserEmail(me.email || "");

        /* อ่านทะเบียนผู้ใช้แยกต่างหาก และ **ห้ามให้ล้มทั้งหน้าถ้าตารางยังไม่มี**
           ฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุดต้องยังใช้เว็บได้ปกติ */
        const prof = await supabase.from("profiles").select("id,email,full_name,role");
        if (alive) {
          if (prof.error) {
            setHasRoles(false);
            setRole("admin"); // ยังไม่มีระบบบทบาท = ทำได้ทุกอย่างเหมือนเดิม
          } else {
            const map = {};
            (prof.data || []).forEach((p) => {
              map[p.id] = p.full_name || p.email || "ผู้ใช้";
            });
            setPeople(map);
            setHasRoles(true);
            const mine = (prof.data || []).find((p) => me && p.id === me.id);
            setUserName(mine && mine.full_name ? mine.full_name : "");
            setRole(mine ? mine.role : "viewer");
          }
        }

        const next = await loadAllWithRetry();
        if (alive) {
          setRaw(next.raw);
          setBudget(next.budget);
          setBudgetHasSaved(next.hasSaved !== false);
          setBudgetHasOther(next.hasOther !== false);
          setBudgetHasOrg(next.hasOrg !== false);
          setMonthlyHasIssue(next.hasIssue !== false);
          setHasIndicatorCols(next.hasIndicator !== false);
          setHasKpiItemCols(next.hasKpiItems !== false);
          setRiskState(next.risk);
          setSubmitState(next.submit || {});
          setHasSubmitTable(next.hasSubmit !== false);
          setPlanEdits(next.edits || []);
          setHasPlanEdits(next.hasEdits !== false);
          setSteps(next.steps || {});
          setHasStepsTable(next.hasSteps !== false);
          setEsg(next.esg || {});
          setHasEsgTable(next.hasEsgTable !== false);
          setReportingOpenState(next.reportingOpen !== false);
          setLastReset(next.lastReset || null);
          setHasSettings(next.hasSettings !== false);
          // ทับแผนก่อน setLoaded เสมอ ไม่งั้นหน้าแรกจะวาดด้วยแผนเดิมแวบหนึ่ง
          // แล้วตัวเลขกระโดดต่อหน้าผู้ใช้ทั้งที่ไม่มีใครกดอะไร
          if ((next.edits || []).length) refreshPlan(next.edits);
        }
      } catch (err) {
        if (alive) setLoadError("โหลดข้อมูลจาก Supabase ไม่สำเร็จ — " + explainError(err));
      }

      const fm = currentFiscalMonth();
      if (alive) setFyStarted(!!fm.started);
      try {
        // getItem คืน null เมื่อไม่มีค่า และ Number(null) เป็น 0 ซึ่งผ่านการเช็คช่วง
        // ต้องกันกรณี null แยกต่างหาก ไม่งั้นจะได้ ต.ค. 69 เสมอแทนเดือนปัจจุบัน
        const stored = localStorage.getItem(ASOF_KEY);
        const saved = stored == null ? NaN : Number(stored);
        // -1 = ดูทั้งปี ค่าที่ยอมรับจึงเริ่มที่ -1 ไม่ใช่ 0
        if (alive) setAsOfState(isFinite(saved) && saved >= -1 && saved <= 11 ? saved : fm.index);
      } catch (e) {
        if (alive) setAsOfState(fm.index);
      }

      if (alive) setLoaded(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- ส่งแถวที่ค้างอยู่ขึ้น Supabase ---------- */
  async function flush() {
    const queue = pending.current;
    pending.current = {
      kpi: new Set(),
      project: new Set(),
      monthly: new Set(),
      budget: new Set(),
      risk: new Set(),
      steps: new Set(),
    };

    const cur = snap.current;
    const supabase = getSupabase();
    const jobs = [];

    if (queue.kpi.size) {
      const rows = [...queue.kpi].map((no) => ({
        no,
        actual: (cur.raw.kpi[no] || {}).actual ?? "",
      }));
      jobs.push(supabase.from("kpi_results").upsert(rows, { onConflict: "no" }));
    }

    if (queue.project.size) {
      const rows = [...queue.project].map((uid) => {
        const p = cur.raw.project[uid] || {};
        return {
          uid,
          code: uid.split("#")[0],
          status: p.status ?? "",
          progress: p.progress ?? "",
          note: p.note ?? "",
          // ส่งสี่ช่องนี้เฉพาะเมื่อฐานข้อมูลมีคอลัมน์จริง ไม่งั้น PostgREST ปฏิเสธทั้งคำสั่ง
          ...(hasIndicatorRef.current
            ? {
                output_result: p.outputResult ?? "",
                output_issue: p.outputIssue ?? "",
                outcome_result: p.outcomeResult ?? "",
                outcome_issue: p.outcomeIssue ?? "",
              }
            : {}),
          // รายงานผลรายข้อ — ส่งเฉพาะเมื่อฐานข้อมูลมีคอลัมน์ ไม่งั้นทั้งคำสั่งถูกปฏิเสธ
          ...(hasKpiItemsRef.current
            ? {
                output_items: p.outputItems ?? [],
                outcome_items: p.outcomeItems ?? [],
              }
            : {}),
        };
      });
      jobs.push(supabase.from("project_results").upsert(rows, { onConflict: "uid" }));
    }

    if (queue.monthly.size) {
      /* ไม่ส่งคอลัมน์ spend เพราะยอดเบิกจ่ายคำนวณจาก budget_entries แล้ว
         PostgREST จะไม่แตะคอลัมน์ที่ไม่ได้ส่งมาตอน update ยอดเดิมที่เคยกรอกมือจึงไม่หาย */
      const rows = [...queue.monthly].map((key) => {
        const sep = key.lastIndexOf("|");
        const uid = key.slice(0, sep);
        const month = Number(key.slice(sep + 1));
        const e = ((cur.raw.project[uid] || {}).monthly || {})[month] || {};
        return {
          uid,
          month,
          output: e.o ?? "",
          outcome: e.r ?? "",
          // ส่ง issue/solution เฉพาะเมื่อฐานข้อมูลมีคอลัมน์จริง ไม่งั้น PostgREST ปฏิเสธทั้งคำสั่ง
          ...(hasIssueRef.current ? { issue: e.issue ?? "", solution: e.solution ?? "" } : {}),
        };
      });
      jobs.push(supabase.from("monthly_reports").upsert(rows, { onConflict: "uid,month" }));
    }

    if (queue.budget.size) {
      const rows = [];
      [...queue.budget].forEach((id) => {
        let found = null;
        Object.keys(cur.budget).some((uid) => {
          const hit = cur.budget[uid].find((e) => e.id === id);
          if (hit) found = hit;
          return !!hit;
        });
        if (!found) return;
        rows.push({
          id: found.id,
          uid: found.uid,
          month: Number(found.month),
          occurred_on: found.occurred_on ? found.occurred_on : null,
          note: found.note ?? "",
          perdiem: toNum(found.perdiem),
          lodging: toNum(found.lodging),
          travel: toNum(found.travel),
          fuel: toNum(found.fuel),
          ...(hasOtherRef.current ? { other: toNum(found.other) } : {}),
          ...(hasOrgRef.current ? { org: found.org || null } : {}),
          // ส่งคอลัมน์ saved เฉพาะเมื่อฐานข้อมูลมีจริง ไม่งั้น PostgREST จะปฏิเสธทั้งคำสั่ง
          ...(hasSavedRef.current ? { saved: found.saved === true } : {}),
        });
      });
      if (rows.length) {
        jobs.push(supabase.from("budget_entries").upsert(rows, { onConflict: "id" }));
      }
    }

    /* ขั้นตอนการดำเนินงาน — คิวเก็บ id ของขั้น อ่านค่าล่าสุดจาก snapshot
       ขั้นที่ถูกลบไประหว่างรอ flush จะหาไม่เจอแล้วข้ามไปเอง */
    if (queue.steps.size) {
      const rows = [];
      [...queue.steps].forEach((id) => {
        let found = null;
        Object.keys(cur.steps || {}).some((uid) => {
          const hit = cur.steps[uid].find((s) => s.id === id);
          if (hit) found = hit;
          return !!hit;
        });
        if (!found) return;
        rows.push({
          id: found.id,
          uid: found.uid,
          ord: found.ord,
          name: found.name ?? "",
          target: found.target ?? "",
          unit: found.unit ?? "",
          plan: found.plan,
          actual: found.actual,
        });
      });
      if (rows.length) {
        jobs.push(supabase.from("project_steps").upsert(rows, { onConflict: "id" }));
      }
    }

    if (queue.risk.size) {
      const rows = [...queue.risk].map((key) => {
        const sep = key.lastIndexOf("|");
        const uid = key.slice(0, sep);
        const month = Number(key.slice(sep + 1));
        const e = (cur.risk[uid] || {})[month] || {};
        return {
          uid,
          month,
          // ระดับที่ยังไม่เลือกต้องเป็น null ไม่ใช่ 0 เพราะ 0 แปลว่า "ไม่มีความเสี่ยง"
          level: e.level === "" || e.level == null ? null : Number(e.level),
          situation: e.situation ?? "",
          action: e.action ?? "",
        };
      });
      jobs.push(supabase.from("risk_reports").upsert(rows, { onConflict: "uid,month" }));
    }

    if (!jobs.length) return;

    const done = await Promise.all(jobs);
    const failed = done.find((r) => r && r.error);
    if (failed) {
      setSaveError(
        /permission denied/i.test(failed.error.message)
          ? "บันทึกไม่สำเร็จ: " + failed.error.message +
            " — role authenticated ยังไม่มีสิทธิ์ระดับตาราง (GRANT) " +
            "ให้รัน supabase/schema.sql ทั้งไฟล์อีกครั้งใน SQL Editor"
          : "บันทึกขึ้น Supabase ไม่สำเร็จ: " + failed.error.message +
            " — ข้อมูลที่เห็นบนจอยังอยู่ ลองกด “บันทึกเดี๋ยวนี้” อีกครั้ง"
      );
      return;
    }

    setSaveError("");
    const d = new Date();
    setSavedHint(
      "บันทึกแล้ว " +
        String(d.getHours()).padStart(2, "0") + ":" +
        String(d.getMinutes()).padStart(2, "0")
    );
  }

  function scheduleFlush() {
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flush().catch((err) => setSaveError("บันทึกไม่สำเร็จ: " + (err.message || String(err))));
    }, FLUSH_MS);
  }

  useEffect(() => {
    return () => clearTimeout(flushTimer.current);
  }, []);

  /* ---------------------------------------------------------------
     ทับแผนใหม่ทั้งก้อนจากรายการในถัง แล้วบอก React ให้วาดใหม่

     applyPlanEdits กับ rebuildRollups ต้องเรียกคู่กันเสมอ ห้ามเรียกแยก
     ไม่งั้น PROJECTS เปลี่ยนแล้วแต่ STRATEGIES/ORGS ยังเป็นยอดเก่า
     ตัวเลขบนหน้าจอจะขัดกันเองโดยไม่มีอะไรฟ้อง
     --------------------------------------------------------------- */
  function refreshPlan(list) {
    applyPlanEdits(list);
    rebuildRollups();
    setPlanVersion((v) => v + 1);
  }

  const api = useMemo(() => {
    return {
      results,
      budget,
      risk,
      loaded,
      loadError,
      saveError,
      savedHint,
      userEmail,
      userName,
      budgetHasSaved,
      monthlyHasIssue,
      hasIndicatorCols,
      hasKpiItemCols,

      /* ---------------------------------------------------------
         สิทธิ์การแก้ไข

         ⚠️ ใช้ปิดปุ่มในหน้าเว็บเท่านั้น **ไม่ใช่ด่านความปลอดภัย**
         anon key ของ Supabase เป็นของสาธารณะ ใครก็ยิง API ตรงได้
         ด่านจริงคือ RLS ในฐานข้อมูล (ดู supabase/schema.sql)
         ตรงนี้มีไว้เพื่อไม่ให้ผู้ดูอย่างเดียวกดแล้วเจอ error เฉย ๆ

         role เป็น null ตอนยังโหลดไม่เสร็จ ให้ถือว่าแก้ไม่ได้ไว้ก่อน
         จะได้ไม่มีจังหวะที่ช่องกรอกเปิดแวบหนึ่งแล้วปิด
         --------------------------------------------------------- */
      /* สถานะการส่งข้อมูลงบประมาณ
         budgetSubmitted(uid, month) — เดือนนั้นส่งแล้วหรือยัง
         ถ้าฐานข้อมูลยังไม่มีตาราง ให้ถือว่ายังไม่ส่ง (เปิดให้กรอกได้ตามปกติ)
         ดีกว่าล็อกทุกอย่างทิ้งจนใช้เว็บไม่ได้ */
      submit,
      hasSubmitTable,
      budgetSubmitted(uid, month) {
        if (month == null) return false;
        return Boolean((submit[uid] || {})[month]);
      },

      role,
      hasRoles,
      canEdit: role === "editor" || role === "admin",
      isAdmin: role === "admin",
      people,

      /* ชื่อคนจาก id ที่เก็บใน updated_by — ไม่รู้จักก็คืนค่าว่าง
         ให้หน้าเว็บตัดสินใจเองว่าจะแสดงหรือไม่แสดงบรรทัดนั้น */
      personName(id) {
        if (!id) return "";
        return people[id] || "";
      },

      /* asOf เป็นค่าที่ผู้ใช้เลือก (-1 = ทั้งปี)
         asOfMonth คือเดือนที่ใช้คำนวณจริง ทั้งปีนับเสมือนถึงสิ้นปีงบ
         โค้ดที่ต้องวนเดือนหรือตัดยอดสะสมให้ใช้ asOfMonth ไม่ใช่ asOf */
      asOfMonth: asOf < 0 ? 11 : asOf,
      allMonths: asOf < 0,
      asOfLabel: asOf < 0 ? "ทั้งปีงบประมาณ" : MONTH_NAMES[asOf],
      asOf,
      fyStarted,

      setAsOf(i) {
        setAsOfState(i);
        try {
          localStorage.setItem(ASOF_KEY, String(i));
        } catch (e) {}
      },

      setKpi(no, actual) {
        if (denyReport()) return;
        setRaw((prev) => ({
          ...prev,
          kpi: { ...prev.kpi, [no]: { ...(prev.kpi[no] || {}), actual } },
        }));
        pending.current.kpi.add(no);
        scheduleFlush();
      },

      setProject(uid, patch) {
        if (denyReport()) return;
        setRaw((prev) => ({
          ...prev,
          project: { ...prev.project, [uid]: { ...(prev.project[uid] || {}), ...patch } },
        }));
        pending.current.project.add(uid);
        scheduleFlush();
      },

      /* รายงานผลของตัวชี้วัด "รายข้อ" — ใช้กับโครงการที่เขียนตัวชี้วัดไว้หลายข้อ
         which = "output" | "outcome" · idx = ลำดับข้อ (เริ่ม 0) · patch = { r } หรือ { i }

         ข้อแรกถูกคัดลอกลงช่องเดิม (outputResult/outputIssue) ด้วย เพราะที่อื่น
         ในเว็บยังอ่านช่องเดิมอยู่ เช่น การนับว่ากิจกรรมนี้รายงานแล้วหรือยัง
         และไฟล์ PDF/Excel ถ้าไม่คัดลอก สรุปพวกนั้นจะว่างทั้งที่กรอกครบแล้ว */
      setProjectItem(uid, which, idx, patch) {
        if (denyReport()) return;
        const listKey = which === "outcome" ? "outcomeItems" : "outputItems";
        const resultKey = which === "outcome" ? "outcomeResult" : "outputResult";
        const issueKey = which === "outcome" ? "outcomeIssue" : "outputIssue";

        setRaw((prev) => {
          const cur = prev.project[uid] || {};
          const list = Array.isArray(cur[listKey]) ? cur[listKey].slice() : [];
          while (list.length <= idx) list.push({ r: "", i: "" });
          list[idx] = { ...(list[idx] || {}), ...patch };

          const merged = { ...cur, [listKey]: list };
          if (idx === 0) {
            if (patch.r != null) merged[resultKey] = patch.r;
            if (patch.i != null) merged[issueKey] = patch.i;
          }
          return { ...prev, project: { ...prev.project, [uid]: merged } };
        });
        pending.current.project.add(uid);
        scheduleFlush();
      },

      setMonthly(uid, i, patch) {
        if (denyReport()) return;
        setRaw((prev) => {
          const curP = prev.project[uid] || {};
          const monthly = { ...(curP.monthly || {}) };
          monthly[i] = { ...(monthly[i] || {}), ...patch };
          return { ...prev, project: { ...prev.project, [uid]: { ...curP, monthly } } };
        });
        pending.current.monthly.add(uid + "|" + i);
        scheduleFlush();
      },

      /* ---------- รายการงบประมาณ ---------- */
      async addBudgetEntry(uid, month, extra) {
        if (denyReport()) return;
        const supabase = getSupabase();
        /* คอลัมน์เสริมสองตัวเพิ่มมาคนละรอบ ต้องต่อทีละตัวตามที่ฐานข้อมูลมีจริง
           ถ้าส่งคอลัมน์ที่ไม่มี PostgREST จะปฏิเสธทั้งคำสั่ง */
        let cols = "id,uid,month,occurred_on,note,perdiem,lodging,travel,fuel";
        if (budgetHasSaved) cols += ",saved";
        if (budgetHasOther) cols += ",other";
        if (budgetHasOrg) cols += ",org";
        const { data, error } = await supabase
          .from("budget_entries")
          .insert({
            uid,
            month,
            perdiem: 0,
            lodging: 0,
            travel: 0,
            fuel: 0,
            ...(budgetHasOther ? { other: 0 } : {}),
            ...(budgetHasSaved ? { saved: false } : {}),
            // ค่าตั้งต้นเพิ่มเติม เช่น หมายเหตุของรายการ 0 บาท
            ...(extra && extra.note ? { note: extra.note } : {}),
          })
          // cols ต่อคอลัมน์เสริมให้แล้วด้านบน อย่าต่อซ้ำอีก
          .select(cols)
          .single();

        if (error) {
          setSaveError("เพิ่มรายการงบประมาณไม่สำเร็จ — " + explainError(error));
          return null;
        }

        const entry = {
          id: data.id,
          uid: data.uid,
          month: data.month,
          occurred_on: data.occurred_on || "",
          note: data.note || "",
          perdiem: "",
          lodging: "",
          travel: "",
          fuel: "",
          other: "",
          org: "",
        };
        setBudget((prev) => ({ ...prev, [uid]: [...(prev[uid] || []), entry] }));
        return entry.id;
      },

      updateBudgetEntry(uid, id, patch) {
        if (denyReport()) return;
        setBudget((prev) => ({
          ...prev,
          [uid]: (prev[uid] || []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
        pending.current.budget.add(id);
        scheduleFlush();
      },

      /* ล็อก/ปลดล็อกรายการที่รายงานเสร็จแล้ว

         ยิง update ตรงไม่ผ่านคิว flush เพราะ flush อ่านค่าจาก snapshot ของ render ล่าสุด
         ซึ่งยังไม่มีค่า saved ที่เพิ่งตั้งไป (setState ยังไม่ทัน re-render)
         แต่ต้อง flush ค่าที่พิมพ์ค้างไว้ก่อน ไม่งั้นตัวเลขที่เพิ่งกรอกจะยังไม่ถูกบันทึก */
      async setEntriesSaved(uid, ids, saved) {
        if (denyReport()) return;
        if (!ids || !ids.length) return true;

        if (!budgetHasSaved) {
          setSaveError(
            "ยังใช้การล็อกรายการไม่ได้ เพราะฐานข้อมูลไม่มีคอลัมน์ budget_entries.saved — " +
              "ให้รัน supabase/schema.sql ทั้งไฟล์ใน SQL Editor ก่อน " +
              "(ตัวเลขที่กรอกไว้ยังถูกบันทึกตามปกติ)"
          );
          return false;
        }

        clearTimeout(flushTimer.current);
        await flush();

        const idSet = new Set(ids);
        setBudget((prev) => ({
          ...prev,
          [uid]: (prev[uid] || []).map((e) => (idSet.has(e.id) ? { ...e, saved } : e)),
        }));

        const { error } = await getSupabase()
          .from("budget_entries")
          .update({ saved })
          .in("id", ids);

        if (error) {
          setSaveError((saved ? "บันทึก" : "ปลดล็อก") + "รายการไม่สำเร็จ: " + error.message);
          return false;
        }

        setSaveError("");
        const d = new Date();
        setSavedHint(
          (saved ? "บันทึกแล้ว " : "ปลดล็อกแล้ว ") +
            String(d.getHours()).padStart(2, "0") + ":" +
            String(d.getMinutes()).padStart(2, "0")
        );
        return true;
      },

      async deleteBudgetEntry(uid, id) {
        if (denyReport()) return;
        setBudget((prev) => ({
          ...prev,
          [uid]: (prev[uid] || []).filter((e) => e.id !== id),
        }));
        pending.current.budget.delete(id);
        const { error } = await getSupabase().from("budget_entries").delete().eq("id", id);
        if (error) setSaveError("ลบรายการงบประมาณไม่สำเร็จ: " + error.message);
      },

      /* =========================================================
         การเชื่อมโยง ESG/SDGs

         เป็นข้อมูลของ "แผน" ไม่ใช่การรายงานผล จึงใช้ canEdit ไม่ใช่ canReport
         ปิดรอบรายงานผลแล้วยังแก้การเชื่อมโยงได้ (ตรงกับ RLS ที่ใช้ can_edit())

         ไม่ผ่านคิว flush เพราะเป็นการกดบันทึกที่ตั้งใจ ไม่ใช่การพิมพ์ต่อเนื่อง
         ========================================================= */
      esg,
      hasEsgTable,

      async saveEsg(uid, patch) {
        if (denyReadOnly()) return false;
        if (!hasEsgTable) {
          setSaveError(
            "ยังบันทึกการเชื่อมโยง ESG/SDGs ไม่ได้ เพราะฐานข้อมูลไม่มีตาราง project_esg — " +
              "ให้ผู้ดูแลรัน supabase/schema.sql ใน SQL Editor"
          );
          return false;
        }

        const row = {
          uid,
          esg: patch.esg || [],
          // เก็บเป็นตัวเลขเสมอ ช่องติ๊กในหน้าเว็บส่งมาเป็นสตริงได้
          sdg: (patch.sdg || []).map((n) => Number(n)),
          note: patch.note == null ? "" : patch.note,
          confirmed: patch.confirmed === true,
        };

        const { data, error } = await getSupabase()
          .from("project_esg")
          .upsert(row, { onConflict: "uid" })
          .select("uid,esg,sdg,note,confirmed,updated_at,updated_by")
          .single();

        if (error) {
          setSaveError("บันทึกการเชื่อมโยง ESG/SDGs ไม่สำเร็จ — " + explainError(error));
          return false;
        }

        setEsg((prev) => ({ ...prev, [uid]: data }));
        setSaveError("");
        setSavedHint(row.confirmed ? "ยืนยันการเชื่อมโยงแล้ว" : "บันทึกการเชื่อมโยงแล้ว");
        return true;
      },

      /* =========================================================
         เปิด/ปิดการรายงานผล และล้างข้อมูลการรายงาน — เฉพาะผู้ดูแล

         canReport คือสิ่งที่หน้าเว็บใช้ตัดสินว่าจะเปิดช่องกรอกหรือไม่
         ตรงกับ can_report() ในฐานข้อมูล: ผู้ดูแลเสมอ หรือผู้กรอกข้อมูลตอนเปิดอยู่
         ========================================================= */
      reportingOpen,
      lastReset,
      hasSettings,
      canReport:
        role === "admin" || ((role === "editor" || role === "admin") && reportingOpen),

      async setReportingOpen(open) {
        if (role !== "admin") {
          setSaveError("เฉพาะผู้ดูแลระบบเท่านั้นที่เปิด/ปิดการรายงานผลได้");
          return false;
        }
        if (!hasSettings) {
          setSaveError(
            "ยังเปิด/ปิดการรายงานผลไม่ได้ เพราะฐานข้อมูลไม่มีตาราง app_settings — " +
              "ให้ผู้ดูแลรัน supabase/schema.sql ใน SQL Editor"
          );
          return false;
        }
        const { error } = await getSupabase()
          .from("app_settings")
          .upsert({ key: "reporting", value: { open: open === true } }, { onConflict: "key" });
        if (error) {
          setSaveError((open ? "เปิด" : "ปิด") + "การรายงานผลไม่สำเร็จ — " + explainError(error));
          return false;
        }
        setReportingOpenState(open === true);
        setSaveError("");
        setSavedHint(open ? "เปิดการรายงานผลแล้ว" : "ปิดการรายงานผลแล้ว");
        return true;
      },

      /* ล้างข้อมูลการรายงาน — ยิงฟังก์ชัน reset_reports ในฐานข้อมูล
         ซึ่งตรวจสิทธิ์ผู้ดูแลเองและล้างทุกตารางในธุรกรรมเดียว
         สำเร็จแล้วล้าง state ในหน้าเว็บให้ตรงกัน ไม่ต้องรีโหลดทั้งหน้า */
      async resetReports(parts) {
        if (role !== "admin") {
          setSaveError("เฉพาะผู้ดูแลระบบเท่านั้นที่ล้างข้อมูลการรายงานได้");
          return false;
        }
        const list = (parts || []).filter(Boolean);
        if (!list.length) return false;

        // ส่งของที่ค้างในคิวทิ้งก่อน ไม่งั้น flush ที่ตามมาทีหลังจะเขียนข้อมูลเก่ากลับเข้าไป
        clearTimeout(flushTimer.current);
        pending.current = {
          kpi: new Set(),
          project: new Set(),
          monthly: new Set(),
          budget: new Set(),
          risk: new Set(),
          steps: new Set(),
        };

        const { error } = await getSupabase().rpc("reset_reports", { parts: list });
        if (error) {
          setSaveError("ล้างข้อมูลการรายงานไม่สำเร็จ — " + explainError(error));
          return false;
        }

        const has = (k) => list.indexOf(k) >= 0;
        if (has("results") || has("kpi")) {
          setRaw((prev) => ({
            kpi: has("kpi") ? {} : prev.kpi,
            project: has("results") ? {} : prev.project,
          }));
        }
        if (has("steps")) setSteps({});
        if (has("risk")) setRiskState({});
        if (has("budget")) {
          setBudget({});
          setSubmitState({});
        }
        setLastReset({ at: new Date().toISOString(), parts: list });
        setSaveError("");
        setSavedHint("ล้างข้อมูลการรายงานแล้ว");
        return true;
      },

      /* ---------- ขั้นตอนการดำเนินงาน ----------
         เพิ่ม/ลบ ยิงตรงทันที (ต้องได้ id จากฐานข้อมูลก่อนถึงจะแก้ต่อได้)
         แก้ค่าในช่อง ผ่านคิว flush แบบหน่วงเวลาเหมือนช่องอื่น ไม่ยิงทุกตัวอักษร */
      steps,
      hasStepsTable,

      async addStep(uid) {
        if (denyReport()) return null;
        if (!hasStepsTable) {
          setSaveError(
            "ยังใช้ตารางขั้นตอนการดำเนินงานไม่ได้ เพราะฐานข้อมูลไม่มีตาราง project_steps — " +
              "ให้ผู้ดูแลรัน supabase/schema.sql ใน SQL Editor"
          );
          return null;
        }
        const list = (steps || {})[uid] || [];
        const ord = list.reduce((m, s) => Math.max(m, s.ord), 0) + 1;
        const { data, error } = await getSupabase()
          .from("project_steps")
          .insert({ uid, ord, name: "", target: "", unit: "", plan: arr12(), actual: arr12() })
          .select("id,uid,ord,name,target,unit,plan,actual")
          .single();
        if (error) {
          setSaveError("เพิ่มขั้นตอนไม่สำเร็จ — " + explainError(error));
          return null;
        }
        const step = normStep(data);
        setSteps((prev) => ({ ...prev, [uid]: (prev[uid] || []).concat([step]) }));
        return step.id;
      },

      updateStep(uid, id, patch) {
        if (denyReport()) return;
        setSteps((prev) => ({
          ...prev,
          [uid]: (prev[uid] || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
        }));
        pending.current.steps.add(id);
        scheduleFlush();
      },

      async deleteStep(uid, id) {
        if (denyReport()) return;
        setSteps((prev) => ({ ...prev, [uid]: (prev[uid] || []).filter((s) => s.id !== id) }));
        pending.current.steps.delete(id);
        const { error } = await getSupabase().from("project_steps").delete().eq("id", id);
        if (error) setSaveError("ลบขั้นตอนไม่สำเร็จ — " + explainError(error));
      },

      /* ---------- รายงานความเสี่ยงรายเดือน ---------- */
      setRisk(uid, month, patch) {
        if (denyReport()) return;
        setRiskState((prev) => {
          const cur = prev[uid] || {};
          return { ...prev, [uid]: { ...cur, [month]: { ...(cur[month] || {}), ...patch } } };
        });
        pending.current.risk.add(uid + "|" + month);
        scheduleFlush();
      },

      /* ---------------------------------------------------------
         ส่งข้อมูลงบประมาณของโครงการหนึ่งในเดือนหนึ่ง

         ต่างจาก setEntriesSaved ที่ล็อกทีละรายการ อันนี้ปิดทั้งเดือน

         เขียนตรงเข้า Supabase ทันที ไม่ผ่าน flush หน่วงเวลา เพราะเป็น
         การกระทำที่ผู้ใช้ตั้งใจกด ไม่ใช่การพิมพ์ต่อเนื่อง และหน้าโครงการ
         ต้องเห็นผลทันทีว่าเดือนนี้ส่งแล้ว จึงจะรายงานผลได้
         --------------------------------------------------------- */
      async setBudgetSubmitted(uid, month, value) {
        if (denyReport()) return false;
        if (!hasSubmitTable) {
          setSaveError(
            "ยังใช้การส่งข้อมูลงบประมาณไม่ได้ เพราะฐานข้อมูลไม่มีตาราง " +
              "budget_submissions — ให้ผู้ดูแลรัน supabase/schema.sql ใน SQL Editor"
          );
          return false;
        }

        const supabase = getSupabase();
        const { error } = await supabase
          .from("budget_submissions")
          .upsert(
            { uid, month: Number(month), submitted: value === true },
            { onConflict: "uid,month" }
          );

        if (error) {
          setSaveError("ส่งข้อมูลงบประมาณไม่สำเร็จ — " + explainError(error));
          return false;
        }

        setSubmitState((prev) => {
          const cur = prev[uid] || {};
          return { ...prev, [uid]: { ...cur, [month]: value === true } };
        });
        setSavedHint(value ? "ส่งข้อมูลงบประมาณแล้ว" : "เปิดให้แก้ไขงบประมาณแล้ว");
        return true;
      },

      /* =========================================================
         ถังการแก้ไขข้อมูล — เพิ่ม/ลบโครงการ แก้งบ แก้ตัวชี้วัด แก้แผน

         ทุกการเปลี่ยนแปลงแผนต้องผ่านที่นี่ที่เดียว ไม่มีทางลัด
         เพราะต้องเหลือหลักฐานว่าใครแก้อะไรเมื่อไหร่ (updated_by/updated_at
         ใส่ให้เองโดย trigger stamp_row ในฐานข้อมูล ไม่ได้ส่งมาจากเบราว์เซอร์
         จะได้ปลอมไม่ได้)
         ========================================================= */
      planEdits,
      hasPlanEdits,
      planVersion,

      /* รายการแก้ไขที่อนุมัติแล้วของรายการหนึ่ง เรียงใหม่สุดขึ้นก่อน
         ใช้แสดง "งบเดิม -> งบใหม่" ในลิ้นชักรายละเอียด */
      editsOf(uid, kind) {
        return planEdits
          .filter((e) => e.uid === uid && (!kind || e.kind === kind))
          .slice()
          .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
      },

      async savePlanEdit(edit) {
        if (denyReadOnly()) return null;
        if (!hasPlanEdits) {
          setSaveError(
            "ยังใช้ถังการแก้ไขข้อมูลไม่ได้ เพราะฐานข้อมูลไม่มีตาราง plan_edits — " +
              "ให้ผู้ดูแลรัน supabase/schema.sql ใน SQL Editor"
          );
          return null;
        }

        const row = {
          kind: edit.kind,
          uid: edit.uid,
          status: edit.status === "approved" ? "approved" : "draft",
          data: edit.data || {},
          prev: edit.prev || {},
          res_no: edit.res_no || null,
          res_date: edit.res_date || null,
          doc_no: edit.doc_no || null,
          doc_date: edit.doc_date || null,
          note: edit.note || null,
        };

        const supabase = getSupabase();
        const res = edit.id
          ? await supabase.from("plan_edits").update(row).eq("id", edit.id).select().single()
          : await supabase.from("plan_edits").insert(row).select().single();

        if (res.error) {
          setSaveError("บันทึกลงถังการแก้ไขไม่สำเร็จ — " + explainError(res.error));
          return null;
        }

        const saved = res.data;
        const nextList = edit.id
          ? planEdits.map((e) => (e.id === saved.id ? saved : e))
          : planEdits.concat([saved]);
        setPlanEdits(nextList);
        refreshPlan(nextList);
        setSaveError("");
        setSavedHint(row.status === "approved" ? "อนุมัติและบันทึกแล้ว" : "บันทึกร่างแล้ว");
        return saved;
      },

      /* ลบแถวในถังได้เฉพาะผู้ดูแล (RLS บังคับซ้ำอีกชั้นในฐานข้อมูล)
         ใช้ตอนบันทึกร่างผิด ไม่ใช่ตอนอยากยกเลิกโครงการที่อนุมัติไปแล้ว */
      async deletePlanEdit(id) {
        if (denyReadOnly()) return false;
        const { error } = await getSupabase().from("plan_edits").delete().eq("id", id);
        if (error) {
          setSaveError("ลบรายการในถังไม่สำเร็จ — " + explainError(error));
          return false;
        }
        const nextList = planEdits.filter((e) => e.id !== id);
        setPlanEdits(nextList);
        refreshPlan(nextList);
        return true;
      },

      /* ล้างข้อมูลของโครงการเดียว — ลบออกจากฐานข้อมูลจริง ทุกคนจะเห็นผล */
      async clearProject(uid) {
        if (denyReport()) return;
        setRaw((prev) => {
          const project = { ...prev.project };
          delete project[uid];
          return { ...prev, project };
        });
        setBudget((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setRiskState((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });

        const supabase = getSupabase();
        const done = await Promise.all([
          supabase.from("monthly_reports").delete().eq("uid", uid),
          supabase.from("budget_entries").delete().eq("uid", uid),
          supabase.from("risk_reports").delete().eq("uid", uid),
          supabase.from("project_results").delete().eq("uid", uid),
        ]);
        const failed = done.find((r) => r && r.error);
        if (failed) setSaveError("ลบไม่สำเร็จ: " + failed.error.message);
      },

      /* บันทึกทันทีโดยไม่รอหน่วงเวลา */
      async saveNow() {
        clearTimeout(flushTimer.current);
        await flush();
      },

      /* ดึงข้อมูลใหม่จาก Supabase เผื่อมีคนอื่นแก้ระหว่างที่เปิดหน้าค้างไว้ */
      async refresh() {
        setLoadError("");
        try {
          const next = await loadAllWithRetry();
          setRaw(next.raw);
          setBudget(next.budget);
          setBudgetHasSaved(next.hasSaved !== false);
          setBudgetHasOther(next.hasOther !== false);
          setBudgetHasOrg(next.hasOrg !== false);
          setMonthlyHasIssue(next.hasIssue !== false);
          setHasIndicatorCols(next.hasIndicator !== false);
          setHasKpiItemCols(next.hasKpiItems !== false);
          setRiskState(next.risk);
          setSubmitState(next.submit || {});
          setHasSubmitTable(next.hasSubmit !== false);
          setEsg(next.esg || {});
          setHasEsgTable(next.hasEsgTable !== false);
          return true;
        } catch (err) {
          setLoadError("ดึงข้อมูลใหม่ไม่สำเร็จ — " + explainError(err));
          return false;
        }
      },

      /* ส่งออกเป็นไฟล์สำรอง */
      exportJson() {
        return JSON.stringify(
          {
            kpi: raw.kpi,
            project: raw.project,
            budget,
            risk,
            savedAt: new Date().toISOString(),
          },
          null,
          2
        );
      },

      /* นำเข้าไฟล์สำรองแล้วเขียนทับลง Supabase */
      async importJson(text) {
        if (denyReadOnly()) return;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") throw new Error("ไฟล์ไม่ถูกรูปแบบ");

        const supabase = getSupabase();

        const kpiRows = Object.keys(parsed.kpi || {}).map((no) => ({
          no,
          actual: (parsed.kpi[no] || {}).actual ?? "",
        }));

        const projRows = [];
        const monRows = [];
        Object.keys(parsed.project || {}).forEach((uid) => {
          const p = parsed.project[uid] || {};
          projRows.push({
            uid,
            code: uid.split("#")[0],
            status: p.status ?? "",
            progress: p.progress ?? "",
            note: p.note ?? "",
            ...(hasIndicatorRef.current
              ? {
                  output_result: p.outputResult ?? "",
                  output_issue: p.outputIssue ?? "",
                  outcome_result: p.outcomeResult ?? "",
                  outcome_issue: p.outcomeIssue ?? "",
                }
              : {}),
            ...(hasKpiItemsRef.current
              ? {
                  output_items: p.outputItems ?? [],
                  outcome_items: p.outcomeItems ?? [],
                }
              : {}),
          });
          Object.keys(p.monthly || {}).forEach((i) => {
            const e = p.monthly[i] || {};
            monRows.push({
              uid,
              month: Number(i),
              output: e.o ?? "",
              outcome: e.r ?? "",
              ...(hasIssueRef.current ? { issue: e.issue ?? "", solution: e.solution ?? "" } : {}),
            });
          });
        });

        const budRows = [];
        Object.keys(parsed.budget || {}).forEach((uid) => {
          (parsed.budget[uid] || []).forEach((e) => {
            budRows.push({
              id: e.id,
              uid,
              month: Number(e.month),
              occurred_on: e.occurred_on ? e.occurred_on : null,
              note: e.note ?? "",
              perdiem: toNum(e.perdiem),
              lodging: toNum(e.lodging),
              travel: toNum(e.travel),
              fuel: toNum(e.fuel),
              ...(hasOtherRef.current ? { other: toNum(e.other) } : {}),
              ...(hasOrgRef.current ? { org: e.org || null } : {}),
            });
          });
        });

        const riskRows = [];
        Object.keys(parsed.risk || {}).forEach((uid) => {
          Object.keys(parsed.risk[uid] || {}).forEach((i) => {
            const e = parsed.risk[uid][i] || {};
            riskRows.push({
              uid,
              month: Number(i),
              level: e.level === "" || e.level == null ? null : Number(e.level),
              situation: e.situation ?? "",
              action: e.action ?? "",
            });
          });
        });

        const jobs = [];
        if (kpiRows.length) jobs.push(supabase.from("kpi_results").upsert(kpiRows, { onConflict: "no" }));
        if (projRows.length) jobs.push(supabase.from("project_results").upsert(projRows, { onConflict: "uid" }));
        if (monRows.length) jobs.push(supabase.from("monthly_reports").upsert(monRows, { onConflict: "uid,month" }));
        if (budRows.length) jobs.push(supabase.from("budget_entries").upsert(budRows, { onConflict: "id" }));
        if (riskRows.length) jobs.push(supabase.from("risk_reports").upsert(riskRows, { onConflict: "uid,month" }));

        const done = await Promise.all(jobs);
        const failed = done.find((r) => r && r.error);
        if (failed) throw new Error(failed.error.message);

        const next = await loadAllWithRetry();
        setRaw(next.raw);
        setBudget(next.budget);
        setBudgetHasSaved(next.hasSaved !== false);
        setBudgetHasOther(next.hasOther !== false);
        setBudgetHasOrg(next.hasOrg !== false);
        setMonthlyHasIssue(next.hasIssue !== false);
        setHasIndicatorCols(next.hasIndicator !== false);
        setHasKpiItemCols(next.hasKpiItems !== false);
        setRiskState(next.risk);
        setSubmitState(next.submit || {});
        setHasSubmitTable(next.hasSubmit !== false);
        return {
          rows: kpiRows.length + projRows.length + monRows.length + budRows.length + riskRows.length,
        };
      },

      async signOut() {
        try {
          await getSupabase().auth.signOut();
        } catch (e) {}
        window.location.href = "/login";
      },
    };
  }, [results, raw, budget, risk, submit, hasSubmitTable, loaded, loadError, saveError, savedHint, userEmail, userName, budgetHasSaved, monthlyHasIssue, hasIndicatorCols, hasKpiItemCols, asOf, fyStarted, role, hasRoles, people, planEdits, hasPlanEdits, planVersion, steps, hasStepsTable, esg, hasEsgTable, reportingOpen, lastReset, hasSettings]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useResults() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResults ต้องอยู่ภายใน ResultsProvider");
  return ctx;
}
