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
  const { budget, addBudgetEntry, updateBudgetEntry, deleteBudgetEntry, setEntriesSaved } =
    useResults();
  const [busy, setBusy] = useState(false);

  const list = entriesOf(budget, uid, month);
  const total = entriesTotal(list);
  const draft = list.filter((e) => !e.saved);
  const locked = list.filter((e) => e.saved);

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
        {locked.length ? " · บันทึกแล้ว " + locked.length + " รายการ" : ""}
        {draft.length ? " · ยังไม่บันทึก " + draft.length + " รายการ" : ""}
      </div>

      {list.length ? (
        <div className="tablewrap">
          <table className="mrep">
            <thead>
              <tr>
                <th style={{ width: 34 }}>สถานะ</th>
                <th style={{ minWidth: 120 }}>วันที่</th>
                <th style={{ minWidth: 170 }}>รายละเอียด</th>
                {COST_FIELDS.map((c) => (
                  <th className="num" key={c.key}>
                    {c.label}
                  </th>
                ))}
                <th className="num">รวม</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const ro = e.saved === true;
                return (
                  <tr key={e.id} className={ro ? "locked" : ""}>
                    <td className="nowrap">
                      <span
                        className={"dot bg-" + (ro ? "ok" : "warn")}
                        title={ro ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
                      />
                    </td>
                    <td>
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
                    <td>
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
                      <td key={c.key}>
                        <input
                          inputMode="decimal"
                          readOnly={ro}
                          disabled={ro}
                          value={e[c.key] == null ? "" : e[c.key]}
                          onChange={(ev) =>
                            updateBudgetEntry(uid, e.id, { [c.key]: ev.target.value })
                          }
                          style={cell}
                        />
                      </td>
                    ))}
                    <td className="num mono">
                      <b>{money(entryTotal(e))}</b>
                    </td>
                    <td className="nowrap">
                      {ro ? (
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
                <td colSpan={3}>
                  <b>รวมเดือน {MONTHS[month]}</b>
                </td>
                {COST_FIELDS.map((c) => {
                  const sum = list.reduce((a, e) => {
                    const v = parseFloat(String(e[c.key] || "").replace(/,/g, ""));
                    return a + (isFinite(v) ? v : 0);
                  }, 0);
                  return (
                    <td className="num mono" key={c.key}>
                      {money(sum)}
                    </td>
                  );
                })}
                <td className="num mono">
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

      <div className="btnrow">
        <button className="btn ghost" onClick={add} disabled={busy}>
          + เพิ่มรายการ
        </button>

        <button className="btn" onClick={saveAll} disabled={busy || !draft.length}>
          {draft.length
            ? "บันทึกรายงาน (" + draft.length + " รายการ)"
            : "บันทึกรายงาน"}
        </button>

        {locked.length ? (
          <button className="btn ghost" onClick={unlockAll} disabled={busy}>
            แก้ไขทั้งหมด ({locked.length})
          </button>
        ) : null}
      </div>

      {!draft.length && locked.length ? (
        <div className="small muted" style={{ marginTop: 6 }}>
          ทุกรายการในเดือนนี้บันทึกแล้วและถูกล็อกไว้ กด “แก้ไข” ที่แถวที่ต้องการก่อนจึงจะพิมพ์ได้
        </div>
      ) : null}
    </div>
  );
}
