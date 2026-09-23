"use client";

/* กล่องหัวข้อมีเลขข้อ — ใช้ในหน้าที่ต้องทำตามลำดับ (รายงานผล · รายงานงบประมาณ)
   หัวกล่องบอกว่าข้อนี้คืออะไร ต้องทำอะไร และมีช่องมุมขวาไว้ใส่ป้ายสรุป

   state (ไม่ใส่ก็ได้) บอกว่าข้อนี้อยู่ตรงไหนของลำดับงาน
     "done" เสร็จแล้ว   วงกลมเป็นสีเขียวมีเครื่องหมายถูก
     "now"  ต้องทำข้อนี้ กรอบเน้นสี + ป้าย "ทำข้อนี้"
     "todo" ยังไม่ถึง    วงกลมสีเทา
   ไม่ใส่ = หน้าตาปกติ ไม่บอกลำดับ (หน้ารายงานผลใช้แบบนี้ เพราะกรอกข้อไหนก่อนก็ได้)

   ⚠️ ต้องเป็นคอมโพเนนต์ระดับไฟล์แบบนี้เท่านั้น ห้ามย้ายไปประกาศในตัวคอมโพเนนต์อื่น
   ถ้าประกาศข้างใน React จะเห็นเป็นชนิดใหม่ทุกครั้งที่วาด แล้วรื้อทุกช่องในกล่อง
   สร้างใหม่ ช่องที่กำลังพิมพ์จะหลุดโฟกัสหลังพิมพ์ทุกตัวอักษร */
export default function Sec({ no, title, hint, right, state, id, children }) {
  return (
    /* คลาสมีคำนำหน้า is- เพราะ globals.css มี .now อยู่แล้ว (ตัวหนา + pre-line
       ของค่าใหม่ในตารางเทียบก่อน/หลัง) ถ้าใช้ชื่อตรง ๆ ทั้งกล่องจะหนาตาม */
    <section className={"rsec" + (state ? " is-" + state : "")} id={id}>
      <header className="rsec-head">
        {/* ไม่ใส่ no = กล่องแบ่งเนื้อหาเฉย ๆ ไม่ใช่ขั้นตอนที่ต้องทำตามลำดับ
            (หน้าที่ดูอย่างเดียวใช้แบบนี้ จะได้ไม่มีเลขข้อลวงว่าต้องกรอกอะไร) */}
        {no ? (
          <span className="rsec-no" aria-hidden="true">
            {state === "done" ? "✓" : no}
          </span>
        ) : null}
        <div className="rsec-titles">
          <h4 className="rsec-title">
            {no ? (
              <span className="sr-only">
                ข้อ {no}
                {state === "done" ? " (เสร็จแล้ว) " : state === "now" ? " (ทำข้อนี้) " : " "}
              </span>
            ) : null}
            {title}
            {state === "now" ? (
              <span className="rsec-tag" aria-hidden="true">
                ทำข้อนี้
              </span>
            ) : null}
          </h4>
          {hint ? <div className="rsec-hint">{hint}</div> : null}
        </div>
        {right ? <div className="rsec-right">{right}</div> : null}
      </header>
      <div className="rsec-body">{children}</div>
    </section>
  );
}
