/* =====================================================================
   Web App Manifest — ทำให้เว็บติดตั้งลงเครื่องได้เหมือนแอป

   Next สร้างไฟล์นี้เป็น /manifest.webmanifest แล้วใส่ <link rel="manifest">
   ให้เองอัตโนมัติ ไม่ต้องไปเพิ่มแท็กใน layout

   ⚠️ /manifest.webmanifest ต้องถูกยกเว้นใน matcher ของ middleware.js
   ไม่งั้นคนที่ยังไม่ล็อกอินจะถูก redirect ไป /login แล้วเบราว์เซอร์
   จะได้ HTML แทน JSON ปุ่ม "ติดตั้ง" จะไม่ขึ้นเลย
   ===================================================================== */

export default function manifest() {
  return {
    id: "/",
    name: "ระบบแจ้งเตือนผลการดำเนินงาน กยท. 2570",
    /* ชื่อใต้ไอคอนบนหน้าจอหลัก สั้นกว่านี้ไม่ได้แล้ว Android ตัดที่ราว 12 ตัวอักษร */
    short_name: "แจ้งเตือน กยท.",
    description:
      "ติดตามและแจ้งเตือนผลการดำเนินงานตามแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570",
    lang: "th",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    /* ตารางบางหน้ากว้างมาก ต้องหมุนจอนอนได้ จึงไม่ล็อกทิศทาง */
    background_color: "#f2f5f1",
    theme_color: "#0a4227",
    categories: ["business", "productivity", "government"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /* Android ครอบไอคอนเป็นวงกลม/สี่เหลี่ยมมนตามธีมของเครื่อง
         ถ้าไม่มีตัว maskable ระบบจะย่อไอคอนลงในกรอบขาวเล็ก ๆ ซึ่งดูแย่ */
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "แจ้งเตือน", url: "/alerts" },
      { name: "โครงการ/กิจกรรม", url: "/projects" },
      { name: "งบประมาณโครงการ", url: "/budget" },
    ],
  };
}
