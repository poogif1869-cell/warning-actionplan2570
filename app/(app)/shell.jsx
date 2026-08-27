"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useResults } from "@/lib/store";
import { buildAlerts } from "@/lib/alerts";

const NAV = [
  { href: "/", label: "แจ้งเตือน" },
  { href: "/projects", label: "โครงการ" },
  { href: "/entry", label: "กรอกผล" },
];

export default function Shell({ children }) {
  const pathname = usePathname();
  const { results, asOf, savedHint, storageOK, loaded } = useResults();
  const [signingOut, setSigningOut] = useState(false);

  const critCount = useMemo(() => {
    if (!loaded) return 0;
    return buildAlerts(results, asOf).filter((a) => a.sev === "crit").length;
  }, [results, asOf, loaded]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch (e) {}
    window.location.href = "/login";
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          {/* ตราสัญลักษณ์ทางการของ กยท. ครอบตัดจาก "โลโก้ กยท..jpg" ด้วย build\make-logo.ps1 ของโปรเจกต์เดิม
              วางบนพื้นเขียวเข้ม จึงต้องรองด้วยวงกลมขาว ไม่งั้นวงตราสีเขียวจะจมไปกับพื้นหลัง */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="emblem"
            src="/logo.png"
            alt="ตราสัญลักษณ์การยางแห่งประเทศไทย"
            width={46}
            height={46}
          />
          <div className="brand">
            <h1>ระบบแจ้งเตือนผลการดำเนินงาน</h1>
            <div className="sub">การยางแห่งประเทศไทย · แผนปฏิบัติการ</div>
            <div className="en">Rubber Authority of Thailand</div>
          </div>
          <div className="fybadge">
            <b>2570</b>
            <span>fiscal year</span>
          </div>

          <div className="topbar-right">
            {savedHint ? <span className="savehint">{savedHint}</span> : null}
            <button className="iconbtn" onClick={signOut} disabled={signingOut}>
              {signingOut ? "กำลังออก…" : "ออกจากระบบ"}
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={pathname === n.href ? "page" : undefined}
          >
            {n.label}
            {n.href === "/" && critCount > 0 ? (
              <span className="count">{critCount}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <main>
        {!storageOK ? (
          <div className="banner">
            เบราว์เซอร์นี้บันทึกลงเครื่องไม่ได้ (localStorage ถูกปิดหรือเต็ม) —
            สิ่งที่กรอกจะหายเมื่อปิดหน้า ให้กด “ส่งออกไฟล์ผล” ในหน้ากรอกผลเก็บไว้เอง
          </div>
        ) : null}
        {children}
      </main>
    </>
  );
}
