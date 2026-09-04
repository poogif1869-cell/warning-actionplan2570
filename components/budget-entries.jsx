"use client";

import { useState } from "react";
import { MONTHS } from "@/lib/plan";
import { money } from "@/lib/format";
import {
  useResults,
  entriesOf,
  entriesTotal,
  entryTotal,
  COST_FIELDS,
} from "@/lib/store";

/* ตารางรายการงบประมาณของรายการหนึ่ง (โครงการหรือกิจกรรม) ในเดือนหนึ่ง

   วงจรการทำงาน:
     เพิ่มรายการ -> กรอก (บันทึกร่างอัตโนมัติ) -> กด "บันทึกรายงาน" -> ล็อก
     ถ้าจะแก้ต้องกด "แก้ไข" ก่อน จึงจะพิมพ์ได้อีกครั้ง
   ล็อกไว้เพื่อกันการเผลอแก้ตัวเลขที่รายงานไปแล้ว */
export default function BudgetEntries({ uid, month, title }) {
  const {
    budget,
    canEdit,
    budgetHasSaved,
    addBudgetEntry,
    updateBudgetEntry,
    deleteBudgetEntry,
    setEntriesSaved,
  } = useResults();
  const [busy, setBusy] = useState(false);

  const list = entriesOf(budget, uid, month);
  const total = entriesTotal(list);

  /* ถ้าฐานข้อมูลยังไม่มีคอลัมน์ saved ให้ถือว่าทุกแถวแก้ได้ และซ่อนปุ่มล็อก
     กรอกตัวเลขยังบันทึกได้ตามปกติ ขาดแค่ความสามารถล็อกรายการเท่านั้น */
  const draft = budgetHasSaved ? list.filter((e) => !e.saved) : list;
  const locked = budgetHasSaved ? list.filter((e) => e.saved) : [];

  const cell = {
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 7px",
    fontSize: 12.5,
    textAlign: "end",
  };

  async function add() {
    setBusy(true);
    await addBudgetEntry(uid, month);
    setBusy(false);
  }

  async function saveAll() {
    setBusy(true);
    await setEntriesSaved(uid, draft.map((e) => e.id), true);
    setBusy(false);
  }

  async function unlockAll() {
    setBusy(true);
    await setEntriesSaved(uid, locked.map((e) => e.id), false);
    setBusy(false);
  }

  async function unlockOne(id) {
    setBusy(true);
    await setEntriesSaved(uid, [id], false);
    setBusy(false);
  }

  return (
    <div>
      <div className="small muted" style={{ marginBottom: 8 }}>
        {title ? <b>{title} — </b> : null}
        รายการงบประมาณเดือน <b>{MONTHS[month]}</b> · {list.length} รายการ รวม{" "}
        <b>{money(total)}</b> บาท
        {budgetHasSaved && locked.length ? " · บันทึกแล้ว " + locked.length + " รายการ" : ""}
        {budgetHasSaved && draft.length ? " · ยังไม่บันทึก " + draft.length + " รายการ" : ""}
      </div>

      {list.length ? (
        <div className="tablewrap">
          <table className="mrep stack">
            <thead>
              <tr>
                <th style={{ width: 34 }}>สถานะ</th>
                <th style={{ minWidth: 120 }}>วันที่</th>
                <th style={{ minWidth: 170 }}>รายละเอียด</th>
                {COST_FIELDS.map((c) => (
                  <th className="num" key={c.key} title={c.hint || undefined}>
                    {c.label}
                    {c.hint ? <div className="thhint">{c.hint}</div> : null}
                  </th>
                ))}
                <th className="num">รวม</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                /* ล็อกเมื่อบันทึกไปแล้ว หรือเมื่อบัญชีนี้เข้ามาแบบดูอย่างเดียว */
                const ro = (budgetHasSaved && e.saved === true) || !canEdit;
                return (
                  <tr key={e.id} className={ro ? "locked" : ""}>
                    <td className="nowrap" data-label="สถานะ">
                      <span
                        className={"dot bg-" + (!budgetHasSaved ? "none" : ro ? "ok" : "warn")}
                        title={!budgetHasSaved ? "ยังไม่เปิดใช้การล็อก" : ro ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
                      />
                    </td>
                    <td className="wide" data-label="วันที่">
                      <input
                        type="date"
                        readOnly={ro}
                        disabled={ro}
                        value={e.occurred_on || ""}
                        onChange={(ev) =>
                          updateBudgetEntry(uid, e.id, { occurred_on: ev.target.value })
                        }
                        style={{ ...cell, textAlign: "start" }}
                      />
                    </td>
                    <td className="wide" data-label="รายละเอียด">
                      <input
                        placeholder="เช่น เดินทางไปตรวจแปลง จ.สุราษฎร์ธานี"
                        readOnly={ro}
                        disabled={ro}
                        value={e.note || ""}
                        onChange={(ev) => updateBudgetEntry(uid, e.id, { note: ev.target.value })}
                        style={{ ...cell, textAlign: "start" }}
                      />
                    </td>
                    {COST_FIELDS.map((c) => (
                      <td key={c.key} className="wide" data-label={c.label}>
                        <input
                          inputMode="decimal"
                          readOnly={ro}
                          disabled={ro}
                          value={e[c.key] == null ? "" : e[c.key]}
                          onChange={(ev) =>
                            updateBudgetEntry(uid, e.id, { [c.key]: ev.target.value })
                          }
                          /* หมวด "อื่น ๆ" มีตัวอย่างกำกับ จะได้รู้ว่าอะไรลงช่องนี้ได้บ้าง
                             โดยไม่ต้องเพิ่มข้อความในตารางที่แน่นอยู่แล้ว */
                          title={c.hint ? c.label + ": " + c.hint : c.label}
                          style={cell}
                        />
                      </td>
                    ))}
                    <td className="num mono" data-label="รวมรายการนี้">
                      <b>{money(entryTotal(e))}</b>
                    </td>
                    <td className="nowrap" data-label="">
                      {/* บัญชีที่ดูอย่างเดียวไม่ต้องมีปุ่มอะไรเลย กดไปก็ถูกปฏิเสธ */}
                      {!canEdit ? null : ro ? (
                        <button
                          className="iconbtn"
                          disabled={busy}
                          onClick={() => unlockOne(e.id)}
                          title="ปลดล็อกเพื่อแก้ไขรายการนี้"
                        >
                          แก้ไข
                        </button>
                      ) : (
                        <button
                          className="iconbtn"
                          disabled={busy}
                          onClick={() => {
                            if (confirm("ลบรายการงบประมาณนี้?")) deleteBudgetEntry(uid, e.id);
                          }}
                        >
                          ลบ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} className="lead">
                  <b>รวมเดือน {MONTHS[month]}</b>
                </td>
                {COST_FIELDS.map((c) => {
                  const sum = list.reduce((a, e) => {
                    const v = parseFloat(String(e[c.key] || "").replace(/,/g, ""));
                    return a + (isFinite(v) ? v : 0);
                  }, 0);
                  return (
                    <td className="num mono" key={c.key} data-label={c.label}>
                      {money(sum)}
                    </td>
                  );
                })}
                <td className="num mono" data-label="รวมทั้งเดือน">
                  <b>{money(total)}</b>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="small muted" style={{ marginBottom: 8 }}>
          ยังไม่มีรายการงบประมาณในเดือน {MONTHS[month]}
        </div>
      )}

      {/* ทั้งแถวนี้เป็นปุ่มแก้ข้อมูลล้วน บัญชีที่ดูอย่างเดียวจึงไม่ต้องเห็นเลย */}
      {canEdit ? (
        <div className="btnrow">
          <button className="btn ghost" onClick={add} disabled={busy}>
            + เพิ่มรายการ
          </button>

          {budgetHasSaved ? (
            <button className="btn" onClick={saveAll} disabled={busy || !draft.length}>
              {draft.length ? "บันทึกรายงาน (" + draft.length + " รายการ)" : "บันทึกรายงาน"}
            </button>
          ) : null}

          {budgetHasSaved && locked.length ? (
            <button className="btn ghost" onClick={unlockAll} disabled={busy}>
              แก้ไขทั้งหมด ({locked.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {!budgetHasSaved ? (
        <div className="small muted" style={{ marginTop: 6 }}>
          ยังใช้การล็อกรายการไม่ได้ เพราะฐานข้อมูลไม่มีคอลัมน์{" "}
          <code>budget_entries.saved</code> — ตัวเลขที่กรอกยังบันทึกตามปกติ
          ถ้าต้องการฟีเจอร์นี้ให้รัน <code>supabase/schema.sql</code> ใน SQL Editor
        </div>
      ) : !draft.length && locked.length ? (
        <div className="small muted" style={{ marginTop: 6 }}>
          ทุกรายการในเดือนนี้บันทึกแล้วและถูกล็อกไว้ กด “แก้ไข” ที่แถวที่ต้องการก่อนจึงจะพิมพ์ได้
        </div>
      ) : null}
    </div>
  );
}
