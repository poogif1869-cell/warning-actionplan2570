"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useResults } from "@/lib/store";
import { buildAlerts } from "@/lib/alerts";
import Assistant from "@/components/assistant";
import InstallButton from "@/components/install-button";
import ThemeToggle from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "ภาพรวม" },
  { href: "/alerts", label: "แจ้งเตือน", badge: true },
  { href: "/strategy", label: "ยุทธศาสตร์ & ตัวชี้วัด" },
  { href: "/projects", label: "โครงการ/กิจกรรม" },
  { href: "/budget", label: "งบประมาณโครงการ" },
  { href: "/linkage", label: "ความเชื่อมโยงแผน" },
  { href: "/risk", label: "ความเสี่ยง" },
];

export default function Shell({ children }) {
  const pathname = usePathname();
  const {
    results,
    risk,
    asOfMonth,
    savedHint,
    loaded,
    loadError,
    saveError,
    userEmail,
    canEdit,
    hasRoles,
    signOut,
    saveNow,
  } = useResults();
  const [signingOut, setSigningOut] = useState(false);

  const critCount = useMemo(() => {
    if (!loaded) return 0;
    return buildAlerts(results, asOfMonth, risk).filter((a) => a.sev === "crit").length;
  }, [results, asOfMonth, risk, loaded]);

  async function handleSignOut() {
    setSigningOut(true);
    // ส่งสิ่งที่ยังค้างขึ้น Supabase ก่อน ไม่งั้นข้อความที่เพิ่งพิมพ์จะหาย
    try {
      await saveNow();
    } catch (e) {}
    await signOut();
  }

  return (
    <>
      {/* แถบหัวเรื่องกับเมนูติดหนึบไปด้วยกันเป็นก้อนเดียว

          เดิมแยกกัน sticky คนละตัว แล้วเมนูตั้ง top:74px ตายตัว
          พอแถบหัวเรื่องสูงไม่เท่า 74px (ตัวหนังสือขึ้นบรรทัดใหม่ ปุ่มเพิ่ม ฯลฯ)
          เมนูจะเลื่อนไปซ้อนใต้แถบหัวเรื่อง ตัวอักษรโดนบังไปครึ่งหนึ่ง
          ห่อรวมแล้ว sticky ที่ตัวห่อทีเดียว จึงไม่ต้องเดาความสูงอีก */}
      <div className="appbar">
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
            {userEmail ? <span className="savehint useremail">{userEmail}</span> : null}
            <ThemeToggle />
            <InstallButton />
            <button className="iconbtn" onClick={handleSignOut} disabled={signingOut}>
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
            {n.badge && critCount > 0 ? <span className="count">{critCount}</span> : null}
          </Link>
        ))}
      </nav>
      </div>

      <main>
        {loadError ? (
          <div className="banner bad">
            {loadError}
            {/* error เรื่อง token มักหายเมื่อเข้าสู่ระบบใหม่ ให้ปุ่มไว้ตรงนี้เลย
                จะได้ไม่ต้องไปหาปุ่มออกจากระบบด้านบนเอง */}
            {/token|JWT|เซสชัน|นาฬิกา/i.test(loadError) ? (
              <div className="btnrow">
                <button className="btn" onClick={signOut}>
                  ออกจากระบบแล้วเข้าใหม่
                </button>
                <button className="btn ghost" onClick={() => window.location.reload()}>
                  ลองโหลดหน้าใหม่
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {saveError ? <div className="banner bad">{saveError}</div> : null}

        {/* บอกให้รู้ตัวว่าเข้ามาแบบดูอย่างเดียว ไม่งั้นจะงงว่าทำไมกรอกไม่ได้
            ขึ้นเฉพาะตอนที่ระบบบทบาทเปิดใช้จริงแล้ว (ฐานข้อมูลมีตาราง profiles) */}
        {loaded && hasRoles && !canEdit ? (
          <div className="banner">
            คุณเข้าใช้งานแบบ <b>ดูอย่างเดียว</b> — ดูและออกรายงานได้ทุกหน้า
            แต่แก้ไขข้อมูลไม่ได้ ถ้าต้องกรอกข้อมูล ให้ผู้ดูแลระบบเปิดสิทธิ์
            "ผู้กรอกข้อมูล" ให้บัญชี {userEmail || "ของคุณ"}
          </div>
        ) : null}

        {children}
      </main>

      {/* ปุ่มลอยมุมขวาล่าง อยู่นอก main จะได้ไม่ถูกกฎ print ของแต่ละหน้าจับ */}
      <Assistant />
    </>
  );
}
