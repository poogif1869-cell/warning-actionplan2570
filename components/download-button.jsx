"use client";

/* =====================================================================
   ปุ่มดาวน์โหลดรายงาน — เลือกได้ว่า PDF หรือ Excel

   PDF   ใช้ window.print() ของเบราว์เซอร์ แล้วให้ผู้ใช้เลือก Save as PDF
   Excel สร้างไฟล์ .xlsx เองใน lib/xlsx.js ไม่ใช้ไลบรารี

   หน้าที่ยังไม่ได้ส่งข้อมูลตาราง (prop sheets) มาให้ จะเห็นเฉพาะปุ่ม PDF
   ไม่ใช่เห็นปุ่ม Excel แล้วกดได้ไฟล์เปล่า
   ===================================================================== */

import { useEffect, useRef, useState } from "react";
import { META } from "@/lib/plan";
import { downloadXlsx } from "@/lib/xlsx";

export default function DownloadButton({
  title,
  subtitle,
  label,
  className,
  mode,
  /* sheets = [{ name, rows, widths }] หรือฟังก์ชันที่คืนค่าแบบนั้น
     ใช้ฟังก์ชันได้เผื่อตารางใหญ่ จะได้ประกอบข้อมูลตอนกดจริงเท่านั้น
     ไม่ต้องคำนวณใหม่ทุกครั้งที่หน้า re-render */
  sheets,
}) {
  const [printing, setPrinting] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const boxRef = useRef(null);

  const hasExcel = Boolean(sheets);
  const cls = mode === "drawer" ? "printing-drawer" : "printing-page";

  /* ---------- PDF: เปลี่ยนชื่อ document ชั่วคราวเพื่อให้ไฟล์ที่เซฟมีชื่อสื่อความหมาย ---------- */
  useEffect(() => {
    if (!printing) return;

    const prevTitle = document.title;
    const stamp = new Date().toLocaleDateString("th-TH").replace(/\//g, "-");
    document.title = (title || "รายงาน") + " " + stamp;

    document.body.classList.add(cls);
    document.body.setAttribute("data-print-title", title || "รายงาน");
    document.body.setAttribute(
      "data-print-sub",
      (subtitle ? subtitle + " · " : "") + META.org + " · " + META.plan
    );

    const t = setTimeout(() => window.print(), 60);
    function done() {
      setPrinting(false);
    }
    window.addEventListener("afterprint", done);

    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove(cls);
      document.body.removeAttribute("data-print-title");
      document.body.removeAttribute("data-print-sub");
      document.title = prevTitle;
    };
  }, [printing, title, subtitle, cls]);

  /* ปิดเมนูเมื่อคลิกที่อื่นหรือกด Esc */
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toExcel() {
    setOpen(false);
    setErr("");
    try {
      const data = typeof sheets === "function" ? sheets() : sheets;
      const stamp = new Date().toLocaleDateString("th-TH").replace(/\//g, "-");
      downloadXlsx((title || "รายงาน") + " " + stamp, data);
    } catch (e) {
      setErr("สร้างไฟล์ Excel ไม่สำเร็จ: " + (e && e.message ? e.message : String(e)));
    }
  }

  /* หน้าที่ยังไม่มีข้อมูลตาราง ให้เป็นปุ่มเดี่ยวแบบเดิม ไม่ต้องมีเมนูให้กดเปล่า */
  if (!hasExcel) {
    return (
      <button
        className={(className || "btn ghost") + " pdfbtn"}
        onClick={() => setPrinting(true)}
        disabled={printing}
        title="เปิดกล่องพิมพ์ แล้วเลือก Save as PDF เพื่อดาวน์โหลดไฟล์"
      >
        {printing ? "กำลังเตรียม…" : label || "ดาวน์โหลด PDF"}
      </button>
    );
  }

  return (
    <span className="dlwrap" ref={boxRef}>
      <button
        className={(className || "btn ghost") + " pdfbtn"}
        onClick={() => setOpen((v) => !v)}
        disabled={printing}
        aria-expanded={open}
        aria-haspopup="menu"
        title="เลือกรูปแบบไฟล์ที่จะดาวน์โหลด"
      >
        {printing ? "กำลังเตรียม…" : label || "ดาวน์โหลด"} ▾
      </button>

      {open ? (
        <span className="dlmenu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPrinting(true);
            }}
          >
            <b>ไฟล์ PDF</b>
            <span>เปิดกล่องพิมพ์ แล้วเลือก Save as PDF</span>
          </button>
          <button role="menuitem" onClick={toExcel}>
            <b>ไฟล์ Excel</b>
            <span>ได้ .xlsx เปิดแก้ต่อและคำนวณได้</span>
          </button>
        </span>
      ) : null}

      {err ? <span className="dlerr">{err}</span> : null}
    </span>
  );
}
