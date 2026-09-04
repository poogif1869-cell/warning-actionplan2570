"use client";

/* =====================================================================
   ชิ้นส่วนที่ใช้ซ้ำในหน้าแก้ไขแผน

   แยกออกมาจาก app/(app)/plan-edit/page.jsx เพราะหน้านั้นยาวพอแล้ว
   และสามชิ้นนี้เป็นเรื่องของ "วิธีเลือก/กรอก" ล้วน ๆ ไม่ผูกกับโหมดไหน
   ===================================================================== */

import { useMemo, useState } from "react";
import { ITEMS, PROJECTS, MONTHS, MONTHS_SHORT } from "@/lib/plan";
import { STRATEGIES, ORG_UNITS, inUnit } from "@/lib/rollup";
import { money, fmt } from "@/lib/format";

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

  const pool = onlyProjects ? PROJECTS : ITEMS.filter((x) => x.lvl >= 1);

  const list = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return pool.filter((p) => {
      if (exclude && exclude(p)) return false;
      if (sNo && p.sNo !== sNo) return false;
      if (org && !inUnit(p, org)) return false;
      if (needle) {
        const hay = (p.code + " " + p.name + " " + (p.org || "")).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [pool, q, sNo, org, exclude]);

  const shown = list.slice(0, 60);

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
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pick-s">ยุทธศาสตร์</label>
          <select id="pick-s" value={sNo} onChange={(e) => setSNo(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {STRATEGIES.map((s) => (
              <option key={s.no} value={s.no}>
                ยุทธศาสตร์ที่ {s.no}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pick-o">หน่วยงาน</label>
          <select id="pick-o" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {ORG_UNITS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="small muted" style={{ marginBottom: 6 }}>
        พบ {fmt(list.length)} รายการ
        {list.length > shown.length
          ? " · แสดง " + shown.length + " รายการแรก พิมพ์คำค้นเพิ่มเพื่อให้แคบลง"
          : ""}
      </div>

      <div className="picklist">
        {shown.length === 0 ? (
          <div className="small muted" style={{ padding: 12 }}>
            ไม่พบรายการที่ตรงกับที่ค้น
          </div>
        ) : (
          shown.map((p) => (
            <button
              type="button"
              key={p.uid}
              className={"pickrow" + (p.uid === value ? " on" : "")}
              onClick={() => onChange(p.uid)}
            >
              <span className="pickmark">{p.uid === value ? "✓" : ""}</span>
              <span className="pickname">
                <b>{p.code}</b> {p.name}
                <span className="small muted">
                  {" "}
                  · {p.lvl === 1 ? "โครงการ" : "กิจกรรม"}
                  {p.org ? " · " + p.org : ""} · {money(p.budget)} บาท
                </span>
              </span>
            </button>
          ))
        )}
      </div>
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
