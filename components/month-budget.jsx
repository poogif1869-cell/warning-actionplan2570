"use client";

import BudgetEntries from "@/components/budget-entries";

/* ฟอร์มบันทึกงบประมาณของรายการหนึ่งในเดือนหนึ่ง

   กติกา: **ถ้าโครงการมีกิจกรรมย่อย จะบันทึกที่ระดับโครงการไม่ได้**
   ต้องลงที่กิจกรรมเท่านั้น เพราะถ้าเปิดให้กรอกทั้งสองระดับ
   ยอดของโครงการ (= ของตัวเอง + ของลูก) จะนับซ้ำโดยที่ผู้กรอกไม่รู้ตัว

   โครงการที่ไม่มีกิจกรรมย่อยจึงกรอกที่ระดับโครงการได้ตามปกติ */
export default function MonthBudget({ item, month, allMonths }) {
  const kids = item._kids || [];

  /* โหมด "ทั้งปี" ไม่มีเดือนปลายทางที่ชัดเจน ถ้าปล่อยให้กรอก
     รายการจะถูกบันทึกลงเดือน ก.ย. 70 เงียบ ๆ จึงให้เลือกเดือนก่อน */
  if (allMonths) {
    return (
      <div className="banner">
        ตอนนี้เลือกดู “ทั้งปีงบประมาณ” — ให้เลือกเดือนจากดรอปดาวน์ด้านบนก่อน
        จึงจะเพิ่มหรือแก้รายการงบประมาณได้ (รายการต้องผูกกับเดือนเสมอ)
      </div>
    );
  }

  if (!kids.length) {
    return <BudgetEntries uid={item.uid} month={month} title="ระดับโครงการ" />;
  }

  return (
    <div>
      <div className="banner" style={{ marginBottom: 14 }}>
        โครงการนี้มีกิจกรรมย่อย {kids.length} กิจกรรม จึง<b>บันทึกงบที่ระดับโครงการไม่ได้</b> —
        ให้ลงที่กิจกรรมด้านล่าง ยอดจะรวมขึ้นมาที่โครงการเอง
        (กันไม่ให้ยอดถูกนับซ้ำสองระดับ)
      </div>

      {kids.map((k, i) => (
        <div
          key={k.uid}
          style={
            i === 0
              ? undefined
              : { borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 14 }
          }
        >
          <BudgetEntries uid={k.uid} month={month} title={k.code + " " + k.name} />
        </div>
      ))}
    </div>
  );
}
