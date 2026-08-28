/* ค่าเชื่อมต่อ Supabase — ใช้ anon key กับ project url เท่านั้น
   anon key ออกแบบมาให้เปิดเผยได้ ความปลอดภัยจริงอยู่ที่ Row Level Security ในฐานข้อมูล

   NEXT_PUBLIC_* ถูกฝังลงบันเดิลตอน build ไม่ใช่ตอนรัน
   ถ้าเพิ่ม env บน Vercel ทีหลังต้อง Redeploy หนึ่งครั้งจึงจะมีผล */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function isConfigured() {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
}
