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

/* ตารางรายการค่าใช้จ่ายของรายการหนึ่ง (โครงการหรือกิจกรรม) ในเดือนหนึ่ง
   = ข้อ 3 "กรอกรายการค่าใช้จ่าย" ของหน้างบประมาณโครงการ

   ไฟล์นี้ทำแค่เพิ่ม/กรอก/ลบรายการ **ไม่มีปุ่มส่งข้อมูลแล้ว**
   ปุ่มส่งย้ายไปเป็นข้อ 4 ของ month-budget.jsx ที่เดียว กดครั้งเดียวทั้งโครงการ
   เดิมมีปุ่มส่งในทุกกล่อง (โครงการที่มี 5 กิจกรรมเลยมีปุ่มส่ง 5 ปุ่ม)
   คนกรอกไม่รู้ว่าต้องกดอันไหนก่อน และการส่งไปเก็บที่ uid ของกิจกรรม
   ทั้งที่หน้ารายงานผลตรวจที่ uid ของโครงการ — ส่งครบแล้วก็ยังบันทึกผลไม่ได้

   locked = เดือนนี้ของโครงการส่งไปแล้ว (แม่เป็นคนบอก) → ทุกช่องล็อก

   การล็อกทีละแถว ("บันทึกรายการ") ยังมีอยู่ แต่เป็นทางเลือก ไม่ใช่ขั้นบังคับ
   ใช้กันหน่วยงานอื่นมาแก้ตัวเลขของแถวที่กรอกเสร็จ ตอนกดส่งในข้อ 4
   ระบบล็อกแถวที่เหลือให้เองทั้งหมดอยู่แล้ว */
export default function BudgetEntries({ uid, month, title, locked: monthSubmitted }) {
  const {
    budget,
    canEdit: canEditRole,
    canReport,
    budgetHasSaved,
    addBudgetEntry,
    updateBudgetEntry,
    deleteBudgetEntry,
    setEntriesSaved,
  } = useResults();
  const [busy, setBusy] = useState(false);

  const list = entriesOf(budget, uid, month);
  const total = entriesTotal(list);

  /* canEdit ในไฟล์นี้หมายถึง "รายงานงบได้ตอนนี้" ไม่ใช่แค่มีสิทธิ์ผู้กรอก
     ปิดการรายงานผลแล้วต้องล็อกเหมือนกัน (ผู้ดูแลยังแก้ได้ ตรงกับ can_report())
     ตั้งชื่อทับไว้ที่เดียว ปุ่มทุกปุ่มในไฟล์ที่เช็ค canEdit อยู่แล้วจึงตามไปเอง */
  const canEdit = canEditRole && canReport;
  const submitted = Boolean(monthSubmitted);
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


  async function unlockOne(id) {
    setBusy(true);
    await setEntriesSaved(uid, [id], false);
    setBusy(false);
  }

  /* ---------------------------------------------------------------
     เดือนที่ดำเนินโครงการแต่ไม่ได้ใช้งบ ต้องมีรายการ 0 บาท แล้วกดส่ง

     ถ้าปล่อยให้ส่งเดือนที่ไม่มีรายการเลย จะแยกไม่ออกระหว่าง
     "เดือนนี้ไม่ได้ใช้งบ" กับ "ยังไม่ได้กรอก" — ซึ่งต่างกันสิ้นเชิง
     อันแรกคือรายงานครบแล้ว อันหลังคืองานค้าง

     รายการ 0 บาทจึงเป็นการบอกอย่างชัดเจนว่า "ดูแล้ว ไม่มีค่าใช้จ่าย"
     --------------------------------------------------------------- */
  async function addZero() {
    setBusy(true);
    await addBudgetEntry(uid, month, { note: "เดือนนี้ไม่มีค่าใช้จ่าย" });
    setBusy(false);
  }

  async function unlockAll() {
    setBusy(true);
    await setEntriesSaved(uid, locked.map((e) => e.id), false);
    setBusy(false);
  }

  return (
    <div className={title ? "bsub" + (list.length ? "" : " empty") : ""}>
      {/* หัวกล่อง: ชื่อกิจกรรม (ถ้ามี) + ป้ายบอกว่ากรอกแล้วหรือยัง
          ป้ายแดง "ยังไม่มีรายการ" คือสิ่งที่ต้องทำต่อ เห็นได้โดยไม่ต้องอ่านตาราง */}
      <div className="bsub-head">
        {title ? <span className="bsub-title">{title}</span> : null}
        <span className={"pill " + (list.length ? "ok" : "bad")}>
          {list.length
            ? list.length + " รายการ · " + money(total) + " บาท"
            : "ยังไม่มีรายการ"}
        </span>
        {budgetHasSaved && draft.length && !submitted ? (
          <span className="pill warn" title="ระบบบันทึกร่างให้อัตโนมัติแล้ว">
            ร่าง {draft.length}
          </span>
        ) : null}
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
                    {/* ---------- ส่วนงานที่ใช้งบ ----------
                        เป็นช่องพิมพ์ ไม่ใช่ดรอปดาวน์บังคับเลือก — ส่วนงานที่มา
                        ร่วมใช้งบบางทีเป็นชื่อที่ไม่มีในทะเบียนหน่วยงานของแผน
                        (คณะทำงานเฉพาะกิจ ศูนย์ในพื้นที่ ฯลฯ) บังคับเลือกแล้ว
                        จะกรอกตามความจริงไม่ได้

                        datalist ยังช่วยเติมชื่อที่มีอยู่ให้ จะได้ไม่พิมพ์ต่างกัน
                        นิดหน่อยจนกลายเป็นคนละส่วนงานเวลารวมยอด

                        **ไม่กรอกก็ได้** ยอดยังถูกนับรวมเป็นงบของโครงการตามปกติ
                        ช่องนี้มีไว้แยกยอดตามส่วนงานเท่านั้น ไม่ใช่เงื่อนไขของการนับ */}
                    <td className="wide" data-label="ส่วนงานที่ใช้งบ">
                      <input
                        list={"orglist-" + uid}
                        placeholder="ไม่ระบุก็ได้"
                        readOnly={ro}
                        disabled={ro}
                        value={e.org || ""}
                        onChange={(ev) =>
                          updateBudgetEntry(uid, e.id, { org: ev.target.value })
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


          {/* รายชื่อไว้เติมอัตโนมัติ ไม่ใช่ตัวเลือกบังคับ — พิมพ์ชื่ออื่นได้เสมอ */}
          <datalist id={"orglist-" + uid}>
            {orgChoices.own.concat(orgChoices.rest).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      ) : (
        <div className="bempty">
          {canEdit && !submitted ? (
            <>
              ยังไม่มีรายการค่าใช้จ่ายเดือน {MONTHS[month]} — กด{" "}
              <b>“+ เพิ่มรายการค่าใช้จ่าย”</b> ด้านล่าง หรือถ้าเดือนนี้ไม่ได้ใช้งบเลย กด{" "}
              <b>“ไม่มีค่าใช้จ่ายเดือนนี้”</b>
            </>
          ) : (
            "ไม่มีรายการค่าใช้จ่ายในเดือน " + MONTHS[month]
          )}
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
          ปุ่มของข้อ 3 มีแค่สองทาง เลือกอย่างใดอย่างหนึ่ง
            + เพิ่มรายการค่าใช้จ่าย  (ปุ่มหลัก)
            หรือ ไม่มีค่าใช้จ่ายเดือนนี้  (โผล่เฉพาะตอนยังไม่มีรายการ)
          ปุ่มส่งข้อมูลไม่อยู่ที่นี่ อยู่ข้อ 4 ที่เดียว

          "บันทึกรายการ" / "ปลดล็อก" ย่อเป็นลิงก์เล็กบรรทัดล่าง ติดป้าย "ไม่บังคับ"
          เดิมเป็นปุ่มขนาดเท่าปุ่มส่ง เรียงติดกันสี่ห้าปุ่ม คนเลยนึกว่าต้องกดทุกปุ่ม
          ตามลำดับ ทั้งที่ระบบบันทึกร่างให้เองอยู่แล้ว

          ทั้งหมดเป็นปุ่มแก้ข้อมูลล้วน บัญชีที่ดูอย่างเดียวจึงไม่เห็นเลย
          --------------------------------------------------------------- */}
      {canEdit && !submitted ? (
        <>
          <div className="btnrow">
            <button className="btn" onClick={add} disabled={busy}>
              + เพิ่มรายการค่าใช้จ่าย
            </button>

            {/* ทางลัดสำหรับเดือนที่ทำโครงการแต่ไม่ได้ใช้งบ
                โผล่เฉพาะตอนยังไม่มีรายการเลย ถ้ามีรายการแล้วปุ่มนี้ไม่มีความหมาย */}
            {!list.length ? (
              <>
                <span className="orword">หรือ</span>
                <button className="btn ghost" onClick={addZero} disabled={busy}>
                  ไม่มีค่าใช้จ่ายเดือนนี้ (ลง 0 บาท)
                </button>
              </>
            ) : null}
          </div>

          {budgetHasSaved && (draft.length || locked.length) ? (
            <div className="bopt">
              <span className="pill none">ไม่บังคับ</span>
              {draft.length ? (
                <button className="linkbtn" onClick={saveAll} disabled={busy}>
                  ล็อกแถวที่กรอกเสร็จ ({draft.length}) กันคนอื่นแก้
                </button>
              ) : null}
              {locked.length ? (
                <button className="linkbtn" onClick={unlockAll} disabled={busy}>
                  ปลดล็อกทั้งหมด ({locked.length})
                </button>
              ) : null}
              <span className="small muted">
                ระบบบันทึกร่างให้อัตโนมัติ และล็อกให้ทั้งหมดตอนกดส่งในข้อ 4
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {!budgetHasSaved ? (
        <div className="small muted" style={{ marginTop: 6 }}>
          ยังใช้การล็อกรายการไม่ได้ เพราะฐานข้อมูลไม่มีคอลัมน์{" "}
          <code>budget_entries.saved</code> — ตัวเลขที่กรอกยังบันทึกตามปกติ
          ถ้าต้องการฟีเจอร์นี้ให้รัน <code>supabase/schema.sql</code> ใน SQL Editor
        </div>
      ) : null}
    </div>
  );
}
