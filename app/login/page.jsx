"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/* ข้อความ error ของ Supabase เป็นภาษาอังกฤษ แปลเฉพาะที่เจอบ่อย
   ที่เหลือแสดงของเดิมไว้เพื่อไม่ให้กลบสาเหตุจริงตอนแก้ปัญหา */
const ERRORS = {
  "Invalid login credentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "Email not confirmed": "อีเมลนี้ยังไม่ได้ยืนยัน — ให้ผู้ดูแลกดยืนยันให้ในหน้า Supabase",
  "Email logins are disabled": "ผู้ดูแลปิดการเข้าสู่ระบบด้วยอีเมลไว้",
  "Too many requests": "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const supabase = getSupabase();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (err) {
        setError(ERRORS[err.message] || err.message || "เข้าสู่ระบบไม่สำเร็จ");
        setBusy(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      /* ใช้ location.href ไม่ใช่ router.push เพื่อให้ middleware อ่านคุกกี้
         ที่เพิ่งตั้งใหม่ในรอบ request ถัดไปทั้งหมด */
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch (err) {
      setError("ติดต่อ Supabase ไม่ได้ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่");
      setBusy(false);
    }
  }

  return (
    <div className="loginwrap">
      <form className="logincard" onSubmit={submit}>
        <div className="head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="ตราสัญลักษณ์การยางแห่งประเทศไทย" width={72} height={72} />
          <h1>ระบบแจ้งเตือนผลการดำเนินงาน</h1>
          <div className="sub">
            แผนปฏิบัติการ การยางแห่งประเทศไทย
            <br />
            ปีงบประมาณ 2570
          </div>
        </div>

        <label htmlFor="email">อีเมล</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">รหัสผ่าน</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <div className="loginerr">{error}</div> : null}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>

        {/* ไม่มีหน้าสมัครสมาชิกโดยตั้งใจ — ผู้ใช้ถูกสร้างจากหน้า Supabase เท่านั้น */}
        <div className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          ยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบเพื่อขอเปิดบัญชีให้
        </div>
      </form>
    </div>
  );
}
