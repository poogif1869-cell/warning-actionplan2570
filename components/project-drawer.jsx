"use client";

import { useEffect, useState } from "react";
import { byUid } from "@/lib/plan";
import { KIND_LABEL, SEV_LABEL } from "@/lib/alerts";
import ReportTab from "@/components/report-tab";
import ProjectDetails from "@/components/project-details";
import DownloadButton from "@/components/download-button";

/* ลิ้นชักรายละเอียดโครงการ — ใช้ร่วมกันทุกหน้า

   ⚠️ **ข้อมูลแต่ละชนิดกรอกได้ที่หน้าเจ้าของเท่านั้น** ลิ้นชักตัวเดียวกันนี้
   โผล่ใน 5 หน้า ถ้าเปิดให้แก้ทุกที่ ข้อมูลชุดเดียวกันจะถูกแก้จากหลายทาง
   จนตามไม่ทันว่าใครแก้อะไร

     ผลการดำเนินงาน (ReportTab) -> หน้า /projects (ReportTab เช็ค path เอง)
     รายงานความเสี่ยงรายเดือน   -> ขั้นตอนหนึ่งใน ReportTab (ไม่มีแท็บแยกแล้ว)
     รายการงบประมาณ            -> หน้า /budget เท่านั้น (ไม่มีในลิ้นชักอยู่แล้ว)
     เพิ่ม/ลบ/แก้ตัวแผน          -> หน้า /plan-edit เท่านั้น

   ลิ้นชักตัวนี้จึงเป็น "ที่แสดงผล" ล้วน ๆ ไม่มีปุ่มที่ลบหรือแก้อะไรของตัวเอง
*/
export default function ProjectDrawer({ uid, alerts, onClose }) {
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

  /* สองแท็บพอ — "รายละเอียดโครงการ" รวมข้อมูลตามแผน ความเชื่อมโยงแผน (รวม ESG/SDGs)
     กิจกรรมย่อย และเนื้อหาจากคำของบประมาณ ฝยศ.1 ไว้หน้าเดียวเรียงเป็นหัวข้อ
     เดิมแยกเป็น "ตามแผน" กับ "ฝยศ.1" แล้วคนต้องสลับแท็บดูโครงการเดียวกัน */
  const TABS = [
    ["report", "รายงานผลรายเดือน"],
    ["detail", "รายละเอียดโครงการ"],
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={p.name}>
        <header>
          <h3>
            {/* หัวลิ้นชักก็ตามกติกาเดียวกัน โครงการหนา กิจกรรมบาง */}
            <span className={p.lvl === 1 ? "projname" : "actname-sm"}>{p.name}</span>
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

          {tab === "detail" ? <ProjectDetails item={p} /> : null}

        </div>
      </aside>
    </>
  );
}
