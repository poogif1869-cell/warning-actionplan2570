/* =====================================================================
   Service Worker — เงื่อนไขที่เบราว์เซอร์บังคับให้มีก่อนจะยอมให้ติดตั้งเป็นแอป

   ⚠️ กติกาสำคัญที่สุดของไฟล์นี้: **แคชเฉพาะไฟล์นิ่งเท่านั้น**

   เว็บนี้แสดงข้อมูลที่ต้องล็อกอินและเปลี่ยนตลอดเวลา ถ้าแคชหน้า HTML
   หรือคำตอบจาก Supabase ไว้ จะเกิดสองเรื่องที่รับไม่ได้:
     1. เครื่องที่ใช้ร่วมกัน คนถัดไปอาจเห็นข้อมูลของคนก่อนหน้า
     2. ตัวเลขงบประมาณที่ค้างอยู่หน้าตาเหมือนของจริง แต่เป็นของเก่า
        ซึ่งอันตรายกว่าการที่เว็บเปิดไม่ขึ้นเสียอีก

   จึงแคชแค่ /_next/static/** (ชื่อไฟล์มี hash เปลี่ยนทุกครั้งที่ build
   จึงไม่มีวันได้ของเก่า) กับไอคอนและหน้า offline
   ที่เหลือวิ่งเข้าเครือข่ายตรง ๆ ทุกครั้ง

   ไม่ได้ใช้ next-pwa หรือ workbox เพราะเครื่องที่พัฒนาลง dependency ไม่ได้
   และกติกาแคชของเว็บนี้แคบพอที่จะเขียนเองสั้น ๆ
   ===================================================================== */

/* logo.png กับไอคอนใช้ชื่อไฟล์เดิมตลอด ไม่มี hash ต่อท้ายเหมือนไฟล์ของ Next
   ถ้าเปลี่ยนรูปพวกนี้ **ต้องขยับเลข VERSION ด้วย** ไม่งั้นเครื่องที่ติดตั้งไปแล้ว
   จะยังเห็นรูปเก่าตลอดไป (ตอน activate จะลบแคชที่ชื่อไม่ตรงทิ้งให้เอง) */
const VERSION = "v4"; // v4 = ไอคอนใหม่ เกจวัดผล + กระดิ่งแจ้งเตือน
const STATIC_CACHE = "raot-static-" + VERSION;
const OFFLINE_URL = "/offline.html";

/* โหลดไว้ตั้งแต่ติดตั้ง เพราะตอนออฟไลน์แล้วค่อยโหลดย่อมไม่ทัน */
const PRECACHE = [
  OFFLINE_URL,
  "/logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      /* ไอคอนตัวใดตัวหนึ่งโหลดไม่ได้ ไม่ควรทำให้ติดตั้ง SW ล้มทั้งหมด
         จึงใส่ทีละไฟล์แทน addAll ที่ล้มทั้งชุดถ้าพลาดแม้แต่ไฟล์เดียว */
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/logo.png"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* แตะเฉพาะ GET ของโดเมนตัวเอง
     คำขอไป Supabase กับ Gemini ต้องไม่ถูกดักเด็ดขาด */
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* ไฟล์นิ่ง — เอาจากแคชก่อน เร็วและใช้ได้ตอนออฟไลน์
     ปลอดภัยเพราะชื่อไฟล์มี hash ของเนื้อหาอยู่แล้ว */
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  /* การเปิดหน้า — เข้าเครือข่ายเสมอ ถ้าเน็ตหลุดค่อยแสดงหน้าออฟไลน์
     **ไม่แคชหน้าไว้** เพราะเป็นเนื้อหาที่ต้องล็อกอินและเปลี่ยนตลอด */
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  /* ที่เหลือ (API, ข้อมูล) ปล่อยผ่านไปเครือข่ายตามปกติ ไม่แตะต้อง */
});
