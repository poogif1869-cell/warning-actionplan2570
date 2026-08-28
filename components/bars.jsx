"use client";

import { money } from "@/lib/format";

/* แท่งแนวนอนเขียนด้วย div + CSS width เป็น %
   **ห้ามใช้ SVG + preserveAspectRatio="none"** ตัวอักษรไทยจะถูกยืดตามความกว้างจอ
   เป็นกับดักที่เจอมาแล้วในเว็บรุ่นก่อน */
export default function Bars({ data }) {
  const list = (data || []).filter(Boolean);
  const max = Math.max(...list.map((d) => d.value || 0), 1);

  if (!list.length) return <div className="small muted">ไม่มีข้อมูล</div>;

  return (
    <div className="hbars">
      {list.map((d, i) => (
        <div key={d.key || d.label || i}>
          <div className="hbar-top">
            <span className="lbl">{d.label}</span>
            <span className="val">{d.display || money(d.value)}</span>
          </div>
          <div className="bar">
            <i
              style={{
                width: ((d.value || 0) / max) * 100 + "%",
                background: d.color || "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
