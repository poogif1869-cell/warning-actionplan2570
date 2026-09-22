"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MONTHS } from "@/lib/plan";
import { money, fmt } from "@/lib/format";
import { useResults, entriesOf, entriesTotal } from "@/lib/store";
import BudgetEntries from "@/components/budget-entries";
import Sec from "@/components/sec";

/* ข้อ 3 และข้อ 4 ของหน้างบประมาณโครงการ

     3. กรอกรายการค่าใช้จ่าย   (ของโครงการ หรือของทุกกิจกรรมถ้ามีกิจกรรมย่อย)
     4. ส่งข้อมูลงบประมาณ      **กดครั้งเดียวทั้งโครงการ** แล้วจึงไปรายงานผลได้

   กติกา: **ถ้าโครงการมีกิจกรรมย่อย จะบันทึกที่ระดับโครงการไม่ได้**
   ต้องลงที่กิจกรรมเท่านั้น เพราะถ้าเปิดให้กรอกทั้งสองระดับ
   ยอดของโครงการ (= ของตัวเอง + ของลูก) จะนับซ้ำโดยที่ผู้กรอกไม่รู้ตัว

   การส่งเก็บที่ uid ของโครงการเสมอ แม้รายการจะอยู่ที่กิจกรรม เพราะหน้ารายงานผล
   (report-tab) กับรายงาน PDF ตรวจที่โครงการ — เดิมแต่ละกิจกรรมมีปุ่มส่งของตัวเอง
   ส่งครบทุกกิจกรรมแล้วหน้ารายงานผลก็ยังบอกว่ายังไม่ส่ง */

/* สถานะของโครงการหนึ่งในเดือนหนึ่ง — หน้างบประมาณใช้ตัวเดียวกันนี้
   ตัดสินว่าข้อไหนเสร็จแล้ว ข้อไหนต้องทำ จะได้ไม่คิดคนละแบบกับข้อ 3/4 ด้านล่าง */
export function budgetMonthState(budget, item, month, budgetSubmitted) {
  const kids = item._kids || [];
  // หน่วยที่ต้องมีรายการ: กิจกรรมทุกตัวถ้ามี ไม่งั้นตัวโครงการเอง
  const units = kids.length ? kids : [item];
  const lists = units.map((u) => ({ u, list: month == null ? [] : entriesOf(budget, u.uid, month) }));
  const missing = lists.filter((x) => !x.list.length).map((x) => x.u);
  const count = lists.reduce((a, x) => a + x.list.length, 0);
  const total = lists.reduce((a, x) => a + entriesTotal(x.list), 0);
  const noBudget = (item.budget || 0) === 0 && kids.every((k) => (k.budget || 0) === 0);
  return {
    kids,
    lists,
    missing,
    count,
    total,
    noBudget,
    // ครบ = ทุกหน่วยมีอย่างน้อยหนึ่งรายการ (ไม่ได้ใช้งบก็ต้องลง 0 บาทให้เห็นว่าดูแล้ว)
    filled: count > 0 && missing.length === 0,
    submitted: month == null ? false : budgetSubmitted(item.uid, month),
  };
}

export default function MonthBudget({ item, month, allMonths }) {
  const router = useRouter();
  const {
    budget,
    canEdit: canEditRole,
    canReport,
    budgetHasSaved,
    hasSubmitTable,
    budgetSubmitted,
    setBudgetSubmitted,
    setEntriesSaved,
    addBudgetEntry,
  } = useResults();
  const [busy, setBusy] = useState(false);

  /* โหมด "ทั้งปี" ไม่มีเดือนปลายทางที่ชัดเจน ถ้าปล่อยให้กรอก
     รายการจะถูกบันทึกลงเดือน ก.ย. 70 เงียบ ๆ จึงให้เลือกเดือนก่อน
     (หน้างบประมาณกันไว้ที่ข้อ 1 แล้ว ตรงนี้กันซ้ำเผื่อมีที่อื่นเรียกใช้) */
  if (allMonths) {
    return (
      <div className="banner">
        ให้เลือกเดือนในข้อ 1 ก่อน จึงจะเพิ่มหรือแก้รายการงบประมาณได้
        (รายการต้องผูกกับเดือนเสมอ)
      </div>
    );
  }

  const canEdit = canEditRole && canReport;
  const st = budgetMonthState(budget, item, month, budgetSubmitted);
  const { kids, lists, missing, count, total, noBudget, filled, submitted } = st;
  const mLabel = MONTHS[month];

  async function fillZero() {
    setBusy(true);
    for (const u of missing) {
      await addBudgetEntry(u.uid, month, { note: "เดือนนี้ไม่มีค่าใช้จ่าย" });
    }
    setBusy(false);
  }

  async function submit() {
    if (!filled) return;
    if (
      !confirm(
        "ส่งข้อมูลงบประมาณเดือน " + mLabel + " ?\n\n" +
          "รวม " + fmt(count) + " รายการ ยอด " + money(total) + " บาท\n" +
          "หลังส่งแล้วแก้ไม่ได้ จนกว่าจะกด “แก้ไขงบประมาณ”"
      )
    ) {
      return;
    }
    setBusy(true);
    /* ล็อกแถวที่ยังเป็นร่างของทุกหน่วยไปพร้อมกัน ไม่งั้นจะเหลือแถว
       "ยังไม่บันทึก" อยู่ในเดือนที่ส่งไปแล้ว ซึ่งขัดกันเอง
       ถ้าล็อกไม่สำเร็จให้หยุด ไม่ส่งต่อ — setEntriesSaved แจ้งข้อผิดพลาดเองแล้ว */
    if (budgetHasSaved) {
      for (const x of lists) {
        const ids = x.list.filter((e) => !e.saved).map((e) => e.id);
        if (!ids.length) continue;
        const ok = await setEntriesSaved(x.u.uid, ids, true);
        if (ok === false) {
          setBusy(false);
          return;
        }
      }
    }
    await setBudgetSubmitted(item.uid, month, true);
    setBusy(false);
  }

  async function reopen() {
    setBusy(true);
    await setBudgetSubmitted(item.uid, month, false);
    setBusy(false);
  }

  /* ขั้นต่อไปหลังส่งงบ — พาไปเปิดลิ้นชักรายงานผลของโครงการนี้เลย
     ไม่ใช่ปล่อยให้ไปค้นหาเองใหม่ที่หน้าโครงการ/กิจกรรม */
  function goReport() {
    router.push("/projects?uid=" + encodeURIComponent(item.uid));
  }

  // ข้อ 3 เสร็จเมื่อทุกหน่วยมีรายการ · ข้อ 4 ต้องทำเมื่อข้อ 3 เสร็จแล้ว
  const s3 = submitted || filled ? "done" : "now";
  const s4 = submitted ? "done" : filled ? "now" : "todo";

  return (
    <>
      <Sec
        no={3}
        id="bud-step3"
        state={s3}
        title={"กรอกรายการค่าใช้จ่าย เดือน " + mLabel}
        hint={
          kids.length
            ? "กรอกที่กิจกรรม ทุกกิจกรรมต้องมีอย่างน้อย 1 รายการ — ไม่ได้ใช้งบให้กด “ไม่มีค่าใช้จ่ายเดือนนี้”"
            : "กด “+ เพิ่มรายการค่าใช้จ่าย” แล้วกรอกตัวเลข ระบบบันทึกให้อัตโนมัติ — ไม่ได้ใช้งบให้กด “ไม่มีค่าใช้จ่ายเดือนนี้”"
        }
        right={
          <span className={"pill " + (count ? "ok" : "none")}>
            {fmt(count)} รายการ · {money(total)} บาท
          </span>
        }
      >
        {noBudget ? (
          <div className="banner" style={{ marginTop: 0 }}>
            โครงการนี้<b>ไม่ได้รับจัดสรรงบประมาณ</b> — ไม่ต้องกรอกและไม่ต้องส่งงบ
            ไปรายงานผลโครงการได้เลย (ถ้ามีค่าใช้จ่ายจริงก็ยังบันทึกได้ตามปกติ)
          </div>
        ) : null}

        {kids.length ? (
          <div className="small muted" style={{ marginBottom: 10 }}>
            โครงการนี้มีกิจกรรมย่อย {kids.length} กิจกรรม —{" "}
            <b>กรอกที่กิจกรรม ยอดจะรวมขึ้นไปที่โครงการเอง</b>{" "}
            (บันทึกที่ระดับโครงการไม่ได้ กันยอดนับซ้ำสองระดับ) · มีรายการแล้ว{" "}
            <b>
              {kids.length - missing.length}/{kids.length}
            </b>{" "}
            กิจกรรม
          </div>
        ) : null}

        {lists.map(({ u }) => (
          <BudgetEntries
            key={u.uid}
            uid={u.uid}
            month={month}
            title={kids.length ? u.code + " " + u.name : ""}
            locked={submitted}
          />
        ))}
      </Sec>

      <Sec
        no={4}
        id="bud-step4"
        state={s4}
        title="ส่งข้อมูลงบประมาณ"
        hint="ตรวจยอดแล้วกดส่งครั้งเดียวทั้งโครงการ — ส่งแล้วจึงไปรายงานผลโครงการของเดือนนี้ได้"
        right={
          <span className={"pill " + (submitted ? "ok" : "bad")}>
            {submitted ? "ส่งแล้ว" : "ยังไม่ส่ง"}
          </span>
        }
      >
        {submitted ? (
          <>
            <div className="banner ok" style={{ marginTop: 0 }}>
              <b>ส่งข้อมูลงบประมาณเดือน {mLabel} แล้ว</b> — รวม {fmt(count)} รายการ{" "}
              {money(total)} บาท · เพิ่มหรือแก้รายการไม่ได้จนกว่าจะกด “แก้ไขงบประมาณ”
            </div>
            <div className="btnrow">
              <button className="btn" onClick={goReport}>
                ขั้นต่อไป: รายงานผลโครงการ →
              </button>
              {canEdit ? (
                <button className="btn ghost" onClick={reopen} disabled={busy}>
                  แก้ไขงบประมาณ
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {/* รายการตรวจก่อนส่ง — บอกตรง ๆ ว่ายังขาดอะไร ไม่ใช่แค่ปุ่มเทาที่กดไม่ได้ */}
            <ul className="bcheck">
              <li className={count ? "ok" : ""}>
                มีรายการค่าใช้จ่ายอย่างน้อย 1 รายการ
                <span className="small muted"> (ไม่ได้ใช้งบให้ลง 0 บาท)</span>
              </li>
              {kids.length ? (
                <li className={missing.length ? "" : "ok"}>
                  ทุกกิจกรรมมีรายการ ({kids.length - missing.length}/{kids.length})
                  {missing.length ? (
                    <div className="small st-bad">
                      ยังไม่มีรายการ:{" "}
                      {missing
                        .slice(0, 5)
                        .map((u) => u.code)
                        .join(", ")}
                      {missing.length > 5 ? " และอีก " + (missing.length - 5) + " กิจกรรม" : ""}
                    </div>
                  ) : null}
                </li>
              ) : null}
            </ul>

            {/* ทางลัดของโครงการที่มีหลายกิจกรรม — กิจกรรมที่เดือนนี้ไม่ได้ใช้งบ
                ไม่ต้องไล่กดทีละกล่อง กดทีเดียวลง 0 บาทให้ทุกตัวที่ยังว่าง */}
            {canEdit && kids.length && missing.length ? (
              <div className="btnrow" style={{ marginTop: 0 }}>
                <button className="btn ghost" onClick={fillZero} disabled={busy}>
                  ลง 0 บาทให้กิจกรรมที่ยังไม่มีรายการ ({missing.length})
                </button>
              </div>
            ) : null}

            {canEdit ? (
              <div className="btnrow">
                <button
                  className="btn bsubmit"
                  onClick={submit}
                  disabled={busy || !filled || !hasSubmitTable}
                >
                  ส่งข้อมูลงบประมาณเดือน {mLabel}
                </button>
              </div>
            ) : (
              <div className="small muted">
                บัญชีนี้ส่งข้อมูลไม่ได้ (ดูได้อย่างเดียว หรือผู้ดูแลปิดการรายงานผลอยู่)
              </div>
            )}

            {canEdit && !filled ? (
              <div className="small st-bad" style={{ marginTop: 6 }}>
                ยังกดส่งไม่ได้ — ทำข้อ 3 ให้ครบก่อน
              </div>
            ) : null}

            {noBudget ? (
              <div className="btnrow">
                <button className="btn ghost" onClick={goReport}>
                  ไม่ต้องส่ง ไปรายงานผลโครงการ →
                </button>
              </div>
            ) : null}
          </>
        )}

        {!hasSubmitTable ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            ยังใช้การส่งข้อมูลงบประมาณไม่ได้ เพราะฐานข้อมูลไม่มีตาราง{" "}
            <code>budget_submissions</code> — ให้ผู้ดูแลรัน <code>supabase/schema.sql</code>
          </div>
        ) : null}
      </Sec>
    </>
  );
}
