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

/* ---------- หน่วยงานรับผิดชอบ ---------- */
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
