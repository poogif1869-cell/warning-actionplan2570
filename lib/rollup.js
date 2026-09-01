/* =====================================================================
   การรวมยอดจากข้อมูลแผน — คำนวณครั้งเดียวตอน import แล้วใช้ร่วมกันทุกหน้า

   ทุกยอดกรอง lvl === 1 เสมอ เพราะงบของกิจกรรมย่อยรวมอยู่ในงบโครงการแม่แล้ว
   ถ้าบวกข้ามระดับจะได้ราว 25,500 ล้านบาทแทนที่จะเป็น 12,770 ล้านบาท
   ===================================================================== */

import { ITEMS, PROJECTS, FUNDS } from "@/lib/plan";

/* ---------- ยุทธศาสตร์ และกลยุทธ์ภายใต้แต่ละยุทธศาสตร์ ---------- */
export const STRATEGIES = (() => {
  const map = new Map();
  PROJECTS.forEach((p) => {
    if (!p.sNo) return;
    if (!map.has(p.sNo)) {
      map.set(p.sNo, {
        no: p.sNo,
        name: p.strategy,
        so: p.so,
        budget: 0,
        count: 0,
        tactics: new Map(),
      });
    }
    const s = map.get(p.sNo);
    s.budget += p.budget || 0;
    s.count++;
    if (!s.so && p.so) s.so = p.so;

    if (!s.tactics.has(p.tNo)) {
      s.tactics.set(p.tNo, { no: p.tNo, name: p.tactic, budget: 0, count: 0 });
    }
    const t = s.tactics.get(p.tNo);
    t.budget += p.budget || 0;
    t.count++;
  });

  return [...map.values()]
    .sort((a, b) => a.no.localeCompare(b.no))
    .map((s) => ({
      ...s,
      tactics: [...s.tactics.values()].sort((a, b) => a.no.localeCompare(b.no)),
    }));
})();

/* ---------- แหล่งเงิน: เพดานงบเทียบกับที่จัดสรรลงโครงการจริง ---------- */
export const FUND_ROLLUP = FUNDS.map((f) => {
  const rows = PROJECTS.filter((p) => p.fund === f.code);
  const used = rows.reduce((a, b) => a + (b.budget || 0), 0);
  return { ...f, used, count: rows.length, left: (f.ceiling || 0) - used };
});

/* ---------- แผนงาน ---------- */
export const PROGRAMS = (() => {
  const m = new Map();
  PROJECTS.forEach((p) => {
    const k = p.program || "(ไม่ระบุแผนงาน)";
    if (!m.has(k)) m.set(k, { name: k, budget: 0, count: 0 });
    const e = m.get(k);
    e.budget += p.budget || 0;
    e.count++;
  });
  return [...m.values()].sort((a, b) => b.budget - a.budget);
})();

/* ---------- หน่วยงานรับผิดชอบ (ตามข้อความเต็มในไฟล์แผน) ---------- */
export const ORGS = (() => {
  const m = new Map();
  PROJECTS.forEach((p) => {
    const k = p.org || "(ไม่ระบุหน่วยงาน)";
    if (!m.has(k)) m.set(k, { name: k, budget: 0, count: 0 });
    const e = m.get(k);
    e.budget += p.budget || 0;
    e.count++;
  });
  return [...m.values()].sort((a, b) => b.budget - a.budget);
})();

/* =====================================================================
   หน่วยงานแบบแยกส่วน

   ไฟล์แผนเก็บหน่วยงานเป็นสายคั่นด้วย "/" เช่น "ฝยศ./กนผ./กคพ."
   หมายถึงโครงการนี้เกี่ยวข้องกับทั้ง ฝยศ. กนผ. และ กคพ.

   ตัวเลือกในดรอปดาวน์จึงเป็น "หน่วยงานตัวหน้า" (ตัวที่เคยขึ้นต้นสายอย่างน้อยหนึ่งครั้ง)
   แต่การกรองจับ**ทุกตำแหน่งในสาย** เลือก ฝยศ. จึงได้ ฝยศ./กนผ. ฝยศ./กบค. ฯลฯ ครบ
   และโครงการ "สวย./ฝทม." โผล่ทั้งตอนเลือก สวย. และตอนเลือก ฝทม.

   ข้อมูลต้นฉบับพิมพ์ไม่สม่ำเสมอ (ฝพก. กับ ฝพก, สวย. กับ สวย, มีเว้นวรรคหลัง /)
   จึง normalize ด้วยการตัดช่องว่างและจุดท้ายออกก่อนเทียบ ไม่งั้นจะกลายเป็นคนละหน่วยงาน
   ===================================================================== */
export function normUnit(s) {
  return String(s == null ? "" : s).trim().replace(/\.+$/, "");
}

export function orgSegments(org) {
  return String(org == null ? "" : org)
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
}

/* โครงการนี้อยู่ภายใต้หน่วยงาน unit หรือไม่ (จับทุกตำแหน่งในสาย)
   ใช้กับ **การกรอง** เท่านั้น เลือก ฝทม. แล้วต้องเห็น "สวย./ฝทม." ด้วย */
export function inUnit(project, unit) {
  if (!unit) return true;
  const target = normUnit(unit);
  return orgSegments(project.org).some((s) => normUnit(s) === target);
}

/* หน่วยงานเจ้าของโครงการ = ตัวที่ขึ้นต้นสายเท่านั้น
   "สวย./ฝอย." เจ้าของคือ สวย. — ฝอย. เป็นหน่วยร่วม ไม่ใช่เจ้าของ

   ใช้กับ **การรวมยอดงบ** เพราะถ้ารวมทุกตำแหน่งในสาย เงินก้อนเดียวจะถูกนับ
   ให้หลายหน่วยงาน ผลรวมทุกแถวจะเกินยอดจริง
   รวมเฉพาะตัวขึ้นต้นแล้วผลรวมทุกหน่วยงาน = ยอดจริงของทั้งแผนพอดี */
export function leadUnit(project) {
  const segs = orgSegments(project.org);
  return segs.length ? normUnit(segs[0]) : "";
}

/* รายการหน่วยงานสำหรับดรอปดาวน์ — เฉพาะตัวที่เคยขึ้นต้นสาย พร้อมยอดที่จับได้จริง */
export const ORG_UNITS = (() => {
  /* เก็บชื่อที่ใช้แสดงผลจากรูปแบบที่พบบ่อยที่สุด เช่น "ฝพก." ชนะ "ฝพก" */
  const display = new Map();
  const leading = new Set();

  PROJECTS.forEach((p) => {
    const segs = orgSegments(p.org);
    segs.forEach((s, i) => {
      const key = normUnit(s);
      if (!key) return;
      if (i === 0) leading.add(key);
      const cur = display.get(key);
      // เลือกแบบที่ยาวกว่า (มักเป็นแบบที่มีจุดท้าย ซึ่งเป็นรูปแบบทางการ)
      if (!cur || s.length > cur.length) display.set(key, s);
    });
  });

  return [...leading]
    .map((key) => {
      const list = PROJECTS.filter((p) => inUnit(p, key));
      return {
        key,
        name: display.get(key) || key,
        count: list.length,
        budget: list.reduce((a, p) => a + (p.budget || 0), 0),
      };
    })
    .sort((a, b) => b.budget - a.budget || a.name.localeCompare(b.name, "th"));
})();

export function projectsOfUnit(unit) {
  return PROJECTS.filter((p) => inUnit(p, unit));
}

/* โครงการที่หน่วยงานนี้ "เป็นเจ้าของ" (ขึ้นต้นสาย) — ใช้รวมยอดงบ
   โครงการแต่ละอันจะถูกนับให้หน่วยงานเดียวเท่านั้น จึงไม่มีการนับซ้ำ */
export function projectsOwnedBy(unit) {
  const target = normUnit(unit);
  return PROJECTS.filter((p) => leadUnit(p) === target);
}

/* รายการหน่วยงานเจ้าของ พร้อมยอดงบตามแผน ใช้ในตารางสรุปงบประมาณ */
export const ORG_OWNERS = (() => {
  const m = new Map();
  PROJECTS.forEach((p) => {
    const key = leadUnit(p) || "(ไม่ระบุหน่วยงาน)";
    if (!m.has(key)) m.set(key, { key, list: [] });
    m.get(key).list.push(p);
  });

  const display = new Map(ORG_UNITS.map((u) => [u.key, u.name]));

  return [...m.values()]
    .map((g) => ({
      key: g.key,
      name: display.get(g.key) || g.key,
      list: g.list,
      count: g.list.length,
      budget: g.list.reduce((a, p) => a + (p.budget || 0), 0),
    }))
    .sort((a, b) => b.budget - a.budget || a.name.localeCompare(b.name, "th"));
})();

/* =====================================================================
   ความเชื่อมโยงแผน

   ไฟล์แผนเก็บการเชื่อมโยงไว้ 3 แผน แต่ละแผนมีหลายชั้น
   หน้าเว็บให้เลือกได้ว่าจะดูแผนไหน แล้วค่อยเลือกชั้นภายในแผนนั้น
   ===================================================================== */
export const PLAN_LINKS = [
  {
    key: "national",
    name: "ยุทธศาสตร์ชาติ 20 ปี",
    short: "ยุทธศาสตร์ชาติ",
    levels: [
      { key: "nX", label: "ยุทธศาสตร์ชาติ" },
      { key: "nGoal", label: "เป้าหมายของยุทธศาสตร์ชาติ" },
      { key: "nIssue", label: "ประเด็นภายใต้ยุทธศาสตร์ชาติ" },
    ],
  },
  {
    key: "master",
    name: "แผนแม่บทภายใต้ยุทธศาสตร์ชาติ",
    short: "แผนแม่บทฯ",
    levels: [
      { key: "nY", label: "ประเด็นแผนแม่บทฯ" },
      { key: "nYGoal", label: "เป้าหมายของแผนแม่บทฯ" },
      { key: "nSub", label: "แผนย่อยของแผนแม่บทฯ" },
      { key: "nSubGoal", label: "เป้าหมายของแผนย่อย" },
    ],
  },
  {
    key: "moac",
    name: "แผนปฏิบัติราชการ กระทรวงเกษตรและสหกรณ์",
    short: "แผนปฏิบัติราชการ กษ.",
    levels: [
      { key: "mIssue", label: "ประเด็นการพัฒนา" },
      { key: "mWay", label: "แนวทางการพัฒนา" },
    ],
  },
  {
    key: "raot",
    name: "แผนวิสาหกิจ กยท.",
    short: "แผนวิสาหกิจ กยท.",
    levels: [
      { key: "so", label: "วัตถุประสงค์เชิงยุทธศาสตร์ (SO)" },
      { key: "strategy", label: "ยุทธศาสตร์" },
      { key: "tactic", label: "กลยุทธ์" },
    ],
  },
];

/* จัดกลุ่มโครงการตามค่าของฟิลด์หนึ่ง พร้อมยอดงบและรายชื่อโครงการในกลุ่ม */
export function groupByField(key) {
  const m = new Map();
  PROJECTS.forEach((p) => {
    const v = p[key];
    if (!v) return;
    if (!m.has(v)) m.set(v, { value: v, budget: 0, list: [] });
    const e = m.get(v);
    e.budget += p.budget || 0;
    e.list.push(p);
  });
  return [...m.values()].sort((a, b) => b.budget - a.budget);
}

/* จำนวนโครงการที่ไม่ได้ระบุการเชื่อมโยงในชั้นนั้น — ช่องว่างที่ควรตามเก็บ */
export function missingCount(key) {
  return PROJECTS.filter((p) => !p[key]).length;
}

/* =====================================================================
   ทะเบียนความเสี่ยง (มาจากไฟล์แผน ไม่ใช่สิ่งที่ผู้ใช้กรอก)
   ===================================================================== */
export const RISK_TYPES = {
  S: "กลยุทธ์ (Strategic)",
  O: "ปฏิบัติการ (Operational)",
  F: "การเงิน (Financial)",
  C: "กฎระเบียบ (Compliance)",
};

/* คะแนนประเมินการควบคุมภายใน 3 ด้าน ด้านละ 0-3 รวมเต็ม 9 */
export const CONTROL_FIELDS = [
  { key: "rC1", label: "ผลการดำเนินงานเทียบเป้าหมาย" },
  { key: "rC2", label: "กระบวนการควบคุม" },
  { key: "rC3", label: "การติดตาม รายงาน" },
];

export const RISK_ITEMS = ITEMS.filter((x) => x.rScen || x.rFactor);

/* ระดับความเสี่ยงที่ผู้ใช้รายงานรายเดือน */
export const RISK_LEVELS = [
  { value: 0, label: "ไม่มีความเสี่ยง", cls: "ok" },
  { value: 1, label: "ต่ำ", cls: "ok" },
  { value: 2, label: "ปานกลาง", cls: "warn" },
  { value: 3, label: "สูง", cls: "bad" },
  { value: 4, label: "สูงมาก", cls: "bad" },
];

export function riskLevelInfo(level) {
  if (level == null || level === "") return { value: null, label: "ยังไม่รายงาน", cls: "none" };
  return RISK_LEVELS[Number(level)] || { value: null, label: "ยังไม่รายงาน", cls: "none" };
}

/* คะแนนควบคุมภายในยิ่งน้อยยิ่งอ่อน — ใช้จัดลำดับว่าโครงการไหนควรจับตา */
export function controlScore(item) {
  const sum = Number(item.rSum);
  return isFinite(sum) && sum > 0 ? sum : null;
}
