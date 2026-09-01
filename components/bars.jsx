"use client";

import { money } from "@/lib/format";

/* แท่งแนวนอนเขียนด้วย div + CSS width เป็น %
   **ห้ามใช้ SVG + preserveAspectRatio="none"** ตัวอักษรไทยจะถูกยืดตามความกว้างจอ
   เป็นกับดักที่เจอมาแล้วในเว็บรุ่นก่อน */
export default function Bars({ data, onSelect }) {
  const list = (data || []).filter(Boolean);
  const max = Math.max(...list.map((d) => d.value || 0), 1);

  if (!list.length) return <div className="small muted">ไม่มีข้อมูล</div>;

  return (
    <div className="hbars">
      {list.map((d, i) => {
        const body = (
          <>
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
          </>
        );

        /* ถ้ามี onSelect ให้ทั้งแท่งกดได้ เพื่อเปิดดูว่ากลุ่มนั้นมีโครงการอะไรบ้าง */
        return onSelect ? (
          <button
            key={d.key || d.label || i}
            className="barbtn"
            onClick={() => onSelect(d)}
            title="กดเพื่อดูรายชื่อโครงการในกลุ่มนี้"
          >
            {body}
          </button>
        ) : (
          <div key={d.key || d.label || i}>{body}</div>
        );
      })}
    </div>
  );
}
