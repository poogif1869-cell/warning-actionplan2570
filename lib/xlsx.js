/* =====================================================================
   สร้างไฟล์ Excel (.xlsx) เองทั้งหมด ไม่ใช้ไลบรารี

   ทำไมต้องเขียนเอง: เครื่องที่พัฒนาไม่มี Node.js จึงลง dependency ไม่ได้
   (ดู README) จะใช้ SheetJS หรือ ExcelJS ไม่ได้เลย

   ทำไมไม่ใช้ CSV: Excel เปิด CSV ภาษาไทยเพี้ยนถ้าไม่มี BOM และต่อให้ใส่ BOM
   ก็ยังไม่มีหลายชีต ไม่มีความกว้างคอลัมน์ ไม่มีการแยกตัวเลขกับข้อความ

   ทำไมไม่ใช้ SpreadsheetML (.xls แบบ XML): Excel รุ่นใหม่ขึ้นคำเตือน
   "รูปแบบไฟล์กับนามสกุลไม่ตรงกัน" ทุกครั้งที่เปิด ดูเหมือนไฟล์เสีย

   .xlsx จริง ๆ คือไฟล์ ZIP ที่ข้างในเป็น XML ไม่กี่ไฟล์ จึงเขียนเองได้
   โดยใช้ ZIP แบบ "stored" (ไม่บีบอัด) — ไม่ต้องมีตัวบีบอัด ไฟล์ใหญ่ขึ้นบ้าง
   แต่ตารางไม่กี่พันแถวก็ยังไม่กี่ร้อย KB

   ⚠️ โครงสร้าง ZIP ในไฟล์นี้ทดสอบแล้วด้วยการวางไบต์แบบเดียวกันใน PowerShell
   แล้วให้ System.IO.Compression.ZipFile เปิดอ่าน ผ่านทั้ง 5 ไฟล์
   ถ้าจะแก้ลำดับฟิลด์ใน header ต้องทดสอบซ้ำแบบเดียวกัน
   ===================================================================== */

/* ---------------------------------------------------------------------
   CRC32 — ZIP บังคับให้มี ไม่งั้นโปรแกรมแตกไฟล์จะบอกว่าไฟล์เสีย
   สร้างตารางครั้งเดียวตอนเรียกใช้ครั้งแรก
   --------------------------------------------------------------------- */
let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------------------------------------------------------------
   ตัวช่วยเขียนไบต์แบบ little-endian ตามที่ ZIP กำหนด
   --------------------------------------------------------------------- */
function pushU16(out, v) {
  out.push(v & 0xff, (v >>> 8) & 0xff);
}

function pushU32(out, v) {
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

function pushBytes(out, bytes) {
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
}

const utf8 = (s) => new TextEncoder().encode(s);

/* ---------------------------------------------------------------------
   ประกอบไฟล์ ZIP แบบ stored (method 0)

   files = [{ name, data: Uint8Array }] — ลำดับสำคัญ ต้องเขียน local header
   ตามลำดับนี้แล้วจด offset ไว้ใส่ใน central directory ท้ายไฟล์
   --------------------------------------------------------------------- */
function zipStore(files) {
  const out = [];
  const central = [];
  const offsets = [];

  files.forEach((f) => {
    const nameBytes = utf8(f.name);
    const crc = crc32(f.data);
    offsets.push(out.length);

    pushU32(out, 0x04034b50); // ลายเซ็น local file header
    pushU16(out, 20); // เวอร์ชันที่ต้องใช้แตกไฟล์
    pushU16(out, 0x0800); // ธง: ชื่อไฟล์เป็น UTF-8
    pushU16(out, 0); // วิธีบีบอัด 0 = เก็บดิบ
    pushU16(out, 0); // เวลาแก้ไข
    pushU16(out, 0x21); // วันที่แก้ไข (1 ม.ค. 1980 ค่าต่ำสุดที่ ZIP เก็บได้)
    pushU32(out, crc);
    pushU32(out, f.data.length); // ขนาดหลังบีบอัด = ขนาดจริง เพราะไม่ได้บีบ
    pushU32(out, f.data.length);
    pushU16(out, nameBytes.length);
    pushU16(out, 0); // ความยาวส่วนเสริม
    pushBytes(out, nameBytes);
    pushBytes(out, f.data);
  });

  files.forEach((f, i) => {
    const nameBytes = utf8(f.name);
    const crc = crc32(f.data);

    pushU32(central, 0x02014b50); // ลายเซ็น central directory
    pushU16(central, 20); // เวอร์ชันที่สร้าง
    pushU16(central, 20); // เวอร์ชันที่ต้องใช้
    pushU16(central, 0x0800);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0x21);
    pushU32(central, crc);
    pushU32(central, f.data.length);
    pushU32(central, f.data.length);
    pushU16(central, nameBytes.length);
    pushU16(central, 0); // ส่วนเสริม
    pushU16(central, 0); // คำอธิบาย
    pushU16(central, 0); // หมายเลขแผ่น
    pushU16(central, 0); // คุณสมบัติภายใน
    pushU32(central, 0); // คุณสมบัติภายนอก
    pushU32(central, offsets[i]);
    pushBytes(central, nameBytes);
  });

  const cdOffset = out.length;
  pushBytes(out, central);

  pushU32(out, 0x06054b50); // ลายเซ็น end of central directory
  pushU16(out, 0);
  pushU16(out, 0);
  pushU16(out, files.length);
  pushU16(out, files.length);
  pushU32(out, central.length);
  pushU32(out, cdOffset);
  pushU16(out, 0); // ความยาวคำอธิบายท้ายไฟล์

  return new Uint8Array(out);
}

/* ---------------------------------------------------------------------
   หนีอักขระที่ XML ห้ามมีดิบ ๆ

   ตัดอักขระควบคุมทิ้งด้วย เพราะข้อมูลที่ผู้ใช้พิมพ์อาจมีติดมาจากการ
   คัดลอกวาง แล้ว Excel จะฟ้องว่าไฟล์เสียโดยไม่บอกว่าเพราะอะไร
   --------------------------------------------------------------------- */
function esc(s) {
  const src = String(s == null ? "" : s);
  let out = "";

  /* ตัดอักขระควบคุมที่ XML 1.0 ไม่ยอมรับ เหลือไว้แค่ tab ขึ้นบรรทัด และปัดแคร่
     ข้อมูลที่ผู้ใช้คัดลอกวางมามักมีอักขระพวกนี้ติดมา แล้ว Excel จะฟ้องว่า
     ไฟล์เสียโดยไม่บอกสาเหตุ

     ไล่ทีละตัวอักษรแทนการใช้ regex ที่มี \x escape โดยตั้งใจ
     เพราะ escape พวกนั้นถูกเครื่องมือแก้ข้อความแปลงกลับเป็นอักขระควบคุมจริง
     ในซอร์สได้ง่ายมาก แล้วจะกลายเป็นไฟล์ที่อ่านไม่ออกและแก้ต่อไม่ได้ */
  for (let i = 0; i < src.length; i++) {
    const code = src.charCodeAt(i);
    if (code >= 32 || code === 9 || code === 10 || code === 13) out += src[i];
  }

  return out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ชื่อคอลัมน์ Excel: 1 -> A, 27 -> AA */
function colName(n) {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/* ชื่อชีตที่ Excel ยอมรับ: ห้ามอักขระ : \ / ? * [ ] และยาวไม่เกิน 31 */
function safeSheetName(name, fallback) {
  const s = String(name || fallback || "Sheet1")
    .replace(/[:\\/?*[\]]/g, " ")
    .trim()
    .slice(0, 31);
  return s || fallback || "Sheet1";
}

/* ตัวเลขล้วนหรือเปล่า — ถ้าใช่เขียนเป็นตัวเลขให้ Excel คำนวณต่อได้
   ค่าที่เป็นข้อความอย่างรหัสโครงการ "010109" ต้องคงศูนย์นำหน้าไว้
   จึงเช็คว่า Number(...) แปลงกลับแล้วได้ข้อความเดิมเป๊ะไหม */
function isNumeric(v) {
  if (typeof v === "number") return isFinite(v);
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return isFinite(Number(s)) && String(Number(s)) === s;
}

function sheetXml(rows, widths) {
  const cols = widths && widths.length
    ? "<cols>" +
      widths
        .map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>')
        .join("") +
      "</cols>"
    : "";

  const body = rows
    .map((row, r) => {
      const cells = (row || [])
        .map((v, c) => {
          const ref = colName(c + 1) + (r + 1);
          if (v == null || v === "") return "";
          if (isNumeric(v)) return '<c r="' + ref + '"><v>' + Number(v) + "</v></c>";
          return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
        })
        .join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    cols +
    "<sheetData>" +
    body +
    "</sheetData></worksheet>"
  );
}

/* ---------------------------------------------------------------------
   สร้างสมุดงานจากชีตหลายแผ่น

   sheets = [{ name, rows: [[...], ...], widths?: [number, ...] }]
   คืน Blob พร้อมดาวน์โหลด
   --------------------------------------------------------------------- */
export function buildXlsx(sheets) {
  const list = (sheets || []).filter((s) => s && Array.isArray(s.rows));
  if (!list.length) throw new Error("ไม่มีข้อมูลสำหรับสร้างไฟล์ Excel");

  const names = list.map((s, i) => safeSheetName(s.name, "แผ่น" + (i + 1)));

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    list
      .map(
        (s, i) =>
          '<Override PartName="/xl/worksheets/sheet' +
          (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      )
      .join("") +
    "</Types>";

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names
      .map(
        (n, i) =>
          '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'
      )
      .join("") +
    "</sheets></workbook>";

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list
      .map(
        (s, i) =>
          '<Relationship Id="rId' +
          (i + 1) +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
          (i + 1) +
          '.xml"/>'
      )
      .join("") +
    "</Relationships>";

  const files = [
    { name: "[Content_Types].xml", data: utf8(contentTypes) },
    { name: "_rels/.rels", data: utf8(rootRels) },
    { name: "xl/workbook.xml", data: utf8(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(workbookRels) },
  ];

  list.forEach((s, i) => {
    files.push({
      name: "xl/worksheets/sheet" + (i + 1) + ".xml",
      data: utf8(sheetXml(s.rows, s.widths)),
    });
  });

  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* สั่งดาวน์โหลดไฟล์ — ตั้งชื่อไฟล์ให้สื่อความหมาย พร้อมวันที่กำกับ */
export function downloadXlsx(fileName, sheets) {
  const blob = buildXlsx(sheets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.replace(/\.xlsx$/i, "") + ".xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // ปล่อย URL ทีหลัง ถ้าปล่อยทันทีบางเบราว์เซอร์ยังโหลดไม่เสร็จ
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
