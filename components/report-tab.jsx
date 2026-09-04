"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MONTHS, STATUSES, monthsOf } from "@/lib/plan";
import { RISK_TYPES, RISK_LEVELS, riskLevelInfo } from "@/lib/rollup";
import ConfirmDialog from "@/components/confirm-dialog";
import { money, pct } from "@/lib/format";
import {
  useResults,
  hasReport,
  riskAt,
  monthlyOf,
  projectTrack,
  budgetRollup,
} from "@/lib/store";

/* แท็บ "รายงานผลรายเดือน" ในลิ้นชักรายละเอียด

   โครงสร้าง:
   1. งบประมาณของโครงการ (จัดสรร / ใช้ไป / คงเหลือ) — อ่านอย่างเดียว
   2. สถานะ + ความก้าวหน้า
   3. ตัวชี้วัดผลผลิต  พร้อมช่องรายงานผล + ปัญหาอุปสรรค
   4. ตัวชี้วัดผลลัพธ์ พร้อมช่องรายงานผล + ปัญหาอุปสรรค
   5. ตารางรายงานผลรายเดือน 12 เดือน
   6. ถ้ามีกิจกรรมย่อย — เลือกกิจกรรม แล้วดูงบของกิจกรรมนั้น
      พร้อมตัวชี้วัดผลผลิตและช่องรายงานผล + ปัญหาอุปสรรคของกิจกรรม

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

export default function ReportTab({ item }) {
  const pathname = usePathname();
  const router = useRouter();
  const editable = pathname === HOME_PATH;

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
  } = useResults();
  const [actUid, setActUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const kids = item._kids || [];
  const activity = kids.find((k) => k.uid === actUid) || null;

  /* ---------------------------------------------------------------
     ต้องส่งข้อมูลงบประมาณของเดือนที่เลือกก่อน ถึงจะบันทึกรายงานผลได้

     เหตุผล: ยอดเบิกจ่ายในรายงานผลคำนวณมาจากรายการงบประมาณ ถ้ายังแก้งบ
     ได้อยู่ ตัวเลขในรายงานที่บันทึกไปแล้วจะเปลี่ยนตามทีหลังโดยไม่มีใครรู้

     "ทั้งปี" ไม่ผูกกับเดือนใดเดือนหนึ่ง จึงไม่บังคับ — แต่เตือนให้เลือกเดือน
     เพราะรายงานผลเป็นงานรายเดือน
     --------------------------------------------------------------- */
  const budgetReady = !allMonths && budgetSubmitted(item.uid, asOfMonth);
  const [ackWarn, setAckWarn] = useState(false);

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
  function BudgetTiles({ target, note }) {
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
          <div className="small muted" style={{ marginBottom: 16 }}>
            {note}
          </div>
        ) : null}
      </>
    );
  }

  /* บล็อกตัวชี้วัด: ค่าตามแผน + ช่องรายงานผล + ช่องปัญหาอุปสรรค */
  function Indicator({ label, planValue, uid, resultKey, issueKey }) {
    const t = projectTrack(results, uid);
    return (
      <>
        <h4>{label}</h4>
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
      {!editable ? (
        <div className="banner">
          หน้านี้ดูได้อย่างเดียว — <b>รายงานผลการดำเนินงานกรอกที่หน้า
          “โครงการ/กิจกรรม”</b> ที่เดียว เพื่อไม่ให้ข้อมูลชุดเดียวกัน
          ถูกแก้จากหลายที่จนตามไม่ทันว่าใครแก้อะไร
        </div>
      ) : null}

      {/* ป๊อปอัพเตือนก่อนเริ่มกรอก ตามที่ตกลงไว้ว่าให้เตือน "ก่อนเริ่มรายงานผล"
          ไม่ใช่ปล่อยให้กรอกจนเสร็จแล้วค่อยบอกว่าบันทึกไม่ได้ */}
      {editable && !budgetReady && !ackWarn ? (
        <ConfirmDialog
          title="ยังไม่ได้ส่งข้อมูลงบประมาณ"
          confirmLabel="รับทราบ ดูข้อมูลไปก่อน"
          cancelLabel="ไปหน้างบประมาณโครงการ"
          onConfirm={() => setAckWarn(true)}
          onCancel={() => {
            setAckWarn(true);
            router.push("/budget");
          }}
        >
          <p>
            {allMonths
              ? "ตอนนี้เลือกช่วงเวลาเป็น “ทั้งปีงบประมาณ” อยู่ การรายงานผลเป็นงานรายเดือน จึงต้องเลือกเดือนที่ต้องการรายงานก่อน"
              : "โครงการนี้ยังไม่ได้ส่งข้อมูลงบประมาณของ " +
                asOfLabel +
                " จึงยังบันทึกรายงานผลของเดือนนี้ไม่ได้"}
          </p>
          <p className="small muted">
            ยอดเบิกจ่ายในรายงานผลคำนวณจากรายการงบประมาณ ถ้ายังแก้งบได้อยู่
            ตัวเลขที่บันทึกไปแล้วจะเปลี่ยนตามทีหลังโดยไม่มีใครรู้
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

      {/* ---------- 1. งบประมาณของโครงการ ---------- */}
      {step === "project" ? (
        <>
      <h4>งบประมาณโครงการ</h4>
      <BudgetTiles
        target={item}
        note={
          "ยอดนี้ดึงมาจากหน้า งบประมาณโครงการ ซึ่งเป็นที่เดียวที่บันทึกงบได้" +
          (roll.kidsTotal ? " · รวมที่บันทึกจากกิจกรรม " + money(roll.kidsTotal) + " บาท" : "")
        }
      />

      {/* ---------- 2. สถานะและความก้าวหน้า ---------- */}
      <h4>สถานะการดำเนินงาน</h4>
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
          <input
            id={"pg-" + item.uid}
            inputMode="decimal"
            value={tk.progress == null ? "" : tk.progress}
            onChange={(e) => setProject(item.uid, { progress: e.target.value })}
          />
        </div>
      </div>

      {!hasIndicatorCols ? (
        <div className="banner" style={{ marginTop: 14 }}>
          ช่องรายงานผลและปัญหาอุปสรรคของตัวชี้วัดยังใช้ไม่ได้ เพราะฐานข้อมูลไม่มีคอลัมน์{" "}
          <code>project_results.output_result</code> และอีก 3 ช่อง —
          ให้รัน <code>supabase/schema.sql</code> ใน SQL Editor ก่อน
        </div>
      ) : null}

      {/* ---------- 3-4. ตัวชี้วัดผลผลิตและผลลัพธ์ ---------- */}
      <Indicator
        label="ตัวชี้วัดผลผลิต (Output)"
        planValue={item.output}
        uid={item.uid}
        resultKey="outputResult"
        issueKey="outputIssue"
      />
      <Indicator
        label="ตัวชี้วัดผลลัพธ์ (Outcome)"
        planValue={item.outcome}
        uid={item.uid}
        resultKey="outcomeResult"
        issueKey="outcomeIssue"
      />

      {/* ---------- 5. ตารางรายเดือน 12 เดือน ที่ระดับโครงการ ---------- */}
      <h4>รายงานผลการดำเนินงานรายเดือน</h4>
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
            {MONTHS.map((label, i) => {
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

        </>
      ) : null}

      {/* ---------- 6. กิจกรรมย่อย (ถ้ามี) ---------- */}
      {step === "activity" && kids.length ? (
        <>
          <h4>รายงานผลรายกิจกรรม ({kids.length} กิจกรรม)</h4>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="small muted" htmlFor={"act-" + item.uid}>
              เลือกกิจกรรม
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
                  {k.code} {k.name}
                </option>
              ))}
            </select>
          </div>

          {activity ? (
            <div
              style={{
                borderInlineStart: "3px solid var(--gold)",
                paddingInlineStart: 14,
                marginBottom: 10,
              }}
            >
              <div className="small muted" style={{ marginBottom: 10 }}>
                <b>{activity.code}</b> {activity.name}
              </div>

              <BudgetTiles target={activity} />

              <Indicator
                label="ตัวชี้วัดผลผลิตของกิจกรรม"
                planValue={activity.output}
                uid={activity.uid}
                resultKey="outputResult"
                issueKey="outputIssue"
              />
              <div className="small muted" style={{ marginTop: 8 }}>
                กิจกรรมไม่มีช่องผลลัพธ์ เพราะผลลัพธ์ (Outcome) เป็นตัวชี้วัดของทั้งโครงการ
                ไม่ได้วัดรายกิจกรรม
              </div>
            </div>
          ) : (
            <div className="small muted" style={{ marginBottom: 10 }}>
              เลือกกิจกรรมด้านบนเพื่อดูงบประมาณและรายงานผลผลิตของกิจกรรมนั้น
            </div>
          )}
        </>
      ) : null}


      {/* ---------- 7. ความเสี่ยง ----------
          ย้ายมาจากหน้า /risk ที่ยุบทิ้ง เพราะเป็นส่วนหนึ่งของการรายงานผล
          ไม่ใช่เรื่องแยกที่ต้องมีหน้าของตัวเอง */}
      {step === "risk" ? (
        <>
          {item.rScen || item.rFactor ? (
            <>
              <h4>ทะเบียนความเสี่ยงตามแผน</h4>
              <dl className="dl">
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
            <div className="banner">
              โครงการนี้ไม่ได้อยู่ในทะเบียนความเสี่ยงตามไฟล์แผน — รายงานได้ตามปกติ
              ถ้าเดือนไหนพบความเสี่ยงจริง
            </div>
          )}

          <h4>รายงานความเสี่ยงรายเดือน</h4>
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
                {MONTHS.map((label, i) => {
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
        </>
      ) : null}
      {editable ? (
        <>
          {!budgetReady ? (
            <div className="banner bad" style={{ marginTop: 18 }}>
              <b>ยังบันทึกรายงานผลไม่ได้</b> —{" "}
              {allMonths
                ? "เลือกเดือนที่ต้องการรายงานจากดรอปดาวน์ด้านบนก่อน"
                : "ต้องไปกด “ส่งข้อมูลงบประมาณ” ของ " +
                  asOfLabel +
                  " ที่หน้างบประมาณโครงการก่อน"}
              <div className="btnrow">
                <button className="btn" onClick={() => router.push("/budget")}>
                  ไปหน้างบประมาณโครงการ
                </button>
              </div>
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
