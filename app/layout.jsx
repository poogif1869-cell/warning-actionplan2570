import "./globals.css";
import RegisterSW from "@/components/register-sw";

export const metadata = {
  title: "แจ้งเตือนผลการดำเนินงาน กยท. ปีงบประมาณ 2570",
  description:
    "ระบบแจ้งเตือนโครงการในแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570 ที่ผลการดำเนินงานไม่เป็นไปตามเป้าหมาย",
  applicationName: "แจ้งเตือน กยท.",
  icons: {
    icon: "/logo.png",
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
