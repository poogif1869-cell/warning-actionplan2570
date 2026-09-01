"use client";

import { useState } from "react";
import { MONTHS, STATUSES, monthsOf } from "@/lib/plan";
import { money, pct } from "@/lib/format";
import {
  useResults,
  hasReport,
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
export default function ReportTab({ item }) {
  const {
    results,
    budget,
    asOfMonth,
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
    <>
      {/* ---------- 1. งบประมาณของโครงการ ---------- */}
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

      {/* ---------- 6. กิจกรรมย่อย (ถ้ามี) ---------- */}
      {kids.length ? (
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

      <div className="btnrow">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "กำลังบันทึก…" : saved ? "บันทึกแล้ว ✓" : "บันทึกรายงาน"}
        </button>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        ระบบบันทึกอัตโนมัติหลังหยุดพิมพ์อยู่แล้ว ปุ่มนี้ไว้กดยืนยันให้แน่ใจว่าขึ้นครบ
      </div>
    </>
  );
}
