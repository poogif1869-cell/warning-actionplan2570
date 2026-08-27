"use client";

/* =====================================================================
   ผลการดำเนินงาน = baseline ในrepo + overlay ใน localStorage

   - data/results-2570.json  คือค่าฐานที่ commit ไว้ ทุกคนที่ login เห็นเหมือนกัน
   - localStorage            คือสิ่งที่ผู้ใช้เครื่องนั้นกรอกเพิ่ม ทับค่าฐานเป็นรายฟิลด์
   - ส่งออกไฟล์ผล -> เอาไปวางทับ data/results-2570.json แล้ว commit
     คือวิธีรวมข้อมูลจากหลายคนโดยไม่ต้องมี Database

   คีย์ของโครงการใช้ uid (code + "#" + ลำดับแถว) ไม่ใช่ code เพราะไฟล์ต้นทาง
   มีรหัสซ้ำ 9 รหัส ถ้าใช้ code สองโครงการที่รหัสชนกันจะใช้ข้อมูลก้อนเดียวกัน
   ===================================================================== */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import BASELINE from "@/data/results-2570.json";
import { ITEMS, currentFiscalMonth } from "@/lib/plan";
import { toNum } from "@/lib/format";

const STORE_KEY = "raot-plan-2570/v2";
const OLD_STORE_KEY = "raot-plan-2570/v1"; // รูปแบบของเว็บเดิม คีย์ด้วย code
const ASOF_KEY = "raot-plan-2570/asof";

const emptyResults = () => ({ kpi: {}, project: {}, savedAt: null });

/* ---------- รวม baseline กับ overlay ---------- */
function mergeResults(base, over) {
  const out = emptyResults();

  out.kpi = Object.assign({}, base.kpi, over.kpi);

  const codes = new Set([
    ...Object.keys(base.project || {}),
    ...Object.keys(over.project || {}),
  ]);
  codes.forEach((k) => {
    const b = (base.project || {})[k] || {};
    const o = (over.project || {})[k] || {};
    const monthly = Object.assign({}, b.monthly);
    Object.keys(o.monthly || {}).forEach((i) => {
      monthly[i] = Object.assign({}, monthly[i], o.monthly[i]);
    });
    out.project[k] = Object.assign({}, b, o, { monthly });
  });

  out.savedAt = over.savedAt || base.savedAt || null;
  return out;
}

/* ---------- ตัวช่วยที่ใช้ทั้งหน้าแจ้งเตือนและหน้ากรอกผล ---------- */
/* แต่ละเดือนเก็บ { o: ผลผลิต, r: ผลลัพธ์, s: เบิกจ่าย } — เหมือนเว็บเดิม */
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

/* ---------- แปลงไฟล์รุ่นเก่า (คีย์ด้วย code) มาเป็นคีย์ uid ---------- */
export function migrateByCode(obj) {
  const firstByCode = new Map();
  const dupCodes = new Set();
  ITEMS.forEach((x) => {
    if (firstByCode.has(x.code)) dupCodes.add(x.code);
    else firstByCode.set(x.code, x);
  });

  const project = {};
  const collided = [];
  Object.keys(obj.project || {}).forEach((key) => {
    if (key.indexOf("#") >= 0) {
      project[key] = obj.project[key]; // เป็นรูปแบบใหม่อยู่แล้ว
      return;
    }
    const item = firstByCode.get(key);
    if (!item) return; // รหัสที่ไม่มีในแผนแล้ว ทิ้งไป
    if (dupCodes.has(key)) collided.push(key);
    project[item.uid] = obj.project[key];
  });

  return { results: { kpi: obj.kpi || {}, project, savedAt: obj.savedAt || null }, collided };
}

function needsMigration(obj) {
  return Object.keys((obj && obj.project) || {}).some((k) => k.indexOf("#") < 0);
}

/* =====================================================================
   React context
   ===================================================================== */
const Ctx = createContext(null);

export function ResultsProvider({ children }) {
  const [overlay, setOverlay] = useState(emptyResults);
  const [storageOK, setStorageOK] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [savedHint, setSavedHint] = useState("");
  const saveTimer = useRef(null);
  const dirty = useRef(false);

  /* "ณ เดือน" ที่ใช้เป็นฐานคำนวณการแจ้งเตือน — ใช้ร่วมกันทุกหน้า
     ปีงบ 2570 คือ ต.ค. 2026 - ก.ย. 2027 ถ้าวันนี้ยังไม่ถึงจะเริ่มที่เดือนแรก
     ค่าเริ่มต้นต้องเป็นค่าคงที่ตอน render แรก ไม่งั้น hydration ไม่ตรงกัน */
  const [asOf, setAsOfState] = useState(0);
  const [fyStarted, setFyStarted] = useState(true);

  /* โหลด overlay หลัง mount เท่านั้น — ถ้าอ่าน localStorage ตอน render แรก
     ผลลัพธ์ฝั่งเซิร์ฟเวอร์กับฝั่งเบราว์เซอร์จะไม่ตรงกันแล้ว React จะเตือน hydration */
  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setOverlay(Object.assign(emptyResults(), parsed));
      } else {
        // ยกข้อมูลจากเว็บเดิมมาให้อัตโนมัติถ้ามี
        raw = localStorage.getItem(OLD_STORE_KEY);
        if (raw) {
          const old = JSON.parse(raw);
          migrateOldMonthlyField(old);
          setOverlay(Object.assign(emptyResults(), migrateByCode(old).results));
        }
      }
    } catch (e) {
      setStorageOK(false);
    }

    const fm = currentFiscalMonth();
    setFyStarted(!!fm.started);
    try {
      // getItem คืน null เมื่อไม่มีค่า และ Number(null) เป็น 0 ซึ่งผ่านการเช็คช่วง
      // ต้องกันกรณี null แยกต่างหาก ไม่งั้นจะได้ ต.ค. 69 เสมอแทนเดือนปัจจุบัน
      const stored = localStorage.getItem(ASOF_KEY);
      const savedAsOf = stored == null ? NaN : Number(stored);
      setAsOfState(
        isFinite(savedAsOf) && savedAsOf >= 0 && savedAsOf <= 11 ? savedAsOf : fm.index
      );
    } catch (e) {
      setAsOfState(fm.index);
    }

    setLoaded(true);
  }, []);

  /* เขียนกลับแบบหน่วงเวลา ทุกครั้งต้องครอบ try/catch และมีทางลงเมื่อเขียนไม่ได้ */
  useEffect(() => {
    if (!loaded) return;
    // รอบแรกหลังโหลดเสร็จยังไม่มีใครแก้อะไร ไม่ต้องเขียนทับและไม่ต้องขึ้น "บันทึกแล้ว"
    if (!dirty.current) {
      dirty.current = true;
      return;
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const payload = Object.assign({}, overlay, { savedAt: new Date().toISOString() });
        localStorage.setItem(STORE_KEY, JSON.stringify(payload));
        const d = new Date();
        setSavedHint(
          "บันทึกแล้ว " +
            String(d.getHours()).padStart(2, "0") + ":" +
            String(d.getMinutes()).padStart(2, "0")
        );
      } catch (e) {
        setStorageOK(false);
        setSavedHint("บันทึกอัตโนมัติไม่สำเร็จ");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [overlay, loaded]);

  const results = useMemo(
    () => mergeResults(Object.assign(emptyResults(), BASELINE), overlay),
    [overlay]
  );

  const api = useMemo(() => {
    return {
      results,
      overlay,
      storageOK,
      savedHint,
      loaded,
      asOf,
      fyStarted,

      setAsOf(i) {
        setAsOfState(i);
        try {
          localStorage.setItem(ASOF_KEY, String(i));
        } catch (e) {}
      },

      setKpi(no, actual) {
        setOverlay((prev) => ({
          ...prev,
          kpi: { ...prev.kpi, [no]: { ...(prev.kpi[no] || {}), actual } },
        }));
      },

      setProject(uid, patch) {
        setOverlay((prev) => ({
          ...prev,
          project: { ...prev.project, [uid]: { ...(prev.project[uid] || {}), ...patch } },
        }));
      },

      setMonthly(uid, i, patch) {
        setOverlay((prev) => {
          const cur = prev.project[uid] || {};
          const monthly = { ...(cur.monthly || {}) };
          monthly[i] = { ...(monthly[i] || {}), ...patch };
          return { ...prev, project: { ...prev.project, [uid]: { ...cur, monthly } } };
        });
      },

      clearProject(uid) {
        setOverlay((prev) => {
          const project = { ...prev.project };
          delete project[uid];
          return { ...prev, project };
        });
      },

      /* ล้างเฉพาะสิ่งที่กรอกในเครื่องนี้ ค่าฐานใน repo ยังอยู่ */
      resetOverlay() {
        setOverlay(emptyResults());
        try {
          localStorage.removeItem(STORE_KEY);
        } catch (e) {}
      },

      /* ส่งออกผลที่รวม baseline แล้ว เพื่อเอาไปวางทับ data/results-2570.json */
      exportMerged() {
        return JSON.stringify(
          { kpi: results.kpi, project: results.project, savedAt: new Date().toISOString() },
          null,
          2
        );
      },

      /* นำเข้าไฟล์ผล รองรับทั้งรูปแบบใหม่ (uid) และไฟล์เก่าจาก index.html (code) */
      importJson(text) {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") throw new Error("ไฟล์ไม่ถูกรูปแบบ");
        migrateOldMonthlyField(parsed);
        if (needsMigration(parsed)) {
          const { results: migrated, collided } = migrateByCode(parsed);
          setOverlay(Object.assign(emptyResults(), migrated));
          return { collided };
        }
        setOverlay(Object.assign(emptyResults(), parsed));
        return { collided: [] };
      },
    };
  }, [results, overlay, storageOK, savedHint, loaded, asOf, fyStarted]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/* เว็บรุ่นแรกเก็บผลรายเดือนเป็นช่องเดียวชื่อ a — ย้ายมาเป็นช่อง o (ผลผลิต) */
function migrateOldMonthlyField(obj) {
  Object.keys((obj && obj.project) || {}).forEach((code) => {
    const m = (obj.project[code] || {}).monthly;
    if (!m) return;
    Object.keys(m).forEach((i) => {
      if (m[i] && m[i].a != null && m[i].o == null) {
        m[i].o = m[i].a;
        delete m[i].a;
      }
    });
  });
}

export function useResults() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResults ต้องอยู่ภายใน ResultsProvider");
  return ctx;
}
