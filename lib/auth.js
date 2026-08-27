/* =====================================================================
   Login แบบรหัสตายตัว ไม่ใช้ Database

   คุกกี้เซสชันเป็น "<เวลาหมดอายุ>.<HMAC-SHA256>" เซ็นด้วย Web Crypto
   ซึ่งมีอยู่แล้วทั้งใน Edge runtime (middleware) และ Node 18+ (route handler)
   จึงไม่ต้องลงไลบรารีอย่าง jose หรือ jsonwebtoken เพิ่ม

   ไฟล์นี้ถูก import จากฝั่งเซิร์ฟเวอร์เท่านั้น (middleware.js กับ app/api/*)
   รหัสผ่านจริงอยู่ใน app/api/login/route.js ไม่ติดมากับ JS ฝั่ง client
   ===================================================================== */

export const COOKIE_NAME = "raot_session";
export const SESSION_MS = 8 * 60 * 60 * 1000; // 8 ชั่วโมง

/* ตั้ง AUTH_SECRET ใน Vercel > Settings > Environment Variables เพื่อความปลอดภัยที่แท้จริง
   ค่า fallback มีไว้ให้ deploy แล้วใช้ได้ทันทีโดยไม่ต้องตั้งค่าอะไร
   แต่ถ้า repo เป็น public ใครอ่านซอร์สก็ปลอมคุกกี้ได้ */
export function sessionSecret() {
  return process.env.AUTH_SECRET || "raot-plan-2570-default-secret-please-override";
}

const encoder = new TextEncoder();

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function signToken(exp, secret) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(String(exp)));
  return String(exp) + "." + base64url(sig);
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const exp = Number(token.slice(0, dot));
  if (!isFinite(exp) || Date.now() > exp) return false;

  const expected = await signToken(exp, secret);
  if (expected.length !== token.length) return false;

  // เทียบแบบเวลาคงที่ กันการเดาลายเซ็นทีละไบต์
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
