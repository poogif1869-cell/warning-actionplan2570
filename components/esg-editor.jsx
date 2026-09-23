"use client";

import { useEffect, useState } from "react";
import { PROJECTS } from "@/lib/plan";
import { useResults } from "@/lib/store";
import { ESG_PILLARS, SDGS, esgOf, proposedCount } from "@/lib/esg-sdg";
import { ItemPicker } from "@/components/plan-pickers";
import EsgBadges from "@/components/esg-badges";
import Sec from "@/components/sec";

/* เชื่อมโยงโครงการกับ ESG และ SDGs — โหมดหนึ่งของหน้าแก้ไขแผน

   ไม่ผ่านถังการแก้ไข (plan_edits) เพราะไม่ได้แก้ตัวแผน ไม่ต้องมีมติรองรับ
   เป็นการจัดหมวดข้อมูลที่แก้กลับได้ทันที — เก็บใครแก้เมื่อไหร่ไว้ในตารางเอง

   ⚠️ ปุ่มในนี้ไม่ใช่ด่านความปลอดภัย ด่านจริงคือ RLS ของตาราง project_esg
   ที่ให้เขียนได้เฉพาะ can_edit() */
export default function EsgEditor() {
  const { esg, hasEsgTable, canEdit, saveEsg, personName } = useResults();

  const [uid, setUid] = useState("");
  const [esgSel, setEsgSel] = useState([]);
  const [sdgSel, setSdgSel] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const target = uid ? PROJECTS.find((p) => p.uid === uid) || null : null;
  const cur = uid ? esgOf(uid, esg[uid]) : null;

  /* เปลี่ยนโครงการเมื่อไหร่ ให้ฟอร์มเริ่มจากค่าปัจจุบันของโครงการนั้น
     (ที่ยืนยันไว้ หรือข้อเสนอของระบบถ้ายังไม่มีใครแก้) */
  useEffect(() => {
    if (!uid) return;
    const c = esgOf(uid, esg[uid]);
    setEsgSel(c.esg || []);
    setSdgSel((c.sdg || []).map(Number));
    setNote(c.why || "");
    setDone("");
    // ตั้งใจไม่ใส่ esg เป็น dependency — ไม่งั้นพอบันทึกเสร็จ ฟอร์มจะถูกเซ็ตใหม่ทับ
    // สิ่งที่ผู้ใช้กำลังพิมพ์ต่อ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  function toggleEsg(k) {
    setEsgSel((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    setDone("");
  }

  function toggleSdg(n) {
    setSdgSel((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
    setDone("");
  }

  async function save(confirmed) {
    if (!uid) return;
    setBusy(true);
    const ok = await saveEsg(uid, {
      esg: esgSel,
      /* เรียงเลขให้เสมอ จะได้แสดงเหมือนกันทุกที่ ไม่ขึ้นกับลำดับที่กดติ๊ก */
      sdg: sdgSel.slice().sort((a, b) => a - b),
      note,
      confirmed,
    });
    setBusy(false);
    if (ok) setDone(confirmed ? "ยืนยันแล้ว" : "บันทึกไว้แล้ว (ยังไม่ยืนยัน)");
  }

  const who = cur && cur.updatedBy ? personName(cur.updatedBy) : "";

  return (
    <>
      {!hasEsgTable ? (
        <div className="banner bad">
          ฐานข้อมูลยังไม่มีตาราง <code>project_esg</code> — ให้ผู้ดูแลเอา{" "}
          <code>supabase/schema.sql</code> ไปรันใน Supabase SQL Editor ก่อน
          จึงจะบันทึกการเชื่อมโยงได้
        </div>
      ) : null}

      <Sec
        no={1}
        state={uid ? "done" : "now"}
        title="เลือกโครงการ"
        hint={"ระบบเสนอการเชื่อมโยงไว้ให้แล้ว " + proposedCount() + " โครงการ — เลือกมาตรวจและยืนยัน"}
        right={
          uid ? null : <span className="pill none">{PROJECTS.length} โครงการ</span>
        }
      >
        <ItemPicker value={uid} onChange={setUid} onlyProjects label="ค้นหาโครงการ" />

        {target ? (
          <div className="card pad picked">
            <div className="small muted">โครงการที่เลือก</div>
            <div className="pickedname projname">
              {target.code} {target.name}
            </div>
            <div className="small muted">{target.org || "ไม่ระบุหน่วยงาน"}</div>
            <div style={{ marginTop: 10 }}>
              <span className="small muted">ตอนนี้: </span>
              <span className={"pill " + (cur.source === "ยืนยันแล้ว" ? "ok" : cur.source === "ยังไม่มี" ? "none" : "warn")}>
                {cur.source}
              </span>
              {cur.updatedAt ? (
                <span className="small muted">
                  {" "}
                  แก้ล่าสุด {new Date(cur.updatedAt).toLocaleDateString("th-TH")}
                  {who ? " โดย " + who : ""}
                </span>
              ) : null}
            </div>
            <div style={{ marginTop: 8 }}>
              <EsgBadges esg={cur.esg} sdg={cur.sdg} size="sm" />
            </div>
          </div>
        ) : null}
      </Sec>

      {target ? (
        <>
          <Sec
            no={2}
            state={esgSel.length ? "done" : "now"}
            title="ด้าน ESG"
            hint="เลือกได้มากกว่าหนึ่งด้าน — ด้านที่กดก่อนถือเป็นด้านหลัก"
          >
            <div className="esgpick">
              {ESG_PILLARS.map((e) => (
                <button
                  type="button"
                  key={e.key}
                  className={"esgopt" + (esgSel.includes(e.key) ? " on" : "")}
                  style={{ "--ec": e.color }}
                  onClick={() => toggleEsg(e.key)}
                  disabled={!canEdit || busy}
                >
                  <b>{e.key}</b>
                  <span>{e.label}</span>
                  <small>{e.hint}</small>
                </button>
              ))}
            </div>
          </Sec>

          <Sec
            no={3}
            state={sdgSel.length ? "done" : esgSel.length ? "now" : "todo"}
            title="เป้าหมาย SDGs"
            hint="กดเลือกเป้าหมายที่โครงการนี้ตอบโดยตรง — แนะนำไม่เกิน 3 เป้าหมาย"
            right={<span className="pill none">เลือกแล้ว {sdgSel.length}</span>}
          >
            <div className="sdgpick">
              {SDGS.map((s) => (
                <button
                  type="button"
                  key={s.no}
                  className={"sdgopt" + (sdgSel.includes(s.no) ? " on" : "")}
                  style={{ "--sc": s.color }}
                  onClick={() => toggleSdg(s.no)}
                  disabled={!canEdit || busy}
                  title={s.full}
                >
                  <b>{s.no}</b>
                  <span>{s.short}</span>
                </button>
              ))}
            </div>
            {sdgSel.length > 3 ? (
              <div className="small muted" style={{ marginTop: 10 }}>
                เลือกไว้ {sdgSel.length} เป้าหมาย — เลือกได้ แต่ถ้าเลือกเยอะเกินไป
                จะบอกไม่ได้ว่าโครงการนี้ตอบเป้าหมายไหนเป็นหลัก
              </div>
            ) : null}
          </Sec>

          <Sec
            no={4}
            state={note.trim() ? "done" : "now"}
            title="เหตุผลของการเชื่อมโยง"
            hint="อธิบายสั้น ๆ ว่าทำไมโครงการนี้ตอบด้านและเป้าหมายที่เลือก"
          >
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="esg-note">เหตุผล</label>
              <textarea
                id="esg-note"
                rows={3}
                value={note}
                placeholder="เช่น ปลูกแทนด้วยไม้ยืนต้น เพิ่มพื้นที่สีเขียวและรายได้เกษตรกร"
                onChange={(e) => {
                  setNote(e.target.value);
                  setDone("");
                }}
                disabled={!canEdit || busy}
              />
              <div className="small muted">
                ข้อความนี้แสดงในลิ้นชักรายละเอียดของโครงการ ให้คนอ่านเข้าใจที่มา
              </div>
            </div>
          </Sec>

          <Sec no={5} title="บันทึก" state={done ? "done" : "now"}>
            <div style={{ marginBottom: 12 }}>
              <span className="small muted">ผลที่จะบันทึก: </span>
              <EsgBadges esg={esgSel} sdg={sdgSel.slice().sort((a, b) => a - b)} />
            </div>

            <div className="btnrow" style={{ marginTop: 0 }}>
              <button
                className="btn"
                disabled={!canEdit || busy || !hasEsgTable || !esgSel.length}
                onClick={() => save(true)}
              >
                ยืนยันการเชื่อมโยงนี้
              </button>
              <button
                className="btn ghost"
                disabled={!canEdit || busy || !hasEsgTable}
                onClick={() => save(false)}
              >
                บันทึกไว้ก่อน (ยังไม่ยืนยัน)
              </button>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  const c = esgOf(uid, null);
                  setEsgSel(c.esg || []);
                  setSdgSel((c.sdg || []).map(Number));
                  setNote(c.why || "");
                  setDone("");
                }}
              >
                คืนค่าข้อเสนอของระบบ
              </button>
            </div>

            {!esgSel.length ? (
              <div className="small st-bad" style={{ marginTop: 8 }}>
                ยังยืนยันไม่ได้ — ต้องเลือกด้าน ESG อย่างน้อยหนึ่งด้านในข้อ 2
              </div>
            ) : null}

            {done ? (
              <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                {done} — ดูผลได้ในลิ้นชักรายละเอียดของโครงการนี้ แท็บ “รายละเอียดโครงการ”
              </div>
            ) : null}
          </Sec>
        </>
      ) : (
        <div className="rsec-empty">เลือกโครงการในข้อ 1 ก่อน จึงจะเลือก ESG และ SDGs ได้</div>
      )}
    </>
  );
}
