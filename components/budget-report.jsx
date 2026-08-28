"use client";

import { MONTHS, META } from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import { COST_FIELDS, entriesOf, entriesTotal, entriesByCost, budgetRollup } from "@/lib/store";

/* รายงานงบประมาณรายโครงการสำหรับพิมพ์เป็น PDF

   ไม่ใช้ไลบรารี PDF เลย — ใช้ window.print() ของเบราว์เซอร์แล้วเลือก "Save as PDF"
   เพราะเครื่องที่พัฒนาไม่มี Node.js จึงเพิ่ม dependency ไม่ได้ และวิธีนี้
   ได้ฟอนต์ไทยถูกต้องเสมอ ไม่ต้องฝังฟอนต์เข้าไปในไฟล์ PDF เอง

   ตัว DOM นี้ถูก render ไว้ก่อนเรียก print เสมอ (กับดักเดิม: ถ้าสร้าง DOM
   ตอน beforeprint จะได้หน้าว่าง) ส่วนการซ่อน/แสดงจัดการด้วย @media print ใน globals.css */
export default function BudgetReport({ item, budget }) {
  if (!item) return null;

  const roll = budgetRollup(budget, item, null);
  const planned = item.budget || 0;
  const used = roll.total;
  const left = planned - used;
  const byCost = entriesByCost([
    ...roll.own,
    ...roll.byActivity.flatMap((a) => a.list),
  ]);

  /* ยอดรายเดือน รวมของกิจกรรมลูกด้วย */
  const monthly = MONTHS.map((label, i) => {
    const r = budgetRollup(budget, item, i);
    return { label, i, total: r.total, count: r.count };
  });

  const printedAt = new Date().toLocaleString("th-TH");

  return (
    <div id="print-report">
      <div className="rpt-head">
        <h1>รายงานงบประมาณโครงการ</h1>
        <div className="rpt-org">{META.org}</div>
        <div className="rpt-plan">{META.plan}</div>
      </div>

      <table className="rpt-meta">
        <tbody>
          <tr>
            <th>ชื่อโครงการ</th>
            <td colSpan={3}>{item.name}</td>
          </tr>
          <tr>
            <th>รหัสโครงการ</th>
            <td>{item.code}</td>
            <th>หน่วยงานรับผิดชอบ</th>
            <td>{item.org || "–"}</td>
          </tr>
          <tr>
            <th>ยุทธศาสตร์</th>
            <td>{item.strategy || "–"}</td>
            <th>แหล่งเงิน</th>
            <td>{item.fund || "–"}</td>
          </tr>
          <tr>
            <th>แผนงาน</th>
            <td>{item.program || "–"}</td>
            <th>ระยะเวลา</th>
            <td>{item.period || "–"}</td>
          </tr>
        </tbody>
      </table>

      <h2>สรุปงบประมาณ</h2>
      <table className="rpt-sum">
        <tbody>
          <tr>
            <th>งบประมาณที่ได้รับจัดสรรตามแผนปฏิบัติการ</th>
            <td className="num">{money(planned)}</td>
            <td className="unit">บาท</td>
          </tr>
          <tr>
            <th>งบประมาณที่ใช้ไปจากโครงการ</th>
            <td className="num">{money(used)}</td>
            <td className="unit">บาท</td>
          </tr>
          <tr className={left < 0 ? "over" : ""}>
            <th>งบประมาณคงเหลือ</th>
            <td className="num">
              <b>{money(left)}</b>
            </td>
            <td className="unit">บาท</td>
          </tr>
          <tr>
            <th>คิดเป็นสัดส่วนที่ใช้ไป</th>
            <td className="num">{planned ? pct((used / planned) * 100) : "–"}</td>
            <td className="unit" />
          </tr>
        </tbody>
      </table>

      <h2>งบประมาณที่ใช้ แยกตามหมวดค่าใช้จ่าย</h2>
      <table className="rpt-tbl">
        <thead>
          <tr>
            {COST_FIELDS.map((c) => (
              <th key={c.key} className="num">
                {c.label}
              </th>
            ))}
            <th className="num">รวม</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {COST_FIELDS.map((c) => (
              <td key={c.key} className="num">
                {money(byCost[c.key])}
              </td>
            ))}
            <td className="num">
              <b>{money(used)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>
        กิจกรรมภายใต้โครงการ
        {item._kids && item._kids.length ? " (" + item._kids.length + " กิจกรรม)" : ""}
      </h2>
      {item._kids && item._kids.length ? (
        <table className="rpt-tbl">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>กิจกรรม</th>
              <th className="num">งบตามแผน</th>
              <th className="num">ใช้ไป</th>
              <th className="num">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {item._kids.map((k) => {
              const kr = budgetRollup(budget, k, null);
              return (
                <tr key={k.uid}>
                  <td className="mono">{k.code}</td>
                  <td>{k.name}</td>
                  <td className="num">{money(k.budget)}</td>
                  <td className="num">{kr.total ? money(kr.total) : "–"}</td>
                  <td className="num">{money((k.budget || 0) - kr.total)}</td>
                </tr>
              );
            })}
            <tr>
              <td />
              <td>
                <b>รวมที่ใช้จากกิจกรรม</b>
              </td>
              <td className="num" />
              <td className="num">
                <b>{money(roll.kidsTotal)}</b>
              </td>
              <td className="num" />
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="rpt-note">โครงการนี้ไม่มีกิจกรรมย่อยแยกไว้ในแผนปฏิบัติการ</p>
      )}
      <p className="rpt-note">
        งบตามแผนของกิจกรรมรวมอยู่ในงบโครงการแม่แล้ว จึงไม่นำมาบวกซ้ำในยอดจัดสรร
        ส่วนงบที่ใช้จริงนับรวมทุกระดับ
      </p>

      <h2>ยอดเบิกจ่ายรายเดือน</h2>
      <table className="rpt-tbl">
        <thead>
          <tr>
            <th>เดือน</th>
            <th className="num">จำนวนรายการ</th>
            <th className="num">ยอดเบิกจ่าย (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.i}>
              <td>{m.label}</td>
              <td className="num">{m.count ? fmt(m.count) : "–"}</td>
              <td className="num">{m.total ? money(m.total) : "–"}</td>
            </tr>
          ))}
          <tr>
            <td>
              <b>รวมทั้งปี</b>
            </td>
            <td className="num">
              <b>{fmt(roll.count)}</b>
            </td>
            <td className="num">
              <b>{money(used)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>รายละเอียดรายการเบิกจ่าย</h2>
      {roll.count ? (
        <table className="rpt-tbl">
          <thead>
            <tr>
              <th>เดือน</th>
              <th>วันที่</th>
              <th>รายการ / กิจกรรม</th>
              {COST_FIELDS.map((c) => (
                <th key={c.key} className="num">
                  {c.label}
                </th>
              ))}
              <th className="num">รวม</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((label, i) => {
              const rows = [
                ...entriesOf(budget, item.uid, i).map((e) => ({ e, from: null })),
                ...roll.byActivity.flatMap((a) =>
                  a.list.filter((e) => Number(e.month) === i).map((e) => ({ e, from: a.item }))
                ),
              ];
              return rows.map(({ e, from }) => (
                <tr key={e.id}>
                  <td>{label}</td>
                  <td className="mono">{e.occurred_on || "–"}</td>
                  <td>
                    {e.note || "–"}
                    {from ? <div className="rpt-sub">กิจกรรม: {from.name}</div> : null}
                  </td>
                  {COST_FIELDS.map((c) => (
                    <td key={c.key} className="num">
                      {money(Number(String(e[c.key] || "").replace(/,/g, "")))}
                    </td>
                  ))}
                  <td className="num">{money(entriesTotal([e]))}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      ) : (
        <p className="rpt-note">ยังไม่มีการบันทึกรายการเบิกจ่ายของโครงการนี้</p>
      )}

      <div className="rpt-foot">
        <div>พิมพ์เมื่อ {printedAt}</div>
        <div>ระบบแจ้งเตือนผลการดำเนินงาน · {META.org}</div>
      </div>
    </div>
  );
}
