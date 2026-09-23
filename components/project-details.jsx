"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useResults } from "@/lib/store";
import { esgOf, ESG_BY_KEY, SDG_BY_NO } from "@/lib/esg-sdg";
import { money } from "@/lib/format";
import { byUid } from "@/lib/plan";
import Sec from "@/components/sec";

/* แท็บ "รายละเอียดโครงการ" — รวมทุกอย่างของโครงการไว้หน้าเดียว แบ่งเป็นหัวข้อ

   1. ข้อมูลตามแผนปฏิบัติการ  ตัวชี้วัด งบ ผู้รับผิดชอบ — **ยึดชุดนี้เป็นหลัก**
   2. ความเชื่อมโยงแผน        แผนระดับบน + ESG + SDGs (บอกรายข้อว่าเข้าข้อไหนเพราะอะไร)
   3. กิจกรรมภายใต้โครงการ
   4. รายละเอียดจากคำของบประมาณ (ฝยศ.1)

   เดิมแยกเป็นสองแท็บ (ตามแผน / ฝยศ.1) คนต้องสลับไปมาเพื่อดูโครงการเดียวกัน
   และไม่รู้ว่าตัวเลขสองชุดต่างกันตรงไหน ตอนนี้อยู่หน้าเดียวเรียงตามลำดับ

   ⚠️ **ไฟล์ ฝยศ.1 คือคำขอ ไม่ใช่แผนที่อนุมัติแล้ว** ตัวเลขหลายตัวในเอกสาร
   จึงไม่ตรงกับแผนที่ใช้จริง ตามที่ผู้ใช้สั่งไว้: ยึดข้อมูลในเว็บเป็นหลักเสมอ
   ของในเอกสารแสดงแยกหัวข้อและบอกกำกับว่าเป็นของเอกสาร

   ⚠️ โหลดเนื้อหา ฝยศ.1 ตอนเปิดแท็บเท่านั้น ไม่โหลดรวมกับ store ตอนเข้าเว็บ
   เพราะรวมกันหลายเมกะไบต์ และอยู่ในฐานข้อมูลที่อ่านได้เฉพาะคนล็อกอิน */

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

  /* ---------- ข้อมูลตามแผน ---------- */
  const planRows = [
    ["รหัส", item.code],
    ["ระดับ", item.lvl === 1 ? "โครงการ" : item.lvl === 0 ? "ค่าใช้จ่ายอื่น" : "กิจกรรม"],
    ["ตัวชี้วัดผลผลิต (Output)", item.output],
    ["ตัวชี้วัดผลลัพธ์ (Outcome)", item.outcome],
    ["ตัวชี้วัดโครงการ", item.kpi],
    ["งบประมาณที่ได้รับจัดสรร", item.budget ? money(item.budget) + " บาท" : "–"],
    ["หน่วยงานรับผิดชอบ", item.org],
    ["แหล่งเงิน", item.fund],
    ["ระยะเวลา", item.period],
    ["ยุทธศาสตร์", item.strategy],
    ["กลยุทธ์", item.tactic],
    ["แผนงาน", item.program],
    ["ประเภทโครงการ", item.ptype],
    ["สาระสำคัญ", item.summary],
  ].filter(([, v]) => v != null && v !== "");

  const linkRows = [
    ["ยุทธศาสตร์ชาติ", item.nX],
    ["เป้าหมายยุทธศาสตร์ชาติ", item.nGoal],
    ["ประเด็นแผนแม่บทฯ", item.nY],
    ["แผนย่อยของแผนแม่บทฯ", item.nSub],
    ["เป้าหมายแผนย่อย", item.nSubGoal],
    ["ประเด็น แผนปฏิบัติราชการ กษ.", item.mIssue],
    ["แนวทาง แผนปฏิบัติราชการ กษ.", item.mWay],
  ].filter(([, v]) => v != null && v !== "");

  const kids = item._kids || [];

  return (
    <>
      {/* ================= 1. ข้อมูลหลักตามแผน ================= */}
      <Sec
        title="ข้อมูลตามแผนปฏิบัติการ"
        hint="ยึดชุดนี้เป็นหลักเสมอ — เป็นตัวเลขที่อนุมัติแล้วและใช้คำนวณทุกหน้าในเว็บ"
        right={<span className="pill ok">ข้อมูลจริง</span>}
      >
        {!item._added && item.baseBudget != null && item.baseBudget !== item.budget ? (
          <div className="banner" style={{ marginTop: 0 }}>
            <b>งบประมาณถูกแก้จากแผนเดิม</b> — แผนเดิม {money(item.baseBudget)} บาท
            ปัจจุบัน {money(item.budget)} บาท · ดูที่มาได้ที่{" "}
            <Link href="/changes">ถังการแก้ไขข้อมูล</Link>
          </div>
        ) : null}

        {item._added ? (
          <div className="banner ok" style={{ marginTop: 0 }}>
            รายการนี้ <b>เพิ่มเข้ามาภายหลัง</b> ไม่ได้อยู่ในไฟล์แผนต้นฉบับ —
            ดูมติที่อ้างถึงได้ที่ <Link href="/changes">ถังการแก้ไขข้อมูล</Link>
          </div>
        ) : null}

        <dl className="dl" style={{ marginBottom: 0 }}>
          {planRows.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Sec>

      {/* ================= 2. ความเชื่อมโยงแผน + ESG/SDGs =================
          ESG กับ SDGs อยู่ในหัวข้อนี้ด้วย เพราะเป็นคำถามเดียวกันคือ
          "โครงการนี้ไปตอบอะไรที่ใหญ่กว่าตัวเอง" — แผนระดับบนของไทย
          และกรอบความยั่งยืนสากล ต่างกันแค่ว่าเป็นคนละกรอบ */}
      <Sec
        title="ความเชื่อมโยงแผน"
        hint="โครงการนี้ตอบแผนระดับบน ด้าน ESG และเป้าหมาย SDGs ข้อไหนบ้าง"
        right={
          <span
            className={
              "pill " +
              (link.source === "ยืนยันแล้ว" ? "ok" : link.source === "ยังไม่มี" ? "none" : "warn")
            }
          >
            ESG/SDGs: {link.source}
          </span>
        }
      >
        {linkRows.length ? (
          <>
            <div className="linklabel">แผนระดับบน</div>
            <dl className="dl">
              {linkRows.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}

        {/* ---------- ESG / SDGs ----------
            บอกเป็นรายข้อว่าเข้าข้อไหนและเพราะอะไร ไม่ใช่โชว์แค่ป้ายสีแล้วจบ */}
        <div className="linklabel">
          ด้าน ESG ที่โครงการนี้ตอบ
          <span className="small muted">
            {link.basis === "ฝยศ.1"
              ? " · วิเคราะห์จากวัตถุประสงค์ ผลผลิต/ผลลัพธ์ และประโยชน์ในคำของบประมาณของโครงการนี้"
              : link.basis
              ? " · วิเคราะห์จากชื่อโครงการและตัวชี้วัดในไฟล์แผน เพราะยังไม่มีเอกสาร ฝยศ.1"
              : ""}
          </span>
        </div>

        {link.esg.length || link.sdg.length ? (
          <>
            <ul className="esglist">
              {link.esg.map((k) => {
                const e = ESG_BY_KEY.get(k);
                if (!e) return null;
                return (
                  <li key={k} style={{ "--ec": e.color }}>
                    <span className="esgmark">{k}</span>
                    <div>
                      <b>{e.full}</b>
                      <div className="small">{link.esgWhy[k] || link.why || "—"}</div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="linklabel">เป้าหมายการพัฒนาที่ยั่งยืน (SDGs) ที่เกี่ยวข้อง</div>
            <ul className="esglist">
              {link.sdg.map((n) => {
                const s = SDG_BY_NO.get(Number(n));
                if (!s) return null;
                return (
                  <li key={n} style={{ "--ec": s.color }}>
                    <span className="esgmark">{s.no}</span>
                    <div>
                      <b>
                        SDG {s.no} · {s.short}
                      </b>
                      <div className="small muted">{s.full}</div>
                      <div className="small">{link.sdgWhy[String(n)] || link.why || "—"}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="small muted">ยังไม่ได้ระบุการเชื่อมโยง ESG/SDGs</div>
        )}

        {/* บอกให้ชัดว่าอันไหนเป็นของทางการ อันไหนเป็นข้อเสนอของระบบ
            ไม่งั้นคนจะเอาไปใช้อ้างอิงทั้งที่ยังไม่มีใครตรวจ */}
        {link.source === "ข้อเสนอ" ? (
          <div className="banner" style={{ marginTop: 14, marginBottom: 0 }}>
            <b>ESG/SDGs ยังเป็นข้อเสนอ ไม่ใช่ข้อมูลทางการ</b> —
            ให้เจ้าหน้าที่ตรวจและยืนยันที่ <Link href="/plan-edit">แก้ไขแผน</Link> →
            เชื่อมโยง ESG/SDGs ก่อนนำไปอ้างอิง (ส่วนแผนระดับบนด้านบนมาจากไฟล์แผน
            เป็นข้อมูลจริง)
          </div>
        ) : null}

        {link.source === "ยังไม่มี" ? (
          <div className="small muted" style={{ marginTop: 10 }}>
            โครงการนี้เพิ่มเข้ามาภายหลัง จึงยังไม่มีข้อเสนอการเชื่อมโยง ESG/SDGs —
            เลือกเองได้ที่หน้าแก้ไขแผน
          </div>
        ) : null}

        {link.updatedAt ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            ESG/SDGs แก้ล่าสุดเมื่อ {new Date(link.updatedAt).toLocaleString("th-TH")}
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

      {/* ================= 3. กิจกรรมภายใต้โครงการ ================= */}
      {kids.length ? (
        <Sec
          title={"กิจกรรมภายใต้โครงการ (" + kids.length + ")"}
          hint="งบของกิจกรรมรวมอยู่ในงบโครงการแม่แล้ว ไม่ต้องนำมาบวกซ้ำ"
        >
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>กิจกรรม</th>
                  <th className="num">งบประมาณ</th>
                </tr>
              </thead>
              <tbody>
                {kids.map((k) => (
                  <tr key={k.uid}>
                    <td className="small">
                      <b>{k.code}</b> {k.name}
                    </td>
                    <td className="num small">{money(k.budget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      ) : null}


      {/* ================= 5. เนื้อหาจากแบบฟอร์ม ฝยศ.1 ================= */}
      {docs === null ? (
        <div className="muted">กำลังโหลดรายละเอียดจากคำของบประมาณ…</div>
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

             เตือนแบบมีแถบเฉพาะ "งบประมาณ" ที่ตัวเลขต่างกันเท่านั้น
             ผู้รับผิดชอบกับตัวชี้วัดเขียนต่างกันเกือบทุกฉบับด้วยวิธีเขียน เช่น
             "ฝกม./กคบ.1/กคบ.2" กับ "ฝกม./กคบ.1 และ กคบ.2" ซึ่งคือหน่วยงานเดียวกัน
             ถ้าเตือนทุกจุด แถบเตือนจะกลายเป็นสิ่งที่ทุกคนเลื่อนผ่าน */
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
                คำของบประมาณ (แบบฟอร์ม ฝยศ.1) ฉบับที่ {d.seq}
                {act ? (
                  <>
                    {" "}— ของกิจกรรม <b>{act.code}</b> {act.name}
                  </>
                ) : (
                  " — ของทั้งโครงการ"
                )}
              </div>

              <div className="small muted" style={{ margin: "-6px 0 12px" }}>
                เอกสารนี้คือ <b>คำขอก่อนอนุมัติ</b> — ตัวชี้วัด งบประมาณ และผู้รับผิดชอบ
                <b> ให้ยึดข้อมูลตามแผนในหัวข้อแรก</b>
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

              {/* ช่องประกอบอื่นของเอกสาร — ไม่ใช่ตัวเลขที่ใช้คำนวณ จึงแสดงตามที่เขียนมา */}
              <Sec title="ข้อมูลประกอบในคำขอ" hint="ตามที่หน่วยงานกรอกไว้ในแบบฟอร์ม">
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
