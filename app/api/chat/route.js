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

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";

/* ---------------------------------------------------------------------
   รายชื่อรุ่นที่จะไล่ใช้ ตัวแรกคือตัวหลัก ที่เหลือคือตัวสำรอง

   ปัญหาที่เจอจริง: **รุ่นใหม่ล่าสุดคือรุ่นที่คิวเต็มบ่อยที่สุด** เพราะคนแห่ไปใช้
   ส่วนรุ่นก่อนหน้าที่ยังอยู่บนชั้นฟรีเหมือนกันกลับว่างกว่ามาก
   งานของเว็บนี้คือ "อ่านตัวเลขจาก JSON ที่ส่งไปให้แล้วสรุปเป็นภาษาไทย"
   ไม่ต้องใช้รุ่นแรงที่สุด รุ่นรองก็ตอบได้คุณภาพเท่ากัน

   เจอ 503 (คิวเต็ม) / 429 (โควตา) / 404 (ปลดระวาง) แล้วจะสลับไปตัวถัดไปเอง
   ผู้ใช้ไม่ต้องมานั่งเดาว่าตอนนี้รุ่นไหนว่าง

   ตั้ง GEMINI_MODEL ทับตัวหลักได้ และ GEMINI_MODEL_FALLBACK
   (คั่นด้วยจุลภาค) ทับรายการสำรองได้ ทั้งคู่แก้ที่ Vercel ไม่ต้องแตะโค้ด
   --------------------------------------------------------------------- */
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_FALLBACKS = "gemini-3.6-flash,gemini-2.5-flash-lite";

/* ตัด "models/" ที่นำหน้าออก เพราะ ENDPOINT เติมให้อยู่แล้ว
   ถ้าใครก๊อบชื่อรุ่นจากข้อความ error มาวางตรง ๆ จะได้ models/models/... แล้วพัง */
function normModel(s) {
  return String(s == null ? "" : s).trim().replace(/^models\//, "");
}

const MODELS = (() => {
  const primary = normModel(process.env.GEMINI_MODEL) || DEFAULT_MODEL;
  const rest = String(process.env.GEMINI_MODEL_FALLBACK || DEFAULT_FALLBACKS)
    .split(",")
    .map(normModel)
    .filter(Boolean);
  const out = [primary];
  rest.forEach((m) => {
    if (out.indexOf(m) < 0) out.push(m);
  });
  return out;
})();

/* ชื่อรุ่นตัวหลัก ใช้ในข้อความ error และหน้าตรวจสอบ */
const MODEL = MODELS[0];

/* รุ่นที่ใช้ได้ล่าสุด — เริ่มจากตัวนี้ก่อนในคำถามถัดไป ไม่ต้องไปเจอ 503 ซ้ำ
   (serverless ใช้ instance ซ้ำ ค่านี้จึงอยู่ข้ามคำถามได้ระยะหนึ่ง) */
let goodModel = null;

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

  const configured = MODELS.map((m) => ({
    model: m,
    usable: usable.indexOf(m) >= 0,
  }));
  const missing = configured.filter((x) => !x.usable).map((x) => x.model);

  return NextResponse.json({
    configured: true,
    /* ลำดับที่เว็บจะไล่ใช้ ตัวแรกคือตัวหลัก ที่เหลือคือตัวสำรองเวลาคิวเต็ม */
    modelChain: configured,
    usableModels: usable,
    hint: missing.length
      ? "รุ่นเหล่านี้ใช้ไม่ได้กับคีย์นี้: " + missing.join(", ") +
        " — เลือกชื่อจาก usableModels ไปตั้ง GEMINI_MODEL (ตัวหลัก) " +
        "และ GEMINI_MODEL_FALLBACK (ตัวสำรอง คั่นด้วยจุลภาค) ใน Vercel แล้ว Redeploy"
      : "ทุกรุ่นในรายการใช้ได้ ถ้าเจอ 503 เว็บจะสลับไปตัวถัดไปให้เอง",
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

  const urlFor = (model) =>
    ENDPOINT + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

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

  async function call(model, variant) {
    const r = await fetch(urlFor(model), {
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
    return { r, d, model, variant };
  }

  /* ไล่รูปแบบคำขอกับรุ่นหนึ่ง ๆ จนกว่าจะเจอตัวที่ผ่าน */
  async function tryModel(model) {
    /* ถ้าเคยรู้แล้วว่ารูปแบบไหนใช้ได้ เริ่มจากตัวนั้นก่อน จะได้ไม่เสียคำขอทิ้ง
       (คีย์ฟรีจำกัดจำนวนคำขอต่อนาที) ที่เหลือเรียงต่อท้ายไว้เผื่อรุ่นเปลี่ยนอีก */
    const order = goodVariant
      ? [goodVariant].concat(VARIANTS.filter((v) => v !== goodVariant))
      : VARIANTS;

    let out = null;
    for (let i = 0; i < order.length; i++) {
      out = await callWithBackoff(call, model, order[i]);
      if (out.r.ok) {
        goodVariant = order[i];
        break;
      }
      /* 400 = คำขอผิดรูป ลองรูปแบบที่เรียบง่ายกว่าอาจผ่าน
         ส่วน 429/403/404/503 เป็นเรื่องของรุ่นหรือคีย์ เปลี่ยนรูปแบบไม่ช่วย */
      if (out.r.status !== 400) break;
    }
    return out;
  }

  /* รุ่นที่ควรลองก่อน แล้วตามด้วยตัวสำรอง */
  const modelOrder =
    goodModel && MODELS.indexOf(goodModel) > 0
      ? [goodModel].concat(MODELS.filter((m) => m !== goodModel))
      : MODELS;

  let res;
  let data;
  try {
    let out = null;
    for (let i = 0; i < modelOrder.length; i++) {
      out = await tryModel(modelOrder[i]);
      if (out.r.ok) {
        goodModel = modelOrder[i];
        break;
      }
      /* 503 คิวเต็ม · 429 โควตารุ่นนั้นหมด · 404 ปลดระวางแล้ว
         ทั้งสามอย่างแก้ได้ด้วยการเปลี่ยนไปใช้รุ่นสำรอง

         ส่วน 400 (คำขอผิด) กับ 403 (คีย์ใช้ไม่ได้) เปลี่ยนรุ่นก็ไม่ช่วย
         เพราะเป็นปัญหาของคำขอหรือของคีย์เอง หยุดเลย */
      const s = out.r.status;
      if (s !== 503 && s !== 429 && s !== 404) break;
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
   ลองซ้ำสั้น ๆ หนึ่งครั้งก่อน ถ้ายังไม่ผ่านค่อยสลับไปรุ่นสำรอง
   ซึ่งได้ผลกว่าการรอรุ่นเดิมไปเรื่อย ๆ

   ลองซ้ำแค่ครั้งเดียว (ไม่ใช่สองครั้งอย่างเดิม) เพราะตอนนี้มีรุ่นสำรองแล้ว
   ถ้าลองซ้ำหลายรอบทุกรุ่น จำนวนคำขอจะบานจนชนลิมิต 15 ครั้งต่อนาทีของคีย์ฟรี
   และเสี่ยงชนเพดานเวลาทำงานของ serverless function ด้วย
   --------------------------------------------------------------------- */
const RETRY_DELAYS = [700];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithBackoff(call, model, variant) {
  let out = await call(model, variant);
  for (let i = 0; i < RETRY_DELAYS.length; i++) {
    if (out.r.status !== 503) break;
    await sleep(RETRY_DELAYS[i]);
    out = await call(model, variant);
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
       มาถึงตรงนี้แปลว่าลองครบทุกรุ่นในรายการแล้ว */
    return (
      "คิวฝั่ง Google เต็มทุกรุ่นที่ตั้งไว้ (" + MODELS.join(", ") + ") " +
      "ลองสลับรุ่นให้แล้วยังไม่ผ่าน รอสัก 1-2 นาทีแล้วกดถามใหม่ " +
      "(ไม่ใช่ปัญหาของคีย์หรือของเว็บ)"
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
    return "ไม่พบรุ่นที่ตั้งไว้เลยสักตัว (" + MODELS.join(", ") + ") — " +
      "เปิด /api/chat?models=1 ดูว่าคีย์นี้ใช้รุ่นไหนได้ แล้วตั้ง GEMINI_MODEL ใหม่ · " + detail;
  }
  return "Gemini ตอบกลับผิดพลาด · " + detail;
}
