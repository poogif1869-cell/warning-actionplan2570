import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_MS, signToken, sessionSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* รหัสตายตัวตามที่กำหนดใน docs/plan.txt
   ตั้ง APP_USER / APP_PASSWORD ใน Vercel เพื่อทับค่านี้ได้โดยไม่ต้องแก้โค้ด
   ค่าเหล่านี้อ่านฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ติดไปกับ JS ที่ส่งให้เบราว์เซอร์ */
function credentials() {
  return {
    user: process.env.APP_USER || "admin",
    pass: process.env.APP_PASSWORD || "raot4623",
  };
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    body = {};
  }

  const username = String(body.username == null ? "" : body.username).trim();
  const password = String(body.password == null ? "" : body.password);
  const ok = credentials();

  if (username !== ok.user || password !== ok.pass) {
    return NextResponse.json(
      { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  const exp = Date.now() + SESSION_MS;
  const token = await signToken(exp, sessionSecret());

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  });
  return res;
}
