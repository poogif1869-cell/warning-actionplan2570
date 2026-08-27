/* รูปแบบตัวเลขไทย — ยกมาจากเว็บเดิม (build/template.html) เพื่อให้ตัวเลขแสดงเหมือนกันทุกที่ */

const nf0 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = (n) => (n === 0 || n ? nf0.format(n) : "–");
export const fmt2 = (n) => (n === 0 || n ? nf2.format(n) : "–");
export const money = (n) => (!n ? "–" : nf0.format(Math.round(n)));
export const mb = (n) => (!n ? "–" : nf2.format(n / 1e6)); // ล้านบาท
export const pct = (n) => (n === 0 || n ? nf2.format(n) + "%" : "–");

/* แปลงค่าที่ผู้ใช้พิมพ์ (อาจมีลูกน้ำคั่นหลักพัน) เป็นตัวเลข */
export function toNum(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
}
