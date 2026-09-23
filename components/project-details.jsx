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

/* แท็บ "รายละเอียดโครงการ" ในลิ้นชัก — สองส่วน

   1. การเชื่อมโยง ESG / SDGs  (ข้อเสนอในโค้ด + ที่เจ้าหน้าที่ยืนยันในฐานข้อมูล)
   2. รายละเอียดจากแบบฟอร์ม ฝยศ.1 ที่นำเข้ามาจากไฟล์คำของบประมาณใน Google Drive

   ⚠️ โหลดข้อมูลส่วนที่ 2 ตอนเปิดแท็บเท่านั้น ไม่โหลดรวมไปกับ store ตอนเข้าเว็บ
   เพราะเนื้อหาทั้งหมดรวมกันหลายเมกะไบต์ ถ้าโหลดทุกครั้งที่เปิดเว็บจะช้าโดยเปล่าประโยชน์
   คนส่วนใหญ่เปิดดูแค่ไม่กี่โครงการ

   ข้อมูลส่วนนี้อยู่ในฐานข้อมูลที่อ่านได้เฉพาะคนล็อกอิน ไม่ได้ฝังมากับโค้ด
   เพราะเป็นเอกสารภายใน (ดูหมายเหตุในตาราง project_details ใน supabase/schema.sql) */

const SECTIONS = [
  ["rationale", "หลักการและเหตุผล"],
  ["objectives", "วัตถุประสงค์"],
  ["results", "ผลผลิต / ผลลัพธ์"],
  ["indicators", "ตัวชี้วัดผลผลิต / ผลลัพธ์"],
  ["stakeholders", "กลุ่มผู้มีส่วนได้ส่วนเสีย"],
  ["benefits", "ประโยชน์ที่คาดว่าจะได้รับ"],
];

function person(p) {
  if (!p) return "";
  const name = (p.name || "").trim();
  const pos = (p.position || "").trim();
  if (name && pos) return name + " · " + pos;
  return name || pos;
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
            <b>ยังเป็นข้อเสนอ ไม่ใช่ข้อมูลทางการ</b> — วิเคราะห์จากชื่อโครงการ
            ผลผลิต และผลลัพธ์ในไฟล์แผน ให้เจ้าหน้าที่ตรวจและยืนยันที่{" "}
            <Link href="/plan-edit">แก้ไขแผน</Link> ก่อนนำไปอ้างอิง
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
          return (
            <div key={d.seq}>
              {docs.length > 1 || act ? (
                <div className="rsec-for">
                  เอกสารฉบับที่ {d.seq}
                  {act ? (
                    <>
                      {" "}— ของกิจกรรม <b>{act.code}</b> {act.name}
                    </>
                  ) : (
                    " — ของทั้งโครงการ"
                  )}
                </div>
              ) : null}

              <Sec title="ข้อมูลคำของบประมาณ" hint="ตามที่หน่วยงานกรอกในแบบฟอร์ม ฝยศ.1">
                <dl className="dl" style={{ marginBottom: 0 }}>
                  {f.name ? (
                    <>
                      <dt>ชื่อในแบบฟอร์ม</dt>
                      <dd>{f.name}</dd>
                    </>
                  ) : null}
                  {f.program ? (
                    <>
                      <dt>แผนงาน</dt>
                      <dd>{f.program}</dd>
                    </>
                  ) : null}
                  {f.fund ? (
                    <>
                      <dt>แหล่งงบประมาณ</dt>
                      <dd>{f.fund}</dd>
                    </>
                  ) : null}
                  {f.budget ? (
                    <>
                      <dt>งบที่ขอ</dt>
                      <dd>{money(f.budget)} บาท</dd>
                    </>
                  ) : null}
                  {f.ptype ? (
                    <>
                      <dt>ประเภทโครงการ</dt>
                      <dd>{f.ptype}</dd>
                    </>
                  ) : null}
                  {f.period ? (
                    <>
                      <dt>ระยะเวลาดำเนินการ</dt>
                      <dd>{f.period}</dd>
                    </>
                  ) : null}
                  {f.place ? (
                    <>
                      <dt>สถานที่ดำเนินโครงการ</dt>
                      <dd>{f.place}</dd>
                    </>
                  ) : null}
                  {f.org ? (
                    <>
                      <dt>ส่วนงานผู้รับผิดชอบ</dt>
                      <dd>{f.org}</dd>
                    </>
                  ) : null}
                  {f.activities ? (
                    <>
                      <dt>กิจกรรมในคำขอ</dt>
                      <dd>{f.activities}</dd>
                    </>
                  ) : null}
                  {/* เก็บแค่ชื่อกับตำแหน่ง ไม่เก็บเบอร์โทรตามที่ตกลงไว้ */}
                  {person(f.owner) ? (
                    <>
                      <dt>ผู้รับผิดชอบโครงการ</dt>
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

              {SECTIONS.filter(([k]) => f[k]).map(([k, label]) => (
                <Sec key={k} title={label}>
                  <div className="longtext">{f[k]}</div>
                </Sec>
              ))}

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
