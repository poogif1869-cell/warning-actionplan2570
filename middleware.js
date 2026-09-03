import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "@/lib/supabase/config";

/* ประตูหน้าของเว็บ — กันทุกหน้ายกเว้นไฟล์ static ของ Next
   หน้าที่ปล่อยผ่านได้ (login, setup) เช็คในตัวฟังก์ชัน อ่านง่ายกว่าเขียน negative lookahead ยาว ๆ

   นอกจากกันคนที่ยังไม่ล็อกอินแล้ว ที่นี่ยัง**ต่ออายุเซสชัน Supabase** ให้ด้วย
   จึงต้องคืน response ตัวที่ setAll เขียนคุกกี้ลงไป ไม่ใช่ NextResponse.next() ตัวใหม่
   ไม่งั้น token ที่รีเฟรชแล้วจะไม่ถูกส่งกลับไปที่เบราว์เซอร์ และผู้ใช้จะหลุดล็อกอินเป็นระยะ */
/* ไฟล์ของ PWA (manifest, service worker, ไอคอน, หน้าออฟไลน์) ต้องอยู่นอกประตูด้วย
   เบราว์เซอร์ขอไฟล์พวกนี้ตอนยังไม่ได้ล็อกอิน ถ้าถูก redirect ไป /login
   จะได้ HTML แทน JSON/JavaScript แล้วปุ่ม "ติดตั้ง" จะไม่ขึ้นเลยโดยไม่มี error ให้เห็น

   sw.js ยังต้องอยู่นอกประตูตลอดไป เพราะเบราว์เซอร์เรียกเช็คเวอร์ชันใหม่เป็นระยะ
   แม้ตอนที่เซสชันหมดอายุแล้ว

   og-image.png ก็เหมือนกัน — บ็อตของ LINE/Facebook ที่มาดึงรูปตัวอย่างตอนแชร์ลิงก์
   ไม่มีคุกกี้เซสชันของใครทั้งนั้น ถ้ากันไว้ การ์ดในแชทจะขึ้นเป็นกรอบเปล่า */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|og-image.png|icons/|manifest.webmanifest|sw.js|offline.html).*)",
  ],
};

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  /* ยังไม่ได้ตั้งค่า Supabase — พาไปหน้าอธิบายวิธีตั้งค่า ไม่ปล่อยให้เว็บพังเงียบ ๆ */
  if (!isConfigured()) {
    if (pathname === "/setup") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/setup") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  /* ต้องใช้ getUser() ไม่ใช่ getSession()
     getSession() อ่านจากคุกกี้ตรง ๆ โดยไม่ตรวจกับเซิร์ฟเวอร์ จึงปลอมได้ */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* /api/* ต้องได้ 401 เป็น JSON ไม่ใช่ถูก redirect ไปหน้า login
     ไม่งั้น fetch จะได้ HTML ของหน้า login กลับมา แล้ว res.json() พังโดยไม่บอกสาเหตุ */
  if (!user && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  if (!user && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const back = request.nextUrl.pathname + request.nextUrl.search;
    if (back && back !== "/") url.searchParams.set("next", back);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
