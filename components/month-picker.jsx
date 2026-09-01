"use client";

import { MONTHS } from "@/lib/plan";
import { useResults } from "@/lib/store";

/* ตัวเลือก "ณ เดือน" ที่ใช้เป็นฐานคำนวณทุกหน้า

   ปีงบประมาณ 2570 คือ ต.ค. 2026 ถึง ก.ย. 2027 ซึ่งอาจยังมาไม่ถึง
   ถ้าผูกกับวันที่จริงอย่างเดียวหน้าแจ้งเตือนจะว่างเปล่าโดยไม่มีคำอธิบาย
   จึงให้ผู้ใช้เลือกเดือนเองได้ หรือเลือก "ทั้งปี" เพื่อดูภาพรวมทั้งหมด

   ค่า -1 = ทั้งปี ระบบจะคิดเสมือนถึงสิ้นปีงบ (ดู asOfMonth ใน lib/store.jsx) */
export default function MonthPicker({ hint }) {
  const { asOf, setAsOf, fyStarted, allMonths } = useResults();

  return (
    <div className="filters" style={{ marginBottom: 16 }}>
      <div className="field">
        <label htmlFor="asof">ช่วงเวลาที่ต้องการดู</label>
        <select
          id="asof"
          value={asOf}
          onChange={(e) => setAsOf(Number(e.target.value))}
          style={{ minWidth: 200 }}
        >
          <option value={-1}>ทั้งปีงบประมาณ (ทั้งหมด)</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              ณ สิ้นเดือน {m}
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ flex: 1, minWidth: 220 }}>
        <label>&nbsp;</label>
        <div className="small muted" style={{ paddingBlock: 7 }}>
          {allMonths
            ? "แสดงข้อมูลทั้งปีงบประมาณ 2570 (ต.ค. 69 – ก.ย. 70)"
            : "คำนวณผลและการแจ้งเตือนถึงสิ้นเดือนที่เลือก"}
          {!fyStarted ? " · ปีงบประมาณ 2570 ยังไม่เริ่ม เลือกเดือนเพื่อจำลองได้" : ""}
          {hint ? " · " + hint : ""}
        </div>
      </div>
    </div>
  );
}
