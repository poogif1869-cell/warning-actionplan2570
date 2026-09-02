"use client";

/* =====================================================================
   ผู้ช่วย AI — ปุ่มลอยมุมขวาล่าง เปิดแผงแชท

   ประวัติการสนทนาอยู่ใน state เท่านั้น ปิดหน้าแล้วหาย (ที่ผู้ใช้เลือกไว้)
   ข้อมูลจริงในระบบถูกประกอบฝั่งนี้ด้วย buildContext() แล้วส่งไปกับคำถาม
   เพราะข้อมูลทั้งหมดโหลดมาอยู่ในเบราว์เซอร์แล้ว เซิร์ฟเวอร์ไม่ต้องไปอ่าน Supabase ซ้ำ
   ===================================================================== */

import { useEffect, useRef, useState } from "react";
import { useResults } from "@/lib/store";
import { buildContext } from "@/lib/assistant-context";

const STARTERS = [
  "ตอนนี้มีโครงการวิกฤตกี่โครงการ",
  "จะกรอกงบประมาณต้องทำยังไง",
  "หน่วยงานไหนเบิกจ่ายน้อยที่สุด",
  "ตัวชี้วัดตัวไหนยังไม่บรรลุเป้าหมาย",
];

export default function Assistant() {
  const { results, budget, risk, asOfMonth, allMonths, asOfLabel, loaded } = useResults();

  const [configured, setConfigured] = useState(null); // null = ยังไม่รู้
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  /* ถามเซิร์ฟเวอร์ครั้งเดียวว่าตั้งคีย์ไว้หรือยัง
     ยังไม่ตั้ง = ไม่แสดงปุ่มเลย ดีกว่าให้กดแล้วเจอ error ทุกครั้ง */
  useEffect(() => {
    let alive = true;
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => alive && setConfigured(Boolean(d && d.configured)))
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  /* เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ */
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, error]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  /* ปิดด้วย Esc — แผงเต็มจอบนมือถือ ถ้าไม่มีทางหนีจะน่ารำคาญ */
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(question) {
    const q = String(question == null ? draft : question).trim();
    if (!q || busy) return;

    setDraft("");
    setError("");
    const history = [...msgs, { role: "user", text: q }];
    setMsgs(history);
    setBusy(true);

    try {
      let context = null;
      if (loaded) {
        try {
          context = buildContext({
            results,
            budget,
            risk,
            asOfMonth,
            allMonths,
            asOfLabel,
            question: q,
          });
        } catch (e) {
          // ประกอบข้อมูลไม่ได้ก็ยังตอบเรื่องวิธีใช้เว็บได้ ไม่ควรพังทั้งแชท
          context = null;
        }
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (!res.ok || !data || !data.text) {
        setError((data && data.error) || "ตอบกลับไม่สำเร็จ (รหัส " + res.status + ")");
        return;
      }
      setMsgs((prev) => [...prev, { role: "model", text: data.text }]);
    } catch (e) {
      setError("ส่งคำถามไม่สำเร็จ: " + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!configured) return null;

  return (
    <>
      <button
        className="chatfab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? "ปิดผู้ช่วย AI" : "ถามผู้ช่วย AI"}
      >
        <span aria-hidden="true">{open ? "✕" : "💬"}</span>
        <span className="chatfab-text">{open ? "ปิด" : "ถาม AI"}</span>
      </button>

      {open ? (
        <section className="chatpanel" aria-label="ผู้ช่วย AI">
          <header className="chathead">
            <div>
              <b>ผู้ช่วย AI</b>
              <span className="chatsub">ข้อมูล ณ {asOfLabel}</span>
            </div>
            <div className="chathead-btns">
              {msgs.length ? (
                <button
                  className="iconbtn"
                  onClick={() => {
                    setMsgs([]);
                    setError("");
                  }}
                  disabled={busy}
                >
                  ล้างการสนทนา
                </button>
              ) : null}
              <button className="iconbtn" onClick={() => setOpen(false)}>
                ปิด
              </button>
            </div>
          </header>

          <div className="chatbody" ref={bodyRef}>
            {msgs.length === 0 ? (
              <div className="chatintro">
                <p>
                  ถามได้ทั้งวิธีใช้เว็บ (เช่น กรอกงบตรงไหน) และข้อมูลจริงในระบบ
                  (เช่น หน่วยงานไหนเบิกจ่ายช้า) โดยตอบจากข้อมูลที่โหลดอยู่ตอนนี้
                </p>
                <div className="chatstarters">
                  {STARTERS.map((s) => (
                    <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
                      {s}
                    </button>
                  ))}
                </div>
                {!loaded ? (
                  <p className="chatwarn">
                    กำลังโหลดข้อมูลจากฐานข้อมูล — ระหว่างนี้ถามได้เฉพาะเรื่องวิธีใช้เว็บ
                  </p>
                ) : null}
              </div>
            ) : null}

            {msgs.map((m, i) => (
              <div key={i} className={"chatmsg " + (m.role === "user" ? "user" : "bot")}>
                {m.text}
              </div>
            ))}

            {busy ? <div className="chatmsg bot chatwait">กำลังคิด…</div> : null}
            {error ? <div className="banner bad chaterr">{error}</div> : null}
          </div>

          <div className="chatfoot">
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              placeholder="พิมพ์คำถาม แล้วกด Enter (Shift+Enter ขึ้นบรรทัดใหม่)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
            />
            <button className="btn" onClick={() => send()} disabled={busy || !draft.trim()}>
              {busy ? "…" : "ส่ง"}
            </button>
          </div>

          <div className="chatnote">
            คำตอบของ AI ไม่ใช่ข้อมูลทางการ ให้ตรวจกับหน้าเว็บจริงก่อนนำไปใช้อ้างอิง
          </div>
        </section>
      ) : null}
    </>
  );
}
