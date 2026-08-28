"use client";

import { useMemo, useRef, useState } from "react";
import { KPIS, PROJECTS, MONTHS, achievement, statusOf, monthsOf } from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import { useResults, kpiActual } from "@/lib/store";
import { buildAlerts, rolledReport } from "@/lib/alerts";
import MonthPicker from "@/components/month-picker";
import ProjectDrawer from "@/components/project-drawer";

export default function EntryPage() {
  const { results, asOf, loaded, setKpi, exportJson, importJson, refresh, saveNow } = useResults();
  const [openUid, setOpenUid] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const alerts = useMemo(() => buildAlerts(results, asOf), [results, asOf]);

  /* โครงการที่ถึงกำหนดรายงานในเดือนที่เลือกแต่ยังไม่ได้กรอก — ทางลัดไปกรอกทีละตัว
     นับว่ารายงานแล้วถ้ากิจกรรมลูกรายงานไว้ ใช้เกณฑ์เดียวกับกลไกแจ้งเตือน */
  const due = useMemo(() => {
    return PROJECTS.filter((p) => {
      const plan = monthsOf(p);
      if (!plan[asOf]) return false;
      return !rolledReport(results, p).reported[asOf];
    }).sort((a, b) => (b.budget || 0) - (a.budget || 0));
  }, [results, asOf]);

  /* สรุปภาพรวมองค์กรจากตัวชี้วัดที่กรอกแล้ว */
  const kpiSummary = useMemo(() => {
    let sum = 0;
    let n = 0;
    let below = 0;
    KPIS.forEach((k) => {
      const p = achievement(kpiActual(results, k.no), k.target, k.dir);
      if (p == null) return;
      sum += p;
      n++;
      if (p < 100) below++;
    });
    return { avg: n ? sum / n : null, n, below };
  }, [results]);

  function download() {
    try {
      const blob = new Blob([exportJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp =
        d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0");
      a.href = url;
      a.download = "results-2570-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("ส่งออกไฟล์สำรองแล้ว");
    } catch (e) {
      setMsg("ส่งออกไม่สำเร็จ: " + e.message);
    }
  }

  function pickFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        const { rows } = await importJson(String(reader.result));
        setMsg("นำเข้าเรียบร้อย เขียนลง Supabase " + rows + " แถว");
      } catch (err) {
        setMsg("นำเข้าไม่สำเร็จ: " + err.message);
      }
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const nProjects = Object.keys(results.project || {}).length;
  const nKpis = Object.keys(results.kpi || {}).length;

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูลแผน…</div>;

  return (
    <>
      <MonthPicker />

      <section className="block">
        <h2>
          ตัวชี้วัดระดับองค์กร
          <small>
            13 ตัว · ค่าเป้าหมายปี 2570 จาก “ยุทธศาสตร์ กลยุลย์ ตัวชี้วัด ปี 70.docx”
            {kpiSummary.avg != null
              ? " · บรรลุเฉลี่ย " + pct(kpiSummary.avg) + " จาก " + kpiSummary.n + " ตัวที่รายงานแล้ว"
              : ""}
          </small>
        </h2>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 46 }}>ที่</th>
                <th>ตัวชี้วัด</th>
                <th>หน่วยนับ</th>
                <th className="num">เป้าหมาย 2570</th>
                <th className="num" style={{ width: 150 }}>
                  ผลการดำเนินงาน
                </th>
                <th className="num">บรรลุ</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {KPIS.map((k) => {
                const actual = kpiActual(results, k.no);
                const p = achievement(actual, k.target, k.dir);
                const st = statusOf(p);
                return (
                  <tr key={k.no}>
                    <td className="mono small">{k.no}</td>
                    <td>
                      {k.name}
                      {k.dir === "down" ? (
                        <span className="chip" style={{ marginInlineStart: 6 }}>
                          ยิ่งน้อยยิ่งดี
                        </span>
                      ) : null}
                      {k.cum ? <div className="small muted">ค่าสะสมตาม .xlsx: {k.cum}</div> : null}
                    </td>
                    <td className="small">{k.unit}</td>
                    <td className="num">{fmt(k.target)}</td>
                    <td className="num">
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{
                          width: "100%",
                          textAlign: "end",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "4px 7px",
                        }}
                        value={actual == null ? "" : actual}
                        onChange={(e) => setKpi(k.no, e.target.value)}
                      />
                    </td>
                    <td className="num">{p == null ? "–" : pct(p)}</td>
                    <td className="nowrap small">
                      <span className={"dot bg-" + st.cls} />
                      <span className={"st-" + st.cls}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>
          ถึงกำหนดรายงานผลเดือน {MONTHS[asOf]}
          <small>{fmt(due.length)} โครงการที่มีแผนในเดือนนี้แต่ยังไม่ได้กรอกผล</small>
        </h2>

        {due.length === 0 ? (
          <div className="banner ok">
            ไม่มีโครงการที่ค้างรายงานผลในเดือน {MONTHS[asOf]}
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>โครงการ</th>
                  <th>หน่วยงาน</th>
                  <th className="num">งบประมาณ</th>
                  <th style={{ width: 110 }}>ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {due.slice(0, 60).map((p) => (
                  <tr key={p.uid}>
                    <td>
                      {p.sNo ? <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span> : null}{" "}
                      {p.name}
                    </td>
                    <td className="small">{p.org}</td>
                    <td className="num">{money(p.budget)}</td>
                    <td>
                      <button className="btn ghost" onClick={() => setOpenUid(p.uid)}>
                        กรอกผล
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {due.length > 60 ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            แสดง 60 รายการแรกจาก {fmt(due.length)} รายการ (เรียงตามงบประมาณ) —
            ดูทั้งหมดได้ที่หน้าโครงการ
          </div>
        ) : null}
      </section>

      <section className="block">
        <h2>
          ข้อมูลและการสำรอง
          <small>
            ในฐานข้อมูลตอนนี้ {fmt(nProjects)} โครงการ · {fmt(nKpis)} ตัวชี้วัด
          </small>
        </h2>

        <div className="card pad">
          <p style={{ marginTop: 0 }} className="small">
            ทุกอย่างที่กรอกถูกบันทึกขึ้น <b>Supabase</b> อัตโนมัติหลังหยุดพิมพ์ประมาณ 1 วินาที
            ทุกคนที่เข้าสู่ระบบจะเห็นข้อมูลชุดเดียวกันทันที ไม่ต้องส่งไฟล์ให้กันอีกแล้ว
          </p>
          <p className="small">
            ถ้าเปิดหน้านี้ค้างไว้นานแล้วสงสัยว่ามีคนอื่นแก้ ให้กด “ดึงข้อมูลใหม่”
            เพื่อโหลดของล่าสุดจากฐานข้อมูล
          </p>

          <div className="btnrow">
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await saveNow();
                setMsg("บันทึกขึ้น Supabase แล้ว");
                setBusy(false);
              }}
            >
              บันทึกเดี๋ยวนี้
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await refresh();
                setMsg(ok ? "ดึงข้อมูลล่าสุดจาก Supabase แล้ว" : "ดึงข้อมูลไม่สำเร็จ");
                setBusy(false);
              }}
            >
              ดึงข้อมูลใหม่
            </button>
            <button className="btn ghost" disabled={busy} onClick={download}>
              ส่งออกไฟล์สำรอง (.json)
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              นำเข้าไฟล์สำรอง
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={pickFile}
            />
          </div>

          <p className="small muted" style={{ marginBottom: 0 }}>
            “นำเข้าไฟล์สำรอง” จะ<b>เขียนทับ</b>ข้อมูลในฐานข้อมูลที่มีคีย์ตรงกัน
            และทุกคนจะเห็นผลทันที ใช้เฉพาะตอนกู้คืนข้อมูลเท่านั้น
          </p>

          {msg ? (
            <div className="banner" style={{ marginTop: 14, marginBottom: 0 }}>
              {msg}
            </div>
          ) : null}
        </div>
      </section>

      {openUid ? (
        <ProjectDrawer uid={openUid} alerts={alerts} onClose={() => setOpenUid(null)} />
      ) : null}
    </>
  );
}
