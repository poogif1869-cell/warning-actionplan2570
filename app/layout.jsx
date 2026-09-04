import "./globals.css";
import RegisterSW from "@/components/register-sw";

const TITLE = "แจ้งเตือนผลการดำเนินงาน กยท. ปีงบประมาณ 2570";
const DESC =
  "ระบบแจ้งเตือนโครงการในแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570 ที่ผลการดำเนินงานไม่เป็นไปตามเป้าหมาย";

/* ---------------------------------------------------------------------
   ที่อยู่เว็บแบบเต็ม — จำเป็นสำหรับรูปตัวอย่างตอนแชร์ลิงก์

   og:image ต้องเป็น URL เต็ม บ็อตของ LINE/Facebook ไม่รู้จักพาธแบบย่อ
   metadataBase ทำให้ Next แปลง "/og-image.png" เป็น URL เต็มให้เอง

   VERCEL_PROJECT_PRODUCTION_URL คือโดเมนของ production (คงที่)
   ส่วน VERCEL_URL เปลี่ยนทุก deploy จึงใช้เป็นตัวสำรองเท่านั้น
   ตั้ง NEXT_PUBLIC_SITE_URL ทับได้ถ้าใช้โดเมนของตัวเอง
   --------------------------------------------------------------------- */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL
    : null) ||
  (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : null) ||
  "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESC,
  applicationName: "แจ้งเตือน กยท.",

  /* ---------------------------------------------------------------
     รูปตัวอย่างตอนส่งลิงก์เข้า LINE / Facebook / X

     บ็อตพวกนี้ไม่มีคุกกี้เซสชัน เปิดหน้าแรกแล้วจะถูก middleware
     พาไป /login — ซึ่งไม่เป็นไร เพราะแท็กพวกนี้อยู่ใน layout ราก
     หน้า login จึงมี og:image ชุดเดียวกัน การ์ดขึ้นครบเหมือนกัน

     แต่ **ตัวไฟล์รูปต้องเปิดได้โดยไม่ต้องล็อกอิน** จึงยกเว้น
     og-image.png ใน matcher ของ middleware.js ไว้แล้ว
     --------------------------------------------------------------- */
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "ระบบแจ้งเตือนผลการดำเนินงาน กยท.",
    title: TITLE,
    description: DESC,
    url: "/",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ระบบแจ้งเตือนผลการดำเนินงาน การยางแห่งประเทศไทย ปีงบประมาณ 2570",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/og-image.png"],
  },

  icons: {
    /* ไอคอนย่อจากภาพ Images/icon.png (เกจวัดผล + กระดิ่งแจ้งเตือน)
       ต้นฉบับเป็นบิตแมป **ไม่มีไฟล์เวกเตอร์** จึงไม่มี favicon.svg
       ทุกเบราว์เซอร์ใช้ PNG หมด ต่างจากไอคอนชุดก่อนที่วาดเป็นเวกเตอร์

       ให้ไปหลายขนาด เบราว์เซอร์จะเลือกตัวที่ใกล้เคียงที่สุดเอง
       จอความละเอียดสูงหยิบ 32/64 ไปใช้แทน 16 คมกว่ามาก */
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
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

/* อ่านโหมดที่ผู้ใช้เลือกไว้แล้วติดลงบน <html> **ก่อนหน้าจอวาดครั้งแรก**
   ถ้าไปทำใน useEffect ของ React จะช้าไปหนึ่งเฟรม คนที่เลือกโหมดมืด
   จะเห็นจอขาววาบขึ้นมาทุกครั้งที่โหลดหน้า

   ห่อ try/catch เพราะเบราว์เซอร์ที่ปิด storage จะโยน error ตั้งแต่บรรทัดแรก
   แล้วสคริปต์ที่เหลือในหน้าจะไม่ทำงานทั้งหมด */
const THEME_BOOT = `try{var t=localStorage.getItem('raot-theme');
if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
