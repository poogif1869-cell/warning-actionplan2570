"use client";

import { useMemo, useState } from "react";
import { MONTHS, byUid } from "@/lib/plan";
import { ORG_UNITS, orgSegments, normUnit } from "@/lib/rollup";
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
    hasSubmitTable,
    budgetSubmitted,
    setBudgetSubmitted,
    addBudgetEntry,
    updateBudgetEntry,
    deleteBudgetEntry,
    setEntriesSaved,
  } = useResults();
  const [busy, setBusy] = useState(false);

  const list = entriesOf(budget, uid, month);
  const total = entriesTotal(list);

  /* ---------------------------------------------------------------
     สองระดับของการล็อก อย่าสับสนกัน

       บันทึกรายการ  ล็อกทีละแถวที่กรอกเสร็จ กันหน่วยงานอื่นมาแก้ตัวเลข
                     ปลดเองได้ทันทีด้วยปุ่ม "แก้ไข" ที่แถวนั้น
       ส่งข้อมูล     ปิดทั้งเดือน เพิ่มรายการใหม่ไม่ได้ และเป็นเงื่อนไข
                     ให้ไปรายงานผลโครงการของเดือนนั้นได้
                     ต้องกด "แก้ไขงบประมาณ" ก่อนถึงจะกลับมาแก้ได้
     --------------------------------------------------------------- */
  const submitted = budgetSubmitted(uid, month);
  const monthLocked = submitted || !canEdit;

  /* ---------------------------------------------------------------
     ตัวเลือกส่วนงานที่มาใช้งบของรายการนี้

     หนึ่งกิจกรรมมีหลายส่วนงานมาใช้งบร่วมกัน จึงต้องระบุที่ระดับ "รายการ"
     ไม่ใช่ระดับโครงการ (คอลัมน์หน่วยงานในไฟล์แผนเป็นของทั้งโครงการ)

     เอาหน่วยงานที่อยู่ในสายของโครงการนี้ขึ้นก่อน เพราะเป็นตัวที่จะเลือกจริง
     เกือบทุกครั้ง ส่วนหน่วยงานที่เหลือทั้งองค์กรอยู่ในกลุ่มถัดไป
     เผื่อกรณีที่หน่วยอื่นมาร่วมใช้งบด้วย
     --------------------------------------------------------------- */
  const orgChoices = useMemo(() => {
    const item = byUid.get(uid);
    const own = orgSegments(item ? item.org : "");
    const ownKeys = own.map(normUnit);
    const rest = ORG_UNITS.map((u) => u.name).filter(
      (n) => ownKeys.indexOf(normUnit(n)) < 0
    );
    return { own, rest };
  }, [uid]);

  /* รวมยอดตามส่วนงาน — เหตุผลทั้งหมดที่เก็บช่องส่วนงานก็เพื่อดูตัวเลขนี้
     แสดงเฉพาะตอนมีมากกว่าหนึ่งส่วนงาน ไม่งั้นเป็นการทวนยอดรวมเปล่า ๆ */
  const byOrg = useMemo(() => {
    const m = new Map();
    list.forEach((e) => {
      const k = (e.org || "").trim() || "(ไม่ระบุส่วนงาน)";
      m.set(k, (m.get(k) || 0) + entryTotal(e));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

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

  async function submitMonth() {
    if (
      !confirm(
        "ส่งข้อมูลงบประมาณเดือน " +
          MONTHS[month] +
          " ?\n\nหลังส่งแล้วแก้ไม่ได้ จนกว่าจะกด “แก้ไขงบประมาณ”"
      )
    ) {
      return;
    }
    setBusy(true);
    /* ล็อกรายการที่ยังค้างเป็นร่างไปพร้อมกัน ไม่งั้นจะเหลือแถวที่ยัง
       "ยังไม่บันทึก" อยู่ในเดือนที่ส่งไปแล้ว ซึ่งขัดกันเอง */
    if (budgetHasSaved && draft.length) {
      await setEntriesSaved(uid, draft.map((e) => e.id), true);
    }
    await setBudgetSubmitted(uid, month, true);
    setBusy(false);
  }

  async function reopenMonth() {
    setBusy(true);
    await setBudgetSubmitted(uid, month, false);
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
                <th style={{ minWidth: 130 }}>
                  ส่วนงานที่ใช้งบ
                  <div className="thhint">หนึ่งกิจกรรมมีหลายส่วนงานร่วมใช้ได้</div>
                </th>
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
                const ro = (budgetHasSaved && e.saved === true) || monthLocked;
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
                    <td className="wide" data-label="ส่วนงานที่ใช้งบ">
                      <select
                        disabled={ro}
                        value={e.org || ""}
                        onChange={(ev) =>
                          updateBudgetEntry(uid, e.id, { org: ev.target.value })
                        }
                        style={{ ...cell, textAlign: "start" }}
                      >
                        <option value="">— ไม่ระบุ —</option>
                        {orgChoices.own.length ? (
                          <optgroup label="หน่วยงานของโครงการนี้">
                            {orgChoices.own.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        <optgroup label="หน่วยงานอื่น">
                          {orgChoices.rest.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </optgroup>
                      </select>
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
                {/* 4 = สถานะ + วันที่ + ส่วนงาน + รายละเอียด */}
                <td colSpan={4} className="lead">
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

      {byOrg.length > 1 ? (
        <div className="orgsplit">
          <span className="orgsplit-lab">รวมตามส่วนงาน</span>
          {byOrg.map(([name, sum]) => (
            <span className="orgsplit-item" key={name}>
              {name} <b>{money(sum)}</b>
            </span>
          ))}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------
          แถบปุ่มสามขั้น เรียงตามลำดับงานจริง

            + เพิ่มรายการ   -> บันทึกรายการ -> ส่งข้อมูลงบประมาณ
                                                      |
                                              แก้ไขงบประมาณ (ย้อนกลับ)

          ทั้งแถวเป็นปุ่มแก้ข้อมูลล้วน บัญชีที่ดูอย่างเดียวจึงไม่เห็นเลย
          --------------------------------------------------------------- */}
      {canEdit ? (
        <div className="btnrow">
          {!submitted ? (
            <>
              <button className="btn ghost" onClick={add} disabled={busy}>
                + เพิ่มรายการ
              </button>

              {budgetHasSaved ? (
                <button className="btn ghost" onClick={saveAll} disabled={busy || !draft.length}>
                  {draft.length ? "บันทึกรายการ (" + draft.length + ")" : "บันทึกรายการ"}
                </button>
              ) : null}

              {budgetHasSaved && locked.length ? (
                <button className="btn ghost" onClick={unlockAll} disabled={busy}>
                  ปลดล็อกทั้งหมด ({locked.length})
                </button>
              ) : null}

              {/* ปุ่มหลักของหน้านี้ — ส่งแล้วถึงจะไปรายงานผลโครงการได้
                  ไม่มีรายการเลยก็ส่งไม่ได้ ไม่งั้นเท่ากับส่งกระดาษเปล่า */}
              <button
                className="btn"
                onClick={submitMonth}
                disabled={busy || !list.length}
                title={
                  list.length
                    ? "ปิดการกรอกงบของเดือนนี้ แล้วจึงไปรายงานผลโครงการได้"
                    : "ยังไม่มีรายการงบประมาณในเดือนนี้"
                }
              >
                ส่งข้อมูลงบประมาณ
              </button>
            </>
          ) : (
            <button className="btn danger" onClick={reopenMonth} disabled={busy}>
              แก้ไขงบประมาณ
            </button>
          )}
        </div>
      ) : null}

      {submitted ? (
        <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
          <b>ส่งข้อมูลงบประมาณเดือน {MONTHS[month]} แล้ว</b> — เพิ่มหรือแก้รายการไม่ได้
          จนกว่าจะกด “แก้ไขงบประมาณ” · ตอนนี้ไปรายงานผลโครงการของเดือนนี้ได้แล้ว
        </div>
      ) : (
        <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>
          <b>ยังไม่ได้ส่งข้อมูลงบประมาณเดือน {MONTHS[month]}</b> —
          ต้องกด “ส่งข้อมูลงบประมาณ” ก่อน จึงจะรายงานผลโครงการของเดือนนี้ได้
        </div>
      )}

      {!hasSubmitTable ? (
        <div className="small muted" style={{ marginTop: 8 }}>
          ยังใช้การส่งข้อมูลงบประมาณไม่ได้ เพราะฐานข้อมูลไม่มีตาราง{" "}
          <code>budget_submissions</code> — ให้ผู้ดูแลรัน <code>supabase/schema.sql</code>
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
