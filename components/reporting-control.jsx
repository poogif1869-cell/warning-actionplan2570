"use client";

/* =====================================================================
   ควบคุมรอบการรายงานผล — เปิด/ปิดการรายงาน และล้างข้อมูลการรายงาน

   ข้อมูลที่กรอกกันมาจนถึงตอนนี้เป็น "การจำลองการรายงาน" จึงต้องมีทาง
   ล้างทิ้งก่อนเริ่มรายงานจริง และสวิตช์เปิด/ปิดรอบการรายงาน

   ทุกคนเห็นสถานะว่าเปิดหรือปิดอยู่ แต่ปุ่มกดได้เฉพาะผู้ดูแลระบบ
   ⚠️ การซ่อนปุ่มไม่ใช่ด่านความปลอดภัย ด่านจริงอยู่ในฐานข้อมูล:
      เปิด/ปิด  -> RLS ของ app_settings (is_admin)
      ล้างข้อมูล -> ฟังก์ชัน reset_reports ตรวจ is_admin เอง
      ตอนปิด    -> RLS ของตารางรายงานทุกตารางใช้ can_report()
   ===================================================================== */

import { useState } from "react";
import { useResults } from "@/lib/store";
import ConfirmDialog from "@/components/confirm-dialog";

/* สิ่งที่ล้างได้ — ตรงกับ parts ของ reset_reports() ในฐานข้อมูล
   ไม่มีการแก้แผน (plan_edits) ในรายการนี้ เพราะมติที่อนุมัติไปแล้ว
   ไม่ใช่ข้อมูลจำลอง ล้างทิ้งแล้วแผนจะย้อนกลับไปเป็นแผนเดิมทั้งหมด */
const PARTS = [
  ["results", "ผลการดำเนินงานโครงการ และรายงานรายเดือน"],
  ["steps", "ขั้นตอนการดำเนินงาน (แผน/ผลรายเดือน)"],
  ["risk", "รายงานความเสี่ยง"],
  ["kpi", "ผลตัวชี้วัดองค์กร"],
  ["budget", "รายการงบประมาณ และการส่งข้อมูลงบ"],
];

/* ต้องพิมพ์คำนี้ก่อนถึงจะกดล้างได้ — ลบแล้วกู้ไม่ได้
   ป๊อปอัพยืนยันอย่างเดียวกดผ่านได้ด้วยความเคยชิน การพิมพ์บังคับให้หยุดคิด */
const CONFIRM_WORD = "ล้างข้อมูล";

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return (
    p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + (d.getFullYear() + 543) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

export default function ReportingControl() {
  const {
    isAdmin,
    reportingOpen,
    lastReset,
    hasSettings,
    setReportingOpen,
    resetReports,
    personName,
  } = useResults();

  const [ask, setAsk] = useState(null); // null | "open" | "close" | "reset"
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(() => PARTS.map(([k]) => k));
  const [typed, setTyped] = useState("");

  async function run() {
    setBusy(true);
    if (ask === "open") await setReportingOpen(true);
    if (ask === "close") await setReportingOpen(false);
    if (ask === "reset") await resetReports(pick);
    setBusy(false);
    setAsk(null);
    setTyped("");
  }

  return (
    <div className="card pad rctl">
      <div className="rctl-head">
        <div>
          <div className="small muted">สถานะการรายงานผล</div>
          <div className={"rctl-state " + (reportingOpen ? "open" : "closed")}>
            <i aria-hidden="true" />
            {reportingOpen ? "เปิดการรายงานผลอยู่" : "ปิดการรายงานผลแล้ว"}
          </div>
          <div className="small muted">
            {reportingOpen
              ? "ผู้กรอกข้อมูลรายงานผล งบประมาณ ความเสี่ยง และตัวชี้วัดได้ตามปกติ"
              : "ทุกคนดูข้อมูลได้อย่างเดียว ยกเว้นผู้ดูแลระบบที่ยังแก้ได้เพื่อแก้ข้อมูลที่ผิด"}
          </div>
        </div>

        {isAdmin ? (
          <div className="btnrow" style={{ marginTop: 0 }}>
            {reportingOpen ? (
              <button className="btn ghost" disabled={busy || !hasSettings} onClick={() => setAsk("close")}>
                ปิดการรายงานผล
              </button>
            ) : (
              <button className="btn" disabled={busy || !hasSettings} onClick={() => setAsk("open")}>
                เริ่มรายงานผล
              </button>
            )}
            <button className="btn danger" disabled={busy || !hasSettings} onClick={() => setAsk("reset")}>
              ล้างการรายงานผล
            </button>
          </div>
        ) : null}
      </div>

      {!hasSettings ? (
        <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>
          ยังใช้ปุ่มเปิด/ปิดและล้างการรายงานไม่ได้ — ฐานข้อมูลยังไม่มีตาราง{" "}
          <code>app_settings</code> ให้รัน <code>supabase/schema.sql</code> ก่อน
        </div>
      ) : null}

      {lastReset && lastReset.at ? (
        <div className="small muted" style={{ marginTop: 10 }}>
          ล้างข้อมูลการรายงานครั้งล่าสุด {when(lastReset.at)}
          {lastReset.by && personName(lastReset.by) ? " โดย " + personName(lastReset.by) : ""}
        </div>
      ) : null}

      {ask === "open" || ask === "close" ? (
        <ConfirmDialog
          title={ask === "open" ? "เริ่มรายงานผล" : "ปิดการรายงานผล"}
          confirmLabel={ask === "open" ? "เริ่มรายงานผล" : "ปิดการรายงานผล"}
          busy={busy}
          onConfirm={run}
          onCancel={() => setAsk(null)}
        >
          <p>
            {ask === "open"
              ? "ผู้กรอกข้อมูลทุกคนจะกรอกรายงานผลได้ทันที"
              : "ทุกคนจะกรอกไม่ได้ทันที เหลือดูอย่างเดียว"}
          </p>
        </ConfirmDialog>
      ) : null}

      {ask === "reset" ? (
        <ConfirmDialog
          title="ล้างการรายงานผล"
          confirmLabel="ล้างข้อมูล"
          danger
          busy={busy}
          confirmDisabled={typed.trim() !== CONFIRM_WORD || !pick.length}
          onConfirm={run}
          onCancel={() => {
            setAsk(null);
            setTyped("");
          }}
        >
          <p>ลบข้อมูลที่เลือกของทุกโครงการทิ้งทั้งหมด กู้คืนไม่ได้</p>

          <div className="partpick" style={{ margin: "10px 0" }}>
            {PARTS.map(([k, label]) => {
              const on = pick.indexOf(k) >= 0;
              return (
                <label className={"partrow" + (on ? " on" : "")} key={k}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setPick(e.target.checked ? pick.concat([k]) : pick.filter((x) => x !== k))
                    }
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>

          <p className="small muted">
            แนะนำให้กด “ส่งออกไฟล์สำรอง” ก่อน · การแก้แผนตามมติไม่ถูกล้าง
          </p>

          <div className="field">
            <label htmlFor="rctl-word">
              พิมพ์ <b>{CONFIRM_WORD}</b> เพื่อยืนยัน
            </label>
            <input
              id="rctl-word"
              type="text"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
