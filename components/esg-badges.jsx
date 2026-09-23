"use client";

import { ESG_BY_KEY, SDG_BY_NO } from "@/lib/esg-sdg";

/* ป้าย ESG และ SDGs — ใช้ทั้งในลิ้นชักรายละเอียดและหน้าแก้ไขแผน

   ป้าย SDG ใช้สีประจำเป้าหมายของ UN ตามเลข คนที่คุ้นกับป้าย SDGs
   จะจำได้จากสีทันทีโดยไม่ต้องอ่านข้อความ */
export default function EsgBadges({ esg, sdg, size }) {
  const small = size === "sm";
  if ((!esg || !esg.length) && (!sdg || !sdg.length)) {
    return <span className="small muted">ยังไม่ได้ระบุการเชื่อมโยง</span>;
  }

  return (
    <div className="esgrow">
      {(esg || []).map((k) => {
        const e = ESG_BY_KEY.get(k);
        if (!e) return null;
        return (
          <span
            key={k}
            className={"esgchip" + (small ? " sm" : "")}
            style={{ "--ec": e.color }}
            title={e.full + " — " + e.hint}
          >
            <b>{k}</b>
            {small ? null : " " + e.label}
          </span>
        );
      })}

      {(sdg || []).map((n) => {
        const s = SDG_BY_NO.get(Number(n));
        if (!s) return null;
        return (
          <span
            key={n}
            className={"sdgchip" + (small ? " sm" : "")}
            style={{ "--sc": s.color }}
            title={"SDG " + s.no + " — " + s.full}
          >
            <b>{s.no}</b>
            {small ? null : " " + s.short}
          </span>
        );
      })}
    </div>
  );
}
