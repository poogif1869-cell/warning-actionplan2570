/* =====================================================================
   กลไกแจ้งเตือนผลการดำเนินงานที่ไม่เป็นไปตามเป้าหมาย

   รับ (results, asOfMonth) แล้วคืนรายการแจ้งเตือน
   asOfMonth = index 0-11 ของเดือนงบประมาณ (0 = ต.ค. 69 ... 11 = ก.ย. 70)

   กฎที่คิดที่ระดับโครงการ (lvl === 1) เท่านั้น เพื่อไม่ให้ยอดงบซ้ำ
   เพราะงบกิจกรรมย่อยรวมอยู่ในงบโครงการแม่แล้ว
   ===================================================================== */

import { KPIS, PROJECTS, MONTHS, monthsOf, achievement } from "@/lib/plan";
import {
  hasReport,
  monthlyOf,
  projectTrack,
  kpiActual,
  spentThrough,
  riskOf,
} from "@/lib/store";
import { riskLevelInfo } from "@/lib/rollup";
import { money, pct, fmt } from "@/lib/format";

/* ---------- เกณฑ์ แยกเป็นค่าคงที่เพื่อให้ปรับได้ที่เดียว ---------- */
export const RULES = {
  kpiCrit: 75,           // บรรลุต่ำกว่านี้ = วิกฤต
  kpiNoReportFrom: 5,    // ตัวชี้วัดที่ยังไม่รายงานผล เริ่มเตือนเมื่อผ่านครึ่งปี (มี.ค. 70)
  missedCrit: 3,         // ขาดรายงานตั้งแต่กี่เดือน = วิกฤต
  spendCrit: 60,         // เบิกจ่ายได้ต่ำกว่า % ของที่ควรได้ = วิกฤต
  spendWarn: 85,         // ต่ำกว่านี้ = เฝ้าระวัง
  riskNoReportFrom: 2,   // โครงการในทะเบียนความเสี่ยงที่ยังไม่เคยรายงาน เริ่มเตือนเดือนที่ 3
};

export const SEV_LABEL = { crit: "วิกฤต", warn: "เฝ้าระวัง" };
export const KIND_LABEL = {
  "kpi-below": "ตัวชี้วัดต่ำกว่าเป้าหมาย",
  "kpi-noreport": "ตัวชี้วัดยังไม่รายงานผล",
  "no-report": "มีแผนแต่ไม่รายงานผล",
  "spend-behind": "เบิกจ่ายต่ำกว่าแผน",
  "status-delayed": "สถานะล่าช้า/ยกเลิก",
  "overdue-open": "ครบกำหนดแล้วยังไม่แล้วเสร็จ",
  "risk-high": "ความเสี่ยงระดับสูง",
  "risk-noreport": "ยังไม่รายงานความเสี่ยง",
};

/* ประเภทที่เกี่ยวกับความเสี่ยง ใช้แยกแดชบอร์ดในหน้าความเสี่ยง */
export const RISK_KINDS = ["risk-high", "risk-noreport"];

/* ---------------------------------------------------------------------
   กฎที่ 1-2: ตัวชี้วัดระดับองค์กร 13 ตัว
   --------------------------------------------------------------------- */
function kpiAlerts(results, asOf) {
  const out = [];
  KPIS.forEach((k) => {
    const actual = kpiActual(results, k.no);
    const p = achievement(actual, k.target, k.dir);

    if (p == null) {
      // ยังไม่กรอกผล — เตือนเมื่อผ่านครึ่งปีงบไปแล้ว ก่อนหน้านั้นถือว่ายังไม่ถึงเวลา
      if (asOf >= RULES.kpiNoReportFrom) {
        out.push({
          id: "kpi-noreport/" + k.no,
          kind: "kpi-noreport",
          sev: "warn",
          title: "ตัวชี้วัดที่ " + k.no + " " + k.name,
          detail:
            "ผ่านมาถึง " + MONTHS[asOf] + " แล้วยังไม่มีการรายงานผล " +
            "(ค่าเป้าหมายปี 2570 = " + fmt(k.target) + " " + k.unit + ")",
          sNo: String(k.s || ""),
          budget: 0,
          kpiNo: k.no,
        });
      }
      return;
    }

    if (p >= 100) return; // บรรลุแล้ว

    out.push({
      id: "kpi-below/" + k.no,
      kind: "kpi-below",
      sev: p < RULES.kpiCrit ? "crit" : "warn",
      title: "ตัวชี้วัดที่ " + k.no + " " + k.name,
      detail:
        "ผลที่รายงาน " + actual + " " + k.unit +
        " จากเป้าหมาย " + fmt(k.target) + " " + k.unit +
        " — บรรลุ " + pct(p) +
        (k.dir === "down" ? " (ตัวชี้วัดนี้ยิ่งน้อยยิ่งดี)" : ""),
      sNo: String(k.s || ""),
      budget: 0,
      kpiNo: k.no,
      achieved: p,
    });
  });
  return out;
}

/* ---------------------------------------------------------------------
   ม้วนผลที่รายงานจากกิจกรรมลูกขึ้นมาที่โครงการแม่

   จำเป็นเพราะแผนรายเดือนอยู่ที่ระดับกิจกรรมเป็นส่วนใหญ่ ผู้ใช้จึงมักกรอกผล
   ที่ระดับกิจกรรมด้วย ถ้าดูแต่ระดับโครงการจะเห็นเป็น "ไม่รายงานเลย" ทั้งที่รายงานแล้ว

   เบิกจ่าย: บวกของโครงการเองกับของกิจกรรมลูกทุกชั้น
   ต่างจากงบ "ตามแผน" ที่ห้ามบวกข้ามระดับ เพราะงบที่ใช้จริงเป็นสิ่งที่ผู้ใช้กรอกเอง
   จะกรอกที่ระดับโครงการหรือระดับกิจกรรมก็ได้ ถ้าไม่บวกทุกระดับเงินที่กรอกไว้
   ที่กิจกรรมจะหายไปจากยอดโครงการ (ต้องตรงกับ budgetRollup ใน lib/store.jsx)
   --------------------------------------------------------------------- */
function descendants(item) {
  const out = [];
  (item._kids || []).forEach((k) => {
    out.push(k);
    descendants(k).forEach((d) => out.push(d));
  });
  return out;
}

export function rolledReport(results, item) {
  const own = monthlyOf(results, item.uid);
  const kids = descendants(item);

  const reported = [];
  for (let i = 0; i < 12; i++) {
    reported[i] =
      hasReport(own[i]) || kids.some((k) => hasReport(monthlyOf(results, k.uid)[i]));
  }

  function spentTo(month) {
    return (
      spentThrough(results, item.uid, month) +
      kids.reduce((a, k) => a + spentThrough(results, k.uid, month), 0)
    );
  }

  const kidsSpent = kids.reduce((a, k) => a + spentThrough(results, k.uid, 11), 0);

  return {
    reported,
    reportedCount: reported.filter(Boolean).length,
    spentTo,
    fromChildren: kidsSpent > 0,
  };
}

/* ---------------------------------------------------------------------
   กฎที่ 3-6: รายโครงการ
   --------------------------------------------------------------------- */
function projectAlerts(results, asOf, risk) {
  const out = [];

  PROJECTS.forEach((p) => {
    // แผนรายเดือนส่วนใหญ่อยู่ที่ระดับกิจกรรม จึงต้องม้วนขึ้นมาเสมอ
    const plan = monthsOf(p);
    const planned = [];
    for (let i = 0; i < 12; i++) if (plan[i]) planned.push(i);

    const roll = rolledReport(results, p);
    const tk = projectTrack(results, p.uid);
    const status = tk.status || "";

    const base = {
      uid: p.uid,
      code: p.code,
      name: p.name,
      org: p.org,
      fund: p.fund,
      sNo: p.sNo,
      tNo: p.tNo,
      budget: p.budget || 0,
    };

    /* --- กฎ 3: มีแผนในเดือนที่ผ่านมาแล้ว แต่ไม่มีรายงานผล --- */
    const missed = planned.filter((i) => i <= asOf && !roll.reported[i]);
    if (missed.length) {
      out.push({
        ...base,
        id: "no-report/" + p.uid,
        kind: "no-report",
        sev: missed.length >= RULES.missedCrit ? "crit" : "warn",
        title: p.name,
        detail:
          "มีแผนดำเนินงาน " + missed.length + " เดือนที่ผ่านมาแล้วแต่ยังไม่รายงานผล: " +
          missed.map((i) => MONTHS[i]).join(", "),
        missed,
      });
    }

    /* --- กฎ 4: เบิกจ่ายต่ำกว่าที่ควรได้ตามสัดส่วนเดือนที่มีแผน ---
       ประเมินเฉพาะโครงการที่รายงานผลมาบ้างแล้ว ถ้ายังไม่รายงานเลย
       กฎ 3 จับไปแล้ว ไม่ต้องเตือนซ้ำ */
    const nReported = roll.reportedCount;
    if (base.budget > 0 && planned.length && nReported > 0) {
      const elapsed = planned.filter((i) => i <= asOf).length;
      if (elapsed > 0) {
        const expected = (base.budget * elapsed) / planned.length;
        const actual = roll.spentTo(asOf);
        const ratio = expected > 0 ? (actual / expected) * 100 : null;
        if (ratio != null && ratio < RULES.spendWarn) {
          out.push({
            ...base,
            id: "spend-behind/" + p.uid,
            kind: "spend-behind",
            sev: ratio < RULES.spendCrit ? "crit" : "warn",
            title: p.name,
            detail:
              "เบิกจ่ายสะสมถึง " + MONTHS[asOf] + " ได้ " + money(actual) +
              " บาท จากที่ควรได้ราว " + money(expected) + " บาท" +
              " (" + elapsed + "/" + planned.length + " เดือนที่มีแผน) — คิดเป็น " + pct(ratio) +
              (roll.fromChildren ? " [รวมยอดจากกิจกรรมย่อย]" : ""),
            spendRatio: ratio,
          });
        }
      }
    }

    /* --- กฎ 5: ผู้ใช้ระบุสถานะเป็นล่าช้าหรือยกเลิก --- */
    if (status === "ล่าช้า" || status === "ยกเลิก") {
      out.push({
        ...base,
        id: "status-delayed/" + p.uid,
        kind: "status-delayed",
        sev: status === "ล่าช้า" ? "crit" : "warn",
        title: p.name,
        detail:
          "ผู้รับผิดชอบระบุสถานะว่า “" + status + "”" +
          (tk.note ? " — " + tk.note : ""),
      });
    }

    /* --- กฎ 6: เดือนสุดท้ายที่มีแผนผ่านไปแล้วแต่ยังไม่แล้วเสร็จ ---
       ข้ามกรณีที่กฎ 5 จับไปแล้ว เพื่อไม่ให้เตือนซ้ำเรื่องเดียวกัน */
    if (planned.length) {
      const last = planned[planned.length - 1];
      if (
        last <= asOf &&
        status !== "แล้วเสร็จ" &&
        status !== "ล่าช้า" &&
        status !== "ยกเลิก"
      ) {
        out.push({
          ...base,
          id: "overdue-open/" + p.uid,
          kind: "overdue-open",
          sev: "crit",
          title: p.name,
          detail:
            "แผนสิ้นสุดเดือน " + MONTHS[last] + " แล้ว แต่สถานะยังเป็น “" +
            (status || "ยังไม่ระบุ") + "” — รายงานผลไปแล้ว " + nReported + "/" +
            planned.length + " เดือน",
        });
      }
    }

    /* --- กฎ 7: ความเสี่ยงที่รายงานไว้อยู่ระดับสูง ---
       ดูรายงานล่าสุดที่ไม่เกินเดือนที่เลือก เพราะความเสี่ยงเดือนเก่าที่แก้ไปแล้ว
       ไม่ควรค้างเตือนอยู่ ถ้าเดือนหลังรายงานว่าลดระดับลงแล้ว */
    const myRisk = riskOf(risk, p.uid);
    let lastRiskMonth = -1;
    for (let i = 0; i <= asOf; i++) {
      const e = myRisk[i];
      if (e && e.level !== "" && e.level != null) lastRiskMonth = i;
    }

    if (lastRiskMonth >= 0) {
      const e = myRisk[lastRiskMonth];
      const level = Number(e.level);
      if (level >= 3) {
        out.push({
          ...base,
          id: "risk-high/" + p.uid,
          kind: "risk-high",
          sev: level >= 4 ? "crit" : "warn",
          title: p.name,
          detail:
            "รายงานความเสี่ยงเดือน " + MONTHS[lastRiskMonth] + " อยู่ระดับ" +
            riskLevelInfo(level).label +
            (e.situation ? " — " + e.situation : "") +
            (e.action ? " · มาตรการ: " + e.action : " · ยังไม่ระบุมาตรการจัดการ"),
          riskLevel: level,
          riskMonth: lastRiskMonth,
        });
      }
    } else if (
      (p.rScen || p.rFactor) &&
      asOf >= RULES.riskNoReportFrom &&
      planned.length
    ) {
      /* --- กฎ 8: อยู่ในทะเบียนความเสี่ยงแต่ยังไม่เคยรายงานความเสี่ยงเลย --- */
      out.push({
        ...base,
        id: "risk-noreport/" + p.uid,
        kind: "risk-noreport",
        sev: "warn",
        title: p.name,
        detail:
          "โครงการนี้อยู่ในทะเบียนความเสี่ยง (" +
          (p.rFactor || p.rScen || "").slice(0, 90) +
          ") แต่ยังไม่เคยรายงานความเสี่ยงเลยจนถึง " + MONTHS[asOf],
      });
    }
  });

  return out;
}

/* ---------------------------------------------------------------------
   รวมทุกกฎ เรียงตามความรุนแรงแล้วตามงบประมาณ
   --------------------------------------------------------------------- */
export function buildAlerts(results, asOf, risk) {
  const all = [
    ...kpiAlerts(results, asOf),
    ...projectAlerts(results, asOf, risk || {}),
  ];
  const rank = { crit: 0, warn: 1 };
  return all.sort((a, b) => {
    if (rank[a.sev] !== rank[b.sev]) return rank[a.sev] - rank[b.sev];
    return (b.budget || 0) - (a.budget || 0);
  });
}

/* สรุปยอดสำหรับไทล์ด้านบนของหน้าแจ้งเตือน */
export function summarize(alerts) {
  const flagged = new Set();
  let crit = 0;
  let warn = 0;
  let budgetAtRisk = 0;
  const seenBudget = new Set();
  const byKind = {};

  alerts.forEach((a) => {
    if (a.sev === "crit") crit++;
    else warn++;
    byKind[a.kind] = (byKind[a.kind] || 0) + 1;
    if (a.uid) {
      flagged.add(a.uid);
      if (!seenBudget.has(a.uid)) {
        seenBudget.add(a.uid);
        budgetAtRisk += a.budget || 0;
      }
    }
  });

  return {
    total: alerts.length,
    crit,
    warn,
    projects: flagged.size,
    budgetAtRisk,
    byKind,
    okProjects: PROJECTS.length - flagged.size,
  };
}

/* จัดกลุ่มตาม uid เพื่อให้ตารางโครงการแสดงจำนวนแจ้งเตือนของแต่ละแถวได้ */
export function groupByUid(alerts) {
  const map = new Map();
  alerts.forEach((a) => {
    if (!a.uid) return;
    if (!map.has(a.uid)) map.set(a.uid, []);
    map.get(a.uid).push(a);
  });
  return map;
}

/* ระดับความรุนแรงสูงสุดของโครงการหนึ่ง */
export function worstSev(list) {
  if (!list || !list.length) return null;
  return list.some((a) => a.sev === "crit") ? "crit" : "warn";
}

/* ---------------------------------------------------------------------
   ตารางเกณฑ์การแจ้งเตือน — เก็บเป็นข้อมูล ไม่ใช่ JSX

   เดิมตารางนี้เขียนเป็น <tr> ตายตัวในหน้าแจ้งเตือน ทำให้ 2 ใน 8 ประเภท
   (ความเสี่ยง) ตกหล่นไปโดยไม่มีใครสังเกต และไฟล์ Excel ก็ไม่มีตารางนี้เลย
   ย้ายมาเป็นอาร์เรย์ตรงนี้ ทั้งตารางบนหน้าจอและชีต Excel จึงอ่านจากที่เดียวกัน
   ตัวเลขทุกตัวมาจาก RULES ไม่ได้พิมพ์ซ้ำ แก้เกณฑ์ที่เดียวแล้วตรงกันหมด

   ต้องรับ MONTHS เข้ามาเป็นพารามิเตอร์ ไม่ import เอง — lib/alerts.js
   ถูก import จาก lib/assistant-prompt.js ที่รันฝั่งเซิร์ฟเวอร์ด้วย
   --------------------------------------------------------------------- */
export function criteriaRows(MONTHS) {
  const m = (i) => (MONTHS && MONTHS[i]) || "เดือนที่ " + (i + 1);
  return [
    [
      KIND_LABEL["kpi-below"],
      "ตัวชี้วัดระดับองค์กร 13 ตัว เทียบผลที่รายงานกับค่าเป้าหมายปี 2570",
      "บรรลุ < " + RULES.kpiCrit + "%",
      "บรรลุ " + RULES.kpiCrit + "–99%",
    ],
    [
      KIND_LABEL["kpi-noreport"],
      "ยังไม่กรอกผลตัวชี้วัด",
      "–",
      "ตั้งแต่ " + m(RULES.kpiNoReportFrom) + " เป็นต้นไป",
    ],
    [
      KIND_LABEL["no-report"],
      "เดือนที่มีแผนดำเนินงานและผ่านไปแล้ว แต่ไม่มีการรายงานผล (แผนรายเดือนม้วนมาจากกิจกรรมย่อย)",
      "ขาด ≥ " + RULES.missedCrit + " เดือน",
      "ขาด 1–" + (RULES.missedCrit - 1) + " เดือน",
    ],
    [
      KIND_LABEL["spend-behind"],
      "เบิกจ่ายสะสม เทียบกับสัดส่วนเดือนที่มีแผนซึ่งผ่านไปแล้ว (ประเมินเฉพาะโครงการที่รายงานผลมาแล้วอย่างน้อย 1 เดือน)",
      "< " + RULES.spendCrit + "% ของที่ควรได้",
      RULES.spendCrit + "–" + RULES.spendWarn + "%",
    ],
    [
      KIND_LABEL["status-delayed"],
      "ผู้รับผิดชอบระบุสถานะเอง",
      "ล่าช้า",
      "ยกเลิก",
    ],
    [
      KIND_LABEL["overdue-open"],
      "เดือนสุดท้ายที่มีแผนผ่านไปแล้ว แต่สถานะยังไม่ใช่ “แล้วเสร็จ”",
      "ทุกกรณี",
      "–",
    ],
    [
      KIND_LABEL["risk-high"],
      "ระดับความเสี่ยงที่รายงานล่าสุด (ดูย้อนหลังได้ ไม่จำกัดเฉพาะเดือนที่เลือก)",
      "สูงมาก",
      "สูง",
    ],
    [
      KIND_LABEL["risk-noreport"],
      "อยู่ในทะเบียนความเสี่ยงตามแผน แต่ยังไม่เคยรายงานความเสี่ยงเลย",
      "–",
      "ตั้งแต่ " + m(RULES.riskNoReportFrom) + " เป็นต้นไป",
    ],
  ];
}
