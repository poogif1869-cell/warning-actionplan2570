"use client";

/* =====================================================================
   ลงทะเบียน Service Worker

   ต้องมี SW ที่ดัก fetch เบราว์เซอร์ถึงจะยอมให้ "ติดตั้ง" เว็บลงเครื่อง
   ตัว SW อยู่ที่ public/sw.js

   วางไว้ใน layout ราก ไม่ใช่ shell ของหน้าที่ต้องล็อกอิน
   จะได้ลงทะเบียนตั้งแต่หน้า /login — คนที่ยังไม่เคยเข้าสู่ระบบ
   ก็ต้องเห็นปุ่มติดตั้งเหมือนกัน

   ไม่แสดงอะไรบนหน้าจอ
   ===================================================================== */

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /* localhost ก็ลงได้ (เบราว์เซอร์ยกเว้นให้) แต่ http ของจริงลงไม่ได้
       เช็คก่อนจะได้ไม่มี error แดง ๆ ใน console โดยไม่จำเป็น */
    const secure =
      window.isSecureContext ||
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost";
    if (!secure) return;

    let cancelled = false;

    /* รอให้หน้าโหลดเสร็จก่อน การลงทะเบียน SW จะได้ไม่ไปแย่งแบนด์วิดท์
       กับข้อมูลที่ผู้ใช้กำลังรออ่านจริง ๆ */
    const start = () => {
      if (cancelled) return;
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // ลงทะเบียนไม่สำเร็จก็ใช้เว็บได้ตามปกติ แค่ติดตั้งเป็นแอปไม่ได้
        console.warn("ลงทะเบียน Service Worker ไม่สำเร็จ", err);
      });
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
    };
  }, []);

  return null;
}
