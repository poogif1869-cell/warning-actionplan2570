"use client";

import { money, pct } from "@/lib/format";

/* กราฟโดนัทเขียนด้วย SVG วงกลม + stroke-dasharray

   ปลอดภัยกับภาษาไทยเพราะ **ไม่มีตัวอักษรอยู่ใน SVG เลย** viewBox เป็นสี่เหลี่ยมจัตุรัส
   และไม่ได้ใช้ preserveAspectRatio="none" ป้ายชื่อทั้งหมดอยู่ในตาราง HTML ข้าง ๆ
   (กับดักเดิมคือเอาตัวอักษรไทยใส่ SVG ที่ถูกยืด แล้วตัวหนังสือเบี้ยว)

   ค่ากลางวงแสดงยอดรวม สีวนจากจานสีของธีม */
const PALETTE = [
  "var(--s1)", "var(--s3)", "var(--s2)", "var(--s4)",
  "var(--accent-2)", "var(--gold)", "var(--ok)", "var(--warn)",
  "var(--bad)", "var(--none)", "var(--brand-3)", "var(--accent)",
];

const SIZE = 180;
const R = 68;
const STROKE = 30;
const C = 2 * Math.PI * R;

/* unit / format ใส่เพิ่มทีหลัง เพราะเดิมโดนัทใช้กับยอดเงินอย่างเดียว
   พอเอาไปนับ "จำนวนโครงการ" หรือ "จำนวนตัวชี้วัด" แล้วขึ้นคำว่าบาทต่อท้าย
   ค่าเริ่มต้นยังเป็นบาทเหมือนเดิม ที่เรียกอยู่แล้วจึงไม่ต้องแก้ */
export default function Donut({ data, centerLabel, emptyText, unit, format }) {
  const fmtv = format || money;
  const u = unit == null ? "บาท" : unit;
  const list = (data || []).filter((d) => d && (d.value || 0) > 0);
  const total = list.reduce((a, d) => a + d.value, 0);

  if (!total) {
    return (
      <div className="small muted" style={{ padding: "18px 0" }}>
        {emptyText || "ยังไม่มียอดเบิกจ่ายในช่วงที่เลือก"}
      </div>
    );
  }

  let acc = 0;
  const segments = list.map((d, i) => {
    const len = (d.value / total) * C;
    const seg = {
      ...d,
      color: d.color || PALETTE[i % PALETTE.length],
      len,
      offset: -acc,
      share: (d.value / total) * 100,
    };
    acc += len;
    return seg;
  });

  return (
    <div className="donutwrap">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={centerLabel || "สัดส่วนยอดเบิกจ่าย"}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--surface2)"
          strokeWidth={STROKE}
        />
        {segments.map((s) => (
          <circle
            key={s.key || s.label}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${s.len} ${C - s.len}`}
            strokeDashoffset={s.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ))}
      </svg>

      <div className="donutlegend">
        <div className="donuttotal">
          <span className="lab">{centerLabel || "ยอดรวม"}</span>
          <b>{fmtv(total)}</b>
          {u ? <span className="unit">{u}</span> : null}
        </div>
        <table>
          <tbody>
            {segments.map((s) => (
              <tr key={s.key || s.label}>
                <td style={{ width: 18 }}>
                  <i className="swatch" style={{ background: s.color }} />
                </td>
                <td className="small">{s.label}</td>
                <td className="num small nowrap">{fmtv(s.value)}</td>
                <td className="num small muted nowrap">{pct(s.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
