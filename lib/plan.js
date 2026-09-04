/* =====================================================================
   ข้อมูลแผนปฏิบัติการ กยท. ปีงบประมาณ 2570
   แตกจาก แผนปฏิบัติการ.xlsx (ชีต 3.1/3.3) + ยุทธศาสตร์ฯ ปี 70.docx
   ไฟล์ data/plan-data.json ใช้ string table: ทุกฟิลด์ข้อความเก็บเป็น index
   ชี้ไปอาร์เรย์ S และแต่ละแถวเป็นอาร์เรย์เรียงตาม fields
   ===================================================================== */

import PLAN from "@/data/plan-data.json";

const STRING_FIELDS = new Set([
  "code", "name", "output", "outcome", "so", "program", "strategy", "kpi",
  "tactic", "policy", "ptype", "summary", "fund", "org", "period", "nX",
  "nGoal", "nIssue", "nY", "nYGoal", "nSub", "nSubGoal", "mIssue", "mWay",
  "rScen", "rFactor", "rType",
]);

export const META = PLAN.meta;
export const FUNDS = PLAN.funds;
export const KPIS = PLAN.kpis;

export const MONTHS = [
  "ต.ค. 69", "พ.ย. 69", "ธ.ค. 69", "ม.ค. 70", "ก.พ. 70", "มี.ค. 70",
  "เม.ย. 70", "พ.ค. 70", "มิ.ย. 70", "ก.ค. 70", "ส.ค. 70", "ก.ย. 70",
];
export const MONTHS_SHORT = [
  "ต.ค.", "พ.ย.", "ธ.ค.", "ม.ค.", "ก.พ.", "มี.ค.",
  "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.",
];

export const STATUSES = ["ยังไม่เริ่ม", "กำลังดำเนินการ", "แล้วเสร็จ", "ล่าช้า", "ยกเลิก"];

/* ---------------------------------------------------------------------
   materialize แถวกลับเป็น object

   หมายเหตุสำคัญ: ไฟล์ต้นทางมีรหัสซ้ำ 9 รหัส (544 รหัสไม่ซ้ำจาก 553 แถว)
   โดย 4 คู่อยู่ที่ระดับโครงการและเป็นคนละโครงการจริง ๆ เช่น 010109 ใช้ทั้งกับ
   "คาร์บอนเครดิต" (60 ล้าน) และ "แปลงต้นแบบสวนยางปราณีต" (1.44 ล้าน)
   เว็บเดิมเก็บผลติดตามด้วย track.project[code] จึงทำให้สองโครงการนั้นใช้ข้อมูลปนกัน
   ที่นี่จึงคีย์ด้วย uid = code + "#" + ลำดับแถว แทน
   --------------------------------------------------------------------- */
export const uid = (code, i) => code + "#" + i;

/* ---------------------------------------------------------------------
   BASE = แผนตามไฟล์ต้นฉบับ ไม่มีการแก้ไขใด ๆ ทับ — **ห้ามแก้ค่าในนี้**

   ทุกครั้งที่มีการแก้ไขจากถังข้อมูล (plan_edits) จะสร้าง ITEMS ขึ้นใหม่
   จาก BASE เสมอ ไม่ได้แก้ทับของเดิมสะสมไปเรื่อย ๆ เพราะถ้าแก้ทับสะสม
   การถอนรายการแก้ไขออกหนึ่งรายการจะคืนค่าเดิมไม่ได้
   และ reconcile() ยังเทียบกับไฟล์ต้นฉบับได้อยู่เสมอ ไม่ว่าจะแก้ไปกี่รอบ
   --------------------------------------------------------------------- */
const BASE = PLAN.rows.map((row, i) => {
  const o = { _i: i };
  PLAN.fields.forEach((name, j) => {
    o[name] = STRING_FIELDS.has(name) ? PLAN.S[row[j]] : row[j];
  });
  o.uid = uid(o.code, i);
  o.sNo = (o.strategy.match(/ยุทธศาสตร์ที่\s*(\d)/) || [])[1] || "";
  o.tNo = (o.tactic.match(/กลยุทธ์ที่\s*(\d\.\d)/) || [])[1] || "";
  // ไฟล์ต้นทางมีบางแถวใส่ "0" ในช่องประเภทความเสี่ยง ถือว่าไม่ได้ระบุ
  if (o.rType === "0") o.rType = "";
  return o;
});

/* ต้องเป็น let ไม่ใช่ const เพราะถูกสร้างใหม่ทุกครั้งที่แผนถูกแก้
   ES module เป็น live binding ไฟล์ที่ import ไปจึงเห็นค่าใหม่เอง */
export let ITEMS = [];
export let PROJECTS = [];   // ตั้งต้น 121 โครงการ
export let ACTIVITIES = []; // กิจกรรม/กิจกรรมย่อย
export let NONPROJECT = []; // ค่าใช้จ่ายอื่น
export let byUid = new Map();

/* ---------- ประกอบ ITEMS จากรายการที่ให้มา แล้วผูกแม่ลูก ---------- */
function link(list) {
  ITEMS = list;
  PROJECTS = ITEMS.filter((x) => x.lvl === 1);
  ACTIVITIES = ITEMS.filter((x) => x.lvl >= 2);
  NONPROJECT = ITEMS.filter((x) => x.lvl === 0);
  byUid = new Map(ITEMS.map((x) => [x.uid, x]));

  /* ผูกลูกเข้ากับแม่ตามความยาวรหัส: 6 หลัก = โครงการ, 8 = กิจกรรม, 9 = กิจกรรมย่อย
     รหัสซ้ำ: ผูกเข้ากับแม่ตัวแรกที่เจอ ซึ่งเป็นพฤติกรรมเดียวกับเว็บเดิม */
  const firstByCode = new Map();
  ITEMS.forEach((x) => { if (!firstByCode.has(x.code)) firstByCode.set(x.code, x); });

  ITEMS.forEach((x) => {
    if (x.lvl >= 2) {
      const parent = firstByCode.get(x.code.slice(0, x.lvl === 2 ? 6 : 8));
      if (parent && parent !== x) {
        x._parent = parent;
        (parent._kids = parent._kids || []).push(x);
      }
    }
  });
}

/* baseBudget = งบตามไฟล์แผนเดิม ติดไปกับทุกรายการตั้งแต่ต้น
   ไม่ได้ใส่เฉพาะรายการที่ถูกแก้ เพราะแดชบอร์ดต้องเทียบ "งบเดิม vs งบปัจจุบัน"
   ของทั้งแผน ถ้าใส่เฉพาะที่แก้ ต้องเขียน ?? p.budget กระจายทุกที่ที่รวมยอด */
function fresh() {
  return BASE.map((o) => ({ ...o, baseBudget: o.budget }));
}

link(fresh());

/* ---------------------------------------------------------------------
   ทับแผนด้วยรายการแก้ไขจากถังข้อมูล

   รับเฉพาะรายการที่ status === "approved" เท่านั้น — ร่างถูกเก็บไว้ในถัง
   แต่ไม่มีผลกับตัวเลขใด ๆ ตามที่ตกลงกันไว้

   **ต้องเรียก rebuildRollups() ของ lib/rollup.js ต่อทันทีเสมอ**
   ที่นี่เรียกเองไม่ได้เพราะ rollup.js import ไฟล์นี้อยู่ ถ้า import กลับ
   จะเป็นวงกลม แล้วแล้วแต่ว่าใครถูกโหลดก่อน จะพังที่ TDZ ของ let PROJECTS
   ตัวที่เรียกทั้งคู่คือ lib/store.jsx
   --------------------------------------------------------------------- */
export function applyPlanEdits(edits) {
  const list = fresh();
  const map = new Map(list.map((x) => [x.uid, x]));

  const approved = (edits || [])
    .filter((e) => e && e.status === "approved")
    .slice()
    .sort((a, b) => String(a.updated_at || "").localeCompare(String(b.updated_at || "")));

  const dropCodes = [];

  approved.forEach((e) => {
    const d = e.data || {};

    if (e.kind === "add") {
      if (map.has(e.uid)) return;
      const it = newItem(e.uid, d);
      list.push(it);
      map.set(it.uid, it);
      return;
    }

    const t = map.get(e.uid);
    if (!t) return;

    if (e.kind === "delete") {
      t._deleted = true;
      // ลบโครงการแล้วกิจกรรมใต้โครงการนั้นต้องหายไปด้วย
      // ไม่งั้นจะเหลือกิจกรรมลอย ๆ ที่ไม่มีแม่ แต่ยังโผล่ในตารางกิจกรรม
      if (t.lvl === 1) dropCodes.push(t.code);
      return;
    }

    if (e.kind === "budget") {
      if (d.budget != null && d.budget !== "") t.budget = Number(d.budget) || 0;
      t._budgetEdited = true;
      return;
    }

    if (e.kind === "kpi") {
      ["output", "outcome", "kpi"].forEach((k) => {
        if (d[k] != null) t[k] = d[k];
      });
      t._kpiEdited = true;
      return;
    }

    if (e.kind === "schedule") {
      if (Array.isArray(d.months) && d.months.length === 12) {
        t.months = d.months.map((v) => (v ? 1 : 0));
      }
      if (d.period != null) t.period = d.period;
      t._scheduleEdited = true;
    }
  });

  link(
    list.filter(
      (x) =>
        !x._deleted &&
        !(x.lvl >= 2 && dropCodes.some((c) => x.code.startsWith(c)))
    )
  );
}

/* ---------- สร้างรายการใหม่จากข้อมูลที่กรอกในหน้าเพิ่มโครงการ ----------
   ต้องมีฟิลด์ครบเท่ารายการที่มาจากไฟล์แผน ไม่งั้นโค้ดที่อ่าน p.output
   หรือ p.months[i] ตรง ๆ จะพังทันทีที่เจอรายการที่เพิ่มเข้ามาใหม่ */
function newItem(id, d) {
  const o = {
    _i: 100000,
    _added: true,
    uid: id,
    code: String(d.code || ""),
    lvl: Number(d.lvl) || 1,
    name: d.name || "",
    output: d.output || "",
    outcome: d.outcome || "",
    kpi: d.kpi || "",
    so: d.so || "",
    program: d.program || "",
    strategy: d.strategy || "",
    tactic: d.tactic || "",
    policy: d.policy || "",
    ptype: d.ptype || "",
    summary: d.summary || "",
    fund: d.fund || "",
    org: d.org || "",
    period: d.period || "",
    budget: Number(d.budget) || 0,
    months:
      Array.isArray(d.months) && d.months.length === 12
        ? d.months.map((v) => (v ? 1 : 0))
        : new Array(12).fill(0),
    rScen: d.rScen || "",
    rFactor: d.rFactor || "",
    rType: d.rType || "",
  };
  // ฟิลด์การเชื่อมโยงแผนที่ยังไม่ได้กรอก ต้องเป็นสตริงว่าง ไม่ใช่ undefined
  ["nX", "nGoal", "nIssue", "nY", "nYGoal", "nSub", "nSubGoal", "mIssue", "mWay"].forEach(
    (k) => { o[k] = d[k] || ""; }
  );
  // รายการที่เพิ่มเข้ามาใหม่ไม่มีงบในแผนเดิม จึงเป็น 0 ไม่ใช่เท่ากับงบปัจจุบัน
  // ไม่งั้นการเพิ่มโครงการจะไม่ปรากฏในผลต่าง "แผนเดิม vs ปัจจุบัน" เลย
  o.baseBudget = 0;
  o.sNo = (o.strategy.match(/ยุทธศาสตร์ที่\s*(\d)/) || [])[1] || "";
  o.tNo = (o.tactic.match(/กลยุทธ์ที่\s*(\d\.\d)/) || [])[1] || "";
  return o;
}

/* uid ของรายการที่เพิ่มเข้ามาใหม่ — ต้องไม่ชนกับ code#index ของไฟล์แผน
   จึงใส่คำว่า new คั่น (รหัสในไฟล์แผนเป็นตัวเลขล้วนเสมอ) */
export function newUid(code) {
  return code + "#new-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* แผนรายเดือนส่วนใหญ่อยู่ที่ระดับกิจกรรม ไม่ใช่โครงการ
   (399/553 แถวมีธงเดือน แต่ระดับโครงการมีเองแค่ 12/121)
   จึงต้องม้วนของลูกขึ้นมาที่แม่เสมอ — ห้ามอ่าน item.months ตรง ๆ */
export function monthsOf(item) {
  const out = item.months.slice();
  (item._kids || []).forEach((k) => {
    monthsOf(k).forEach((v, i) => { if (v) out[i] = out[i] || v; });
  });
  return out;
}

/* เดือนที่มีแผน (index 0-11) ของรายการหนึ่ง */
export function plannedMonths(item) {
  const m = monthsOf(item);
  const out = [];
  for (let i = 0; i < 12; i++) if (m[i]) out.push(i);
  return out;
}

/* ---------- สถานะการบรรลุตัวชี้วัด — สูตรเดียวกับเว็บเดิมทุกประการ ---------- */
export function achievement(actual, target, dir) {
  if (actual == null || actual === "" || target == null || !isFinite(target)) return null;
  const a = Number(actual);
  if (!isFinite(a)) return null;
  if (dir === "down") {
    if (a === 0) return 100;
    if (target === 0) return null;
    return Math.min(100, (target / a) * 100);
  }
  if (target === 0) return null;
  return Math.min(100, (a / target) * 100);
}

export function statusOf(p) {
  if (p == null) return { cls: "none", label: "ยังไม่รายงานผล" };
  if (p >= 100) return { cls: "ok", label: "บรรลุเป้าหมาย" };
  if (p >= 75) return { cls: "warn", label: "ใกล้บรรลุ" };
  return { cls: "bad", label: "ต่ำกว่าเป้าหมาย" };
}

/* ---------- ยอดกระทบยอดกับไฟล์ต้นฉบับ (ใช้ในแถบตรวจสอบท้ายหน้าแจ้งเตือน) ---------- */
export const EXPECTED = {
  rows: 553,
  projects: 121,
  projectBudget: 12769902181,
  byStrategy: {
    1: { budget: 9999683542, count: 40 },
    2: { budget: 310107800, count: 15 },
    3: { budget: 1515144445, count: 58 },
    4: { budget: 944966394, count: 8 },
  },
};

/* งบรวมต้องกรอง lvl === 1 เท่านั้น — งบกิจกรรมย่อยรวมอยู่ในงบโครงการแม่แล้ว
   ถ้าบวกข้ามระดับจะได้ราว 25.5 พันล้านแทนที่จะเป็น 12.7 พันล้าน */
/* ต้องนับจาก BASE ไม่ใช่ PROJECTS — ตารางนี้ตอบคำถามว่า "ข้อมูลที่ฝังมา
   ตรงกับไฟล์ต้นฉบับไหม" ถ้านับจาก PROJECTS ที่ทับด้วยถังการแก้ไขแล้ว
   พอมีคนเพิ่มโครงการหนึ่งโครงการ แถบตรวจสอบจะขึ้นแดงทันทีทั้งที่ไม่มีอะไรผิด */
export function reconcile() {
  const byStrategy = {};
  let projectBudget = 0;
  BASE.filter((x) => x.lvl === 1).forEach((p) => {
    projectBudget += p.budget || 0;
    if (!p.sNo) return;
    if (!byStrategy[p.sNo]) byStrategy[p.sNo] = { budget: 0, count: 0 };
    byStrategy[p.sNo].budget += p.budget || 0;
    byStrategy[p.sNo].count++;
  });
  return {
    rows: BASE.length,
    projects: BASE.filter((x) => x.lvl === 1).length,
    projectBudget,
    byStrategy,
  };
}

/* ---------- ปีงบประมาณ 2570 = ต.ค. 2026 - ก.ย. 2027 ----------
   ถ้าวันนี้ยังไม่ถึงปีงบ ให้เริ่มที่เดือนแรก เพื่อไม่ให้หน้าแจ้งเตือนว่างเปล่าโดยไม่มีคำอธิบาย */
export function currentFiscalMonth(now) {
  const d = now || new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0 = ม.ค.
  // ต.ค. 2026 (y=2026, m=9) คือ index 0
  const idx = (y - 2026) * 12 + (m - 9);
  if (idx < 0) return { index: 0, started: false };
  if (idx > 11) return { index: 11, started: true, ended: true };
  return { index: idx, started: true };
}
