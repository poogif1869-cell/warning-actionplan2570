"use client";

import { useMemo, useRef, useState } from "react";
import { KPIS, PROJECTS, MONTHS, achievement, statusOf, monthsOf } from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import { useResults, kpiActual } from "@/lib/store";
import { buildAlerts, rolledReport } from "@/lib/alerts";
import MonthPicker from "@/components/month-picker";
import ProjectDrawer from "@/components/project-drawer";

export default function EntryPage() {
  const { results, asOf, loaded, setKpi, resetOverlay, exportMerged, importJson, overlay } =
    useResults();
  const [openUid, setOpenUid] = useState(null);
  const [msg, setMsg] = useState("");
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
      const blob = new Blob([exportMerged()], { type: "application/json" });
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
      setMsg("ส่งออกไฟล์แล้ว — นำไปวางทับ data/results-2570.json แล้ว commit เพื่อให้ทุกคนเห็นตรงกัน");
    } catch (e) {
      setMsg("ส่งออกไม่สำเร็จ: " + e.message);
    }
  }

  function pickFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { collided } = importJson(String(reader.result));
        setMsg(
          "นำเข้าไฟล์เรียบร้อย" +
            (collided.length
              ? " — แต่มีรหัสที่ซ้ำกันในแผน " +
                collided.length +
                " รหัส (" +
                collided.join(", ") +
                ") ระบบจับเข้ากับโครงการแรกที่พบ กรุณาตรวจสอบ"
              : "")
        );
      } catch (err) {
        setMsg("นำเข้าไม่สำเร็จ: " + err.message);
      }
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const nOverlayProjects = Object.keys(overlay.project || {}).length;
  const nOverlayKpis = Object.keys(overlay.kpi || {}).length;

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
          ข้อมูลและการส่งต่อ
          <small>
            กรอกไว้ในเครื่องนี้ {fmt(nOverlayProjects)} โครงการ · {fmt(nOverlayKpis)} ตัวชี้วัด
          </small>
        </h2>

        <div className="card pad">
          <p style={{ marginTop: 0 }} className="small">
            สิ่งที่กรอกจะเก็บไว้ใน localStorage ของเบราว์เซอร์เครื่องนี้เท่านั้น
            ส่วนค่าฐานที่ทุกคนเห็นตรงกันมาจากไฟล์ <code>data/results-2570.json</code> ใน repo
          </p>
          <p className="small">
            <b>วิธีรวมผลจากหลายคนโดยไม่ต้องมีฐานข้อมูล:</b> กด “ส่งออกไฟล์ผล”
            แล้วนำไฟล์ที่ได้ไปวางทับ <code>data/results-2570.json</code> ใน repo แล้ว commit —
            Vercel จะ deploy ใหม่อัตโนมัติ และทุกคนจะเห็นค่าฐานชุดใหม่
          </p>

          <div className="btnrow">
            <button className="btn" onClick={download}>
              ส่งออกไฟล์ผล (.json)
            </button>
            <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>
              นำเข้าไฟล์ผล
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={pickFile}
            />
            <button
              className="btn danger"
              onClick={() => {
                if (confirm("ล้างทุกอย่างที่กรอกไว้ในเครื่องนี้? (ค่าฐานใน repo ยังอยู่)")) {
                  resetOverlay();
                  setMsg("ล้างข้อมูลที่กรอกในเครื่องนี้แล้ว");
                }
              }}
            >
              ล้างข้อมูลในเครื่องนี้
            </button>
          </div>

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
