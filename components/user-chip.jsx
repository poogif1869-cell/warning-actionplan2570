"use client";

/* =====================================================================
   ป้ายผู้ใช้บนแถบหัวเรื่อง

   เดิมแสดงอีเมลเต็ม ๆ ซึ่งยาวจนดันปุ่มอื่นตกบรรทัด และไม่ใช่ข้อมูลที่ต้อง
   อ่านตลอดเวลา เปลี่ยนเป็นวงกลมตัวย่อ แล้วเก็บอีเมลเต็มกับบทบาทไว้ใน
   tooltip (และอ่านออกด้วย screen reader ผ่าน aria-label)
   ===================================================================== */

import { useResults } from "@/lib/store";

const ROLE_LABEL = {
  viewer: "ดูอย่างเดียว",
  editor: "ผู้กรอกข้อมูล",
  admin: "ผู้ดูแลระบบ",
};

/* ---------------------------------------------------------------------
   ย่อชื่อให้เหลือ 1-2 ตัวอักษร

   ลำดับความพยายาม:
     1. ชื่อที่ตั้งไว้ใน profiles.full_name — เอาอักษรแรกของแต่ละคำ
        (ภาษาไทยก็ใช้ได้ เพราะแยกด้วยช่องว่างตามปกติของชื่อ-สกุล)
     2. ส่วนหน้า @ ของอีเมล ถ้ามีจุด/ขีด/ขีดล่างคั่น เอาอักษรแรกของแต่ละท่อน
     3. ไม่มีตัวคั่น เอาสองอักษรแรก

   ตัดที่ 2 ตัวอักษรเสมอ ยาวกว่านั้นวงกลมจะเบี้ยว
   --------------------------------------------------------------------- */
function initialsOf(name, email) {
  const src = String(name || "").trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  const local = String(email || "").split("@")[0] || "";
  if (!local) return "?";

  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export default function UserChip() {
  const { userEmail, userName, role, hasRoles } = useResults();

  if (!userEmail && !userName) return null;

  const label = userName || userEmail;
  const roleText = hasRoles && role ? ROLE_LABEL[role] || role : "";
  const full = label + (roleText ? " · " + roleText : "");

  return (
    <span
      className={"userchip" + (role ? " role-" + role : "")}
      title={full}
      aria-label={"บัญชีที่ใช้งาน " + full}
    >
      {initialsOf(userName, userEmail)}
    </span>
  );
}
