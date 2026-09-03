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
/* ตัด "models/" ที่นำหน้าออก เพราะ ENDPOINT เติมให้อยู่แล้ว
   ถ้าใครก๊อบชื่อรุ่นจากข้อความ error มาวางตรง ๆ จะได้ models/models/... แล้วพัง */
const MODEL = (process.env.GEMINI_MODEL || "gemini-3.6-flash")
  .trim()
  .replace(/^models\//, "");
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";

/* เพดานฝั่งเซิร์ฟเวอร์ — ไม่เชื่อว่า client จะส่งมาเท่าไหร่ */
const MAX_CHARS = 2000;      // ความยาวข้อความหนึ่งข้อความ
const MAX_TURNS = 12;        // จำนวนข้อความย้อนหลังที่ส่งไปด้วย
const MAX_CONTEXT = 60000;   // ขนาด JSON ข้อมูลระบบ (ตัวอักษร)
const MAX_OUTPUT = 8192;     // เพดานคำตอบ — เผื่อ token ที่รุ่นใหม่ใช้ไปกับการคิดด้วย

/* ---------------------------------------------------------------------
   รูปแบบคำขอ เรียงจากเต็มที่สุดไปเรียบง่ายที่สุด

   Google เปลี่ยนพารามิเตอร์ที่แต่ละรุ่นรับได้ทุกครั้งที่ออกรุ่นใหม่
   และ error ที่ตอบกลับมาบอกแค่ "Request contains an invalid argument."
   **ไม่บอกว่าฟิลด์ไหนผิด** จึงเดาไม่ได้ว่าต้องตัดอะไรออก

   ทางออกคือไล่ถอยทีละขั้นจนกว่าจะมีตัวที่ผ่าน ตัวสุดท้ายเหลือแค่ contents
   ซึ่งเป็นรูปแบบพื้นฐานที่สุดที่ทุกรุ่นต้องรับได้ แล้วจำไว้ว่าใช้ตัวไหนได้
   (serverless ใช้ instance ซ้ำ ค่านี้จึงอยู่ข้ามคำถามได้ระยะหนึ่ง)
   --------------------------------------------------------------------- */
const VARIANTS = ["full", "no-thinking", "cap-only", "minimal"];
let goodVariant = null;

function key() {
  return (process.env.GEMINI_API_KEY || "").trim();
}

function clip(s, n) {
  const t = String(s == null ? "" : s);
  return t.length > n ? t.slice(0, n) : t;
}

/* ให้ widget รู้ว่าควรโผล่ไหม โดยไม่ต้องเปิดเผยคีย์
   และไม่ต้องเพิ่ม NEXT_PUBLIC_ อีกตัวเพียงเพื่อเช็คว่ามีคีย์หรือยัง

   เปิด /api/chat?models=1 ในเบราว์เซอร์ (ตอนล็อกอินอยู่) เพื่อดูว่า
   **คีย์นี้ใช้รุ่นไหนได้บ้าง** — เครื่องที่พัฒนาไม่มีคีย์ไว้ทดสอบ
   เวลาเจอ error เรื่องชื่อรุ่นจึงต้องมีทางถามตัว API ตรง ๆ ไม่ใช่เดาไปเรื่อย
   คืนแค่รายชื่อรุ่น ไม่มีส่วนไหนของคีย์หลุดออกไป */
export async function GET(request) {
  const apiKey = key();

  let wantModels = false;
  try {
    wantModels = new URL(request.url).searchParams.get("models") === "1";
  } catch (e) {}

  if (!wantModels) {
    return NextResponse.json({ configured: Boolean(apiKey), model: MODEL });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });
  }

  let r;
  let d = null;
  try {
    r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" +
        encodeURIComponent(apiKey)
    );
    d = await r.json();
  } catch (e) {
    return NextResponse.json(
      { error: "ติดต่อ Gemini ไม่ได้: " + (e && e.message ? e.message : String(e)) },
      { status: 502 }
    );
  }

  if (!r.ok) {
    return NextResponse.json(
      { error: explainGemini(r.status, errorDetail(d, r.status)) },
      { status: 502 }
    );
  }

  const all = (d && d.models) || [];
  const usable = all
    .filter((m) => (m.supportedGenerationMethods || []).indexOf("generateContent") >= 0)
    .map((m) => String(m.name || "").replace(/^models\//, ""));

  return NextResponse.json({
    configured: true,
    currentModel: MODEL,
    currentModelUsable: usable.indexOf(MODEL) >= 0,
    usableModels: usable,
    hint:
      usable.indexOf(MODEL) >= 0
        ? "รุ่นที่ตั้งไว้ใช้ได้ ถ้ายังพังอยู่แสดงว่าเป็นเรื่องพารามิเตอร์ ไม่ใช่ชื่อรุ่น"
        : "รุ่นที่ตั้งไว้ใช้ไม่ได้ — เลือกชื่อจาก usableModels ไปใส่ GEMINI_MODEL ใน Vercel แล้ว Redeploy",
  });
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

  /* ------------------------------------------------------------------
     ประกอบคำขอตามรูปแบบที่กำหนด

     "full" ส่งครบ ลงไปจนถึง "minimal" ที่เหลือแค่ contents อย่างเดียว
     ซึ่งเป็นรูปแบบพื้นฐานที่สุดที่ทุกรุ่นต้องรับได้
     ------------------------------------------------------------------ */
  function payload(variant) {
    const body = { contents: contents.map((c) => ({ ...c })) };

    if (variant === "minimal") {
      /* รุ่นที่ไม่รับ system_instruction ก็ยังอ่านคำสั่งได้ ถ้าเอาไปแปะหน้าคำถาม */
      const last = body.contents[body.contents.length - 1];
      last.parts = [{ text: SYSTEM_PROMPT + "\n\n---\n\n" + last.parts[0].text }];
    } else {
      body.system_instruction = { parts: [{ text: SYSTEM_PROMPT }] };
    }

    if (variant === "full") {
      /* รุ่น 2.5 "คิด" ก่อนตอบ และการคิดกิน maxOutputTokens ด้วย
         ปิดได้จะเร็วกว่าและไม่โดนตัดคำตอบกลางประโยค
         (รุ่น 3 ไม่รับฟิลด์นี้ จะตกไปใช้รูปแบบถัดไปเอง) */
      body.generationConfig = {
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT,
        thinkingConfig: { thinkingBudget: 0 },
      };
    } else if (variant === "no-thinking") {
      body.generationConfig = { temperature: 0.3, maxOutputTokens: MAX_OUTPUT };
    } else if (variant === "cap-only") {
      body.generationConfig = { maxOutputTokens: MAX_OUTPUT };
    }
    // "minimal" ไม่ส่ง generationConfig เลย

    return JSON.stringify(body);
  }

  async function call(variant) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload(variant),
    });
    let d = null;
    try {
      d = await r.json();
    } catch (e) {
      d = null;
    }
    return { r, d, variant };
  }

  let res;
  let data;
  try {
    /* ถ้าเคยรู้แล้วว่ารูปแบบไหนใช้ได้ เริ่มจากตัวนั้นก่อน จะได้ไม่เสียคำขอทิ้ง
       (คีย์ฟรีจำกัดจำนวนคำขอต่อนาที) ที่เหลือเรียงต่อท้ายไว้เผื่อรุ่นเปลี่ยนอีก */
    const order = goodVariant
      ? [goodVariant].concat(VARIANTS.filter((v) => v !== goodVariant))
      : VARIANTS;

    let out = null;
    for (let i = 0; i < order.length; i++) {
      out = await callWithBackoff(call, order[i]);
      if (out.r.ok) {
        goodVariant = order[i];
        break;
      }
      /* 400 = คำขอผิดรูป ลองรูปแบบที่เรียบง่ายกว่าอาจผ่าน
         ส่วน 429/403/404/503 ลองรูปแบบอื่นก็ไม่ช่วย หยุดเลย
         (503 ลองซ้ำไปแล้วใน callWithBackoff)

         ถ้าไม่ผ่านสักตัว จะรายงาน error ของตัวสุดท้าย (แบบเรียบง่ายที่สุด)
         ซึ่งตรงกับข้อความที่บอกว่า "ลองแบบเรียบง่ายที่สุดแล้วก็ยังไม่ผ่าน" */
      if (out.r.status !== 400) break;
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
    return NextResponse.json(
      { error: explainGemini(res.status, errorDetail(data, res.status)) },
      { status: 502 }
    );
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

/* ---------------------------------------------------------------------
   ลองซ้ำเมื่อเจอ 503 UNAVAILABLE

   "This model is currently experiencing high demand" คือคิวฝั่ง Google เต็ม
   ไม่ใช่ความผิดของคำขอเรา และมักหายเองในไม่กี่วินาที
   ลองซ้ำสั้น ๆ สองครั้งจึงคุ้มกว่าโยน error ให้ผู้ใช้ไปกดเองทันที

   หน่วงรวมไม่เกิน ~2.2 วินาที เพราะ serverless function บน Vercel
   มีเพดานเวลาทำงาน ถ้าหน่วงนานกว่านี้เสี่ยงโดนตัดกลางคัน
   --------------------------------------------------------------------- */
const RETRY_DELAYS = [700, 1500];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithBackoff(call, variant) {
  let out = await call(variant);
  for (let i = 0; i < RETRY_DELAYS.length; i++) {
    if (out.r.status !== 503) break;
    await sleep(RETRY_DELAYS[i]);
    out = await call(variant);
  }
  return out;
}

/* ---------------------------------------------------------------------
   ดึงรายละเอียด error ให้ได้มากที่สุด

   error.message ของ Gemini มักเป็นประโยคกว้าง ๆ ที่ไม่ช่วยอะไร
   ตัวที่บอกว่าฟิลด์ไหนผิดจริง ๆ อยู่ใน error.details ซึ่งถ้าไม่แสดงออกมา
   จะไล่หาสาเหตุไม่ได้เลย เพราะรัน build ในเครื่องไม่ได้และไม่มีคีย์ไว้ทดสอบ
   --------------------------------------------------------------------- */
function errorDetail(data, status) {
  const err = (data && data.error) || null;
  if (!err) return "รหัสสถานะ " + status;

  let out = err.message || "รหัสสถานะ " + status;
  if (err.status && err.status !== err.message) out += " [" + err.status + "]";

  if (Array.isArray(err.details) && err.details.length) {
    try {
      out += " · รายละเอียด: " + JSON.stringify(err.details).slice(0, 600);
    } catch (e) {}
  }
  return out;
}

/* แปล error ให้บอกวิธีแก้ตรงจุด แนวเดียวกับ explainError ใน lib/store.jsx */
function explainGemini(status, detail) {
  if (status === 429) {
    return "โควตา Gemini เต็มชั่วคราว (คีย์ฟรีจำกัดจำนวนคำถามต่อนาที) รอสักครู่แล้วถามใหม่";
  }
  if (status === 503) {
    /* คิวฝั่ง Google เต็ม ไม่ใช่ความผิดของคำขอเรา และไม่ใช่เรื่องโควตาของคีย์
       ลองซ้ำอัตโนมัติไปแล้วสองครั้งก่อนจะมาถึงตรงนี้ */
    return (
      "ตอนนี้รุ่น " + MODEL + " มีคนใช้พร้อมกันเยอะจนคิวเต็มฝั่ง Google " +
      "ลองซ้ำให้แล้วยังไม่ผ่าน รอสัก 1-2 นาทีแล้วกดถามใหม่ " +
      "(ไม่ใช่ปัญหาของคีย์หรือของเว็บ ถ้าเจอบ่อยให้ตั้ง GEMINI_MODEL เป็นรุ่นอื่นใน Vercel)"
    );
  }
  if (status === 403) {
    return "คีย์ Gemini ใช้ไม่ได้ — ตรวจว่าเปิดใช้ Generative Language API แล้ว " +
      "และคีย์ไม่ได้ถูกจำกัดโดเมน · " + detail;
  }
  if (status === 400) {
    /* มาถึงตรงนี้แปลว่าลองครบทุกรูปแบบแล้ว รวมถึงแบบเรียบง่ายที่สุด
       ที่ส่งแค่ contents ปัญหาจึงไม่ใช่พารามิเตอร์ แต่เป็นคีย์หรือชื่อรุ่น */
    return "คำขอไม่ถูกต้อง — ลองส่งแบบเรียบง่ายที่สุดแล้วก็ยังไม่ผ่าน " +
      "มักเป็นคีย์ผิด หรือรุ่น " + MODEL + " ไม่มีอยู่จริง/คีย์นี้ใช้ไม่ได้ · " + detail;
  }
  if (status === 404) {
    return "ไม่พบโมเดล " + MODEL + " — ตั้งตัวแปร GEMINI_MODEL ให้เป็นรุ่นที่คีย์นี้ใช้ได้ · " + detail;
  }
  return "Gemini ตอบกลับผิดพลาด · " + detail;
}
