import "./globals.css";
import RegisterSW from "@/components/register-sw";

export const metadata = {
  title: "แจ้งเตือนผลการดำเนินงาน กยท. ปีงบประมาณ 2570",
  description:
    "ระบบแจ้งเตือนโครงการในแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570 ที่ผลการดำเนินงานไม่เป็นไปตามเป้าหมาย",
  applicationName: "แจ้งเตือน กยท.",
  icons: {
    /* favicon เป็นหยดน้ำยางบนวงกลมเขียว ไม่ใช่ตราเต็ม เพราะแสดงจริงที่ 16px
       รายละเอียดของตรา (เส้นใบยาง ขอบวง) เละหมดที่ขนาดนั้น
       ส่วนไอคอนแอปยังเป็นตราเต็ม เพราะแสดงที่ 180-512px ซึ่งอ่านออกสบาย

       เรียง SVG ไว้ก่อน เบราว์เซอร์ที่รองรับจะได้ตัวคมทุกขนาด
       ที่เหลือเป็น PNG สำรองให้ Safari รุ่นเก่าและแถบงานของ Windows */
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/icons/favicon-32.png",
    /* iOS ไม่อ่าน manifest ตอนกด "เพิ่มไปยังหน้าจอโฮม" ต้องมีแท็กนี้แยก
       ไม่งั้นจะได้ภาพหน้าจอย่อส่วนแทนไอคอน */
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "แจ้งเตือน กยท.",
    /* แถบสถานะโปร่งใสให้สีเขียวของหัวเว็บไหลขึ้นไปถึงขอบบน */
    statusBarStyle: "black-translucent",
  },
  /* หมายเลขที่เป็นตัวเลขล้วนใน iOS Safari จะถูกทำเป็นลิงก์โทรออกเอง
     ตารางรหัสโครงการ 6 หลักจึงกลายเป็นลิงก์สีฟ้าเต็มไปหมด */
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  /* คีย์บอร์ดบนจอเด้งขึ้นมาแล้วให้ย่อพื้นที่หน้าเว็บลงจริง ๆ
     ไม่ใช่ลอยทับ — 100dvh จะได้ตรงกับที่ตาเห็น และช่องพิมพ์ในแชท
     ไม่ถูกคีย์บอร์ดบัง (Android ทำตามค่านี้ ส่วน iOS ยังไม่รองรับ
     จึงต้องอาศัย visualViewport ใน components/assistant.jsx ด้วย) */
  interactiveWidget: "resizes-content",
  /* ไม่ล็อกการซูม ผู้ใช้ที่สายตาไม่ดีต้องขยายอ่านตัวเลขในตารางได้ */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a4227" },
    { media: "(prefers-color-scheme: dark)", color: "#08301d" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
