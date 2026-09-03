"use client";

/* =====================================================================
   ปุ่ม "ติดตั้งแอป" บนแถบหัวเรื่อง

   เบราว์เซอร์มีปุ่มติดตั้งของตัวเองอยู่แล้ว (ไอคอนในแถบที่อยู่บนเดสก์ท็อป
   เมนู "เพิ่มไปยังหน้าจอโฮม" บนมือถือ) แต่ซ่อนลึกจนผู้ใช้ทั่วไปหาไม่เจอ
   จึงดัก beforeinstallprompt มาทำเป็นปุ่มของเราเอง

   ปุ่มจะโผล่ก็ต่อเมื่อเบราว์เซอร์บอกว่าติดตั้งได้จริง ๆ เท่านั้น
   ติดตั้งไปแล้ว หรือเบราว์เซอร์ไม่รองรับ (Safari) ก็จะไม่มีปุ่ม
   ไม่ใช่ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น
   ===================================================================== */

import { useEffect, useState } from "react";

export default function InstallButton() {
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* เปิดจากไอคอนที่ติดตั้งไว้แล้ว ไม่ต้องชวนติดตั้งซ้ำ */
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) return;

    function onPrompt(e) {
      /* ต้องกันไม่ให้เบราว์เซอร์แสดงแถบชวนติดตั้งของตัวเอง
         แล้วเก็บ event ไว้ยิงตอนผู้ใช้กดปุ่มของเรา */
      e.preventDefault();
      setPrompt(e);
    }
    function onInstalled() {
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (e) {
      // ผู้ใช้กดยกเลิกก็มาทางนี้ ไม่ต้องทำอะไร
    }
    /* event ใช้ได้ครั้งเดียว ถ้าผู้ใช้กดยกเลิก เบราว์เซอร์จะส่งมาใหม่เองภายหลัง */
    setPrompt(null);
    setBusy(false);
  }

  if (!prompt) return null;

  return (
    <button className="iconbtn" onClick={install} disabled={busy} title="ติดตั้งลงเครื่อง">
      ⬇ ติดตั้งแอป
    </button>
  );
}
