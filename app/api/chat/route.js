/* =====================================================================
   คุยกับ Gemini แทนผู้ใช้

   คีย์อยู่ที่นี่ที่เดียว **ห้ามตั้งชื่อ env เป็น NEXT_PUBLIC_GEMINI_API_KEY**
   ตัวแปรที่ขึ้นต้นด้วย NEXT_PUBLIC_ จะถูกฝังลงในบันเดิลที่ส่งให้เบราว์เซอร์
   ใครเปิด devtools ก็อ่านคีย์ได้

   middleware.js กัน /api/* ไว้แล้ว เฉพาะคนที่ล็อกอินจึงเรียกได้

   ยิง REST ตรง ๆ ด้วย fetch ไม่ลง SDK เพราะเครื่องที่พัฒนาไม่มี Node.js
   จึงติดตั้งหรือทดสอบ dependency ใหม่ไม่ได้
   ===================================================================== */

import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/assistant-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Google ปลดระวางรุ่นเก่าเป็นระยะแล้วคืน 404 พร้อมบอกรุ่นใหม่ที่ควรใช้
   ถ้าเจอ "no longer available" อีก ให้ตั้ง GEMINI_MODEL ใน Vercel เป็นรุ่นที่ error บอก
   จะได้แก้ได้โดยไม่ต้อง deploy ใหม่ */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";

/* เพดานฝั่งเซิร์ฟเวอร์ — ไม่เชื่อว่า client จะส่งมาเท่าไหร่ */
const MAX_CHARS = 2000;      // ความยาวข้อความหนึ่งข้อความ
const MAX_TURNS = 12;        // จำนวนข้อความย้อนหลังที่ส่งไปด้วย
const MAX_CONTEXT = 60000;   // ขนาด JSON ข้อมูลระบบ (ตัวอักษร)
const MAX_OUTPUT = 8192;     // เพดานคำตอบ — เผื่อ token ที่รุ่นใหม่ใช้ไปกับการคิดด้วย

/* จำไว้ว่ารุ่นนี้รับ thinkingConfig ไหม จะได้ไม่ยิงคำขอที่รู้อยู่แล้วว่าพังทุกครั้ง
   (serverless ใช้ instance ซ้ำ ค่านี้จึงอยู่ข้ามคำถามได้ระยะหนึ่ง) */
let thinkingConfigOK = true;

function key() {
  return (process.env.GEMINI_API_KEY || "").trim();
}

function clip(s, n) {
  const t = String(s == null ? "" : s);
  return t.length > n ? t.slice(0, n) : t;
}

/* ให้ widget รู้ว่าควรโผล่ไหม โดยไม่ต้องเปิดเผยคีย์
   และไม่ต้องเพิ่ม NEXT_PUBLIC_ อีกตัวเพียงเพื่อเช็คว่ามีคีย์หรือยัง */
export async function GET() {
  return NextResponse.json({ configured: Boolean(key()), model: MODEL });
}

export async function POST(request) {
  const apiKey = key();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ยังไม่ได้ตั้งค่าคีย์ Gemini — ให้ผู้ดูแลเพิ่มตัวแปร GEMINI_API_KEY " +
          "ใน Vercel (Settings → Environment Variables) แล้ว Redeploy หนึ่งครั้ง",
      },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const incoming = Array.isArray(body && body.messages) ? body.messages : [];
  const msgs = incoming
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({
      role: m.role === "model" ? "model" : "user",
      text: clip(m.text, MAX_CHARS),
    }));

  if (!msgs.length || msgs[msgs.length - 1].role !== "user") {
    return NextResponse.json({ error: "ไม่มีคำถามที่จะส่ง" }, { status: 400 });
  }

  /* ข้อมูลระบบแนบไปกับ**คำถามล่าสุดเท่านั้น** ไม่ต้องแนบซ้ำทุกข้อความ
     เพราะเป็นชุดเดียวกันและกินโควตาโดยเปล่าประโยชน์ */
  let ctx = "";
  if (body && body.context) {
    try {
      ctx = clip(JSON.stringify(body.context), MAX_CONTEXT);
    } catch (e) {
      ctx = "";
    }
  }

  const contents = msgs.map((m, i) => {
    const last = i === msgs.length - 1;
    const text =
      last && ctx
        ? "ข้อมูลจริงในระบบ ณ ตอนนี้ (JSON):\n" +
          ctx +
          "\n\nคำถามของผู้ใช้: " +
          m.text
        : m.text;
    return { role: m.role, parts: [{ text }] };
  });

  const url =
    ENDPOINT + encodeURIComponent(MODEL) + ":generateContent?key=" + encodeURIComponent(apiKey);

  function payload(withThinking) {
    const gen = { temperature: 0.3, maxOutputTokens: MAX_OUTPUT };
    /* รุ่นใหม่ (2.5 ขึ้นไป) "คิด" ก่อนตอบ และการคิดกิน maxOutputTokens ด้วย
       ถ้าไม่ปิด คำตอบจะถูกตัดกลางประโยคทั้งที่ยังเขียนไม่จบ
       คำถามในเว็บนี้เป็นการอ่านตัวเลขจาก context ที่ส่งไปให้แล้ว ไม่ต้องใช้การคิดยาว */
    if (!withThinking) gen.thinkingConfig = { thinkingBudget: 0 };
    return JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: gen,
    });
  }

  async function call(withThinking) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload(withThinking),
    });
    let d = null;
    try {
      d = await r.json();
    } catch (e) {
      d = null;
    }
    return { r, d };
  }

  let res;
  let data;
  try {
    let out = await call(!thinkingConfigOK);

    /* บางรุ่นปิดการคิดไม่ได้ แล้วตอบ 400 กลับมา — ลองใหม่แบบไม่ส่ง thinkingConfig

       ลองใหม่ทุกกรณีที่เป็น 400 ไม่ดูข้อความ เพราะ Gemini 3 ตอบแค่
       "Request contains an invalid argument." ไม่บอกว่าฟิลด์ไหนผิด
       thinkingConfig เป็นฟิลด์เดียวที่เราส่งเพิ่มจากมาตรฐาน จึงเป็นผู้ต้องสงสัยอันดับแรก
       ถ้าลองใหม่แล้วยังพัง จะรายงาน error ของรอบแรกซึ่งตรงกับสาเหตุจริงมากกว่า */
    if (out.r.status === 400 && thinkingConfigOK) {
      const retry = await call(true);
      if (retry.r.ok) {
        thinkingConfigOK = false; // รุ่นนี้ไม่รับ เลิกส่งไปเลย ไม่ต้องเสียคำขอทิ้งทุกครั้ง
        out = retry;
      }
    }
    res = out.r;
    data = out.d;
  } catch (e) {
    return NextResponse.json(
      { error: "ติดต่อ Gemini ไม่ได้: " + (e && e.message ? e.message : String(e)) },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const detail =
      (data && data.error && data.error.message) || "รหัสสถานะ " + res.status;
    return NextResponse.json({ error: explainGemini(res.status, detail) }, { status: 502 });
  }

  const cand = (data && data.candidates && data.candidates[0]) || null;
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();

  if (!text) {
    /* คำตอบว่างมักมาจากตัวกรองเนื้อหา หรือชนเพดาน token กลางประโยค */
    const why = cand && cand.finishReason ? cand.finishReason : "";
    return NextResponse.json(
      {
        error:
          why === "MAX_TOKENS"
            ? "คำตอบยาวเกินไป ลองถามให้แคบลง เช่น ระบุหน่วยงานหรือชื่อโครงการ"
            : "ไม่ได้รับคำตอบจาก Gemini" + (why ? " (" + why + ")" : "") + " ลองถามใหม่อีกครั้ง",
      },
      { status: 502 }
    );
  }

  /* ยังชนเพดานได้ถ้ารายการยาวจริง ๆ — ต้องบอกผู้ใช้ ไม่ใช่โชว์คำตอบที่ขาดกลางคัน
     เงียบ ๆ แล้วปล่อยให้เข้าใจว่านั่นคือคำตอบทั้งหมด */
  const truncated = cand && cand.finishReason === "MAX_TOKENS";
  return NextResponse.json({ text, truncated: Boolean(truncated) });
}

/* แปล error ให้บอกวิธีแก้ตรงจุด แนวเดียวกับ explainError ใน lib/store.jsx */
function explainGemini(status, detail) {
  if (status === 429) {
    return "โควตา Gemini เต็มชั่วคราว (คีย์ฟรีจำกัดจำนวนคำถามต่อนาที) รอสักครู่แล้วถามใหม่";
  }
  if (status === 403) {
    return "คีย์ Gemini ใช้ไม่ได้ — ตรวจว่าเปิดใช้ Generative Language API แล้ว " +
      "และคีย์ไม่ได้ถูกจำกัดโดเมน · " + detail;
  }
  if (status === 400) {
    /* Gemini 3 ตอบ 400 แบบไม่บอกว่าฟิลด์ไหนผิด จึงต้องไล่ความเป็นไปได้ให้ผู้ดูแล */
    return "คำขอไม่ถูกต้อง — อาจเป็นคีย์ผิด ชื่อรุ่นโมเดลไม่มีอยู่จริง " +
      "หรือรุ่น " + MODEL + " ไม่รองรับพารามิเตอร์ที่ส่งไป · " + detail;
  }
  if (status === 404) {
    return "ไม่พบโมเดล " + MODEL + " — ตั้งตัวแปร GEMINI_MODEL ให้เป็นรุ่นที่คีย์นี้ใช้ได้ · " + detail;
  }
  return "Gemini ตอบกลับผิดพลาด · " + detail;
}
