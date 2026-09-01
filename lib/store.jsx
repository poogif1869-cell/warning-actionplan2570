"use client";

/* =====================================================================
   ผลการดำเนินงาน เก็บใน Supabase

   ตาราง (ดู supabase/schema.sql):
     kpi_results      no, actual
     project_results  uid, code, status, progress, note
     monthly_reports  uid, month, output, outcome, spend
     budget_entries   id, uid, month, occurred_on, note, perdiem, lodging, travel, fuel, saved
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
import { currentFiscalMonth, MONTHS as MONTH_NAMES } from "@/lib/plan";
import { toNum } from "@/lib/format";

const ASOF_KEY = "raot-plan-2570/asof";
const FLUSH_MS = 800;

const emptyResults = () => ({ kpi: {}, project: {} });

/* ---------- ตัวช่วยที่ใช้ทั้งหน้าแจ้งเตือนและหน้ากรอกผล ---------- */
/* แต่ละเดือนเก็บ { o: ผลผลิต, r: ผลลัพธ์, s: เบิกจ่าย (คำนวณมา) } */
export function hasReport(e) {
  return !!(
    e &&
    ((e.o != null && e.o !== "") ||
      (e.r != null && e.r !== "") ||
      (e.s != null && e.s !== ""))
  );
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

/* ---------- รายการงบประมาณ ---------- */
export const COST_FIELDS = [
  { key: "perdiem", label: "ค่าเบี้ยเลี้ยง" },
  { key: "lodging", label: "ค่าที่พัก" },
  { key: "travel", label: "ค่าเดินทาง" },
  { key: "fuel", label: "ค่าน้ำมันเชื้อเพลิง" },
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

/* ยอดแยกตามหมวดค่าใช้จ่าย 4 หมวด ของรายการชุดหนึ่ง */
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
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedHint, setSavedHint] = useState("");
  const [userEmail, setUserEmail] = useState("");
  // ฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุดจะไม่มีคอลัมน์ saved
  // ปิดเฉพาะฟีเจอร์ล็อกรายการ ส่วนที่เหลือยังใช้ได้ตามปกติ
  const [budgetHasSaved, setBudgetHasSaved] = useState(true);
  const hasSavedRef = useRef(true);
  hasSavedRef.current = budgetHasSaved;

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
  });
  const flushTimer = useRef(null);

  const results = useMemo(() => applyBudget(raw, budget), [raw, budget]);

  const snap = useRef({ raw, budget, risk });
  snap.current = { raw, budget, risk };

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

    const [kpiRes, projRes, monRes, riskRes] = await Promise.all([
      supabase.from("kpi_results").select("no,actual"),
      supabase.from("project_results").select("uid,status,progress,note"),
      supabase.from("monthly_reports").select("uid,month,output,outcome,spend"),
      supabase.from("risk_reports").select("uid,month,level,situation,action"),
    ]);

    /* ---------------------------------------------------------------
       คอลัมน์ saved เพิ่มทีหลัง ฐานข้อมูลที่ยังไม่ได้รัน schema.sql รอบล่าสุด
       จะยังไม่มี — ถ้าปล่อยให้ throw ทั้งเว็บจะใช้ไม่ได้เลยทั้งที่ขาดแค่ฟีเจอร์เดียว
       จึงลองใหม่โดยไม่เอาคอลัมน์นั้น แล้วปิดเฉพาะฟีเจอร์ล็อกรายการแทน
       --------------------------------------------------------------- */
    const BUD_COLS = "id,uid,month,occurred_on,note,perdiem,lodging,travel,fuel";
    let hasSaved = true;
    let budRes = await supabase
      .from("budget_entries")
      .select(BUD_COLS + ",saved")
      .order("occurred_on", { ascending: true });

    if (budRes.error && /saved/i.test(budRes.error.message || "")) {
      hasSaved = false;
      budRes = await supabase
        .from("budget_entries")
        .select(BUD_COLS)
        .order("occurred_on", { ascending: true });
    }

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
        monthly: {},
      };
    });

    (monRes.data || []).forEach((row) => {
      if (!nextRaw.project[row.uid]) nextRaw.project[row.uid] = { monthly: {} };
      if (!nextRaw.project[row.uid].monthly) nextRaw.project[row.uid].monthly = {};
      nextRaw.project[row.uid].monthly[row.month] = {
        o: row.output == null ? "" : row.output,
        r: row.outcome == null ? "" : row.outcome,
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
        // ถ้าฐานข้อมูลยังไม่มีคอลัมน์ saved ให้ถือว่าทุกแถวยังแก้ได้
        saved: hasSaved ? row.saved === true : false,
      });
    });

    const nextRisk = {};
    (riskRes.data || []).forEach((row) => {
      if (!nextRisk[row.uid]) nextRisk[row.uid] = {};
      nextRisk[row.uid][row.month] = {
        level: row.level == null ? "" : String(row.level),
        situation: row.situation || "",
        action: row.action || "",
      };
    });

    return { raw: nextRaw, budget: nextBudget, risk: nextRisk, hasSaved };
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getUser();
        if (alive && data && data.user) setUserEmail(data.user.email || "");

        const next = await loadAllWithRetry();
        if (alive) {
          setRaw(next.raw);
          setBudget(next.budget);
          setBudgetHasSaved(next.hasSaved !== false);
          setRiskState(next.risk);
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
        return { uid, month, output: e.o ?? "", outcome: e.r ?? "" };
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
          // ส่งคอลัมน์ saved เฉพาะเมื่อฐานข้อมูลมีจริง ไม่งั้น PostgREST จะปฏิเสธทั้งคำสั่ง
          ...(hasSavedRef.current ? { saved: found.saved === true } : {}),
        });
      });
      if (rows.length) {
        jobs.push(supabase.from("budget_entries").upsert(rows, { onConflict: "id" }));
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
      budgetHasSaved,

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
        setRaw((prev) => ({
          ...prev,
          kpi: { ...prev.kpi, [no]: { ...(prev.kpi[no] || {}), actual } },
        }));
        pending.current.kpi.add(no);
        scheduleFlush();
      },

      setProject(uid, patch) {
        setRaw((prev) => ({
          ...prev,
          project: { ...prev.project, [uid]: { ...(prev.project[uid] || {}), ...patch } },
        }));
        pending.current.project.add(uid);
        scheduleFlush();
      },

      setMonthly(uid, i, patch) {
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
      async addBudgetEntry(uid, month) {
        const supabase = getSupabase();
        const cols = "id,uid,month,occurred_on,note,perdiem,lodging,travel,fuel";
        const { data, error } = await supabase
          .from("budget_entries")
          .insert({
            uid,
            month,
            perdiem: 0,
            lodging: 0,
            travel: 0,
            fuel: 0,
            ...(budgetHasSaved ? { saved: false } : {}),
          })
          .select(budgetHasSaved ? cols + ",saved" : cols)
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
        };
        setBudget((prev) => ({ ...prev, [uid]: [...(prev[uid] || []), entry] }));
        return entry.id;
      },

      updateBudgetEntry(uid, id, patch) {
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
        setBudget((prev) => ({
          ...prev,
          [uid]: (prev[uid] || []).filter((e) => e.id !== id),
        }));
        pending.current.budget.delete(id);
        const { error } = await getSupabase().from("budget_entries").delete().eq("id", id);
        if (error) setSaveError("ลบรายการงบประมาณไม่สำเร็จ: " + error.message);
      },

      /* ---------- รายงานความเสี่ยงรายเดือน ---------- */
      setRisk(uid, month, patch) {
        setRiskState((prev) => {
          const cur = prev[uid] || {};
          return { ...prev, [uid]: { ...cur, [month]: { ...(cur[month] || {}), ...patch } } };
        });
        pending.current.risk.add(uid + "|" + month);
        scheduleFlush();
      },

      /* ล้างข้อมูลของโครงการเดียว — ลบออกจากฐานข้อมูลจริง ทุกคนจะเห็นผล */
      async clearProject(uid) {
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
          setRiskState(next.risk);
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
          });
          Object.keys(p.monthly || {}).forEach((i) => {
            const e = p.monthly[i] || {};
            monRows.push({
              uid,
              month: Number(i),
              output: e.o ?? "",
              outcome: e.r ?? "",
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
        setRiskState(next.risk);
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
  }, [results, raw, budget, risk, loaded, loadError, saveError, savedHint, userEmail, budgetHasSaved, asOf, fyStarted]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useResults() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResults ต้องอยู่ภายใน ResultsProvider");
  return ctx;
}
