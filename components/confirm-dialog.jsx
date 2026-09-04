"use client";

/* =====================================================================
   กล่องยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้

   ใช้แทน window.confirm() ในจุดที่อยากได้หน้าตาเข้ากับเว็บ
   และเขียนคำอธิบายได้ยาวกว่าหนึ่งบรรทัด

   ทำเป็น component แยกเพราะจะได้เอาไปใช้ซ้ำจุดอื่นได้ (เช่น ลบข้อมูล)
   ไม่ใช่ผูกติดกับปุ่มออกจากระบบอย่างเดียว
   ===================================================================== */

import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const okRef = useRef(null);

  /* โฟกัสปุ่มยืนยันทันทีที่เปิด กด Enter ได้เลยโดยไม่ต้องใช้เมาส์
     และคนที่ใช้คีย์บอร์ดอย่างเดียวจะรู้ว่าโฟกัสย้ายเข้ามาในกล่องแล้ว */
  useEffect(() => {
    if (okRef.current) okRef.current.focus();
  }, []);

  /* Esc = ยกเลิก ตามที่ทุกคนคาดหวังจากกล่องแบบนี้ */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <>
      {/* คลิกพื้นหลังก็ยกเลิกได้ แต่ห้ามยกเลิกระหว่างกำลังทำงาน
          ไม่งั้นจะปิดกล่องทิ้งทั้งที่งานยังค้างอยู่ */}
      <div className="scrim scrim-top" onClick={busy ? undefined : onCancel} />
      <div
        className="confirmbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h3 id="confirm-title">{title}</h3>
        <div className="confirmbody">{children}</div>
        <div className="btnrow">
          <button
            ref={okRef}
            className={"btn" + (danger ? " danger" : "")}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "กำลังทำงาน…" : confirmLabel}
          </button>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </>
  );
}
