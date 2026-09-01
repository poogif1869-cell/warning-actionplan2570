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

   กติกาที่ต่างกันตามระดับรายการ:
   - โครงการที่**มีกิจกรรมย่อย** → เลือกกิจกรรมก่อน แล้วรายงานเฉพาะ
     ผลผลิต / ปัญหาอุปสรรค / วิธีแก้ปัญหา
     (ผลลัพธ์เป็นของระดับโครงการ ไม่ได้วัดรายกิจกรรม)
   - โครงการที่**ไม่มีกิจกรรมย่อย** → รายงานที่ตัวโครงการเอง ครบทั้ง 4 ช่อง

   **ไม่มีช่องกรอกงบประมาณที่นี่** งบบันทึกที่หน้า "งบประมาณโครงการ" ที่เดียว
   หน้านี้แค่ดึงยอดมาแสดง เพื่อไม่ให้มีสองแหล่งที่กรอกเงินแล้วตัวเลขขัดกัน */
export default function ReportTab({ item }) {
  const { results, budget, asOfMonth, monthlyHasIssue, setProject, setMonthly, saveNow } =
    useResults();
  const [actUid, setActUid] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const kids = item._kids || [];
  const hasKids = kids.length > 0;

  /* เป้าหมายที่กำลังกรอก: กิจกรรมที่เลือก หรือตัวโครงการเองถ้าไม่มีกิจกรรม */
  const target = hasKids ? kids.find((k) => k.uid === actUid) || null : item;

  const tk = projectTrack(results, item.uid);
  const roll = budgetRollup(budget, item, null);
  const planned = item.budget || 0;
  const used = roll.total;
  const left = planned - used;

  const plan = target ? monthsOf(target) : [];
  const rep = target ? monthlyOf(results, target.uid) : {};

  const inputStyle = {
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 7px",
    fontSize: 12.5,
    textAlign: "start",
  };

  async function save() {
    setSaving(true);
    setSaved(false);
    await saveNow();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      {/* ---------- งบประมาณ อ่านอย่างเดียว เชื่อมจากหน้างบประมาณโครงการ ---------- */}
      <h4>งบประมาณโครงการ</h4>
      <div className="tiles" style={{ marginBottom: 6 }}>
        <div className="tile">
          <span className="lab">ได้รับจัดสรรตามแผน</span>
          <div className="val">{money(planned)}</div>
          <div className="note">บาท</div>
        </div>
        <div className="tile">
          <span className="lab">ใช้ไปแล้ว</span>
          <div className="val">{used ? money(used) : "–"}</div>
          <div className="note">
            {planned ? pct((used / planned) * 100) + " ของที่จัดสรร" : "บาท"}
          </div>
        </div>
        <div className={"tile " + (left < 0 ? "crit" : "ok")}>
          <span className="lab">คงเหลือ</span>
          <div className={"val " + (left < 0 ? "st-bad" : "")}>{money(left)}</div>
          <div className="note">บาท</div>
        </div>
      </div>
      <div className="small muted" style={{ marginBottom: 16 }}>
        ยอดนี้ดึงมาจากหน้า <b>งบประมาณโครงการ</b> ซึ่งเป็นที่เดียวที่บันทึกงบได้
        {roll.kidsTotal ? " · รวมที่บันทึกจากกิจกรรม " + money(roll.kidsTotal) + " บาท" : ""}
      </div>

      {/* ---------- สถานะภาพรวมของโครงการ ---------- */}
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

      {/* ---------- ตัวชี้วัดตามแผน วางเหนือช่องกรอกให้เทียบได้ ---------- */}
      <h4>ตัวชี้วัดความสำเร็จตามแผน</h4>
      <dl className="dl">
        <dt>ผลผลิต (Output)</dt>
        <dd>{(target || item).output || "–"}</dd>
        {!hasKids ? (
          <>
            <dt>ผลลัพธ์ (Outcome)</dt>
            <dd>{item.outcome || "–"}</dd>
          </>
        ) : null}
      </dl>

      {/* ---------- เลือกกิจกรรมก่อน ถ้าโครงการมีกิจกรรมย่อย ---------- */}
      {hasKids ? (
        <>
          <h4>เลือกกิจกรรมที่จะรายงาน</h4>
          <div className="field" style={{ marginBottom: 12 }}>
            <select
              value={actUid || ""}
              onChange={(e) => setActUid(e.target.value || null)}
              style={{ width: "100%", maxWidth: "none" }}
            >
              <option value="">— เลือกกิจกรรม ({kids.length} กิจกรรม) —</option>
              {kids.map((k) => (
                <option key={k.uid} value={k.uid}>
                  {k.code} {k.name}
                </option>
              ))}
            </select>
          </div>
          <div className="small muted" style={{ marginBottom: 14 }}>
            โครงการนี้มีกิจกรรมย่อย จึงรายงานผลที่ระดับกิจกรรม
            แต่ละกิจกรรมกรอก <b>ผลผลิต · ปัญหาอุปสรรค · วิธีแก้ปัญหา</b>
          </div>
        </>
      ) : null}

      {/* ---------- ตารางรายงาน 12 เดือน ---------- */}
      {target ? (
        <>
          <h4>
            รายงานผลการดำเนินงานรายเดือน
            <span className="muted small" style={{ fontWeight: 400, marginInlineStart: 8 }}>
              {hasKids ? target.name : "ระดับโครงการ"}
            </span>
          </h4>

          <div className="tablewrap">
            <table className="mrep stack">
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th className="num">แผน</th>
                  <th>ผลผลิต (Output)</th>
                  {!hasKids ? <th>ผลลัพธ์ (Outcome)</th> : null}
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
                      <td className="wide" data-label="ผลผลิต (Output)">
                        <input
                          value={e.o == null ? "" : e.o}
                          onChange={(ev) => setMonthly(target.uid, i, { o: ev.target.value })}
                          style={inputStyle}
                        />
                      </td>
                      {!hasKids ? (
                        <td className="wide" data-label="ผลลัพธ์ (Outcome)">
                          <input
                            value={e.r == null ? "" : e.r}
                            onChange={(ev) => setMonthly(target.uid, i, { r: ev.target.value })}
                            style={inputStyle}
                          />
                        </td>
                      ) : null}
                      <td className="wide" data-label="ปัญหาอุปสรรค">
                        <input
                          disabled={!monthlyHasIssue}
                          placeholder={monthlyHasIssue ? "ติดปัญหาอะไร" : "ยังไม่พร้อมใช้"}
                          value={e.issue == null ? "" : e.issue}
                          onChange={(ev) =>
                            setMonthly(target.uid, i, { issue: ev.target.value })
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td className="wide" data-label="วิธีการแก้ปัญหา">
                        <input
                          disabled={!monthlyHasIssue}
                          placeholder={monthlyHasIssue ? "แก้ไขอย่างไร" : "ยังไม่พร้อมใช้"}
                          value={e.solution == null ? "" : e.solution}
                          onChange={(ev) =>
                            setMonthly(target.uid, i, { solution: ev.target.value })
                          }
                          style={inputStyle}
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
              ช่อง <b>ปัญหาอุปสรรค</b> และ <b>วิธีการแก้ปัญหา</b> ยังใช้ไม่ได้
              เพราะฐานข้อมูลไม่มีคอลัมน์ <code>monthly_reports.issue</code> และ{" "}
              <code>solution</code> — ให้รัน <code>supabase/schema.sql</code> ใน SQL Editor ก่อน
              (ช่องผลผลิตและผลลัพธ์ยังบันทึกได้ตามปกติ)
            </div>
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
      ) : (
        <div className="banner">เลือกกิจกรรมด้านบนก่อน จึงจะกรอกรายงานผลรายเดือนได้</div>
      )}
    </>
  );
}
