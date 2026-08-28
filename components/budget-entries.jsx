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

/* ตารางรายการงบประมาณของโครงการหนึ่งในเดือนหนึ่ง
   ใช้ทั้งในหน้ารายงานงบประมาณ และในลิ้นชักรายละเอียดโครงการ

   หนึ่งเดือนมีได้หลายรายการ (เช่น เดินทางหลายครั้ง) แก้ไขได้ทุกรายการ
   ผลรวมของทุกรายการในเดือนนั้น = ยอด "เบิกจ่าย" ในรายงานผลการดำเนินงานรายเดือน */
export default function BudgetEntries({ uid, month, compact }) {
  const { budget, addBudgetEntry, updateBudgetEntry, deleteBudgetEntry } = useResults();
  const [adding, setAdding] = useState(false);

  const list = entriesOf(budget, uid, month);
  const total = entriesTotal(list);

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
    setAdding(true);
    await addBudgetEntry(uid, month);
    setAdding(false);
  }

  return (
    <div>
      {!compact ? (
        <div className="small muted" style={{ marginBottom: 8 }}>
          รายการงบประมาณเดือน <b>{MONTHS[month]}</b> — {list.length} รายการ รวม{" "}
          <b>{money(total)}</b> บาท
        </div>
      ) : null}

      {list.length ? (
        <div className="tablewrap">
          <table className="mrep">
            <thead>
              <tr>
                <th style={{ minWidth: 120 }}>วันที่</th>
                <th style={{ minWidth: 170 }}>รายละเอียด</th>
                {COST_FIELDS.map((c) => (
                  <th className="num" key={c.key}>
                    {c.label}
                  </th>
                ))}
                <th className="num">รวม</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="date"
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
                      value={e.note || ""}
                      onChange={(ev) => updateBudgetEntry(uid, e.id, { note: ev.target.value })}
                      style={{ ...cell, textAlign: "start" }}
                    />
                  </td>
                  {COST_FIELDS.map((c) => (
                    <td key={c.key}>
                      <input
                        inputMode="decimal"
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
                  <td>
                    <button
                      className="iconbtn"
                      title="ลบรายการนี้"
                      onClick={() => {
                        if (confirm("ลบรายการงบประมาณนี้?")) deleteBudgetEntry(uid, e.id);
                      }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
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
        <button className="btn ghost" onClick={add} disabled={adding}>
          {adding ? "กำลังเพิ่ม…" : "+ เพิ่มรายการ"}
        </button>
      </div>
    </div>
  );
}
