import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken, sessionSecret } from "@/lib/auth";

/* กันทุกหน้ายกเว้นไฟล์ static ของ Next แล้วปล่อยหน้า login กับ API login
   ผ่านในตัวฟังก์ชัน — อ่านง่ายกว่าการเขียน negative lookahead ยาว ๆ ใน matcher */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME);
  if (await verifyToken(token && token.value, sessionSecret())) {
    return NextResponse.next();
  }

  // API ที่ยังไม่ล็อกอินควรได้ 401 ไม่ใช่หน้า HTML ของ /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const back = req.nextUrl.pathname + req.nextUrl.search;
  if (back && back !== "/") url.searchParams.set("next", back);
  return NextResponse.redirect(url);
}
