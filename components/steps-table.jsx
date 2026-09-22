"use client";

/* =====================================================================
   ตารางขั้นตอนการดำเนินงาน — แผนกับผลรายเดือน และความคืบหน้าที่คำนวณได้

     คอลัมน์ 1  ขั้นตอนการดำเนินงาน (หนึ่งขั้น = แถวแผน + แถวผล)
     คอลัมน์ 2  ค่าเป้าหมายของขั้นตอน
     คอลัมน์ 3  ระยะเวลา ต.ค. 69 – ก.ย. 70 แถวแผนใส่เป้ารายเดือน แถวผลใส่ผลจริง
     คอลัมน์ 4  ความคืบหน้า คำนวณจากผลเทียบแผน ไม่ได้ให้กรอกเอง

   **ความคืบหน้าคำนวณ ไม่ใช่กรอก** — ตัวเลขที่กรอกมือจะไม่ตรงกับผลรายเดือน
   ในตารางเดียวกันเมื่อไหร่ก็ได้ แล้วไม่มีใครรู้ว่าอันไหนถูก

   แถวแผนกรอกได้ทั้ง 12 เดือน เพราะแผนต้องวางล่วงหน้าทั้งปี
   แถวผลกรอกได้เฉพาะเดือนที่ถึงแล้ว (upto) ตามกติกาเดิมของหน้ารายงาน
   ว่าเดือนที่ยังมาไม่ถึงไม่ต้องให้กรอกผล
   ===================================================================== */

import { useEffect, useState } from "react";
import { MONTHS } from "@/lib/plan";
import { fmt, pct, toNum } from "@/lib/format";
import { useResults, stepsOf, stepProgress, stepsProgress } from "@/lib/store";

export default function StepsTable({ uid, upto, editable, onProgress }) {
  const { steps, hasStepsTable, addStep, updateStep, deleteStep } = useResults();
  const [busy, setBusy] = useState(false);

  const list = stepsOf(steps, uid);
  const last = upto == null ? 11 : upto;
  const overall = stepsProgress(list, last);

  /* ส่งความคืบหน้ารวมกลับไปให้คนเรียก (ใช้เติมช่อง "ความก้าวหน้า %" ของโครงการ)
     ปัดทศนิยมหนึ่งตำแหน่งก่อนเทียบ ไม่งั้นเลขทศนิยมยาว ๆ ที่ต่างกันนิดเดียว
     จะทำให้ effect ยิงซ้ำไม่รู้จบ */
  const rounded = overall.donePct == null ? null : Math.round(overall.donePct * 10) / 10;
  useEffect(() => {
    if (onProgress && rounded != null) onProgress(rounded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounded]);

  async function add() {
    setBusy(true);
    await addStep(uid);
    setBusy(false);
  }

  function setCell(step, key, i, value) {
    const next = step[key].slice();
    next[i] = value;
    updateStep(uid, step.id, { [key]: next });
  }

  if (!hasStepsTable) {
    return (
      <div className="banner">
        ยังใช้ตารางขั้นตอนการดำเนินงานไม่ได้ — ฐานข้อมูลยังไม่มีตาราง{" "}
        <code>project_steps</code> ให้ผู้ดูแลรัน <code>supabase/schema.sql</code>{" "}
        ใน Supabase SQL Editor ก่อน
      </div>
    );
  }

  return (
    <div className="steptbl-box">
      {list.length === 0 ? (
        <div className="picknone" style={{ marginBottom: 12 }}>
          ยังไม่มีขั้นตอนการดำเนินงาน
          {editable ? " — กด “+ เพิ่มขั้นตอน” เพื่อเริ่มวางแผน" : ""}
        </div>
      ) : (
        <div className="tablewrap steptbl-wrap">
          <table className="steptbl">
            <thead>
              <tr>
                <th rowSpan={2} className="st-name">
                  ขั้นตอนการดำเนินงาน
                </th>
                <th rowSpan={2} className="st-kind" />
                <th rowSpan={2} className="st-target">
                  ค่าเป้าหมาย
                </th>
                <th colSpan={12} className="st-period">
                  ระยะเวลาการดำเนินงาน
                </th>
                <th rowSpan={2} className="st-prog">
                  ความคืบหน้า
                </th>
              </tr>
              <tr>
                {MONTHS.map((m, i) => (
                  <th key={m} className={"st-m" + (i === last ? " now" : "")}>
                    {m}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {list.map((s, n) => {
                const p = stepProgress(s, last);
                const planSum = s.plan.reduce((a, v) => a + toNum(v), 0);
                const tgt = toNum(s.target);
                /* ผลรวมแผนรายเดือนไม่เท่าค่าเป้าหมาย = วางแผนไม่ครบหรือเกิน
                   เตือนไว้เฉย ๆ ไม่บล็อก เพราะบางขั้นเป้าหมายเป็นคำ ไม่ใช่ผลรวม */
                const mismatch = tgt > 0 && planSum > 0 && Math.abs(planSum - tgt) > 0.0001;
                const tone =
                  p.gap == null ? "none" : p.gap >= 0 ? "ok" : p.gap > -10 ? "warn" : "bad";

                return [
                  <tr key={s.id + "/p"} className="st-planrow">
                    <td rowSpan={2} className="st-name">
                      <div className="st-namebox">
                        <span className="st-no">{n + 1}</span>
                        <textarea
                          rows={2}
                          value={s.name}
                          placeholder="ชื่อขั้นตอน เช่น จัดประชุมชี้แจง"
                          onChange={(e) => updateStep(uid, s.id, { name: e.target.value })}
                        />
                      </div>
                      {editable ? (
                        <button
                          type="button"
                          className="linkbtn del"
                          onClick={() => {
                            if (confirm("ลบขั้นตอนนี้?")) deleteStep(uid, s.id);
                          }}
                        >
                          ลบขั้นตอน
                        </button>
                      ) : null}
                    </td>
                    <td className="st-kind plan">แผน</td>
                    <td rowSpan={2} className="st-target">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={s.target}
                        placeholder="เป้าหมาย"
                        onChange={(e) => updateStep(uid, s.id, { target: e.target.value })}
                      />
                      <input
                        type="text"
                        value={s.unit}
                        placeholder="หน่วยนับ"
                        onChange={(e) => updateStep(uid, s.id, { unit: e.target.value })}
                      />
                      {mismatch ? (
                        <div className="st-warn">
                          แผนรวม {fmt(planSum)} ≠ เป้าหมาย {fmt(tgt)}
                        </div>
                      ) : null}
                    </td>
                    {s.plan.map((v, i) => (
                      <td key={i} className={"st-m" + (i === last ? " now" : "")}>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={"แผน " + MONTHS[i]}
                          value={v}
                          onChange={(e) => setCell(s, "plan", i, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="st-prog">
                      <span className="small muted">
                        แผนถึง {MONTHS[last]}
                        <br />
                        <b>{p.planPct == null ? "–" : pct(p.planPct)}</b>
                      </span>
                    </td>
                  </tr>,

                  <tr key={s.id + "/a"} className="st-actrow">
                    <td className="st-kind actual">ผล</td>
                    {s.actual.map((v, i) => (
                      <td key={i} className={"st-m" + (i === last ? " now" : "")}>
                        {i <= last ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={"ผล " + MONTHS[i]}
                            value={v}
                            onChange={(e) => setCell(s, "actual", i, e.target.value)}
                          />
                        ) : (
                          <span className="st-future" title="ยังไม่ถึงเดือนนี้">
                            –
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={"st-prog st-" + tone}>
                      <b className="st-big">{p.donePct == null ? "–" : pct(p.donePct)}</b>
                      <span className="small">
                        {p.gap == null
                          ? "ยังไม่มีแผน"
                          : Math.abs(p.gap) < 0.05
                          ? "ตามแผน"
                          : p.gap > 0
                          ? "เร็วกว่าแผน " + pct(p.gap)
                          : "ช้ากว่าแผน " + pct(-p.gap)}
                      </span>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>

            {/* ---------- ความคืบหน้าทั้งโครงการ ----------
                เฉลี่ยทุกขั้นเท่ากัน ไม่ถ่วงตามค่าเป้าหมาย เพราะหน่วยนับต่างกัน
                (ดู stepsProgress ใน lib/store.jsx) */}
            <tfoot>
              <tr>
                <td colSpan={3} className="st-foot-lab">
                  ความคืบหน้าของโครงการ
                  <div className="small muted">
                    เฉลี่ยจาก {overall.count} ขั้นตอน · ถึง {MONTHS[last]}
                  </div>
                </td>
                <td colSpan={12} className="st-foot-bar">
                  <div className="st-bar">
                    {overall.planPct != null ? (
                      <i className="plan" style={{ width: overall.planPct + "%" }} />
                    ) : null}
                    {overall.donePct != null ? (
                      <i className="done" style={{ width: overall.donePct + "%" }} />
                    ) : null}
                  </div>
                  <div className="small muted" style={{ marginTop: 5 }}>
                    แถบจาง = ควรไปถึงตามแผน {overall.planPct == null ? "–" : pct(overall.planPct)} ·
                    แถบเข้ม = ทำได้จริง
                  </div>
                </td>
                <td className="st-prog">
                  <b className="st-big">
                    {overall.donePct == null ? "–" : pct(overall.donePct)}
                  </b>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editable ? (
        <div className="btnrow">
          <button type="button" className="btn ghost" onClick={add} disabled={busy}>
            {busy ? "กำลังเพิ่ม…" : "+ เพิ่มขั้นตอน"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
