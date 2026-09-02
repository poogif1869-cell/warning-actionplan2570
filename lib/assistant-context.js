/* =====================================================================
   ประกอบ "ข้อมูลระบบ" ก้อนเล็ก ๆ ที่ส่งไปพร้อมคำถามให้ผู้ช่วย AI

   หลักการ: ใช้ฟังก์ชันรวมยอดที่หน้าเว็บใช้อยู่แล้วทั้งหมด ไม่เขียนตรรกะซ้ำ
   ถ้าเขียนใหม่ที่นี่ ตัวเลขที่บอทตอบจะค่อย ๆ เพี้ยนไปจากที่หน้าเว็บแสดง
   โดยไม่มีใครสังเกต

   ห้ามส่ง data/plan-data.json ทั้งก้อน (404 KB) — ส่งเฉพาะสรุปกับโครงการที่เกี่ยวข้อง

   ไฟล์นี้ทำงานฝั่งเบราว์เซอร์ (import lib/store.jsx ที่เป็น "use client")
   ===================================================================== */

import {
  META,
  MONTHS,
  KPIS,
  PROJECTS,
  achievement,
  monthsOf,
} from "@/lib/plan";
import {
  STRATEGIES,
  FUND_ROLLUP,
  PROGRAMS,
  ORG_OWNERS,
  ORG_UNITS,
  normUnit,
  inUnit,
  leadUnit,
  riskLevelInfo,
} from "@/lib/rollup";
import {
  buildAlerts,
  summarize,
  groupByUid,
  KIND_LABEL,
  SEV_LABEL,
  rolledReport,
} from "@/lib/alerts";
import {
  COST_FIELDS,
  budgetRollup,
  entriesByCost,
  kpiActual,
  projectTrack,
  riskOf,
  monthlyOf,
  hasReport,
} from "@/lib/store";

const MAX_PROJECTS = 8;   // โครงการที่ส่งรายละเอียดเต็มไปด้วย
const MAX_ALERTS = 15;    // การแจ้งเตือนที่ส่งไปเป็นรายการ

const round = (n) => Math.round(Number(n) || 0);

/* ---------------------------------------------------------------------
   หาโครงการที่เกี่ยวกับคำถาม

   ภาษาไทยไม่เว้นวรรคระหว่างคำ จะตัดคำให้ถูกต้องต้องมี dictionary
   ซึ่งเกินความจำเป็น จึงใช้สามชั้นนี้แทน แล้วปล่อยให้บอทขอชื่อโครงการเพิ่ม
   ถ้าหาไม่เจอ
   --------------------------------------------------------------------- */
function matchProjects(question) {
  const q = String(question || "");
  if (!q.trim()) return [];

  const picked = new Map();
  const add = (p) => {
    if (p && !picked.has(p.uid)) picked.set(p.uid, p);
  };

  /* 1. รหัสโครงการที่พิมพ์มาตรง ๆ */
  (q.match(/\d{6,9}/g) || []).forEach((code) => {
    PROJECTS.filter((p) => p.code === code).forEach(add);
  });

  /* 2. ชื่อหน่วยงานที่ปรากฏในคำถาม — เอาโครงการของหน่วยนั้น (เรียงตามงบ) */
  if (picked.size < MAX_PROJECTS) {
    ORG_UNITS.forEach((u) => {
      if (picked.size >= MAX_PROJECTS) return;
      const name = normUnit(u.name);
      if (name.length < 2 || q.indexOf(name) < 0) return;
      PROJECTS.filter((p) => inUnit(p, u.key))
        .slice()
        .sort((a, b) => (b.budget || 0) - (a.budget || 0))
        .slice(0, MAX_PROJECTS)
        .forEach(add);
    });
  }

  /* 3. ชิ้นส่วนคำยาว ๆ ที่ตรงกันระหว่างคำถามกับชื่อโครงการ
        นับความยาวที่ตรงกันมากที่สุดเป็นคะแนน แล้วเอาอันดับต้น ๆ */
  if (picked.size < MAX_PROJECTS) {
    const scored = [];
    PROJECTS.forEach((p) => {
      const name = String(p.name || "");
      let best = 0;
      for (let len = Math.min(name.length, 24); len >= 4 && len > best; len--) {
        for (let i = 0; i + len <= name.length; i++) {
          if (q.indexOf(name.substr(i, len)) >= 0) {
            best = len;
            break;
          }
        }
      }
      if (best >= 4) scored.push({ p, best });
    });
    scored
      .sort((a, b) => b.best - a.best || (b.p.budget || 0) - (a.p.budget || 0))
      .slice(0, MAX_PROJECTS)
      .forEach((x) => add(x.p));
  }

  return [...picked.values()].slice(0, MAX_PROJECTS);
}

/* รายละเอียดเต็มของโครงการหนึ่ง — ตัวเลขชุดเดียวกับที่ลิ้นชักในหน้าโครงการแสดง */
function projectDetail(p, { results, budget, risk, asOfMonth, allMonths, alertsByUid }) {
  const month = allMonths ? null : asOfMonth;
  const roll = budgetRollup(budget, p, month);
  const yearRoll = budgetRollup(budget, p, null);
  const tk = projectTrack(results, p.uid);
  const plan = monthsOf(p);
  const planned = [];
  for (let i = 0; i < 12; i++) if (plan[i]) planned.push(MONTHS[i]);

  const rep = rolledReport(results, p);
  const reportedMonths = [];
  for (let i = 0; i < 12; i++) if (rep.reported[i]) reportedMonths.push(MONTHS[i]);

  const own = monthlyOf(results, p.uid);
  const notes = [];
  for (let i = 0; i < 12; i++) {
    const e = own[i];
    if (!hasReport(e)) continue;
    if (!allMonths && i > asOfMonth) continue;
    notes.push({
      เดือน: MONTHS[i],
      ผลผลิต: e.o || "",
      ผลลัพธ์: e.r || "",
      ปัญหาอุปสรรค: e.issue || "",
      วิธีแก้: e.solution || "",
    });
  }

  const rk = riskOf(risk, p.uid);
  let lastRisk = null;
  for (let i = asOfMonth; i >= 0; i--) {
    const e = rk[i];
    if (e && e.level != null && e.level !== "") {
      lastRisk = {
        เดือน: MONTHS[i],
        ระดับ: riskLevelInfo(e.level).label,
        สถานการณ์: e.situation || "",
        การจัดการ: e.action || "",
      };
      break;
    }
  }

  const alerts = (alertsByUid.get(p.uid) || []).map(
    (a) => SEV_LABEL[a.sev] + ": " + KIND_LABEL[a.kind] + " — " + a.detail
  );

  return {
    รหัส: p.code,
    ชื่อโครงการ: p.name,
    หน่วยงานรับผิดชอบ: p.org,
    หน่วยงานเจ้าของงบ: leadUnit(p),
    ยุทธศาสตร์: p.strategy,
    กลยุทธ์: p.tactic,
    แผนงาน: p.program,
    แหล่งเงิน: p.fund,
    งบตามแผน: round(p.budget),
    ผลผลิตที่คาดหวัง: p.output || "",
    ผลลัพธ์ที่คาดหวัง: p.outcome || "",
    มีกิจกรรมย่อย: (p._kids || []).length,
    เดือนที่มีแผน: planned,
    เดือนที่รายงานผลแล้ว: reportedMonths,
    สถานะ: tk.status || "ยังไม่ระบุ",
    ความก้าวหน้าร้อยละ: tk.progress == null || tk.progress === "" ? null : Number(tk.progress),
    ผลตามตัวชี้วัดผลผลิต: tk.outputResult || "",
    ปัญหาอุปสรรคของผลผลิต: tk.outputIssue || "",
    ผลตามตัวชี้วัดผลลัพธ์: tk.outcomeResult || "",
    ปัญหาอุปสรรคของผลลัพธ์: tk.outcomeIssue || "",
    บันทึกเพิ่มเติม: tk.note || "",
    งบที่ใช้ไปทั้งปี: round(yearRoll.total),
    งบที่ใช้ไปถึงช่วงที่เลือก: round(roll.total),
    งบคงเหลือ: round((p.budget || 0) - yearRoll.total),
    งบที่ใช้แยกตามหมวด: costMap(
      entriesByCost([
        ...roll.own,
        ...roll.byActivity.reduce((a, x) => a.concat(x.list), []),
      ])
    ),
    งบที่ลงไว้ที่กิจกรรมย่อย: roll.byActivity.map((x) => ({
      กิจกรรม: x.item.name,
      ยอด: round(x.total),
    })),
    รายงานรายเดือน: notes,
    ความเสี่ยงล่าสุด: lastRisk,
    การแจ้งเตือนของโครงการนี้: alerts,
  };
}

function costMap(sums) {
  const out = {};
  COST_FIELDS.forEach((c) => (out[c.label] = round(sums[c.key])));
  return out;
}

/* ---------------------------------------------------------------------
   ตัวหลัก
   --------------------------------------------------------------------- */
export function buildContext({
  results,
  budget,
  risk,
  asOfMonth,
  allMonths,
  asOfLabel,
  question,
}) {
  const month = allMonths ? null : asOfMonth;
  const alerts = buildAlerts(results, asOfMonth, risk);
  const sum = summarize(alerts);
  const alertsByUid = groupByUid(alerts);

  /* ยอดเบิกจ่ายรวมทั้งองค์กร — บวกที่ระดับโครงการด้วย budgetRollup
     (โครงการ + กิจกรรมลูก) จึงไม่นับซ้ำและไม่ตกหล่น */
  let spentAll = 0;
  const costAll = {};
  COST_FIELDS.forEach((c) => (costAll[c.key] = 0));
  const perProject = new Map();

  PROJECTS.forEach((p) => {
    const r = budgetRollup(budget, p, month);
    perProject.set(p.uid, r.total);
    spentAll += r.total;
    const flat = [...r.own, ...r.byActivity.reduce((a, x) => a.concat(x.list), [])];
    const c = entriesByCost(flat);
    COST_FIELDS.forEach((f) => (costAll[f.key] += c[f.key]));
  });

  const plannedAll = PROJECTS.reduce((a, p) => a + (p.budget || 0), 0);

  /* เบิกจ่ายรายเดือน — ทุกเดือนของปีงบ ไม่ตัดตามช่วงที่เลือก
     เพราะคำถามอย่าง "เดือนไหนเบิกมากสุด" ต้องเห็นทั้งปี */
  const byMonth = MONTHS.map((label, i) => {
    let t = 0;
    PROJECTS.forEach((p) => (t += budgetRollup(budget, p, i).total));
    return { เดือน: label, เบิกจ่าย: round(t) };
  });

  const orgRows = ORG_OWNERS.map((u) => {
    const spent = u.list.reduce((a, p) => a + (perProject.get(p.uid) || 0), 0);
    return {
      หน่วยงาน: u.name,
      จำนวนโครงการ: u.count,
      งบตามแผน: round(u.budget),
      เบิกจ่าย: round(spent),
      ร้อยละเบิกจ่าย: u.budget ? Math.round((spent / u.budget) * 1000) / 10 : null,
    };
  });

  const strategyRows = STRATEGIES.map((s) => {
    const list = PROJECTS.filter((p) => p.sNo === s.no);
    const spent = list.reduce((a, p) => a + (perProject.get(p.uid) || 0), 0);
    return {
      ยุทธศาสตร์: "ที่ " + s.no + " " + s.name,
      เป้าประสงค์: s.so || "",
      จำนวนโครงการ: s.count,
      งบตามแผน: round(s.budget),
      เบิกจ่าย: round(spent),
      กลยุทธ์: s.tactics.map((t) => ({
        กลยุทธ์: (t.no ? "ที่ " + t.no + " " : "") + t.name,
        จำนวนโครงการ: t.count,
        งบตามแผน: round(t.budget),
      })),
    };
  });

  const kpiRows = KPIS.map((k) => {
    const actual = kpiActual(results, k.no);
    const pct = achievement(actual, k.target, k.dir);
    return {
      ตัวชี้วัด: "ที่ " + k.no + " " + k.name,
      ยุทธศาสตร์: k.s ? "ที่ " + k.s : "",
      เป้าหมาย: k.target,
      หน่วย: k.unit,
      ผลที่รายงาน: actual == null || actual === "" ? "ยังไม่รายงาน" : actual,
      บรรลุร้อยละ: pct == null ? null : Math.round(pct * 10) / 10,
      ทิศทาง: k.dir === "down" ? "ยิ่งน้อยยิ่งดี" : "ยิ่งมากยิ่งดี",
    };
  });

  const related = matchProjects(question).map((p) =>
    projectDetail(p, { results, budget, risk, asOfMonth, allMonths, alertsByUid })
  );

  return {
    ช่วงเวลาที่ผู้ใช้เลือกอยู่: asOfLabel,
    เดือนที่ใช้คำนวณถึง: MONTHS[asOfMonth],
    ภาพรวมแผน: {
      หน่วยงาน: META.org,
      แผน: META.plan,
      งบรวมทั้งแผน: round(META.totals.grand),
      งบระดับโครงการ: round(plannedAll),
      จำนวนโครงการ: PROJECTS.length,
      งบรายการอื่นที่ไม่ใช่โครงการ: round(META.totals.other),
    },
    สรุปการแจ้งเตือน: {
      ทั้งหมด: sum.total,
      วิกฤต: sum.crit,
      เฝ้าระวัง: sum.warn,
      โครงการที่ถูกแจ้งเตือน: sum.projects,
      โครงการที่ยังไม่มีปัญหา: sum.okProjects,
      งบที่อยู่ในโครงการที่ถูกแจ้งเตือน: round(sum.budgetAtRisk),
      แยกตามประเภท: Object.keys(sum.byKind).reduce((o, k) => {
        o[KIND_LABEL[k] || k] = sum.byKind[k];
        return o;
      }, {}),
    },
    การแจ้งเตือนสำคัญ: alerts.slice(0, MAX_ALERTS).map((a) => ({
      ความรุนแรง: SEV_LABEL[a.sev],
      ประเภท: KIND_LABEL[a.kind],
      เรื่อง: a.title,
      รายละเอียด: a.detail,
      รหัสโครงการ: a.code || "",
      หน่วยงาน: a.org || "",
      งบตามแผน: round(a.budget),
    })),
    การแจ้งเตือนที่เหลือไม่ได้ส่งมา:
      alerts.length > MAX_ALERTS ? alerts.length - MAX_ALERTS : 0,
    งบประมาณ: {
      งบตามแผนรวม: round(plannedAll),
      เบิกจ่ายถึงช่วงที่เลือก: round(spentAll),
      คงเหลือ: round(plannedAll - spentAll),
      ร้อยละเบิกจ่าย: plannedAll ? Math.round((spentAll / plannedAll) * 1000) / 10 : 0,
      แยกตามหมวดค่าใช้จ่าย: costMap(costAll),
      เบิกจ่ายรายเดือนทั้งปี: byMonth,
    },
    สรุปตามหน่วยงานเจ้าของงบ: orgRows,
    สรุปตามยุทธศาสตร์: strategyRows,
    สรุปตามแหล่งเงิน: FUND_ROLLUP.map((f) => ({
      แหล่งเงิน: f.code + " " + f.name,
      เพดานงบ: round(f.ceiling),
      จัดสรรลงโครงการแล้ว: round(f.used),
      คงเหลือจากเพดาน: round(f.left),
      จำนวนโครงการ: f.count,
    })),
    สรุปตามแผนงาน: PROGRAMS.map((g) => ({
      แผนงาน: g.name,
      จำนวนโครงการ: g.count,
      งบตามแผน: round(g.budget),
    })),
    ตัวชี้วัดองค์กร: kpiRows,
    โครงการที่เกี่ยวกับคำถาม: related,
    หมายเหตุ:
      related.length === 0
        ? "ไม่พบโครงการที่ตรงกับคำถามนี้ ถ้าผู้ใช้ถามถึงโครงการเฉพาะ ให้ขอชื่อหรือรหัสโครงการเพิ่ม"
        : "รายละเอียดรายโครงการมีเฉพาะที่อยู่ในรายการนี้เท่านั้น",
  };
}
