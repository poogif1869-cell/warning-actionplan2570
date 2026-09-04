"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MONTHS, byUid } from "@/lib/plan";
import { money, pct } from "@/lib/format";
import { useResults } from "@/lib/store";
import { KIND_LABEL, SEV_LABEL } from "@/lib/alerts";
import ReportTab from "@/components/report-tab";
import DownloadButton from "@/components/download-button";

/* ลิ้นชักรายละเอียดโครงการ — ใช้ร่วมกันทุกหน้า

   ⚠️ **ข้อมูลแต่ละชนิดกรอกได้ที่หน้าเจ้าของเท่านั้น** ลิ้นชักตัวเดียวกันนี้
   โผล่ใน 5 หน้า ถ้าเปิดให้แก้ทุกที่ ข้อมูลชุดเดียวกันจะถูกแก้จากหลายทาง
   จนตามไม่ทันว่าใครแก้อะไร

     ผลการดำเนินงาน (ReportTab) -> หน้า /projects
     รายงานความเสี่ยงรายเดือน   -> ขั้นตอนหนึ่งใน ReportTab (ไม่มีแท็บแยกแล้ว)
     ล้างข้อมูลโครงการ          -> หน้า /projects (ลบทั้งสามชนิดพร้อมกัน)
     รายการงบประมาณ            -> หน้า /budget เท่านั้น (ไม่มีในลิ้นชักอยู่แล้ว)
*/
export default function ProjectDrawer({ uid, alerts, onClose }) {
  const pathname = usePathname();
  const canClear = pathname === "/projects";

  const { clearProject } = useResults();
  const [tab, setTab] = useState("report");

  // ปิดด้วย Esc
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = byUid.get(uid);
  if (!p) return null;

  const mine = (alerts || []).filter((a) => a.uid === uid);

  const rows = [
    ["รหัส", p.code],
    ["ระดับ", p.lvl === 1 ? "โครงการ" : p.lvl === 0 ? "ค่าใช้จ่ายอื่น" : "กิจกรรม"],
    ["ยุทธศาสตร์", p.strategy],
    ["กลยุทธ์", p.tactic],
    ["ตัวชี้วัดโครงการ", p.kpi],
    ["แผนงาน", p.program],
    ["ประเภทโครงการ", p.ptype],
    ["หน่วยงานรับผิดชอบ", p.org],
    ["แหล่งเงิน", p.fund],
    ["งบประมาณ", p.budget ? money(p.budget) + " บาท" : "–"],
    ["ระยะเวลา", p.period],
    ["สาระสำคัญ", p.summary],
  ].filter(([, v]) => v != null && v !== "");

  const linkRows = [
    ["ยุทธศาสตร์ชาติ", p.nX],
    ["เป้าหมายยุทธศาสตร์ชาติ", p.nGoal],
    ["ประเด็นแผนแม่บทฯ", p.nY],
    ["แผนย่อยของแผนแม่บทฯ", p.nSub],
    ["เป้าหมายแผนย่อย", p.nSubGoal],
    ["ประเด็น แผนปฏิบัติราชการ กษ.", p.mIssue],
    ["แนวทาง แผนปฏิบัติราชการ กษ.", p.mWay],
  ].filter(([, v]) => v != null && v !== "");

  const TABS = [
    ["report", "รายงานผลรายเดือน"],
    ["info", "รายละเอียดตามแผน"],
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={p.name}>
        <header>
          <h3>
            {p.name}
            <div className="small muted" style={{ fontWeight: 400 }}>
              {p.code}
              {p.org ? " · " + p.org : ""}
            </div>
          </h3>
          {/* พิมพ์เฉพาะเนื้อในลิ้นชัก โดยซ่อนหน้าเบื้องหลังทิ้ง (ดู body.printing-drawer) */}
          <DownloadButton
            className="iconbtn"
            label="PDF"
            mode="drawer"
            title={"รายงานโครงการ " + p.name}
            subtitle={p.code + (p.org ? " · " + p.org : "")}
          />
          <button className="iconbtn" onClick={onClose}>
            ปิด
          </button>
        </header>

        <div className="dbody">
          {mine.length ? (
            <div className="alerts" style={{ marginBottom: 18 }}>
              {mine.map((a) => (
                <div key={a.id} className={"alert " + a.sev} style={{ cursor: "default" }}>
                  <span className="sev">{SEV_LABEL[a.sev]}</span>
                  <div className="abody">
                    <div className="title" style={{ fontSize: 13 }}>
                      {KIND_LABEL[a.kind]}
                    </div>
                    <div className="detail">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="segmented" style={{ marginBottom: 16 }}>
            {TABS.map(([k, label]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {/* ---------------- รายงานผลรายเดือน ----------------
              แยกไปไว้ใน report-tab.jsx เพราะกติกาต่างกันระหว่างโครงการที่มี
              กิจกรรมย่อยกับที่ไม่มี และลิ้นชักตัวนี้ยาวเกินไปแล้ว */}
          {tab === "report" ? <ReportTab item={p} /> : null}


          {/* ---------------- รายละเอียดตามแผน ---------------- */}
          {tab === "info" ? (
            <>
              <h4>รายละเอียดโครงการ</h4>
              <dl className="dl">
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>

              {linkRows.length ? (
                <>
                  <h4>ความเชื่อมโยงแผน</h4>
                  <dl className="dl">
                    {linkRows.map(([k, v]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : null}

              {p._kids && p._kids.length ? (
                <>
                  <h4>กิจกรรมภายใต้โครงการ ({p._kids.length})</h4>
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>กิจกรรม</th>
                          <th className="num">งบประมาณ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p._kids.map((k) => (
                          <tr key={k.uid}>
                            <td className="small">{k.name}</td>
                            <td className="num small">{money(k.budget)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="small muted" style={{ marginTop: 7 }}>
                    งบของกิจกรรมรวมอยู่ในงบโครงการแม่แล้ว ไม่ต้องนำมาบวกซ้ำ
                  </div>
                </>
              ) : null}

              {/* ปุ่มนี้ลบข้อมูลทั้งสามชนิดพร้อมกัน จึงอยู่ที่หน้าโครงการที่เดียว
                  ไม่ควรลบข้อมูลความเสี่ยงหรืองบประมาณจากหน้าที่ไม่ได้เป็นเจ้าของ */}
              {canClear ? (
                <div className="btnrow">
                  <button
                    className="btn ghost"
                    onClick={() => {
                      if (
                        confirm(
                          "ล้างข้อมูลที่กรอกไว้ของโครงการนี้ทั้งหมด (ผลรายเดือน รายการงบประมาณ และรายงานความเสี่ยง)?\nทุกคนจะเห็นผลทันที"
                        )
                      ) {
                        clearProject(uid);
                      }
                    }}
                  >
                    ล้างข้อมูลที่กรอกของโครงการนี้
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
