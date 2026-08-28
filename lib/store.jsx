"use client";

/* =====================================================================
   ผลการดำเนินงาน เก็บใน Supabase

   ตาราง (ดู supabase/schema.sql):
     kpi_results      no, actual
     project_results  uid, code, status, progress, note
     monthly_reports  uid, month, output, outcome, spend

   คีย์ของโครงการใช้ uid = code + "#" + ลำดับแถว ไม่ใช่ code เปล่า ๆ
   เพราะไฟล์แผนมีรหัสซ้ำ 9 รหัส ถ้าใช้ code สองโครงการที่ชนกันจะเขียนทับกัน

   การเขียนกลับเป็นแบบ optimistic: อัปเดตหน้าจอทันที แล้วค่อยส่งขึ้น Supabase
   แบบหน่วงเวลา เพื่อไม่ให้ยิง request ทุกตัวอักษรที่พิมพ์
   ===================================================================== */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { currentFiscalMonth } from "@/lib/plan";
import { toNum } from "@/lib/format";

const ASOF_KEY = "raot-plan-2570/asof";
const FLUSH_MS = 800;

const emptyResults = () => ({ kpi: {}, project: {} });

/* ---------- ตัวช่วยที่ใช้ทั้งหน้าแจ้งเตือนและหน้ากรอกผล ---------- */
/* แต่ละเดือนเก็บ { o: ผลผลิต, r: ผลลัพธ์, s: เบิกจ่าย } */
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

/* =====================================================================
   React context
   ===================================================================== */
const Ctx = createContext(null);

export function ResultsProvider({ children }) {
  const [results, setResults] = useState(emptyResults);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedHint, setSavedHint] = useState("");
  const [userEmail, setUserEmail] = useState("");

  /* "ณ เดือน" ที่ใช้เป็นฐานคำนวณการแจ้งเตือน — ใช้ร่วมกันทุกหน้า
     ค่าเริ่มต้นต้องคงที่ตอน render แรก ไม่งั้น hydration ฝั่งเซิร์ฟเวอร์กับเบราว์เซอร์ไม่ตรงกัน */
  const [asOf, setAsOfState] = useState(0);
  const [fyStarted, setFyStarted] = useState(true);

  /* คิวของแถวที่ยังไม่ได้ส่งขึ้น Supabase */
  const pending = useRef({ kpi: new Set(), project: new Set(), monthly: new Set() });
  const flushTimer = useRef(null);
  const latest = useRef(results);
  latest.current = results;

  /* ---------- โหลดข้อมูลทั้งหมดจาก Supabase ---------- */
  async function loadAll() {
    const supabase = getSupabase();

    const [kpiRes, projRes, monRes] = await Promise.all([
      supabase.from("kpi_results").select("no,actual"),
      supabase.from("project_results").select("uid,status,progress,note"),
      supabase.from("monthly_reports").select("uid,month,output,outcome,spend"),
    ]);

    const firstError = kpiRes.error || projRes.error || monRes.error;
    if (firstError) throw firstError;

    const next = emptyResults();

    (kpiRes.data || []).forEach((row) => {
      next.kpi[row.no] = { actual: row.actual == null ? "" : row.actual };
    });

    (projRes.data || []).forEach((row) => {
      next.project[row.uid] = {
        status: row.status == null ? "" : row.status,
        progress: row.progress == null ? "" : row.progress,
        note: row.note == null ? "" : row.note,
        monthly: {},
      };
    });

    (monRes.data || []).forEach((row) => {
      if (!next.project[row.uid]) next.project[row.uid] = { monthly: {} };
      if (!next.project[row.uid].monthly) next.project[row.uid].monthly = {};
      next.project[row.uid].monthly[row.month] = {
        o: row.output == null ? "" : row.output,
        r: row.outcome == null ? "" : row.outcome,
        s: row.spend == null ? "" : String(row.spend),
      };
    });

    return next;
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getUser();
        if (alive && data && data.user) setUserEmail(data.user.email || "");

        const next = await loadAll();
        if (alive) setResults(next);
      } catch (err) {
        if (alive) {
          setLoadError(
            "โหลดข้อมูลจาก Supabase ไม่สำเร็จ: " +
              (err && err.message ? err.message : String(err)) +
              " — ถ้าเพิ่งตั้งค่าใหม่ ให้ตรวจว่ารัน supabase/schema.sql แล้ว"
          );
        }
      }

      const fm = currentFiscalMonth();
      if (alive) setFyStarted(!!fm.started);
      try {
        // getItem คืน null เมื่อไม่มีค่า และ Number(null) เป็น 0 ซึ่งผ่านการเช็คช่วง
        // ต้องกันกรณี null แยกต่างหาก ไม่งั้นจะได้ ต.ค. 69 เสมอแทนเดือนปัจจุบัน
        const stored = localStorage.getItem(ASOF_KEY);
        const saved = stored == null ? NaN : Number(stored);
        if (alive) setAsOfState(isFinite(saved) && saved >= 0 && saved <= 11 ? saved : fm.index);
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
    pending.current = { kpi: new Set(), project: new Set(), monthly: new Set() };

    const snapshot = latest.current;
    const supabase = getSupabase();
    const jobs = [];

    if (queue.kpi.size) {
      const rows = [...queue.kpi].map((no) => ({
        no,
        actual: (snapshot.kpi[no] || {}).actual ?? "",
      }));
      jobs.push(supabase.from("kpi_results").upsert(rows, { onConflict: "no" }));
    }

    if (queue.project.size) {
      const rows = [...queue.project].map((uid) => {
        const p = snapshot.project[uid] || {};
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
      const rows = [...queue.monthly].map((key) => {
        const sep = key.lastIndexOf("|");
        const uid = key.slice(0, sep);
        const month = Number(key.slice(sep + 1));
        const e = ((snapshot.project[uid] || {}).monthly || {})[month] || {};
        const raw = e.s == null ? "" : String(e.s).trim();
        return {
          uid,
          month,
          output: e.o ?? "",
          outcome: e.r ?? "",
          // ช่องว่างต้องเป็น null ไม่ใช่ 0 ไม่งั้นเดือนที่ไม่ได้กรอกจะกลายเป็นเบิกจ่าย 0 บาท
          spend: raw === "" ? null : toNum(raw),
        };
      });
      jobs.push(
        supabase.from("monthly_reports").upsert(rows, { onConflict: "uid,month" })
      );
    }

    if (!jobs.length) return;

    const done = await Promise.all(jobs);
    const failed = done.find((r) => r && r.error);
    if (failed) {
      setSaveError(
        "บันทึกขึ้น Supabase ไม่สำเร็จ: " + failed.error.message +
          " — ข้อมูลที่เห็นบนจอยังอยู่ แต่ยังไม่ได้บันทึก ลองกดบันทึกซ้ำอีกครั้ง"
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
      loaded,
      loadError,
      saveError,
      savedHint,
      userEmail,
      asOf,
      fyStarted,

      setAsOf(i) {
        setAsOfState(i);
        try {
          localStorage.setItem(ASOF_KEY, String(i));
        } catch (e) {}
      },

      setKpi(no, actual) {
        setResults((prev) => ({
          ...prev,
          kpi: { ...prev.kpi, [no]: { ...(prev.kpi[no] || {}), actual } },
        }));
        pending.current.kpi.add(no);
        scheduleFlush();
      },

      setProject(uid, patch) {
        setResults((prev) => ({
          ...prev,
          project: { ...prev.project, [uid]: { ...(prev.project[uid] || {}), ...patch } },
        }));
        pending.current.project.add(uid);
        scheduleFlush();
      },

      setMonthly(uid, i, patch) {
        setResults((prev) => {
          const cur = prev.project[uid] || {};
          const monthly = { ...(cur.monthly || {}) };
          monthly[i] = { ...(monthly[i] || {}), ...patch };
          return { ...prev, project: { ...prev.project, [uid]: { ...cur, monthly } } };
        });
        pending.current.monthly.add(uid + "|" + i);
        scheduleFlush();
      },

      /* ล้างข้อมูลของโครงการเดียว — ลบออกจากฐานข้อมูลจริง ทุกคนจะเห็นผล */
      async clearProject(uid) {
        setResults((prev) => {
          const project = { ...prev.project };
          delete project[uid];
          return { ...prev, project };
        });
        const supabase = getSupabase();
        const [a, b] = await Promise.all([
          supabase.from("monthly_reports").delete().eq("uid", uid),
          supabase.from("project_results").delete().eq("uid", uid),
        ]);
        const err = (a && a.error) || (b && b.error);
        if (err) setSaveError("ลบไม่สำเร็จ: " + err.message);
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
          const next = await loadAll();
          setResults(next);
          return true;
        } catch (err) {
          setLoadError("ดึงข้อมูลใหม่ไม่สำเร็จ: " + (err.message || String(err)));
          return false;
        }
      },

      /* ส่งออกเป็นไฟล์สำรอง — รูปแบบเดียวกับที่ importJson รับ */
      exportJson() {
        return JSON.stringify(
          { kpi: results.kpi, project: results.project, savedAt: new Date().toISOString() },
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
            const raw = e.s == null ? "" : String(e.s).trim();
            monRows.push({
              uid,
              month: Number(i),
              output: e.o ?? "",
              outcome: e.r ?? "",
              spend: raw === "" ? null : toNum(raw),
            });
          });
        });

        const jobs = [];
        if (kpiRows.length) jobs.push(supabase.from("kpi_results").upsert(kpiRows, { onConflict: "no" }));
        if (projRows.length) jobs.push(supabase.from("project_results").upsert(projRows, { onConflict: "uid" }));
        if (monRows.length) jobs.push(supabase.from("monthly_reports").upsert(monRows, { onConflict: "uid,month" }));

        const done = await Promise.all(jobs);
        const failed = done.find((r) => r && r.error);
        if (failed) throw new Error(failed.error.message);

        const next = await loadAll();
        setResults(next);
        return { rows: kpiRows.length + projRows.length + monRows.length };
      },

      async signOut() {
        try {
          await getSupabase().auth.signOut();
        } catch (e) {}
        window.location.href = "/login";
      },
    };
  }, [results, loaded, loadError, saveError, savedHint, userEmail, asOf, fyStarted]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useResults() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useResults ต้องอยู่ภายใน ResultsProvider");
  return ctx;
}
