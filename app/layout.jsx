import "./globals.css";

export const metadata = {
  title: "แจ้งเตือนผลการดำเนินงาน กยท. ปีงบประมาณ 2570",
  description:
    "ระบบแจ้งเตือนโครงการในแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570 ที่ผลการดำเนินงานไม่เป็นไปตามเป้าหมาย",
  icons: { icon: "/logo.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
