"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MONTHS, STATUSES, monthsOf, currentFiscalMonth } from "@/lib/plan";
import { RISK_TYPES, RISK_LEVELS, riskLevelInfo } from "@/lib/rollup";
import ConfirmDialog from "@/components/confirm-dialog";
import StatusBadge, { ReportBadge } from "@/components/status-badge";
import { money, pct } from "@/lib/format";
import {
  useResults,
  hasReport,
  riskAt,
  monthlyOf,
  projectTrack,
  budgetRollup,
  stepsOf,
} from "@/lib/store";
import StepsTable from "@/components/steps-table";

/* แท็บ "รายงานผลรายเดือน" ในลิ้นชักรายละเอียด

   แบ่งเป็นขั้น (ผลโครงการ → ผลกิจกรรม → ความเสี่ยง) แต่ละขั้นแบ่งเป็นกล่อง
   มีเลขข้อกำกับ (คอมโพเนนต์ Sec ด้านล่าง)

   ขั้นผลโครงการ
     1. งบประมาณโครงการ (จัดสรร / ใช้ไป / คงเหลือ) — อ่านอย่างเดียว
     2. สถานะการดำเนินงาน + ความก้าวหน้า
     3. ขั้นตอนการดำเนินงาน (แผน/ผลรายเดือน)
     4. ตัวชี้วัดผลผลิต  พร้อมช่องรายงานผล + ปัญหาอุปสรรค
     5. ตัวชี้วัดผลลัพธ์ พร้อมช่องรายงานผล + ปัญหาอุปสรรค
     6. รายงานผลการดำเนินงานรายเดือน (เฉพาะเดือนที่ถึงแล้ว)
   ขั้นผลกิจกรรม (มีเฉพาะโครงการที่มีกิจกรรมย่อย)
     1. เลือกกิจกรรม  2. งบของกิจกรรม  3. ตัวชี้วัดผลผลิต  4. ขั้นตอนของกิจกรรม
   ขั้นความเสี่ยง
     1. ทะเบียนความเสี่ยงตามแผน — อ่านอย่างเดียว  2. รายงานความเสี่ยงรายเดือน

   **รายงานหลักอยู่ที่ระดับโครงการเสมอ** กิจกรรมเป็นส่วนเพิ่ม ไม่ใช่ตัวแทน
   กิจกรรมไม่มีช่องผลลัพธ์ เพราะผลลัพธ์ (Outcome) เป็นตัวชี้วัดของทั้งโครงการ

   **ไม่มีช่องกรอกงบประมาณที่นี่** งบบันทึกที่หน้า "งบประมาณโครงการ" ที่เดียว */
/* ---------------------------------------------------------------------
   ⚠️ ลิ้นชักรายละเอียดโครงการถูกใช้ใน 5 หน้า (ภาพรวม · แจ้งเตือน · โครงการ ·
   ความเชื่อมโยงแผน · ความเสี่ยง) แต่ **ผลการดำเนินงานต้องกรอกได้ที่หน้า
   โครงการ/กิจกรรม ที่เดียว** ตามที่ตกลงกันไว้ว่าข้อมูลหนึ่งชนิดมีที่กรอกที่เดียว

   หน้าอื่นเปิดลิ้นชักได้ตามปกติ แต่เป็นอ่านอย่างเดียว
   --------------------------------------------------------------------- */
const HOME_PATH = "/projects";

/* กล่องหัวข้อมีเลขข้อ — หัวกล่องบอกว่าข้อนี้คืออะไร ต้องทำอะไร
   และมีช่องมุมขวาไว้ใส่ป้ายสรุป (สถานะ / รายงานแล้วกี่รายการ)

   ประกาศไว้นอก ReportTab โดยตั้งใจ ถ้าประกาศข้างใน React จะเห็นเป็น
   คอมโพเนนต์ชนิดใหม่ทุกครั้งที่วาด แล้วรื้อทุกช่องในกล่องสร้างใหม่
   ช่องที่กำลังพิมพ์จะหลุดโฟกัสหลังพิมพ์ทุกตัวอักษร */
function Sec({ no, title, hint, right, children }) {
  return (
    <section className="rsec">
      <header className="rsec-head">
        <span className="rsec-no" aria-hidden="true">
          {no}
        </span>
        <div className="rsec-titles">
          <h4 className="rsec-title">
            <span className="sr-only">ข้อ {no} </span>
            {title}
          </h4>
          {hint ? <div className="rsec-hint">{hint}</div> : null}
        </div>
        {right ? <div className="rsec-right">{right}</div> : null}
      </header>
      <div className="rsec-body">{children}</div>
    </section>
  );
}

export default function ReportTab({ item }) {
  const pathname = usePathname();
  const router = useRouter();

  /* ตัด "/" ท้ายทิ้งก่อนเทียบ — บนมือถือ (โดยเฉพาะตอนเปิดจากไอคอน PWA
     หรือจากลิงก์ที่พิมพ์เอง) path อาจกลายเป็น "/projects/" ซึ่งไม่เท่ากับ
     "/projects" ตรง ๆ แล้วหน้าจะกลายเป็นดูอย่างเดียวทั้งที่อยู่หน้าเดียวกัน */
  const here = String(pathname || "").replace(/\/+$/, "") || "/";
  const onHome = here === HOME_PATH;

  const {
    results,
    budget,
    asOfMonth,
    asOfLabel,
    allMonths,
    budgetSubmitted,
    risk,
    setRisk,
    monthlyHasIssue,
    hasIndicatorCols,
    setProject,
    setMonthly,
    saveNow,
    steps,
    canReport,
    reportingOpen,
  } = useResults();

  /* กรอกได้ต้องผ่านสองด่าน: อยู่หน้าโครงการ/กิจกรรม และตอนนี้รายงานได้
     (มีสิทธิ์ผู้กรอกข้อมูล และผู้ดูแลเปิดการรายงานผลอยู่ — ผู้ดูแลกรอกได้เสมอ)
     ใช้ตัวแปรเดียวคุมทั้งแท็บ ช่องกรอก ปุ่มบันทึก และการเขียนความคืบหน้ากลับ
     จะได้ไม่มีที่ไหนหลุดไปเขียนตอนปิดรอบ */
  const editable = onHome && canReport;
  const [actUid, setActUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const kids = item._kids || [];
  const activity = kids.find((k) => k.uid === actUid) || null;

  /* ---------------------------------------------------------------
     กิจกรรมนี้รายงานผลแล้วหรือยัง

     นับจาก outputResult ที่กรอกจริงเท่านั้น ไม่นับ outputIssue
     เพราะ "ติดปัญหาอะไร" กรอกได้โดยที่ยังไม่มีผลผลิตมารายงาน
     ถ้านับด้วยจะขึ้นว่ารายงานแล้วทั้งที่ยังไม่มีตัวเลขผลงานสักตัว
     --------------------------------------------------------------- */
  function actReported(k) {
    const v = projectTrack(results, k.uid).outputResult;
    return v != null && String(v).trim() !== "";
  }
  const actDone = kids.filter(actReported).length;

  /* ---------------------------------------------------------------
     ต้องส่งข้อมูลงบประมาณของเดือนที่เลือกก่อน ถึงจะบันทึกรายงานผลได้

     เหตุผล: ยอดเบิกจ่ายในรายงานผลคำนวณมาจากรายการงบประมาณ ถ้ายังแก้งบ
     ได้อยู่ ตัวเลขในรายงานที่บันทึกไปแล้วจะเปลี่ยนตามทีหลังโดยไม่มีใครรู้

     "ทั้งปี" ไม่ผูกกับเดือนใดเดือนหนึ่ง จึงไม่บังคับ — แต่เตือนให้เลือกเดือน
     เพราะรายงานผลเป็นงานรายเดือน
     --------------------------------------------------------------- */
  /* โครงการที่ไม่ได้รับงบเลย ไม่ต้องส่งงบก่อน — ไม่มีอะไรให้ส่ง
     ดูจากงบตามแผนของทั้งโครงการรวมกิจกรรมลูก ถ้าเป็นศูนย์ทั้งหมด
     แปลว่าเป็นงานที่ทำโดยไม่ใช้งบ บังคับไปก็ได้แค่รายการ 0 บาทเปล่า ๆ */
  const noBudget =
    (item.budget || 0) === 0 && kids.every((k) => (k.budget || 0) === 0);

  const budgetReady = !allMonths && (noBudget || budgetSubmitted(item.uid, asOfMonth));
  const [ackWarn, setAckWarn] = useState(false);

  /* พาไปที่โครงการนี้ในหน้างบประมาณเลย ไม่ใช่ให้ไปค้นเองใหม่
     ส่ง uid ไม่ใช่ code เพราะรหัสโครงการซ้ำกัน 9 รหัส ถ้าส่ง code
     จะเปิดผิดโครงการได้ (ดูหมายเหตุเรื่องรหัสซ้ำใน lib/plan.js) */
  function goBudget() {
    router.push("/budget?uid=" + encodeURIComponent(item.uid));
  }

  /* ---------------------------------------------------------------
     รายงานเป็นขั้นตอน ไม่ใช่หน้ายาวหน้าเดียว

       ผลโครงการ -> ผลกิจกรรม -> ความเสี่ยง -> บันทึก

     **โครงการที่ไม่มีกิจกรรมย่อยข้ามขั้นที่สองไปเลย** ไม่ใช่โชว์ขั้นว่าง ๆ
     ให้กดผ่าน — คนกรอกจะได้ไม่สงสัยว่าลืมทำอะไรไปหรือเปล่า

     เก็บลำดับขั้นไว้เป็นอาร์เรย์แทนการนับเลขตรง ๆ เพราะจำนวนขั้นไม่คงที่
     ถ้าใช้เลขจะต้องเขียน if กระจายทุกที่ที่ต้องรู้ว่าขั้นถัดไปคืออะไร
     --------------------------------------------------------------- */
  const STEPS = kids.length
    ? [
        ["project", "ผลโครงการ"],
        ["activity", "ผลกิจกรรม"],
        ["risk", "ความเสี่ยง"],
      ]
    : [
        ["project", "ผลโครงการ"],
        ["risk", "ความเสี่ยง"],
      ];

  const [stepIdx, setStepIdx] = useState(0);
  const idx = Math.min(stepIdx, STEPS.length - 1);
  const step = STEPS[idx][0];
  const isLast = idx === STEPS.length - 1;

  const tk = projectTrack(results, item.uid);
  const roll = budgetRollup(budget, item, null);
  const plan = monthsOf(item);
  const rep = monthlyOf(results, item.uid);

  /* ---------------------------------------------------------------
     เดือนสุดท้ายที่แสดงในตารางรายงาน

     เลือกเดือนไหนอยู่ ก็แสดงถึงเดือนนั้น — เดือนที่ยังมาไม่ถึงไม่ต้องขึ้น
     ตอนเลือก "ทั้งปี" ใช้เดือนจริงตามปฏิทิน ไม่ใช่ ก.ย. 70 ทั้งดุ้น
     ไม่งั้นการเลือกทั้งปีจะกลายเป็นทางลัดให้กรอกล่วงหน้าได้ทั้งปี
     --------------------------------------------------------------- */
  const lastMonth = allMonths ? currentFiscalMonth().index : asOfMonth;

  /* ---------------------------------------------------------------
     ความก้าวหน้า (%) ของโครงการ/กิจกรรม มาจากตารางขั้นตอนการดำเนินงาน

     เขียนกลับลงช่อง progress เฉพาะตอนค่าเปลี่ยนจริง และเฉพาะหน้าที่กรอกได้
     หน้าอื่นเปิดลิ้นชักดูอย่างเดียว ถ้าให้เขียนด้วยจะยิงไปชน denyReadOnly
     ทุกครั้งที่มีคนเปิดดู
     --------------------------------------------------------------- */
  const ownSteps = stepsOf(steps, item.uid);

  function syncProgress(uid) {
    return (value) => {
      if (!editable) return;
      const cur = projectTrack(results, uid).progress;
      if (String(cur == null ? "" : cur) === String(value)) return;
      setProject(uid, { progress: String(value) });
    };
  }

  const area = {
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13.5,
    minHeight: 62,
    resize: "vertical",
    fontFamily: "inherit",
  };
  const cell = { ...area, minHeight: 0, padding: "4px 7px", fontSize: 12.5 };

  async function save() {
    setSaving(true);
    setSaved(false);
    await saveNow();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  /* ไทล์งบ 3 ช่อง ใช้ทั้งระดับโครงการและระดับกิจกรรม */
  function budgetTiles({ target, note }) {
    const r = budgetRollup(budget, target, null);
    const planned = target.budget || 0;
    const left = planned - r.total;
    return (
      <>
        <div className="tiles" style={{ marginBottom: 6 }}>
          <div className="tile">
            <span className="lab">ได้รับจัดสรรตามแผน</span>
            <div className="val">{money(planned)}</div>
            <div className="note">บาท</div>
          </div>
          <div className="tile">
            <span className="lab">ใช้ไปแล้ว</span>
            <div className="val">{r.total ? money(r.total) : "–"}</div>
            <div className="note">
              {planned ? pct((r.total / planned) * 100) + " ของที่จัดสรร" : "บาท"}
            </div>
          </div>
          <div className={"tile " + (left < 0 ? "crit" : "ok")}>
            <span className="lab">คงเหลือ</span>
            <div className={"val " + (left < 0 ? "st-bad" : "")}>{money(left)}</div>
            <div className="note">บาท</div>
          </div>
        </div>
        {note ? (
          <div className="small muted" style={{ marginTop: 4 }}>
            {note}
          </div>
        ) : null}
      </>
    );
  }

  /* บล็อกตัวชี้วัด: ค่าตามแผน + ช่องรายงานผล + ช่องปัญหาอุปสรรค

     ⚠️ ต้องเรียกเป็นฟังก์ชัน {indicator({...})} ห้ามเรียกเป็น <Indicator />
     ฟังก์ชันนี้ประกาศอยู่ในตัว ReportTab จึงเกิดใหม่ทุกครั้งที่วาด ถ้าใช้เป็น
     คอมโพเนนต์ React จะเห็นเป็น "คนละชนิด" ทุกรอบแล้ว unmount ทิ้งสร้างใหม่
     ช่องที่กำลังพิมพ์จะหลุดโฟกัสหลังพิมพ์ทุกตัวอักษร
     หัวข้อไม่ได้อยู่ในนี้แล้ว ย้ายไปเป็นหัวของกล่อง Sec แทน */
  function indicator({ planValue, uid, resultKey, issueKey }) {
    const t = projectTrack(results, uid);
    return (
      <>
        <dl className="dl">
          <dt>ค่าตามแผน</dt>
          <dd>{planValue || "–"}</dd>
        </dl>
        <div className="trackgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="small muted">รายงานผล</label>
            <textarea
              value={t[resultKey] == null ? "" : t[resultKey]}
              disabled={!hasIndicatorCols}
              placeholder={hasIndicatorCols ? "ผลที่ทำได้จริง" : "ยังไม่พร้อมใช้"}
              onChange={(e) => setProject(uid, { [resultKey]: e.target.value })}
              style={area}
            />
          </div>
          <div>
            <label className="small muted">ปัญหาอุปสรรค</label>
            <textarea
              value={t[issueKey] == null ? "" : t[issueKey]}
              disabled={!hasIndicatorCols}
              placeholder={hasIndicatorCols ? "ติดปัญหาอะไร" : "ยังไม่พร้อมใช้"}
              onChange={(e) => setProject(uid, { [issueKey]: e.target.value })}
              style={area}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    /* fieldset ปิดช่องกรอกทั้งก้อนในทีเดียว ไม่ต้องใส่ disabled ทีละ input
       (มีเป็นสิบช่อง และเพิ่มใหม่เมื่อไหร่ก็ลืมได้ง่าย)
       ต้องมี min-width:0 ใน CSS ไม่งั้น fieldset จะดันความกว้างจนตารางล้น */
    <fieldset className="plainset" disabled={!editable}>
      {!onHome ? (
        <div className="banner">
          หน้านี้ดูได้อย่างเดียว — <b>รายงานผลการดำเนินงานกรอกที่หน้า
          “โครงการ/กิจกรรม”</b> ที่เดียว เพื่อไม่ให้ข้อมูลชุดเดียวกัน
          ถูกแก้จากหลายที่จนตามไม่ทันว่าใครแก้อะไร
        </div>
      ) : !reportingOpen && !canReport ? (
        <div className="banner bad">
          <b>ปิดการรายงานผลแล้ว</b> — ดูข้อมูลได้อย่างเดียว
          จนกว่าผู้ดูแลระบบจะกด “เริ่มรายงานผล”
        </div>
      ) : null}

      {/* ---------- แถบเตือนค้างไว้ด้านบน ----------
          ป๊อปอัพกดปิดแล้วก็หายไป ถ้ามีแค่ป๊อปอัพ คนที่กด "รับทราบ" ตั้งแต่แรก
          จะกรอกไปทั้งหน้าโดยไม่เหลืออะไรเตือนว่าบันทึกไม่ได้
          แถบนี้จึงค้างอยู่ตลอดจนกว่าจะส่งงบจริง และมีปุ่มพาไปทำต่อในตัว */}
      {editable && !budgetReady ? (
        <div className="banner bad blocknote">
          <div>
            <b>ยังบันทึกรายงานผลไม่ได้</b>
            <div style={{ marginTop: 3 }}>
              {allMonths
                ? "ตอนนี้เลือกช่วงเวลาเป็น “ทั้งปีงบประมาณ” อยู่ — การรายงานผลเป็นงานรายเดือน ให้เลือกเดือนที่ต้องการรายงานจากดรอปดาวน์ด้านบนก่อน"
                : "โครงการนี้ยังไม่ได้ส่งข้อมูลงบประมาณของ " +
                  asOfLabel +
                  " ต้องไปกด “ส่งข้อมูลงบประมาณ” ที่หน้างบประมาณโครงการก่อน จึงจะกดบันทึกโครงการได้"}
            </div>
          </div>
          {!allMonths ? (
            <button type="button" className="btn" onClick={goBudget}>
              รายงานงบประมาณ →
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ป๊อปอัพเตือนก่อนเริ่มกรอก ตามที่ตกลงไว้ว่าให้เตือน "ก่อนเริ่มรายงานผล"
          ไม่ใช่ปล่อยให้กรอกจนเสร็จแล้วค่อยบอกว่าบันทึกไม่ได้ */}
      {editable && !budgetReady && !ackWarn ? (
        <ConfirmDialog
          title="ยังไม่ได้ส่งข้อมูลงบประมาณ"
          confirmLabel="รับทราบ ดูข้อมูลไปก่อน"
          cancelLabel="รายงานงบประมาณ"
          onConfirm={() => setAckWarn(true)}
          onCancel={() => {
            setAckWarn(true);
            goBudget();
          }}
        >
          <p>
            {allMonths
              ? "เลือกเดือนที่จะรายงานจากดรอปดาวน์ด้านบนก่อน"
              : "ต้องส่งข้อมูลงบประมาณของ " + asOfLabel + " ก่อน จึงจะบันทึกได้"}
          </p>
        </ConfirmDialog>
      ) : null}

      {/* ---------- แถบบอกขั้นตอน ----------
          กดย้อนกลับไปขั้นก่อนหน้าได้ แต่กดข้ามไปข้างหน้าไม่ได้
          บังคับให้ผ่านทุกขั้นอย่างน้อยหนึ่งครั้ง จะได้ไม่ลืมรายงานความเสี่ยง */}
      <ol className="steps">
        {STEPS.map(([k, lab], i) => (
          <li key={k} className={i === idx ? "on" : i < idx ? "done" : ""}>
            <button type="button" onClick={() => i <= idx && setStepIdx(i)} disabled={i > idx}>
              <span className="stepno">{i + 1}</span>
              {lab}
            </button>
          </li>
        ))}
      </ol>

      {/* ================= ขั้นผลโครงการ =================
          แบ่งเป็นกล่องมีเลขข้อ 1-6 ทุกกล่องมีหัวข้อ คำอธิบายสั้น ๆ
          ว่ากล่องนี้ต้องทำอะไร และป้ายสรุปสถานะอยู่มุมขวา
          เดิมเป็นหัวข้อ h4 เรียงต่อกันยาวลงไป มองไม่ออกว่าข้อไหนจบตรงไหน */}
      {step === "project" ? (
        <>
      <Sec
        no={1}
        title="งบประมาณโครงการ"
        hint="ดูอย่างเดียว — บันทึกงบที่หน้างบประมาณโครงการ"
      >
        {budgetTiles({
          target: item,
          note:
            "ยอดนี้ดึงมาจากหน้า งบประมาณโครงการ ซึ่งเป็นที่เดียวที่บันทึกงบได้" +
            (roll.kidsTotal ? " · รวมที่บันทึกจากกิจกรรม " + money(roll.kidsTotal) + " บาท" : ""),
        })}
      </Sec>

      <Sec
        no={2}
        title="สถานะการดำเนินงาน"
        hint="สถานะปัจจุบันของโครงการ และความก้าวหน้าโดยรวม"
        right={
          /* ป้ายสรุปมุมขวา ให้รู้สถานะปัจจุบันโดยไม่ต้องกวาดตาหาในดรอปดาวน์
             และเห็นทันทีว่าเดือนที่มีแผนรายงานครบหรือยัง */
          <span className="badgerow" style={{ marginTop: 0 }}>
            <StatusBadge status={tk.status} />
            <ReportBadge
              done={(() => {
                let n = 0;
                for (let i = 0; i < 12; i++) if (hasReport(rep[i])) n++;
                return n;
              })()}
              planned={plan.filter(Boolean).length}
            />
          </span>
        }
      >
      <div className="trackgrid">
        <div>
          <label className="small muted" htmlFor={"st-" + item.uid}>
            สถานะ
          </label>
          <select
            id={"st-" + item.uid}
            value={tk.status || ""}
            onChange={(e) => setProject(item.uid, { status: e.target.value })}
          >
            <option value="">— ยังไม่ระบุ —</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="small muted" htmlFor={"pg-" + item.uid}>
            ความก้าวหน้า (%)
          </label>
          {/* มีตารางขั้นตอนเมื่อไหร่ ช่องนี้กลายเป็นค่าที่คำนวณ กรอกเองไม่ได้
              ไม่งั้นจะมีสองตัวเลขที่ขัดกันได้ในหน้าเดียว */}
          <input
            id={"pg-" + item.uid}
            inputMode="decimal"
            value={tk.progress == null ? "" : tk.progress}
            readOnly={ownSteps.length > 0}
            title={ownSteps.length ? "คำนวณจากตารางขั้นตอนการดำเนินงาน" : undefined}
            onChange={(e) => setProject(item.uid, { progress: e.target.value })}
          />
          {ownSteps.length ? (
            <div className="small muted">คำนวณจากขั้นตอนการดำเนินงานด้านล่าง</div>
          ) : null}
        </div>
      </div>
      </Sec>

      <Sec
        no={3}
        title="ขั้นตอนการดำเนินงาน"
        hint="วางแผนรายเดือนแต่ละขั้น แล้วรายงานผลเทียบกับแผน"
      >
        <StepsTable
          uid={item.uid}
          upto={lastMonth}
          editable={editable}
          onProgress={syncProgress(item.uid)}
        />
      </Sec>

      {!hasIndicatorCols ? (
        <div className="banner" style={{ marginTop: 14 }}>
          ช่องรายงานผลและปัญหาอุปสรรคของตัวชี้วัดยังใช้ไม่ได้ เพราะฐานข้อมูลไม่มีคอลัมน์{" "}
          <code>project_results.output_result</code> และอีก 3 ช่อง —
          ให้รัน <code>supabase/schema.sql</code> ใน SQL Editor ก่อน
        </div>
      ) : null}

      <Sec
        no={4}
        title="ตัวชี้วัดผลผลิต (Output)"
        hint="สิ่งที่โครงการทำได้ เทียบกับค่าตามแผน"
      >
        {indicator({
          planValue: item.output,
          uid: item.uid,
          resultKey: "outputResult",
          issueKey: "outputIssue",
        })}
      </Sec>

      <Sec
        no={5}
        title="ตัวชี้วัดผลลัพธ์ (Outcome)"
        hint="ผลที่เกิดกับกลุ่มเป้าหมาย เทียบกับค่าตามแผน"
      >
        {indicator({
          planValue: item.outcome,
          uid: item.uid,
          resultKey: "outcomeResult",
          issueKey: "outcomeIssue",
        })}
      </Sec>

      {/* ---------- 6. ตารางรายเดือน ที่ระดับโครงการ ----------
          แสดงเฉพาะเดือนที่ถึงแล้ว เดือนอนาคตไม่ต้องขึ้นมาให้กรอก
          ตารางที่มีช่องว่างของเดือนที่ยังไม่ถึงอยู่ครึ่งตาราง ทำให้ดูเหมือน
          งานค้างเต็มไปหมด ทั้งที่ยังไม่ถึงเวลาต้องทำ

          เดือนที่ผ่านไปแล้วยังแก้ได้ ไม่ได้ล็อกเป็นอ่านอย่างเดียว
          เพราะการแก้ข้อมูลย้อนหลังของเดือนที่กรอกผิดเป็นเรื่องปกติ */}
      <Sec
        no={6}
        title="รายงานผลการดำเนินงานรายเดือน"
        hint="ผลผลิต ผลลัพธ์ ปัญหา และวิธีแก้ ของแต่ละเดือนที่ถึงแล้ว"
        right={<span className="pill none">ถึง {MONTHS[lastMonth]}</span>}
      >
      <div className="tablewrap">
        <table className="mrep stack">
          <thead>
            <tr>
              <th>เดือน</th>
              <th className="num">แผน</th>
              <th>ผลผลิต</th>
              <th>ผลลัพธ์</th>
              <th>ปัญหาอุปสรรค</th>
              <th>วิธีการแก้ปัญหา</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.slice(0, lastMonth + 1).map((label, i) => {
              const e = rep[i] || {};
              const reported = hasReport(e);
              const missed = plan[i] && i <= asOfMonth && !reported;

              return (
                <tr key={i} className={reported ? "reported" : missed ? "missed" : ""}>
                  <td className="lead nowrap">
                    {label}
                    {i === asOfMonth ? (
                      <span className="chip" style={{ marginInlineStart: 6 }}>
                        ณ เดือนนี้
                      </span>
                    ) : null}
                  </td>
                  <td className="plan" data-label="แผน">
                    {plan[i] ? (plan[i] > 1000 ? money(plan[i]) : "มีแผน") : "–"}
                  </td>
                  <td className="wide" data-label="ผลผลิต">
                    <input
                      value={e.o == null ? "" : e.o}
                      onChange={(ev) => setMonthly(item.uid, i, { o: ev.target.value })}
                      style={cell}
                    />
                  </td>
                  <td className="wide" data-label="ผลลัพธ์">
                    <input
                      value={e.r == null ? "" : e.r}
                      onChange={(ev) => setMonthly(item.uid, i, { r: ev.target.value })}
                      style={cell}
                    />
                  </td>
                  <td className="wide" data-label="ปัญหาอุปสรรค">
                    <input
                      disabled={!monthlyHasIssue}
                      value={e.issue == null ? "" : e.issue}
                      onChange={(ev) => setMonthly(item.uid, i, { issue: ev.target.value })}
                      style={cell}
                    />
                  </td>
                  <td className="wide" data-label="วิธีการแก้ปัญหา">
                    <input
                      disabled={!monthlyHasIssue}
                      value={e.solution == null ? "" : e.solution}
                      onChange={(ev) => setMonthly(item.uid, i, { solution: ev.target.value })}
                      style={cell}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!monthlyHasIssue ? (
        <div className="banner" style={{ marginTop: 12 }}>
          ช่องปัญหาอุปสรรคและวิธีแก้ในตารางรายเดือนยังใช้ไม่ได้ เพราะฐานข้อมูลไม่มีคอลัมน์{" "}
          <code>monthly_reports.issue</code> และ <code>solution</code>
        </div>
      ) : null}
      </Sec>

        </>
      ) : null}

      {step === "activity" && kids.length ? (
        <>
          <Sec
            no={1}
            title="เลือกกิจกรรมที่จะรายงาน"
            hint="กดที่กิจกรรมเพื่อเปิดช่องรายงานของกิจกรรมนั้นด้านล่าง"
            right={
              <span
                className={"pill " + (actDone === kids.length ? "ok" : actDone ? "warn" : "none")}
              >
                รายงานแล้ว {actDone}/{kids.length}
              </span>
            }
          >
            {/* รายการกิจกรรมพร้อมสถานะ ให้เห็นทีเดียวว่าเหลือกิจกรรมไหนยังไม่ได้ทำ
                ถ้ามีแต่ดรอปดาวน์ ต้องกดไล่ทีละตัวถึงจะรู้ว่าตกอันไหน */}
            <div className="actlist">
              {kids.map((k) => {
                const done = actReported(k);
                return (
                  <button
                    type="button"
                    key={k.uid}
                    className={
                      "actrow" + (done ? " done" : "") + (k.uid === actUid ? " on" : "")
                    }
                    onClick={() => setActUid(k.uid === actUid ? "" : k.uid)}
                  >
                    <span className="actmark">{done ? "✓" : "•"}</span>
                    <span className="actname">
                      <b>{k.code}</b> {k.name}
                    </span>
                    <span className={"pill " + (done ? "ok" : "none")}>
                      {done ? "รายงานแล้ว" : "ยังไม่รายงาน"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="small muted" htmlFor={"act-" + item.uid}>
                หรือเลือกจากรายการ
              </label>
              <select
                id={"act-" + item.uid}
                value={actUid}
                onChange={(e) => setActUid(e.target.value)}
                style={{ width: "100%", maxWidth: "none" }}
              >
                <option value="">— เลือกกิจกรรม —</option>
                {kids.map((k) => (
                  <option key={k.uid} value={k.uid}>
                    {actReported(k) ? "✓ รายงานแล้ว" : "• ยังไม่รายงาน"} — {k.code} {k.name}
                  </option>
                ))}
              </select>
            </div>
          </Sec>

          {activity ? (
            <>
              {/* ชื่อกิจกรรมที่เลือกอยู่ตรึงเป็นแถบเหนือกล่อง 2-4
                  สามกล่องนี้เป็นของกิจกรรมนี้เท่านั้น ไม่ใช่ของทั้งโครงการ */}
              <div className="rsec-for">
                กำลังรายงาน <b>{activity.code}</b> {activity.name}
              </div>

              <Sec no={2} title="งบประมาณของกิจกรรม" hint="ดูอย่างเดียว — บันทึกงบที่หน้างบประมาณโครงการ">
                {budgetTiles({ target: activity })}
              </Sec>

              <Sec
                no={3}
                title="ตัวชี้วัดผลผลิตของกิจกรรม"
                hint="กิจกรรมไม่มีตัวชี้วัดผลลัพธ์ เพราะผลลัพธ์เป็นของทั้งโครงการ"
              >
                {indicator({
                  planValue: activity.output,
                  uid: activity.uid,
                  resultKey: "outputResult",
                  issueKey: "outputIssue",
                })}
              </Sec>

              {/* กิจกรรมมีตารางขั้นตอนของตัวเอง แยกจากของโครงการ
                  ใช้ uid ของกิจกรรมเป็นเจ้าของ ความคืบหน้าจึงแยกกันด้วย */}
              <Sec
                no={4}
                title="ขั้นตอนการดำเนินงานของกิจกรรม"
                hint="แผนรายเดือนของกิจกรรมนี้ และผลเทียบกับแผน"
              >
                <StepsTable
                  uid={activity.uid}
                  upto={lastMonth}
                  editable={editable}
                  onProgress={syncProgress(activity.uid)}
                />
              </Sec>
            </>
          ) : (
            <div className="rsec-empty">
              เลือกกิจกรรมในข้อ 1 เพื่อเปิดข้อ 2–4 (งบประมาณ ตัวชี้วัด และขั้นตอนของกิจกรรมนั้น)
            </div>
          )}
        </>
      ) : null}

      {/* ================= ขั้นความเสี่ยง =================
          ย้ายมาจากหน้า /risk ที่ยุบทิ้ง เพราะเป็นส่วนหนึ่งของการรายงานผล
          ไม่ใช่เรื่องแยกที่ต้องมีหน้าของตัวเอง
          ข้อ 1 เป็นข้อมูลตามแผน (อ่านอย่างเดียว) ข้อ 2 เป็นส่วนที่ต้องกรอก */}
      {step === "risk" ? (
        <>
          <Sec
            no={1}
            title="ทะเบียนความเสี่ยงตามแผน"
            hint="ดูอย่างเดียว — มาจากไฟล์แผนปฏิบัติการ"
          >
          {item.rScen || item.rFactor ? (
            <>
              <dl className="dl" style={{ marginBottom: 0 }}>
                {item.rFactor ? (
                  <>
                    <dt>ปัจจัยเสี่ยง</dt>
                    <dd>{item.rFactor}</dd>
                  </>
                ) : null}
                {item.rScen ? (
                  <>
                    <dt>สถานการณ์ความเสี่ยง</dt>
                    <dd>{item.rScen}</dd>
                  </>
                ) : null}
                <dt>ประเภทความเสี่ยง</dt>
                <dd>{RISK_TYPES[item.rType] || item.rType || "ไม่ระบุ"}</dd>
                <dt>สรุปคะแนนควบคุมภายใน</dt>
                <dd>{item.rSum ? item.rSum + " / 9" : "–"}</dd>
              </dl>
            </>
          ) : (
            <div className="small muted">
              โครงการนี้ไม่ได้อยู่ในทะเบียนความเสี่ยงตามไฟล์แผน — รายงานในข้อ 2 ได้ตามปกติ
              ถ้าเดือนไหนพบความเสี่ยงจริง
            </div>
          )}
          </Sec>

          <Sec
            no={2}
            title="รายงานความเสี่ยงรายเดือน"
            hint="ระดับความเสี่ยงที่พบ สถานการณ์ และมาตรการจัดการ ของแต่ละเดือนที่ถึงแล้ว"
            right={<span className="pill none">ถึง {MONTHS[lastMonth]}</span>}
          >
          <div className="tablewrap">
            <table className="mrep stack">
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th style={{ width: 130 }}>ระดับ</th>
                  <th>สถานการณ์ที่พบ</th>
                  <th>มาตรการจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {/* เดือนที่ยังมาไม่ถึงไม่ต้องขึ้นมาให้กรอกเช่นกัน */}
                {MONTHS.slice(0, lastMonth + 1).map((label, i) => {
                  const cur = riskAt(risk, item.uid, i) || {};
                  const info = riskLevelInfo(cur.level === "" ? null : cur.level);
                  return (
                    <tr key={i}>
                      <td className="lead nowrap">
                        {label}
                        {i === asOfMonth ? (
                          <span className="chip" style={{ marginInlineStart: 6 }}>
                            ณ เดือนนี้
                          </span>
                        ) : null}
                        <div className={"small st-" + info.cls}>
                          <span className={"dot bg-" + info.cls} />
                          {info.label}
                        </div>
                      </td>
                      <td className="wide" data-label="ระดับความเสี่ยง">
                        <select
                          value={cur.level == null ? "" : cur.level}
                          onChange={(ev) => setRisk(item.uid, i, { level: ev.target.value })}
                          style={{ ...cell, textAlign: "start" }}
                        >
                          <option value="">— ยังไม่รายงาน —</option>
                          {RISK_LEVELS.map((lv) => (
                            <option key={lv.value} value={lv.value}>
                              {lv.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="wide" data-label="สถานการณ์ที่พบ">
                        <input
                          value={cur.situation || ""}
                          onChange={(ev) => setRisk(item.uid, i, { situation: ev.target.value })}
                          style={{ ...cell, textAlign: "start" }}
                        />
                      </td>
                      <td className="wide" data-label="มาตรการจัดการ">
                        <input
                          value={cur.action || ""}
                          onChange={(ev) => setRisk(item.uid, i, { action: ev.target.value })}
                          style={{ ...cell, textAlign: "start" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Sec>
        </>
      ) : null}

      {editable ? (
        <>
          {/* ตรงนี้เหลือบรรทัดเดียวพอ เพราะคำอธิบายเต็มอยู่ในแถบเตือนด้านบนแล้ว
              แต่ต้องมีอะไรอยู่ตรงนี้ด้วย ไม่งั้นคนเลื่อนลงมาเจอปุ่มกดไม่ได้
              แล้วไม่รู้ว่าทำไม เพราะแถบด้านบนเลื่อนพ้นจอไปแล้ว */}
          {!budgetReady ? (
            <div className="small st-bad" style={{ marginTop: 18 }}>
              ปุ่มบันทึกยังกดไม่ได้ —{" "}
              {allMonths
                ? "เลือกเดือนที่ต้องการรายงานจากดรอปดาวน์ด้านบนก่อน"
                : "ยังไม่ได้ส่งข้อมูลงบประมาณของ " + asOfLabel}
            </div>
          ) : null}

          {/* ปุ่มบันทึกโผล่เฉพาะขั้นสุดท้าย บังคับให้ผ่านทุกขั้นก่อน
              ไม่งั้นคนจะกรอกแต่ผลโครงการแล้วกดบันทึก โดยไม่ได้แตะความเสี่ยงเลย */}
          <div className="btnrow">
            {idx > 0 ? (
              <button className="btn ghost" onClick={() => setStepIdx(idx - 1)}>
                ← ย้อนกลับ
              </button>
            ) : null}

            {!isLast ? (
              <button className="btn" onClick={() => setStepIdx(idx + 1)}>
                ถัดไป: {STEPS[idx + 1][1]} →
              </button>
            ) : (
              <button className="btn" onClick={save} disabled={saving || !budgetReady}>
                {saving ? "กำลังบันทึก…" : saved ? "บันทึกแล้ว ✓" : "บันทึกโครงการ"}
              </button>
            )}
          </div>

          <div className="small muted" style={{ marginTop: 6 }}>
            {isLast
              ? "ระบบบันทึกอัตโนมัติหลังหยุดพิมพ์อยู่แล้ว ปุ่มนี้ไว้กดยืนยันให้แน่ใจว่าขึ้นครบทุกขั้น"
              : "กรอกขั้นนี้เสร็จแล้วกด “ถัดไป” — สิ่งที่พิมพ์ไว้ถูกบันทึกอัตโนมัติ ไม่หายระหว่างเปลี่ยนขั้น"}
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
