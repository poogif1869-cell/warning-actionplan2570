"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useResults } from "@/lib/store";
import { esgOf } from "@/lib/esg-sdg";
import { money } from "@/lib/format";
import { byUid } from "@/lib/plan";
import EsgBadges from "@/components/esg-badges";
import Sec from "@/components/sec";

/* แท็บ "รายละเอียดโครงการ" ในลิ้นชัก — สามส่วน

   1. ข้อมูลหลักตามแผน (ตัวชี้วัด งบประมาณ ผู้รับผิดชอบ) — **ยึดอันนี้เป็นหลัก**
   2. การเชื่อมโยง ESG / SDGs
   3. เนื้อหาจากแบบฟอร์ม ฝยศ.1 (หลักการและเหตุผล วัตถุประสงค์ ประโยชน์ ฯลฯ)

   ⚠️ **ไฟล์ ฝยศ.1 คือคำขอ ไม่ใช่แผนที่อนุมัติแล้ว** ตัวเลขหลายตัวในเอกสาร
   (งบที่ขอ ตัวชี้วัด ผู้รับผิดชอบ) จึงไม่ตรงกับแผนที่ใช้จริงในเว็บ
   ตามที่ผู้ใช้สั่งไว้: ให้ยึดข้อมูลในเว็บเป็นหลักเสมอ ส่วนของเอกสารแสดงเป็น
   "ข้อมูลในเอกสาร" และถ้าต่างกันให้ขึ้นแถบเตือนให้เห็นว่าต่างตรงไหน
   ไม่ใช่เอาค่าจากเอกสารไปทับหรือแสดงปนกันจนแยกไม่ออกว่าอันไหนของจริง

   ⚠️ โหลดเนื้อหาส่วนที่ 3 ตอนเปิดแท็บเท่านั้น ไม่โหลดรวมไปกับ store ตอนเข้าเว็บ
   เพราะรวมกันหลายเมกะไบต์ คนส่วนใหญ่เปิดดูแค่ไม่กี่โครงการ
   ข้อมูลอยู่ในฐานข้อมูลที่อ่านได้เฉพาะคนล็อกอิน ไม่ได้ฝังมากับโค้ด
   (ดูหมายเหตุตาราง project_details ใน supabase/schema.sql) */

/* ส่วนที่เอกสารมีแต่แผนไม่มี — เป็นเนื้อหาที่ทำให้แท็บนี้มีประโยชน์จริง */
const SECTIONS = [
  ["rationale", "หลักการและเหตุผล"],
  ["objectives", "วัตถุประสงค์"],
  ["benefits", "ประโยชน์ที่คาดว่าจะได้รับ"],
  ["stakeholders", "กลุ่มผู้มีส่วนได้ส่วนเสีย"],
];

function person(p) {
  if (!p) return "";
  const name = (p.name || "").trim();
  const pos = (p.position || "").trim();
  if (name && pos) return name + " · " + pos;
  return name || pos;
}

/* ตัดช่องว่างและอักขระที่ไม่ใช่ตัวอักษรออกก่อนเทียบ — เอกสารกับไฟล์แผน
   พิมพ์เว้นวรรคไม่เหมือนกันบ่อยมาก ถ้าเทียบตรง ๆ จะขึ้นว่า "ต่างกัน" เกือบทุกโครงการ */
const norm = (s) => String(s == null ? "" : s).replace(/[\s\.\,\(\)\-–—:;]/g, "");

function same(a, b) {
  return norm(a) === norm(b);
}

/* เอกสารเขียนตัวชี้วัดเป็นย่อหน้ายาว "ผลผลิต (Output) : … ผลลัพธ์ (Outcome) : …"
   ส่วนไฟล์แผนเก็บเฉพาะตัวข้อความตัวชี้วัด ถ้าเทียบให้ตรงเป๊ะจะขึ้นว่าต่างกัน
   แทบทุกโครงการทั้งที่เนื้อความเดียวกัน — ถือว่าตรงกันถ้าเอกสารครอบข้อความของแผนไว้ */
function covers(docText, planText) {
  if (!planText) return true;
  return norm(docText).includes(norm(planText));
}

export default function ProjectDetails({ item }) {
  const { esg, hasEsgTable, personName } = useResults();
  const [docs, setDocs] = useState(null); // null = กำลังโหลด
  const [err, setErr] = useState("");

  /* รายละเอียดผูกกับ "โครงการ" เสมอ ถ้าลิ้นชักเปิดเป็นกิจกรรม ให้ไต่ขึ้นไปหาแม่
     (เอกสาร ฝยศ.1 หนึ่งฉบับคือคำขอของทั้งโครงการ หรือของกิจกรรมหนึ่งในโครงการนั้น) */
  let top = item;
  while (top._parent) top = top._parent;

  useEffect(() => {
    let alive = true;
    setDocs(null);
    setErr("");

    (async () => {
      const res = await getSupabase()
        .from("project_details")
        .select("uid,seq,act_uid,source,data,updated_at")
        .eq("uid", top.uid)
        .order("seq", { ascending: true });

      if (!alive) return;
      if (res.error) {
        // ตารางยังไม่มี = ยังไม่ได้รัน schema.sql หรือยังไม่ได้นำเข้า ไม่ใช่ความผิดของผู้ใช้
        setErr(res.error.message || "อ่านข้อมูลไม่สำเร็จ");
        setDocs([]);
        return;
      }
      setDocs(res.data || []);
    })();

    return () => {
      alive = false;
    };
  }, [top.uid]);

  const link = esgOf(top.uid, esg[top.uid]);
  const who = personName(link.updatedBy);

  return (
    <>
      {/* ================= 1. ข้อมูลหลักตามแผน ================= */}
      <Sec
        title="ข้อมูลหลักตามแผนปฏิบัติการ"
        hint="ยึดข้อมูลชุดนี้เป็นหลักเสมอ — เป็นตัวเลขที่ผ่านการอนุมัติและใช้คำนวณทุกหน้าในเว็บ"
        right={<span className="pill ok">ข้อมูลจริง</span>}
      >
        <dl className="dl" style={{ marginBottom: 0 }}>
          <dt>รหัส / ชื่อโครงการ</dt>
          <dd>
            <b>{top.code}</b> {top.name}
          </dd>
          <dt>ตัวชี้วัดผลผลิต</dt>
          <dd>{top.output || "–"}</dd>
          <dt>ตัวชี้วัดผลลัพธ์</dt>
          <dd>{top.outcome || "–"}</dd>
          <dt>งบประมาณที่ได้รับจัดสรร</dt>
          <dd>{money(top.budget)} บาท</dd>
          <dt>ผู้รับผิดชอบ</dt>
          <dd>{top.org || "–"}</dd>
          <dt>แหล่งงบประมาณ</dt>
          <dd>{top.fund || "–"}</dd>
          {top.period ? (
            <>
              <dt>ระยะเวลาดำเนินการ</dt>
              <dd>{top.period}</dd>
            </>
          ) : null}
        </dl>
      </Sec>

      {/* ================= 2. ESG / SDGs ================= */}
      <Sec
        title="การเชื่อมโยง ESG และ SDGs"
        hint="แก้ไขได้ที่หน้าแก้ไขแผน → เชื่อมโยง ESG/SDGs"
        right={
          <span
            className={
              "pill " +
              (link.source === "ยืนยันแล้ว" ? "ok" : link.source === "ยังไม่มี" ? "none" : "warn")
            }
          >
            {link.source}
          </span>
        }
      >
        <EsgBadges esg={link.esg} sdg={link.sdg} />

        {link.why ? (
          <div className="small" style={{ marginTop: 10 }}>
            <b>เหตุผล:</b> {link.why}
          </div>
        ) : null}

        {/* บอกให้ชัดว่าอันไหนเป็นของทางการ อันไหนเป็นข้อเสนอของระบบ
            ไม่งั้นคนจะเอาไปใช้อ้างอิงทั้งที่ยังไม่มีใครตรวจ */}
        {link.source === "ข้อเสนอ" ? (
          <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>
            <b>ยังเป็นข้อเสนอ ไม่ใช่ข้อมูลทางการ</b> — วิเคราะห์จาก
            {link.basis === "ฝยศ.1"
              ? "วัตถุประสงค์ ผลผลิต/ผลลัพธ์ และประโยชน์ที่คาดว่าจะได้รับ ในแบบฟอร์ม ฝยศ.1 ของโครงการนี้"
              : "ชื่อโครงการและตัวชี้วัดในไฟล์แผน เพราะโครงการนี้ยังไม่มีเอกสาร ฝยศ.1 ในระบบ"}{" "}
            · ให้เจ้าหน้าที่ตรวจและยืนยันที่ <Link href="/plan-edit">แก้ไขแผน</Link> ก่อนนำไปอ้างอิง
          </div>
        ) : null}

        {link.source === "ยังไม่มี" ? (
          <div className="small muted" style={{ marginTop: 10 }}>
            โครงการนี้เพิ่มเข้ามาภายหลัง จึงยังไม่มีข้อเสนอการเชื่อมโยง —
            เลือกเองได้ที่หน้าแก้ไขแผน
          </div>
        ) : null}

        {link.updatedAt ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            แก้ล่าสุดเมื่อ {new Date(link.updatedAt).toLocaleString("th-TH")}
            {who ? " โดย " + who : ""}
          </div>
        ) : null}

        {!hasEsgTable ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            ฐานข้อมูลยังไม่มีตาราง <code>project_esg</code> — แสดงได้แค่ข้อเสนอ
            ให้ผู้ดูแลรัน <code>supabase/schema.sql</code> ก่อนจึงจะยืนยันได้
          </div>
        ) : null}
      </Sec>

      {/* ================= 3. เนื้อหาจากแบบฟอร์ม ฝยศ.1 ================= */}
      {docs === null ? (
        <div className="muted">กำลังโหลดรายละเอียดโครงการ…</div>
      ) : docs.length === 0 ? (
        <div className="banner">
          <b>ยังไม่มีรายละเอียดจากแบบฟอร์ม ฝยศ.1 ของโครงการนี้</b> —
          รายละเอียดนำเข้าจากไฟล์คำของบประมาณใน Google Drive เป็นรอบ ๆ
          {err ? " (" + err + ")" : ""}
        </div>
      ) : (
        docs.map((d) => {
          const f = d.data || {};
          const act = d.act_uid ? byUid.get(d.act_uid) : null;

          /* เทียบกับ "รายการที่เอกสารฉบับนี้เป็นของ" คือกิจกรรมถ้าเป็นเอกสารรายกิจกรรม
             ไม่งั้นงบของกิจกรรมเดียวจะถูกเทียบกับงบทั้งโครงการแล้วขึ้นว่าไม่ตรงทุกฉบับ

             เตือนเฉพาะ "งบประมาณ" เท่านั้น เพราะเป็นตัวเลขที่เทียบแล้วเห็นชัดว่าต่าง
             ส่วนผู้รับผิดชอบกับตัวชี้วัดต่างกันเกือบทุกฉบับด้วยวิธีเขียน เช่น
             "ฝกม./กคบ.1/กคบ.2" กับ "ฝกม./กคบ.1 และ กคบ.2" ซึ่งคือหน่วยงานเดียวกัน
             ถ้าขึ้นเตือนทุกจุดแถบเตือนจะกลายเป็นสิ่งที่ทุกคนเลื่อนผ่าน
             จึงบอกกติกาไว้บรรทัดเดียวว่าให้ยึดข้อมูลหลักด้านบน แล้วโชว์ของในเอกสาร
             ไว้ในหัวข้อ "ข้อมูลประกอบในเอกสาร" แบบสีจาง ให้รู้ว่าเป็นของเอกสาร */
          const ref = act || top;
          const budgetDiff =
            f.budget && Number(f.budget) !== Number(ref.budget || 0)
              ? { plan: ref.budget || 0, doc: Number(f.budget) }
              : null;
          const kpiDiff = Boolean(f.results && ref.output && !covers(f.results, ref.output));
          const orgDiff = Boolean(f.org && !same(f.org, ref.org));

          return (
            <div key={d.seq}>
              <div className="rsec-for">
                เอกสารคำของบประมาณ (ฝยศ.1) ฉบับที่ {d.seq}
                {act ? (
                  <>
                    {" "}— ของกิจกรรม <b>{act.code}</b> {act.name}
                  </>
                ) : (
                  " — ของทั้งโครงการ"
                )}
              </div>

              {/* เอกสารคือ "คำขอ" ตัวเลขจึงเป็นของก่อนอนุมัติ ต่างจากแผนได้เป็นปกติ */}
              <div className="small muted" style={{ margin: "-6px 0 12px" }}>
                เอกสารนี้คือ <b>คำของบประมาณก่อนอนุมัติ</b> — ตัวชี้วัด งบประมาณ
                และผู้รับผิดชอบ <b>ให้ยึดข้อมูลหลักตามแผนด้านบน</b> ส่วนด้านล่างคือ
                เหตุผลและรายละเอียดที่หน่วยงานเขียนไว้ในคำขอ
                {kpiDiff || orgDiff
                  ? " (ฉบับนี้เขียน" +
                    [kpiDiff ? "ตัวชี้วัด" : "", orgDiff ? "ผู้รับผิดชอบ" : ""]
                      .filter(Boolean)
                      .join("และ") +
                    "ไว้ไม่เหมือนแผน)"
                  : ""}
              </div>

              {budgetDiff ? (
                <div className="banner" style={{ marginTop: 0 }}>
                  <b>งบในเอกสารไม่เท่ากับงบตามแผน</b> — ตามแผน{" "}
                  <b>{money(budgetDiff.plan)} บาท</b> (ยึดอันนี้) · ในเอกสารขอไว้{" "}
                  {money(budgetDiff.doc)} บาท
                  {budgetDiff.doc > budgetDiff.plan ? " (ถูกปรับลดตอนอนุมัติ)" : ""}
                </div>
              ) : null}

              {SECTIONS.filter(([k]) => f[k]).map(([k, label]) => (
                <Sec key={k} title={label}>
                  <div className="longtext">{f[k]}</div>
                </Sec>
              ))}

              {/* ช่องประกอบอื่นของเอกสาร — ไม่ใช่ตัวเลขที่ใช้คำนวณ จึงแสดงได้ตามที่เขียนมา */}
              <Sec title="ข้อมูลประกอบในเอกสาร" hint="ตามที่หน่วยงานกรอกไว้ในแบบฟอร์ม ฝยศ.1">
                <dl className="dl" style={{ marginBottom: 0 }}>
                  {f.place ? (
                    <>
                      <dt>สถานที่ดำเนินโครงการ</dt>
                      <dd>{f.place}</dd>
                    </>
                  ) : null}
                  {f.period ? (
                    <>
                      <dt>ระยะเวลาในเอกสาร</dt>
                      <dd>{f.period}</dd>
                    </>
                  ) : null}
                  {f.ptype ? (
                    <>
                      <dt>ประเภทโครงการ</dt>
                      <dd>{f.ptype}</dd>
                    </>
                  ) : null}
                  {f.program ? (
                    <>
                      <dt>แผนงาน</dt>
                      <dd>{f.program}</dd>
                    </>
                  ) : null}
                  {f.activities ? (
                    <>
                      <dt>กิจกรรมในคำขอ</dt>
                      <dd>{f.activities}</dd>
                    </>
                  ) : null}
                  {f.indicators ? (
                    <>
                      <dt>ตัวชี้วัดที่เขียนในเอกสาร</dt>
                      <dd className="muted">{f.indicators}</dd>
                    </>
                  ) : null}
                  {/* เก็บแค่ชื่อกับตำแหน่ง ไม่เก็บเบอร์โทรตามที่ตกลงไว้ */}
                  {person(f.owner) ? (
                    <>
                      <dt>ผู้รับผิดชอบตามเอกสาร</dt>
                      <dd>{person(f.owner)}</dd>
                    </>
                  ) : null}
                  {person(f.coordinator) ? (
                    <>
                      <dt>ผู้ประสานงาน</dt>
                      <dd>{person(f.coordinator)}</dd>
                    </>
                  ) : null}
                </dl>
              </Sec>

              <div className="small muted" style={{ margin: "-6px 0 16px" }}>
                ที่มา: {d.source}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
