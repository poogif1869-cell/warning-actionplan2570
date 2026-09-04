"use client";

/* =====================================================================
   ปุ่มสลับโหมดสว่าง/มืด

   globals.css รองรับสามสถานะอยู่แล้ว:
     ไม่มี data-theme       → ตามเครื่อง (prefers-color-scheme)
     data-theme="light"     → บังคับสว่าง
     data-theme="dark"      → บังคับมืด

   ปุ่มนี้จึงแค่หมุนค่าใน <html data-theme> กับ localStorage
   ไม่ต้องแตะสีที่ไหนเลย

   ⚠️ การอ่านค่าที่บันทึกไว้ทำใน app/layout.jsx ด้วยสคริปต์เล็ก ๆ ที่รัน
   **ก่อนหน้าจอวาดครั้งแรก** ถ้ามาอ่านตอน component นี้ mount จะช้าไป
   ผู้ใช้ที่เลือกโหมดมืดจะเห็นจอขาววาบขึ้นมาก่อนหนึ่งเฟรมทุกครั้งที่โหลดหน้า
   ===================================================================== */

import { useEffect, useState } from "react";

export const THEME_KEY = "raot-theme";

/* เรียงตามลำดับที่กดวน — เริ่มจาก "ตามเครื่อง" ซึ่งเป็นค่าตั้งต้น */
const MODES = [
  { key: "system", label: "ตามเครื่อง", icon: "◑" },
  { key: "light", label: "สว่าง", icon: "☀" },
  { key: "dark", label: "มืด", icon: "☾" },
];

function apply(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
  else root.removeAttribute("data-theme");
}

export default function ThemeToggle() {
  /* ตั้งต้นเป็น null จนกว่าจะอ่านค่าจริงได้ เพื่อไม่ให้ปุ่มแสดงข้อความ
     คนละอย่างกับที่เซิร์ฟเวอร์ส่งมา (hydration mismatch) */
  const [mode, setMode] = useState(null);

  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    setMode(MODES.some((m) => m.key === saved) ? saved : "system");
  }, []);

  function next() {
    const i = MODES.findIndex((m) => m.key === mode);
    const picked = MODES[(i + 1) % MODES.length].key;
    setMode(picked);
    apply(picked);
    try {
      localStorage.setItem(THEME_KEY, picked);
    } catch (e) {}
  }

  if (!mode) return null;

  const cur = MODES.find((m) => m.key === mode) || MODES[0];

  return (
    <button
      className="iconbtn themebtn"
      onClick={next}
      title={"โหมดแสดงผล: " + cur.label + " (กดเพื่อเปลี่ยน)"}
      aria-label={"โหมดแสดงผล " + cur.label + " กดเพื่อเปลี่ยน"}
    >
      <span aria-hidden="true">{cur.icon}</span>
      <span className="themebtn-text">{cur.label}</span>
    </button>
  );
}
