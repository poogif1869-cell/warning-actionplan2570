"use client";

import { MONTHS } from "@/lib/plan";
import { useResults } from "@/lib/store";

/* ตัวเลือก "ณ เดือน" ที่ใช้เป็นฐานคำนวณการแจ้งเตือน — ใช้ร่วมกันทุกหน้า

   ปีงบประมาณ 2570 คือ ต.ค. 2026 ถึง ก.ย. 2027 ซึ่งอาจยังมาไม่ถึง
   ถ้าผูกกับวันที่จริงอย่างเดียวหน้าแจ้งเตือนจะว่างเปล่าโดยไม่มีคำอธิบาย
   จึงให้ผู้ใช้เลื่อนเดือนเองได้ */
export default function MonthPicker() {
  const { asOf, setAsOf, fyStarted } = useResults();

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="small muted" style={{ marginBottom: 7 }}>
        คำนวณการแจ้งเตือน ณ สิ้นเดือน
        {!fyStarted ? " (ปีงบประมาณ 2570 ยังไม่เริ่ม — เลือกเดือนที่ต้องการจำลองได้)" : ""}
      </div>
      <div className="monthpick">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            aria-pressed={asOf === i}
            onClick={() => setAsOf(i)}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
