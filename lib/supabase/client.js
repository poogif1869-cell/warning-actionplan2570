"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

/* client ฝั่งเบราว์เซอร์ — เก็บเซสชันไว้ในคุกกี้ให้ middleware อ่านต่อได้
   สร้างครั้งเดียวแล้วใช้ซ้ำ ไม่งั้นจะมี listener ซ้อนกันทุกครั้งที่ re-render */
let cached = null;

export function getSupabase() {
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
