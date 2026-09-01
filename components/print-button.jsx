"use client";

import { useEffect, useState } from "react";
import { META } from "@/lib/plan";

/* ปุ่มเรียกรายงานหน้าปัจจุบันเป็น PDF — ใช้ได้ทุกหน้า

   วิธีทำงาน: ติดคลาส printing-page ที่ body แล้วเรียก window.print()
   CSS จะซ่อนเมนู ตัวกรอง และปุ่มทิ้ง เหลือแต่เนื้อรายงาน
   ผู้ใช้เลือก "Save as PDF" ในกล่องพิมพ์เพื่อดาวน์โหลดไฟล์

   **ไม่ใช้ไลบรารี PDF** เพราะเครื่องที่พัฒนาไม่มี Node.js จึงเพิ่ม dependency ไม่ได้
   และวิธีนี้ได้ฟอนต์ไทยถูกต้องเสมอโดยไม่ต้องฝังฟอนต์ลงไฟล์เอง

   เคล็ดลับ: เบราว์เซอร์ตั้งชื่อไฟล์ PDF จาก document.title
   จึงเปลี่ยนชื่อชั่วคราวก่อนพิมพ์ ผู้ใช้จะได้ไฟล์ที่ชื่อสื่อความหมายทันที
   ไม่ใช่ "ระบบแจ้งเตือน..." เหมือนกันทุกไฟล์ */
export default function PrintButton({ title, subtitle, label, className, mode }) {
  const [printing, setPrinting] = useState(false);

  /* mode "drawer" = พิมพ์เฉพาะเนื้อในลิ้นชัก โดยซ่อนหน้าเบื้องหลัง
     mode ปกติ    = พิมพ์เนื้อหาของหน้าปัจจุบัน */
  const cls = mode === "drawer" ? "printing-drawer" : "printing-page";

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

  return (
    <button
      className={className || "btn ghost"}
      onClick={() => setPrinting(true)}
      disabled={printing}
      title="เปิดกล่องพิมพ์ แล้วเลือก Save as PDF เพื่อดาวน์โหลดไฟล์"
    >
      {printing ? "กำลังเตรียม…" : label || "ดาวน์โหลด PDF"}
    </button>
  );
}
