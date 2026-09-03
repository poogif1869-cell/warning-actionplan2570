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

/* ข้อความทักทายที่ลอยอยู่ข้างหุ่นยนต์ตอนยังไม่ได้เปิดแชท */
const GREETING = "ให้ช่วยอะไรไหมครับ";
const GREET_KEY = "raot-chat-greeted";

/* ---------------------------------------------------------------------
   หุ่นยนต์ผู้ช่วย — วาดเป็น SVG ในโค้ดเลย

   ไม่ใช้ไฟล์รูปเพราะต้องมีสองชุดสำหรับโหมดสว่าง/มืด และไม่ใช้ไลบรารีไอคอน
   เพราะเครื่องที่พัฒนาลง dependency ไม่ได้
   สีทั้งหมดอิง currentColor กับตัวแปรธีม จึงสลับโหมดมืดได้เอง

   ไม่มีข้อความไทยใน SVG (คำทักทายเป็น HTML ข้าง ๆ) ตามกติกาเดิมของโปรเจกต์

   ตั้ง aria-hidden เพราะเป็นของตกแต่งล้วน ทุกจุดที่วางมีข้อความกำกับอยู่แล้ว
   ("ถาม AI", "ผู้ช่วย AI", คำทักทาย, ตัวคำตอบ) ถ้าประกาศชื่อด้วยจะถูกอ่านซ้ำสองรอบ
   --------------------------------------------------------------------- */
function Robot({ size = 30, className }) {
  return (
    <svg
      className={"robot" + (className ? " " + className : "")}
      viewBox="0 0 48 46"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {/* เสาอากาศ */}
      <path d="M24 9V4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle className="robot-led" cx="24" cy="3" r="2.7" fill="var(--gold)" />

      {/* หูสองข้าง */}
      <rect x="1.5" y="20" width="5" height="11" rx="2.5" fill="currentColor" />
      <rect x="41.5" y="20" width="5" height="11" rx="2.5" fill="currentColor" />

      {/* หัว */}
      <rect
        className="robot-head"
        x="6" y="9" width="36" height="32" rx="11"
        fill="var(--surface)" stroke="currentColor" strokeWidth="2.4"
      />

      {/* แก้ม */}
      <circle cx="12.5" cy="30.5" r="2.6" fill="var(--gold)" opacity=".5" />
      <circle cx="35.5" cy="30.5" r="2.6" fill="var(--gold)" opacity=".5" />

      {/* ตา — กะพริบด้วย CSS */}
      <g className="robot-eyes">
        <circle cx="17.5" cy="22.5" r="3.7" fill="currentColor" />
        <circle cx="30.5" cy="22.5" r="3.7" fill="currentColor" />
      </g>

      {/* ยิ้ม */}
      <path
        d="M18.5 30.2c1.7 2.6 3.6 3.9 5.5 3.9s3.8-1.3 5.5-3.9"
        fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------------
   ตัวแปลง markdown แบบย่อ

   บอทตอบมาเป็น markdown ตามธรรมชาติ (**ตัวหนา**, รายการขึ้นต้นด้วย * หรือ -)
   ถ้าไม่แปลงจะเห็นดอกจันดิบ ๆ ปนอยู่ในคำตอบ
   ลงไลบรารี markdown ทั้งตัวเพื่อสามรูปแบบนี้ไม่คุ้ม และเครื่องนี้ลงอะไรไม่ได้อยู่แล้ว
   --------------------------------------------------------------------- */
function inlineBold(text, keyBase) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<b key={keyBase + "b" + m.index}>{m[1]}</b>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Rich({ text }) {
  const lines = String(text == null ? "" : text).split("\n");
  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="chatgap" />;

        const head = /^\s*#{1,6}\s+/.test(line);
        const bullet = !head && /^\s*[*\-•]\s+/.test(line);
        const body = line.replace(/^\s*(#{1,6}|[*\-•])\s+/, "");

        return (
          <div
            key={i}
            className={"chatline" + (bullet ? " bullet" : "") + (head ? " head" : "")}
          >
            {inlineBold(body, i + "-")}
          </div>
        );
      })}
    </>
  );
}

export default function Assistant() {
  const { results, budget, risk, asOfMonth, allMonths, asOfLabel, loaded } = useResults();

  const [configured, setConfigured] = useState(null); // null = ยังไม่รู้
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [greet, setGreet] = useState(false);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  /* ทักทายหลังหน้าโหลดเสร็จสักครู่ ไม่ใช่เด้งพร้อมหน้าจนบังของที่ผู้ใช้กำลังอ่าน
     กดปิดแล้วจำไว้ ไม่ทักซ้ำอีก — ทักทุกครั้งที่เปิดเว็บจะกลายเป็นน่ารำคาญ */
  useEffect(() => {
    if (!configured) return;
    try {
      if (localStorage.getItem(GREET_KEY)) return;
    } catch (e) {}
    const t = setTimeout(() => setGreet(true), 1200);
    return () => clearTimeout(t);
  }, [configured]);

  function dismissGreet() {
    setGreet(false);
    try {
      localStorage.setItem(GREET_KEY, "1");
    } catch (e) {}
  }

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

  /* โฟกัสช่องพิมพ์เฉพาะบนจอใหญ่
     บนมือถือคีย์บอร์ดจะเด้งขึ้นมาทันทีที่เปิดแชท บังคำถามตัวอย่างจนกดไม่ได้
     แอปแชททั่วไปก็ไม่เด้งคีย์บอร์ดให้เองตอนเพิ่งเปิดห้อง */
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia("(max-width:820px)").matches) return;
    if (inputRef.current) inputRef.current.focus();
  }, [open]);

  /* ---------------------------------------------------------------
     ทำให้แผงสูงเท่า "พื้นที่ที่มองเห็นจริง" บนมือถือ เหมือนแอปแชททั่วไป

     ตอนคีย์บอร์ดเด้งขึ้นมา iOS Safari **ไม่ย่อ layout viewport ให้**
     แผงที่สูง 100dvh จึงยังสูงเท่าเดิม ช่องพิมพ์ถูกคีย์บอร์ดบังไปเฉย ๆ
     ต้องอ่านขนาดจริงจาก visualViewport แล้วกำหนดความสูงเอง
     ส่วน offsetTop ใช้ชดเชยตอนหน้าถูกเลื่อนขึ้นไปหลบคีย์บอร์ด

     Android จัดการให้แล้วผ่าน interactiveWidget:"resizes-content"
     ใน app/layout.jsx แต่โค้ดนี้ทำงานถูกทั้งสองฝั่ง
     --------------------------------------------------------------- */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const el = panelRef.current;
    if (!vv || !el) return;

    const mq = window.matchMedia("(max-width:820px)");

    function apply() {
      if (!mq.matches) {
        // จอใหญ่ปล่อยให้ CSS คุมเอง อย่าค้างค่าที่คำนวณไว้ตอนจอเล็ก
        el.style.height = "";
        el.style.transform = "";
        return;
      }
      el.style.height = vv.height + "px";
      el.style.transform = "translateY(" + vv.offsetTop + "px)";

      /* แผงเตี้ยลงตอนคีย์บอร์ดเด้ง ข้อความล่าสุดจะหลุดออกนอกสายตา
         ต้องรั้งให้อยู่ล่างสุดเสมอ เหมือนที่แอปแชททำ */
      const body = bodyRef.current;
      if (body) body.scrollTop = body.scrollHeight;
    }

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    if (mq.addEventListener) mq.addEventListener("change", apply);

    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      el.style.height = "";
      el.style.transform = "";
    };
  }, [open]);

  /* กันหน้าเบื้องหลังเลื่อนตามนิ้วตอนแผงเต็มจอ — แอปแชทไม่มีใครทำแบบนั้น */
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width:820px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ช่องพิมพ์ยืดตามจำนวนบรรทัด เริ่มที่บรรทัดเดียวเหมือนแอปแชท
     สูงสุด 120px แล้วค่อยให้เลื่อนในช่อง ไม่งั้นข้อความยาว ๆ จะดันแผงจนเต็มจอ */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [draft, open]);

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
      setMsgs((prev) => [
        ...prev,
        { role: "model", text: data.text, truncated: Boolean(data.truncated) },
      ]);
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
      <div className="chatdock">
        {greet && !open ? (
          <div className="chatgreet" role="status">
            <span>{GREETING}</span>
            <button
              className="chatgreet-x"
              onClick={dismissGreet}
              aria-label="ปิดคำทักทาย"
            >
              ✕
            </button>
          </div>
        ) : null}

        <button
          className={"chatfab" + (open ? " isopen" : "")}
          onClick={() => {
            setOpen((v) => !v);
            dismissGreet();
          }}
          aria-expanded={open}
          title={open ? "ปิดผู้ช่วย AI" : "ถามผู้ช่วย AI"}
        >
          {open ? (
            <span className="chatfab-x" aria-hidden="true">
              ✕
            </span>
          ) : (
            <Robot size={30} />
          )}
          <span className="chatfab-text">{open ? "ปิด" : "ถาม AI"}</span>
        </button>
      </div>

      {open ? (
        <section className="chatpanel" aria-label="ผู้ช่วย AI" ref={panelRef}>
          <header className="chathead">
            <Robot size={34} className="chathead-bot" />
            <div className="chathead-title">
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
                <div className="chathello">
                  <Robot size={54} />
                  <b>{GREETING}</b>
                </div>
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

            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="chatmsg user">
                  {m.text}
                </div>
              ) : (
                /* หุ่นยนต์ยืนข้างคำตอบทุกครั้ง จะได้แยกออกทันทีว่าอันไหนบอทพูด */
                <div key={i} className="chatrow">
                  <Robot size={26} className="chatavatar" />
                  <div className="chatmsg bot">
                    <Rich text={m.text} />
                    {m.truncated ? (
                      <div className="chatcut">
                        คำตอบยาวเกินจึงถูกตัด — ลองถามให้แคบลง เช่น ระบุชื่อหรือรหัสโครงการ
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )}

            {busy ? (
              <div className="chatrow">
                <Robot size={26} className="chatavatar thinking" />
                <div className="chatmsg bot chatwait">กำลังคิด…</div>
              </div>
            ) : null}
            {error ? <div className="banner bad chaterr">{error}</div> : null}
          </div>

          <div className="chatfoot">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder="พิมพ์คำถาม…"
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
