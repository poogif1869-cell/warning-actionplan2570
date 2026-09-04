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
    placeholder: "เช่น 15 ม.ค. 2570",
  },
  {
    key: "doc_no",
    label: "เลขหนังสือที่แจ้ง ฝยศ.",
    placeholder: "เช่น กษ 2610/ว.123",
  },
  {
    key: "doc_date",
    label: "ลงวันที่",
    placeholder: "เช่น 20 ม.ค. 2570",
  },
];

/* กรอกครบทั้งสี่ช่องหรือยัง — ช่องว่างล้วน ๆ ไม่นับว่ากรอก */
export function isApprovalComplete(v) {
  return APPROVAL_FIELDS.every((f) => String((v || {})[f.key] || "").trim() !== "");
}

/* ข้อความสรุปมติไว้แสดงในถังการแก้ไข */
export function approvalText(e) {
  if (!e) return "";
  const parts = [];
  if (e.res_no) parts.push("มติ คกก.กยท. ครั้งที่ " + e.res_no);
  if (e.res_date) parts.push("เมื่อ " + e.res_date);
  if (e.doc_no) parts.push("หนังสือ " + e.doc_no);
  if (e.doc_date) parts.push("ลงวันที่ " + e.doc_date);
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
                type="text"
                value={v[f.key] == null ? "" : v[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => onChange({ ...v, [f.key]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
