"use client";

/* =====================================================================
   ชิ้นส่วนที่ใช้ซ้ำในหน้าแก้ไขแผน

   แยกออกมาจาก app/(app)/plan-edit/page.jsx เพราะหน้านั้นยาวพอแล้ว
   และสามชิ้นนี้เป็นเรื่องของ "วิธีเลือก/กรอก" ล้วน ๆ ไม่ผูกกับโหมดไหน
   ===================================================================== */

import { useMemo, useState } from "react";
import { PROJECTS, MONTHS, MONTHS_SHORT } from "@/lib/plan";
import { STRATEGIES, ORG_UNITS, PLAN_LINKS, inUnit } from "@/lib/rollup";
import { money, fmt } from "@/lib/format";
import { linkOptions, leadNo, underNo } from "@/lib/plan-links";

/* ---------------------------------------------------------------------
   เลือกโครงการ/กิจกรรม — มีช่องค้นหาและตัวกรอง

   ดรอปดาวน์ธรรมดาใช้ไม่ไหวแล้วที่ 553 รายการ ต้องเลื่อนหาเองทั้งหมด
   ที่นี่จึงพิมพ์ค้นได้ทั้งรหัส ชื่อ และหน่วยงาน แล้วกรองซ้ำด้วย
   ยุทธศาสตร์กับหน่วยงานอีกชั้น

   ตัดรายการที่แสดงไว้ที่ 60 รายการ ไม่ใช่เพราะกลัวช้า แต่เพราะรายชื่อ
   ที่ยาวเป็นร้อยแปลว่าคำค้นยังกว้างไป ควรบอกให้พิมพ์เพิ่มมากกว่า
   --------------------------------------------------------------------- */
export function ItemPicker({ value, onChange, onlyProjects, label, exclude }) {
  const [q, setQ] = useState("");
  const [sNo, setSNo] = useState("");
  const [org, setOrg] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openUid, setOpenUid] = useState("");
  /* แบ่งหน้าแทนกล่องเลื่อน — กล่องที่มี overflow-y เมื่อเลื่อนจนสุดแล้ว
     เบราว์เซอร์จะส่งการเลื่อนต่อไปให้หน้าเว็บ (scroll chaining)
     คนกำลังไล่ดูรายชื่อจึงถูกดีดออกไปท้ายหน้าโดยไม่ได้ตั้งใจ */
  const [page, setPage] = useState(0);

  /* ---------------------------------------------------------------
     ยังไม่ค้นอะไรเลย = ไม่ต้องเทรายชื่อ 121 โครงการมาให้

     รายชื่อยาว ๆ ที่โผล่มาก่อนที่จะรู้ว่าจะหาอะไร ไม่ได้ช่วยอะไรเลย
     นอกจากทำให้ต้องเลื่อนผ่าน และเสี่ยงกดผิดโครงการ
     ต้องพิมพ์ค้น เลือกยุทธศาสตร์ เลือกหน่วยงาน หรือกด "แสดงทั้งหมด" ก่อน
     --------------------------------------------------------------- */
  const needle = q.toLowerCase().trim();
  const active = Boolean(needle || sNo || org || showAll);

  /* ---------------------------------------------------------------
     ระดับบนสุดของรายการเป็น "โครงการ" เสมอ กิจกรรมอยู่ใต้โครงการของตัวเอง
     ไม่ปนกันเป็นรายการแบนเหมือนเดิม — 553 แถวเรียงกันดูไม่ออกว่า
     กิจกรรมไหนอยู่ใต้โครงการไหน

     คำค้นที่ตรงกับ "กิจกรรม" ก็ให้โครงการแม่โผล่ขึ้นมาด้วย และกางให้เอง
     ไม่งั้นค้นชื่อกิจกรรมแล้วไม่เจออะไรเลย ทั้งที่มีอยู่จริง
     --------------------------------------------------------------- */
  const list = useMemo(() => {
    if (!active) return [];

    const hit = (x) =>
      !needle || (x.code + " " + x.name + " " + (x.org || "")).toLowerCase().includes(needle);

    return PROJECTS.filter((p) => {
      if (exclude && exclude(p)) return false;
      if (sNo && p.sNo !== sNo) return false;
      if (org && !inUnit(p, org)) return false;
      if (!needle) return true;
      return hit(p) || (p._kids || []).some(hit);
    }).map((p) => ({
      p,
      // กิจกรรมที่ตรงคำค้น ใช้ทั้งกางอัตโนมัติและบอกจำนวนที่ตรง
      hits: needle && !hit(p) ? (p._kids || []).filter(hit) : [],
    }));
  }, [active, needle, sNo, org, exclude]);

  const PER_PAGE = 8;
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  // เปลี่ยนตัวกรองแล้วจำนวนหน้าลด หน้าที่ค้างอยู่อาจเกินไปแล้ว
  const pageNo = Math.min(page, pages - 1);
  const shown = list.slice(pageNo * PER_PAGE, pageNo * PER_PAGE + PER_PAGE);

  function reset() {
    setQ("");
    setSNo("");
    setOrg("");
    setShowAll(false);
    setOpenUid("");
    setPage(0);
  }

  /* เปลี่ยนคำค้นหรือตัวกรอง ต้องกลับหน้าแรกเสมอ
     ไม่งั้นค้นใหม่แล้วเจอ "ไม่พบรายการ" ทั้งที่มีผลลัพธ์อยู่หน้าแรก */
  function refine(fn) {
    return (v) => {
      fn(v);
      setPage(0);
    };
  }

  return (
    <div className="pickbox">
      <div className="filters">
        <div className="field">
          <label htmlFor="pick-q">{label || "ค้นหาโครงการ"}</label>
          <input
            id="pick-q"
            type="search"
            placeholder="ชื่อ / รหัส / หน่วยงาน"
            value={q}
            onChange={(e) => refine(setQ)(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pick-s">ยุทธศาสตร์</label>
          <select id="pick-s" value={sNo} onChange={(e) => refine(setSNo)(e.target.value)}>
            <option value="">— ไม่กรอง —</option>
            {STRATEGIES.map((s) => (
              <option key={s.no} value={s.no}>
                ยุทธศาสตร์ที่ {s.no} ({fmt(s.count)})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pick-o">หน่วยงาน</label>
          <select id="pick-o" value={org} onChange={(e) => refine(setOrg)(e.target.value)}>
            <option value="">— ไม่กรอง —</option>
            {ORG_UNITS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.name} ({fmt(u.count)})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button
              type="button"
              className={showAll ? "btn" : "btn ghost"}
              onClick={() => refine(setShowAll)(!showAll)}
            >
              {showAll ? "กำลังแสดงทั้งหมด" : "แสดงทั้งหมด"}
            </button>
            {active ? (
              <button type="button" className="btn ghost" onClick={reset}>
                ล้าง
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!active ? (
        <div className="picknone">
          พิมพ์ค้นหาชื่อหรือรหัสโครงการ · เลือกยุทธศาสตร์หรือหน่วยงาน ·
          หรือกด <b>แสดงทั้งหมด</b> เพื่อดูโครงการทั้ง {fmt(PROJECTS.length)} โครงการ
        </div>
      ) : (
        <>
          <div className="small muted" style={{ marginBottom: 7 }}>
            พบ {fmt(list.length)} โครงการ
            {pages > 1 ? " · หน้า " + (pageNo + 1) + " จาก " + pages : ""}
          </div>

          <div className="picklist">
            {shown.length === 0 ? (
              <div className="small muted" style={{ padding: 14 }}>
                ไม่พบโครงการที่ตรงกับที่ค้น
              </div>
            ) : (
              shown.map(({ p, hits }) => {
                const kids = p._kids || [];
                const open = openUid === p.uid || hits.length > 0;
                return (
                  <div className="pickgroup" key={p.uid}>
                    <button
                      type="button"
                      className={"pickrow proj" + (p.uid === value ? " on" : "")}
                      onClick={() => onChange(p.uid)}
                    >
                      <span className="pickmark">{p.uid === value ? "✓" : ""}</span>
                      <span className="pickname">
                        <b>{p.code}</b> {p.name}
                        <span className="pickmeta">
                          โครงการ
                          {p.org ? " · " + p.org : ""} · {money(p.budget)} บาท
                          {kids.length ? " · " + kids.length + " กิจกรรม" : ""}
                        </span>
                      </span>
                    </button>

                    {/* กิจกรรมซ่อนไว้จนกว่าจะกดกาง — ค่าเริ่มต้นคนหาโครงการ
                        ไม่ได้หากิจกรรม การกางทุกอันไว้ทำให้รายการยาวขึ้นสี่เท่า */}
                    {kids.length && !onlyProjects ? (
                      <button
                        type="button"
                        className="pickexp"
                        aria-expanded={open}
                        onClick={() => setOpenUid(open && !hits.length ? "" : p.uid)}
                      >
                        {open ? "▾" : "▸"} กิจกรรมภายใต้โครงการนี้ ({kids.length})
                        {hits.length ? " · ตรงกับที่ค้น " + hits.length : ""}
                      </button>
                    ) : null}

                    {open && !onlyProjects
                      ? kids.map((k) => (
                          <button
                            type="button"
                            key={k.uid}
                            className={"pickrow act" + (k.uid === value ? " on" : "")}
                            onClick={() => onChange(k.uid)}
                          >
                            <span className="pickmark">{k.uid === value ? "✓" : ""}</span>
                            <span className="pickname">
                              <b>{k.code}</b> {k.name}
                              <span className="pickmeta">
                                กิจกรรม · {money(k.budget)} บาท
                              </span>
                            </span>
                          </button>
                        ))
                      : null}
                  </div>
                );
              })
            )}
          </div>

          {/* ปุ่มเปลี่ยนหน้า — ไม่ใช้กล่องเลื่อน จะได้ไม่ดีดหน้าเว็บตอนเลื่อนจนสุด */}
          {pages > 1 ? (
            <div className="pickpager">
              <button
                type="button"
                className="btn ghost"
                disabled={pageNo === 0}
                onClick={() => setPage(pageNo - 1)}
              >
                ← ก่อนหน้า
              </button>
              <span className="small muted">
                หน้า {pageNo + 1} / {pages}
              </span>
              <button
                type="button"
                className="btn ghost"
                disabled={pageNo >= pages - 1}
                onClick={() => setPage(pageNo + 1)}
              >
                ถัดไป →
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   หน่วยงานที่รับผิดชอบ — เลือกจากที่มีอยู่ หรือพิมพ์เพิ่มเองก็ได้

   ไฟล์แผนเก็บหน่วยงานเป็นข้อความเดียวคั่นด้วย "/" เช่น "ฝวจ./กวจ."
   ตัวนี้จึงทำงานกับข้อความรูปแบบนั้น ไม่ได้เปลี่ยนโครงสร้างข้อมูล
   แค่ทำให้กรอกง่ายขึ้นและไม่พิมพ์ชื่อหน่วยงานผิดจากที่มีอยู่แล้ว
   --------------------------------------------------------------------- */
export function OrgPicker({ value, onChange }) {
  const [typed, setTyped] = useState("");

  const parts = String(value || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  function set(next) {
    onChange(next.join("/"));
  }

  function add(name) {
    const n = String(name || "").trim();
    if (!n || parts.includes(n)) return;
    set(parts.concat([n]));
    setTyped("");
  }

  return (
    <div className="field">
      <label htmlFor="org-add">
        หน่วยงานที่รับผิดชอบ<span className="req"> *</span>
      </label>

      {parts.length ? (
        <div className="chiprow">
          {parts.map((p, i) => (
            <span className="orgchip" key={p + i}>
              {p}
              <button
                type="button"
                aria-label={"เอา " + p + " ออก"}
                onClick={() => set(parts.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="addrow">
        <select
          aria-label="เลือกหน่วยงานที่มีอยู่แล้ว"
          value=""
          onChange={(e) => add(e.target.value)}
        >
          <option value="">— เลือกจากหน่วยงานที่มีอยู่ —</option>
          {ORG_UNITS.filter((u) => !parts.includes(u.name)).map((u) => (
            <option key={u.key} value={u.name}>
              {u.name} ({fmt(u.count)} โครงการ)
            </option>
          ))}
        </select>

        <input
          id="org-add"
          type="text"
          placeholder="หรือพิมพ์หน่วยงานใหม่"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(typed);
            }
          }}
        />
        <button type="button" className="btn ghost" onClick={() => add(typed)}>
          เพิ่ม
        </button>
      </div>

      <div className="small muted" style={{ marginTop: 4 }}>
        หน่วยงานแรกในรายการถือเป็น <b>เจ้าของโครงการ</b> ใช้รวมยอดในแดชบอร์ด
        หน่วยงานที่เหลือคือผู้ร่วมดำเนินการ
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   แผนการดำเนินงานรายเดือน พร้อมเป้าหมายรายเดือน

   ไฟล์แผนต้นฉบับมีแต่ธงว่าเดือนไหนมีแผน ไม่มีเป้าหมายรายเดือน
   ตัวนี้จึงเพิ่มช่องเป้าหมายให้ทุกเดือนที่ติ๊กว่ามีแผน
   เดือนที่ไม่มีแผนแสดงเป็น "-" และปิดช่องกรอกไปเลย ไม่ใช่ปล่อยว่าง
   เพราะช่องว่างอ่านได้สองความหมาย (ยังไม่กรอก / ไม่มีแผน)

   ผลรวมเป้าหมายรายเดือนต้องเท่ากับค่าเป้าหมายรวมของตัวชี้วัดผลผลิต
   ถ้าไม่เท่าจะเตือนและกดอนุมัติไม่ได้ — เพราะถ้าปล่อยให้ไม่เท่า
   ตัวเลขที่รายงานรายเดือนจะบวกได้ไม่ตรงกับเป้าทั้งปีตั้งแต่ต้น
   --------------------------------------------------------------------- */
export function monthTargetSum(list) {
  return (list || []).reduce((a, v) => {
    const n = Number(String(v == null ? "" : v).replace(/,/g, ""));
    return a + (isFinite(n) ? n : 0);
  }, 0);
}

export function scheduleProblem(form) {
  const picked = (form.months || []).filter(Boolean).length;
  if (!picked) return "ยังไม่ได้เลือกเดือนที่มีแผนดำเนินงาน";

  for (let i = 0; i < 12; i++) {
    if (form.months[i] && String((form.monthTargets || [])[i] || "").trim() === "") {
      return "เดือนที่มีแผนต้องกรอกเป้าหมายให้ครบ — ยังขาด " + MONTHS[i];
    }
  }

  const goal = String(form.outputTarget || "").trim();
  if (goal === "") return "";
  const g = Number(goal.replace(/,/g, ""));
  if (!isFinite(g)) return "ค่าเป้าหมายรวมต้องเป็นตัวเลข";

  const sum = monthTargetSum(form.monthTargets);
  if (Math.abs(sum - g) > 0.0001) {
    return "ผลรวมเป้าหมายรายเดือน (" + fmt(sum) + ") ไม่เท่ากับค่าเป้าหมายรวม (" + fmt(g) + ")";
  }
  return "";
}

export function ScheduleFields({ form, setForm }) {
  const months = form.months || new Array(12).fill(0);
  const targets = form.monthTargets || new Array(12).fill("");
  const sum = monthTargetSum(targets);
  const problem = scheduleProblem(form);

  function toggle(i) {
    const m = months.slice();
    const t = targets.slice();
    m[i] = m[i] ? 0 : 1;
    if (!m[i]) t[i] = ""; // ปิดเดือนแล้วเป้าหมายต้องหายไปด้วย ไม่ค้างเป็นตัวเลขผี
    setForm({ ...form, months: m, monthTargets: t });
  }

  function setTarget(i, v) {
    const t = targets.slice();
    t[i] = v;
    setForm({ ...form, monthTargets: t });
  }

  return (
    <>
      <div className="grid2">
        <div className="field">
          <label htmlFor="sc-period">ระยะเวลาดำเนินงาน</label>
          <input
            id="sc-period"
            type="text"
            value={form.period || ""}
            placeholder="เช่น ต.ค. 2569 – ก.ย. 2570"
            onChange={(e) => setForm({ ...form, period: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="sc-goal">ค่าเป้าหมายรวมของตัวชี้วัดผลผลิต</label>
          <div className="addrow">
            <input
              id="sc-goal"
              type="text"
              inputMode="decimal"
              value={form.outputTarget || ""}
              placeholder="เช่น 1200"
              onChange={(e) => setForm({ ...form, outputTarget: e.target.value })}
            />
            <input
              type="text"
              aria-label="หน่วยนับ"
              value={form.outputUnit || ""}
              placeholder="หน่วยนับ เช่น ราย"
              onChange={(e) => setForm({ ...form, outputUnit: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="field">
        <label>เป้าหมายรายเดือน</label>
        <div className="mtgrid">
          {MONTHS_SHORT.map((m, i) => (
            <div className={"mtcell" + (months[i] ? " on" : "")} key={m}>
              <button
                type="button"
                className="mttoggle"
                aria-pressed={Boolean(months[i])}
                title={MONTHS[i]}
                onClick={() => toggle(i)}
              >
                {m}
              </button>
              {months[i] ? (
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={"เป้าหมายเดือน " + MONTHS[i]}
                  value={targets[i] == null ? "" : targets[i]}
                  onChange={(e) => setTarget(i, e.target.value)}
                />
              ) : (
                <div className="mtnone" aria-label={"ไม่มีแผนเดือน " + MONTHS[i]}>
                  –
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mtsum">
          <span>
            ผลรวมเป้าหมายรายเดือน <b>{fmt(sum)}</b>
            {form.outputUnit ? " " + form.outputUnit : ""}
          </span>
          {String(form.outputTarget || "").trim() !== "" ? (
            <span className={problem ? "st-bad" : "st-ok"}>
              {problem ? "ยังไม่ตรงกับค่าเป้าหมายรวม" : "ตรงกับค่าเป้าหมายรวม ✓"}
            </span>
          ) : null}
        </div>

        {problem ? <div className="small st-bad">{problem}</div> : null}

        <div className="small muted" style={{ marginTop: 4 }}>
          กดชื่อเดือนเพื่อเปิด/ปิดว่าเดือนนั้นมีแผน · เดือนที่ไม่มีแผนจะเป็น “–”
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------
   การเชื่อมโยงแผน — เลือกจากรายการจริงของแต่ละแผน ไม่ใช่พิมพ์เอง

   ตัวเลือกมาจาก data/ข้อมูลเชื่อมโยงแผน.xlsx (ผ่าน lib/plan-links.js)
   สำหรับสามแผนแรก ส่วนแผนวิสาหกิจ กยท. อ่านจากไฟล์แผนปฏิบัติการ
   เพราะยุทธศาสตร์กับกลยุทธ์อยู่ที่นั่นอยู่แล้วและตรงกันทุกตัวอักษร

   **เป็นดรอปดาวน์ ไม่ใช่ช่องพิมพ์** เพราะการเชื่อมโยงแผนต้องเลือกจาก
   รายการทางการเท่านั้น พิมพ์เองแล้วต่างกันนิดเดียวก็กลายเป็นคนละกลุ่ม
   ในหน้าความเชื่อมโยงแผนทันที (จัดกลุ่มด้วยข้อความตรงตัว)

   ชั้นล่างกรองตามเลขของชั้นบน — เลือกยุทธศาสตร์ชาติที่ 2 แล้วเป้าหมาย
   เหลือเฉพาะ 2.x ไม่ต้องไล่หาเองในรายการ 35 บรรทัด
   --------------------------------------------------------------------- */
export function PlanLinkFields({ form, setForm }) {
  /* ยุทธศาสตร์/กลยุทธ์ของ กยท. ย้ายมาอยู่ในส่วนนี้ เพราะมันคือ
     "การเชื่อมโยงกับแผนวิสาหกิจ กยท." ไม่ใช่ข้อมูลของโครงการเอง
     กลยุทธ์กรองตามยุทธศาสตร์ที่เลือกอยู่แล้วในโครงสร้าง STRATEGIES */
  const strategy = STRATEGIES.find((s) => s.name === form.strategy) || null;

  function set(patch) {
    setForm({ ...form, ...patch });
  }

  /* ตัวเลือกของแต่ละช่อง พร้อมตัวกรองตามชั้นบน */
  function optionsFor(key) {
    if (key === "nGoal" || key === "nIssue") return underNo(linkOptions(key), leadNo(form.nX));
    if (key === "nYGoal" || key === "nSub") return underNo(linkOptions(key), leadNo(form.nY));
    if (key === "nSubGoal") return underNo(linkOptions(key), leadNo(form.nSub || form.nY));
    if (key === "mWay") return underNo(linkOptions(key), leadNo(form.mIssue));
    return linkOptions(key);
  }

  /* เลือกชั้นบนใหม่ ต้องล้างชั้นล่างที่ไม่เข้าพวกแล้วทิ้ง
     ไม่งั้นจะเหลือ "ยุทธศาสตร์ชาติที่ 2" คู่กับ "เป้าหมาย 5.1" ค้างอยู่ */
  const CLEARS = {
    nX: ["nGoal", "nIssue"],
    nY: ["nYGoal", "nSub", "nSubGoal"],
    nSub: ["nSubGoal"],
    mIssue: ["mWay"],
  };

  function pick(key, value) {
    const patch = { [key]: value };
    (CLEARS[key] || []).forEach((k) => (patch[k] = ""));
    set(patch);
  }

  return (
    <div className="linkgrid">
      {PLAN_LINKS.map((plan) => {
        const isRaot = plan.key === "raot";
        const filled = plan.levels.filter((l) => String(form[l.key] || "").trim()).length;

        return (
          <div className="linkcard" key={plan.key}>
            <div className="linkhead">
              <b>{plan.name}</b>
              <span
                className={
                  "pill " + (filled === plan.levels.length ? "ok" : filled ? "warn" : "none")
                }
              >
                {filled}/{plan.levels.length}
              </span>
            </div>

            {/* ---------- แผนวิสาหกิจ กยท. ----------
                so มาจากยุทธศาสตร์ที่เลือก ไม่ให้เลือกแยก เพราะหนึ่งยุทธศาสตร์
                มี SO เดียวตายตัวอยู่แล้วในไฟล์แผน */}
            {isRaot ? (
              <>
                <div className="field">
                  <label htmlFor="lk-strategy">
                    ยุทธศาสตร์<span className="req"> *</span>
                  </label>
                  <select
                    id="lk-strategy"
                    value={form.strategy || ""}
                    onChange={(e) =>
                      set({
                        strategy: e.target.value,
                        tactic: "",
                        so:
                          (STRATEGIES.find((s) => s.name === e.target.value) || {}).so || "",
                      })
                    }
                  >
                    <option value="">— เลือกยุทธศาสตร์ —</option>
                    {STRATEGIES.map((s) => (
                      <option key={s.no} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="lk-tactic">กลยุทธ์</label>
                  <select
                    id="lk-tactic"
                    value={form.tactic || ""}
                    disabled={!strategy}
                    onChange={(e) => set({ tactic: e.target.value })}
                  >
                    <option value="">
                      {strategy
                        ? "— เลือกกลยุทธ์ (" + strategy.tactics.length + " ข้อ) —"
                        : "เลือกยุทธศาสตร์ก่อน"}
                    </option>
                    {(strategy ? strategy.tactics : []).map((t) => (
                      <option key={t.no || t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>วัตถุประสงค์เชิงยุทธศาสตร์ (SO)</label>
                  <div className={"linkro" + (form.so ? "" : " empty")}>
                    {form.so || "— เลือกยุทธศาสตร์แล้วจะขึ้นให้เอง —"}
                  </div>
                </div>
              </>
            ) : (
              plan.levels.map((l) => {
                const list = optionsFor(l.key);
                const val = form[l.key] || "";
                /* ค่าที่เคยกรอกไว้แต่ไม่อยู่ในรายการ (ข้อมูลเก่า/ร่างเดิม)
                   ต้องเติมเป็นตัวเลือกด้วย ไม่งั้นดรอปดาวน์จะเด้งกลับเป็นว่าง
                   แล้วค่าเดิมหายไปเงียบ ๆ ตอนบันทึก */
                const extra = val && list.indexOf(val) < 0 ? [val] : [];
                return (
                  <div className="field" key={l.key}>
                    <label htmlFor={"lk-" + l.key}>{l.label}</label>
                    <select
                      id={"lk-" + l.key}
                      value={val}
                      onChange={(e) => pick(l.key, e.target.value)}
                    >
                      <option value="">
                        {list.length ? "— เลือก (" + fmt(list.length) + " รายการ) —" : "— ไม่ระบุ —"}
                      </option>
                      {extra.concat(list).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
/* ---------------------------------------------------------------------
   กิจกรรมภายใต้โครงการ — กรอกพร้อมกันตอนสร้างโครงการใหม่

   ไฟล์แผนต้นฉบับเก็บแผนรายเดือนไว้ที่ระดับกิจกรรมเป็นหลัก (399/553 แถว
   มีธงเดือน แต่ระดับโครงการมีเองแค่ 12/121) การสร้างโครงการที่มีกิจกรรม
   แล้วใส่แผนรายเดือนไว้ที่โครงการ จึงผิดโครงสร้างข้อมูลตั้งแต่ต้น

   ดังนั้น **มีกิจกรรมเมื่อไหร่ แผนการดำเนินงานย้ายไปอยู่ที่กิจกรรมทั้งหมด**
   โครงการไม่มีแผนของตัวเอง เพราะ monthsOf() ม้วนของลูกขึ้นมาให้อยู่แล้ว

   รหัสกิจกรรมเติมให้อัตโนมัติเป็น <รหัสโครงการ> + 01, 02, ... แต่แก้ได้
   เพราะบางโครงการเลขกิจกรรมไม่ได้เรียงจาก 01 ตามไฟล์เดิม
   --------------------------------------------------------------------- */
export const emptyActivity = () => ({
  code: "",
  name: "",
  output: "",
  budget: "",
  outputTarget: "",
  outputUnit: "",
  months: new Array(12).fill(0),
  monthTargets: new Array(12).fill(""),
});

/* ปัญหาของกิจกรรมหนึ่งตัว — คืนข้อความว่าง ๆ ถ้าไม่มีปัญหา */
export function activityProblem(a, projectCode, all, index) {
  const c = String(a.code || "").trim();
  if (!String(a.name || "").trim()) return "ยังไม่ได้ใส่ชื่อกิจกรรม";
  if (!c) return "ยังไม่ได้ใส่รหัสกิจกรรม";
  if (!/^\d{8}$/.test(c)) return "รหัสกิจกรรมต้องเป็นตัวเลข 8 หลัก";
  if (projectCode && c.slice(0, 6) !== projectCode) {
    return "6 หลักแรกต้องเป็น " + projectCode + " ตามรหัสโครงการ";
  }
  if (all.some((o, i) => i !== index && String(o.code || "").trim() === c)) {
    return "รหัสซ้ำกับกิจกรรมอื่นในโครงการนี้";
  }
  if (!String(a.output || "").trim()) return "ยังไม่ได้ใส่ตัวชี้วัดผลผลิต";
  return scheduleProblem(a);
}

export function ActivityFields({ acts, setActs, projectCode }) {
  function update(i, next) {
    setActs(acts.map((a, j) => (i === j ? next : a)));
  }

  function add() {
    const a = emptyActivity();
    // เดารหัสถัดไปให้ ไม่ต้องนับเองว่าถึงเลขไหนแล้ว
    if (projectCode && /^\d{6}$/.test(projectCode)) {
      a.code = projectCode + String(acts.length + 1).padStart(2, "0");
    }
    setActs(acts.concat([a]));
  }

  return (
    <>
      <div className="small muted" style={{ marginBottom: 12 }}>
        โครงการที่มีกิจกรรมย่อย ให้ใส่แผนการดำเนินงานและเป้าหมายรายเดือน
        <b> ที่กิจกรรมแต่ละตัว</b> ไม่ใช่ที่ตัวโครงการ —
        ยอดของโครงการม้วนขึ้นมาจากกิจกรรมให้เอง
        {acts.length ? null : " · ถ้าโครงการนี้ไม่มีกิจกรรมย่อย ข้ามส่วนนี้ไปได้เลย"}
      </div>

      {acts.map((a, i) => {
        const err = activityProblem(a, projectCode, acts, i);
        return (
          <div className={"actcard" + (err ? "" : " ok")} key={i}>
            <div className="actcard-head">
              <b>กิจกรรมที่ {i + 1}</b>
              {err ? (
                <span className="pill warn">{err}</span>
              ) : (
                <span className="pill ok">กรอกครบแล้ว</span>
              )}
              <button
                type="button"
                className="linkbtn del"
                onClick={() => setActs(acts.filter((_, j) => j !== i))}
              >
                เอากิจกรรมนี้ออก
              </button>
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor={"ac-code-" + i}>
                  รหัสกิจกรรม (8 หลัก)<span className="req"> *</span>
                </label>
                <input
                  id={"ac-code-" + i}
                  type="text"
                  inputMode="numeric"
                  value={a.code}
                  placeholder={(projectCode || "010101") + "01"}
                  onChange={(e) => update(i, { ...a, code: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={"ac-bud-" + i}>งบประมาณของกิจกรรม (บาท)</label>
                <input
                  id={"ac-bud-" + i}
                  type="text"
                  inputMode="numeric"
                  value={a.budget}
                  onChange={(e) => update(i, { ...a, budget: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor={"ac-name-" + i}>
                ชื่อกิจกรรม<span className="req"> *</span>
              </label>
              <input
                id={"ac-name-" + i}
                type="text"
                value={a.name}
                onChange={(e) => update(i, { ...a, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor={"ac-out-" + i}>
                ตัวชี้วัดผลผลิตของกิจกรรม<span className="req"> *</span>
              </label>
              <textarea
                id={"ac-out-" + i}
                rows={2}
                value={a.output}
                onChange={(e) => update(i, { ...a, output: e.target.value })}
              />
            </div>

            <ScheduleFields form={a} setForm={(next) => update(i, next)} />
          </div>
        );
      })}

      <div className="btnrow">
        <button type="button" className="btn ghost" onClick={add}>
          + เพิ่มกิจกรรม
        </button>
        {acts.length ? (
          <span className="small muted" style={{ alignSelf: "center" }}>
            รวม {acts.length} กิจกรรม · งบกิจกรรมรวม{" "}
            {fmt(
              acts.reduce(
                (s, a) => s + (Number(String(a.budget || "0").replace(/,/g, "")) || 0),
                0
              )
            )}{" "}
            บาท
          </span>
        ) : null}
      </div>
    </>
  );
}
