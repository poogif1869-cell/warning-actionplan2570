"use client";

/* =====================================================================
   ช่องกรอกมติอนุมัติ — ใช้ร่วมกันทุกที่ที่ต้องอ้างมติก่อนแก้แผน
   (เพิ่มโครงการ · ลบโครงการ · แก้ตัวชี้วัด)

   ทั้งสี่ช่องบังคับกรอกครบ ไม่ใช่แค่ทำให้ปุ่มจาง — ตัว isApprovalComplete()
   ถูกใช้ปิดปุ่มจริง และฐานข้อมูลยังมี constraint ตรวจซ้ำอีกชั้น
   (plan_edits_approval_required ใน supabase/schema.sql) เพราะการซ่อนปุ่ม
   ในหน้าเว็บไม่ใช่การป้องกัน ใครก็ยิง API ตรงได้

   วันที่เก็บเป็นข้อความ ไม่ใช่ date ของ Postgres โดยตั้งใจ — หนังสือราชการ
   บางฉบับลงวันที่เป็น พ.ศ. บางฉบับเขียนแบบ "15 ม.ค. 70" การบังคับรูปแบบ
   จะทำให้กรอกตามหนังสือจริงไม่ได้ ช่องจึงเป็น type="text" พร้อมตัวอย่าง
   ===================================================================== */

export const APPROVAL_FIELDS = [
  {
    key: "res_no",
    label: "มติ คกก.กยท. ครั้งที่",
    placeholder: "เช่น 8/2569",
  },
  {
    key: "res_date",
    label: "เมื่อวันที่",
    date: true,
  },
  {
    key: "doc_no",
    label: "เลขหนังสือที่แจ้ง ฝยศ.",
    placeholder: "เช่น กษ 2610/ว.123",
  },
  {
    key: "doc_date",
    label: "ลงวันที่",
    date: true,
  },
];

/* ---------------------------------------------------------------------
   วันที่เก็บเป็น yyyy-mm-dd (ค.ศ.) ตามที่ <input type="date"> ให้มา
   แต่ **แสดงผลเป็น พ.ศ. เสมอ** เพราะหนังสือราชการใช้ พ.ศ.

   เก็บเป็น ค.ศ. เพราะเรียงลำดับและเทียบวันได้ตรง ๆ ถ้าเก็บเป็นข้อความไทย
   ("15 ม.ค. 70") จะเรียงตามตัวอักษรแล้วได้ลำดับมั่ว
   คอลัมน์ในฐานข้อมูลยังเป็น text เหมือนเดิม จึงไม่ต้องแก้ schema
   และข้อมูลเก่าที่เคยกรอกเป็นข้อความไทยไว้ก็ยังแสดงได้ตามเดิม
   --------------------------------------------------------------------- */
const TH_MONTH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function thaiDate(v) {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s; // ข้อความเดิมที่ไม่ใช่รูปแบบวันที่ ให้แสดงตามที่กรอกไว้
  const y = Number(m[1]) + 543;
  const mo = TH_MONTH[Number(m[2]) - 1] || m[2];
  return Number(m[3]) + " " + mo + " " + y;
}

/* กรอกครบทั้งสี่ช่องหรือยัง — ช่องว่างล้วน ๆ ไม่นับว่ากรอก */
export function isApprovalComplete(v) {
  return APPROVAL_FIELDS.every((f) => String((v || {})[f.key] || "").trim() !== "");
}

/* ข้อความสรุปมติไว้แสดงในถังการแก้ไข */
export function approvalText(e) {
  if (!e) return "";
  const parts = [];
  if (e.res_no) parts.push("มติ คกก.กยท. ครั้งที่ " + e.res_no);
  if (e.res_date) parts.push("เมื่อ " + thaiDate(e.res_date));
  if (e.doc_no) parts.push("หนังสือ " + e.doc_no);
  if (e.doc_date) parts.push("ลงวันที่ " + thaiDate(e.doc_date));
  return parts.join(" · ");
}

export default function ApprovalFields({ value, onChange, idPrefix }) {
  const v = value || {};
  const pre = idPrefix || "ap";

  return (
    <div className="approvalbox">
      <div className="small muted" style={{ marginBottom: 8 }}>
        ต้องกรอกครบทั้งสี่ช่อง จึงจะกดปุ่มที่มีผลกับแผนได้
      </div>
      <div className="grid2">
        {APPROVAL_FIELDS.map((f) => {
          const filled = String(v[f.key] || "").trim() !== "";
          return (
            <div className="field" key={f.key}>
              <label htmlFor={pre + "-" + f.key}>
                {f.label}
                {filled ? null : <span className="req"> *</span>}
              </label>
              <input
                id={pre + "-" + f.key}
                type={f.date ? "date" : "text"}
                value={v[f.key] == null ? "" : v[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => onChange({ ...v, [f.key]: e.target.value })}
              />
              {/* ช่องวันที่แสดงเป็น ค.ศ. ตามที่เบราว์เซอร์กำหนด กลับเป็น พ.ศ. ไม่ได้
                  จึงเขียน พ.ศ. กำกับไว้ใต้ช่อง ให้ตรวจกับหนังสือได้โดยไม่ต้องบวกเอง */}
              {f.date && filled ? (
                <div className="small muted">= {thaiDate(v[f.key])} (พ.ศ.)</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
