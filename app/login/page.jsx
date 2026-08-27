"use client";

import { useState } from "react";

/* หน้าเข้าสู่ระบบ — ส่งรหัสไปตรวจที่ /api/login ฝั่งเซิร์ฟเวอร์
   รหัสจริงอยู่ใน route handler ไม่ติดมากับ JS ก้อนนี้

   ตั้งใจไม่ใช้ useSearchParams เพราะใน Next 14 ต้องครอบ Suspense
   ไม่งั้น build ไม่ผ่าน — อ่านจาก window.location ตอนกดส่งแทน ง่ายกว่าและปลอดภัยกว่า */
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
        setBusy(false);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      // ใช้ location แทน router.push เพื่อให้ middleware อ่านคุกกี้ที่เพิ่งตั้งรอบใหม่ทั้งหมด
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch (err) {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
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

        <label htmlFor="username">ชื่อผู้ใช้</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label htmlFor="password">รหัสผ่าน</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <div className="loginerr">{error}</div> : null}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
