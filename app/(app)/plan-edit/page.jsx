"use client";

/* =====================================================================
   หน้าแก้ไขแผน — ที่เดียวที่เปลี่ยนตัวแผนได้ (ไม่ใช่ผลการดำเนินงาน)

   ห้าโหมดในหน้าเดียว เพราะทุกโหมดจบด้วยการเขียนแถวลงตาราง plan_edits
   เหมือนกันหมด ต่างกันแค่กรอกอะไรกับต้องมีมติหรือไม่:

     add       เพิ่มโครงการ/กิจกรรม     ต้องมีมติ (ตอนกดอนุมัติ)
     delete    ลบโครงการ/กิจกรรม        ต้องมีมติ
     kpi       แก้ตัวชี้วัด              ต้องมีมติ
     budget    แก้งบที่ได้รับจัดสรร      ไม่ต้องมีมติ แต่เก็บงบเดิมไว้เทียบ
     schedule  แก้แผน/ระยะเวลาดำเนินงาน  ไม่ต้องมีมติ

   ทุกโหมดถูกบันทึกลงถังการแก้ไขข้อมูลเสมอ พร้อมชื่อผู้แก้และเวลา
   (ฐานข้อมูลใส่ updated_by/updated_at ให้เองด้วย trigger ปลอมไม่ได้)

   อ่านพารามิเตอร์จาก window.location ใน useEffect แทน useSearchParams
   เพราะ useSearchParams บังคับให้ต้องมี <Suspense> ครอบตอน build
   ===================================================================== */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ITEMS,
  byUid,
  MONTHS,
  MONTHS_SHORT,
  FUNDS,
  newUid,
} from "@/lib/plan";
import { STRATEGIES, PROGRAMS, ORG_UNITS } from "@/lib/rollup";
import { money } from "@/lib/format";
import { useResults } from "@/lib/store";
import ApprovalFields, { isApprovalComplete } from "@/components/approval-fields";
import ConfirmDialog from "@/components/confirm-dialog";

const MODES = {
  add: {
    title: "เพิ่มโครงการ / กิจกรรม",
    lead: "กรอกรายละเอียดให้ครบ แล้วเลือกว่าจะบันทึกร่างไว้ก่อน หรืออนุมัติเข้าแผนเลย",
    needsApproval: true,
  },
  delete: {
    title: "ลบโครงการ / กิจกรรม",
    lead: "ต้องอ้างมติที่อนุมัติให้ยกเลิก และรายการที่ลบจะยังอยู่ในถังการแก้ไขข้อมูล",
    needsApproval: true,
  },
  kpi: {
    title: "แก้ไขตัวชี้วัด",
    lead: "ตัวชี้วัดเป็นสิ่งที่ผูกกับมติที่อนุมัติโครงการ การแก้จึงต้องอ้างมติ",
    needsApproval: true,
  },
  budget: {
    title: "แก้ไขงบประมาณที่ได้รับจัดสรร",
    lead: "งบเดิมจะถูกเก็บไว้เทียบในแดชบอร์ด ไม่ได้ถูกเขียนทับหายไป",
    needsApproval: false,
  },
  schedule: {
    title: "แก้ไขแผน / ระยะเวลาดำเนินงาน",
    lead: "แก้ได้เลยไม่ต้องมีมติ แต่ทุกครั้งจะถูกบันทึกไว้ในถังการแก้ไขข้อมูล",
    needsApproval: false,
  },
};

const LEVELS = [
  [1, "โครงการ", "รหัส 6 หลัก"],
  [2, "กิจกรรม", "รหัส 8 หลัก — 6 หลักแรกต้องตรงกับรหัสโครงการแม่"],
  [3, "กิจกรรมย่อย", "รหัส 9 หลัก — 8 หลักแรกต้องตรงกับรหัสกิจกรรมแม่"],
];

const emptyForm = () => ({
  lvl: 1,
  code: "",
  name: "",
  org: "",
  strategy: "",
  so: "",
  tactic: "",
  program: "",
  fund: "",
  budget: "",
  output: "",
  outcome: "",
  kpi: "",
  period: "",
  summary: "",
  months: new Array(12).fill(0),
});

export default function PlanEditPage() {
  const router = useRouter();
  const { canEdit, loaded, hasPlanEdits, savePlanEdit, planEdits } = useResults();

  const [mode, setMode] = useState("add");
  const [uid, setUid] = useState("");
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [approval, setApproval] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(null); // null | "approve" | "delete"
  const [ready, setReady] = useState(false);

  /* ---------- รับพารามิเตอร์จาก URL ---------- */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("mode");
    if (m && MODES[m]) setMode(m);
    const u = q.get("uid");
    if (u) setUid(u);
    const id = q.get("id");
    if (id) setEditId(id);
    setReady(true);
  }, []);

  const target = uid ? byUid.get(uid) : null;
  const info = MODES[mode] || MODES.add;

  /* ---------- เปิดร่างเดิมขึ้นมาแก้ต่อ ---------- */
  useEffect(() => {
    if (!editId || !planEdits.length) return;
    const row = planEdits.find((e) => e.id === editId);
    if (!row) return;
    setMode(row.kind);
    setUid(row.uid);
    setApproval({
      res_no: row.res_no || "",
      res_date: row.res_date || "",
      doc_no: row.doc_no || "",
      doc_date: row.doc_date || "",
    });
    setNote(row.note || "");
    if (row.kind === "add") setForm({ ...emptyForm(), ...(row.data || {}) });
  }, [editId, planEdits]);

  /* ---------- โหมดแก้ของเดิม: เติมค่าปัจจุบันลงฟอร์มให้ ---------- */
  useEffect(() => {
    if (!target || mode === "add" || mode === "delete") return;
    setForm((f) => ({
      ...f,
      budget: target.budget == null ? "" : String(target.budget),
      output: target.output || "",
      outcome: target.outcome || "",
      kpi: target.kpi || "",
      period: target.period || "",
      months: (target.months || new Array(12).fill(0)).slice(),
    }));
  }, [target, mode]);

  const strategy = useMemo(
    () => STRATEGIES.find((s) => s.name === form.strategy) || null,
    [form.strategy]
  );

  /* ---------- ตรวจความครบถ้วน ----------
     แยกเป็นสองระดับ: ร่างขอแค่มีชื่อ ส่วนอนุมัติต้องครบจริง
     เพราะร่างมีไว้ให้เก็บงานที่ยังทำไม่เสร็จ ถ้าบังคับครบตั้งแต่ร่าง
     ก็ไม่มีเหตุผลให้มีปุ่มร่างตั้งแต่แรก */
  const codeErr = useMemo(() => {
    if (mode !== "add") return "";
    const c = String(form.code || "").trim();
    if (!c) return "ต้องกรอกรหัส";
    if (!/^\d+$/.test(c)) return "รหัสต้องเป็นตัวเลขล้วน";
    const want = form.lvl === 1 ? 6 : form.lvl === 2 ? 8 : 9;
    if (c.length !== want) return "ระดับนี้ต้องใช้รหัส " + want + " หลัก";
    if (form.lvl >= 2) {
      const parentCode = c.slice(0, form.lvl === 2 ? 6 : 8);
      if (!ITEMS.some((x) => x.code === parentCode)) {
        return "ไม่พบรายการแม่รหัส " + parentCode + " ในแผน";
      }
    }
    if (ITEMS.some((x) => x.code === c)) {
      return "รหัสนี้มีอยู่แล้วในแผน — ถ้าตั้งใจให้ซ้ำ ให้แก้รายการเดิมแทน";
    }
    return "";
  }, [mode, form.code, form.lvl]);

  const missing = useMemo(() => {
    const out = [];
    if (mode === "add") {
      if (!String(form.name || "").trim()) out.push("ชื่อโครงการ/กิจกรรม");
      if (codeErr) out.push("รหัส (" + codeErr + ")");
      if (!String(form.org || "").trim()) out.push("หน่วยงานที่รับผิดชอบ");
      if (form.lvl === 1 && !String(form.strategy || "").trim()) out.push("ยุทธศาสตร์");
    }
    if (mode !== "add" && !target) out.push("รายการที่จะแก้");
    if (info.needsApproval && !isApprovalComplete(approval)) out.push("มติอนุมัติให้ครบทั้งสี่ช่อง");
    return out;
  }, [mode, form, codeErr, target, info.needsApproval, approval]);

  const canApprove = missing.length === 0 && canEdit && hasPlanEdits;
  const canDraft =
    canEdit &&
    hasPlanEdits &&
    (mode === "add" ? String(form.name || "").trim() !== "" : Boolean(target));

  /* ---------- ประกอบแถวที่จะเขียนลงถัง ---------- */
  function buildEdit(status) {
    const base = {
      id: editId || undefined,
      kind: mode,
      status,
      note,
      res_no: approval.res_no,
      res_date: approval.res_date,
      doc_no: approval.doc_no,
      doc_date: approval.doc_date,
    };

    if (mode === "add") {
      return {
        ...base,
        uid: uid || newUid(String(form.code || "000000").trim()),
        data: {
          ...form,
          code: String(form.code || "").trim(),
          budget: Number(form.budget) || 0,
          so: strategy ? strategy.so || "" : form.so,
        },
        prev: {},
      };
    }

    if (mode === "delete") {
      return {
        ...base,
        uid,
        data: {},
        prev: {
          code: target.code,
          name: target.name,
          org: target.org,
          budget: target.budget || 0,
          lvl: target.lvl,
        },
      };
    }

    if (mode === "budget") {
      return {
        ...base,
        uid,
        data: { budget: Number(form.budget) || 0 },
        // เก็บงบเดิม "ตามไฟล์แผน" ไม่ใช่งบล่าสุด เพราะแดชบอร์ดเทียบกับแผนเดิม
        prev: { budget: target.baseBudget == null ? target.budget || 0 : target.baseBudget },
      };
    }

    if (mode === "kpi") {
      return {
        ...base,
        uid,
        data: { output: form.output, outcome: form.outcome, kpi: form.kpi },
        prev: { output: target.output, outcome: target.outcome, kpi: target.kpi },
      };
    }

    return {
      ...base,
      uid,
      data: { months: form.months, period: form.period },
      prev: { months: (target.months || []).slice(), period: target.period },
    };
  }

  async function submit(status) {
    setBusy(true);
    setErr("");
    const saved = await savePlanEdit(buildEdit(status));
    setBusy(false);
    setAsk(null);
    if (!saved) {
      setErr("บันทึกไม่สำเร็จ — ดูข้อความแจ้งเตือนด้านบนของหน้า");
      return;
    }
    router.push("/changes");
  }

  if (!loaded || !ready) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  return (
    <>
      <section className="block">
        <h2>
          {info.title}
          <small>{info.lead}</small>
        </h2>

        {!canEdit ? (
          <div className="banner bad">
            บัญชีของคุณเป็น <b>ผู้ดูอย่างเดียว</b> — แก้แผนไม่ได้
            ให้ผู้ดูแลระบบเปิดสิทธิ์ให้ก่อน
          </div>
        ) : null}

        {!hasPlanEdits ? (
          <div className="banner bad">
            ฐานข้อมูลยังไม่มีตาราง <code>plan_edits</code> —
            ให้ผู้ดูแลเอา <code>supabase/schema.sql</code> ไปรันใน Supabase SQL Editor ก่อน
          </div>
        ) : null}

        {/* ---------- เลือกสิ่งที่จะทำ ---------- */}
        <div className="segmented" style={{ marginBottom: 16 }}>
          {Object.keys(MODES).map((k) => (
            <button
              key={k}
              aria-pressed={mode === k}
              onClick={() => {
                setMode(k);
                setErr("");
              }}
            >
              {MODES[k].title.replace(" / ", "/")}
            </button>
          ))}
        </div>

        <fieldset className="plainset" disabled={!canEdit || busy}>
          {/* ---------- เลือกรายการเป้าหมาย (ทุกโหมดยกเว้นเพิ่ม) ---------- */}
          {mode !== "add" ? (
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="pe-target">รายการที่จะแก้</label>
              <select
                id="pe-target"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                style={{ width: "100%", maxWidth: "none" }}
              >
                <option value="">— เลือกโครงการหรือกิจกรรม —</option>
                {ITEMS.filter((x) => x.lvl >= 1).map((x) => (
                  <option key={x.uid} value={x.uid}>
                    {x.lvl === 1 ? "โครงการ" : "กิจกรรม"} {x.code} — {x.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {mode !== "add" && target ? (
            <div className="card pad" style={{ marginBottom: 16 }}>
              <div className="small muted">รายการที่เลือก</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {target.code} {target.name}
              </div>
              <div className="small muted">
                {target.org || "ไม่ระบุหน่วยงาน"} · งบตามแผน {money(target.budget)} บาท
                {target.baseBudget != null && target.baseBudget !== target.budget
                  ? " (งบเดิม " + money(target.baseBudget) + " บาท)"
                  : ""}
              </div>
            </div>
          ) : null}

          {/* ---------- โหมดเพิ่ม: ฟอร์มเต็ม ---------- */}
          {mode === "add" ? (
            <>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>ระดับของรายการ</label>
                <div className="monthpick">
                  {LEVELS.map(([lv, lab]) => (
                    <button
                      key={lv}
                      type="button"
                      aria-pressed={form.lvl === lv}
                      onClick={() => setForm({ ...form, lvl: lv })}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
                <div className="small muted" style={{ marginTop: 5 }}>
                  {(LEVELS.find((l) => l[0] === form.lvl) || [])[2]}
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="pe-code">
                    รหัส<span className="req"> *</span>
                  </label>
                  <input
                    id="pe-code"
                    type="text"
                    inputMode="numeric"
                    value={form.code}
                    placeholder={form.lvl === 1 ? "010101" : form.lvl === 2 ? "01010101" : "010101011"}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                  {codeErr && form.code ? <div className="small st-bad">{codeErr}</div> : null}
                </div>
                <div className="field">
                  <label htmlFor="pe-fund">แหล่งงบประมาณ</label>
                  <select
                    id="pe-fund"
                    value={form.fund}
                    onChange={(e) => setForm({ ...form, fund: e.target.value })}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {FUNDS.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.code} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="pe-name">
                  ชื่อโครงการ / กิจกรรม<span className="req"> *</span>
                </label>
                <input
                  id="pe-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="pe-org">
                  หน่วยงานที่รับผิดชอบ<span className="req"> *</span>
                </label>
                <input
                  id="pe-org"
                  type="text"
                  list="pe-orglist"
                  value={form.org}
                  placeholder="เช่น ฝวจ./กวจ. — คั่นด้วย / เมื่อมีหลายส่วนงาน"
                  onChange={(e) => setForm({ ...form, org: e.target.value })}
                />
                <datalist id="pe-orglist">
                  {ORG_UNITS.map((u) => (
                    <option key={u.key} value={u.name} />
                  ))}
                </datalist>
              </div>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="pe-strategy">
                    ยุทธศาสตร์{form.lvl === 1 ? <span className="req"> *</span> : null}
                  </label>
                  <select
                    id="pe-strategy"
                    value={form.strategy}
                    onChange={(e) =>
                      setForm({ ...form, strategy: e.target.value, tactic: "" })
                    }
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {STRATEGIES.map((s) => (
                      <option key={s.no} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pe-tactic">กลยุทธ์</label>
                  <select
                    id="pe-tactic"
                    value={form.tactic}
                    disabled={!strategy}
                    onChange={(e) => setForm({ ...form, tactic: e.target.value })}
                  >
                    <option value="">
                      {strategy ? "— ไม่ระบุ —" : "เลือกยุทธศาสตร์ก่อน"}
                    </option>
                    {(strategy ? strategy.tactics : []).map((t) => (
                      <option key={t.no || t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="pe-program">แผนงาน</label>
                  <input
                    id="pe-program"
                    type="text"
                    list="pe-proglist"
                    value={form.program}
                    onChange={(e) => setForm({ ...form, program: e.target.value })}
                  />
                  <datalist id="pe-proglist">
                    {PROGRAMS.map((p) => (
                      <option key={p.name} value={p.name} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor="pe-budget">งบประมาณที่ได้รับจัดสรร (บาท)</label>
                  <input
                    id="pe-budget"
                    type="text"
                    inputMode="numeric"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  />
                </div>
              </div>

              <Indicators form={form} setForm={setForm} />
              <Schedule form={form} setForm={setForm} />

              <div className="field">
                <label htmlFor="pe-summary">สาระสำคัญของโครงการ</label>
                <textarea
                  id="pe-summary"
                  rows={3}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>
            </>
          ) : null}

          {/* ---------- โหมดแก้งบ ---------- */}
          {mode === "budget" && target ? (
            <div className="grid2">
              <div className="field">
                <label>งบเดิมตามไฟล์แผน (บาท)</label>
                <input
                  type="text"
                  value={money(target.baseBudget == null ? target.budget : target.baseBudget)}
                  readOnly
                  disabled
                />
              </div>
              <div className="field">
                <label htmlFor="pe-newbudget">งบที่ได้รับจัดสรรใหม่ (บาท)</label>
                <input
                  id="pe-newbudget"
                  type="text"
                  inputMode="numeric"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          {/* ---------- โหมดแก้ตัวชี้วัด ---------- */}
          {mode === "kpi" && target ? <Indicators form={form} setForm={setForm} /> : null}

          {/* ---------- โหมดแก้แผนการดำเนินงาน ---------- */}
          {mode === "schedule" && target ? <Schedule form={form} setForm={setForm} /> : null}

          {/* ---------- โหมดลบ ---------- */}
          {mode === "delete" && target ? (
            <div className="banner bad">
              <b>กำลังจะลบ {target.code} {target.name}</b>
              <div style={{ marginTop: 4 }}>
                {target.lvl === 1 && (target._kids || []).length
                  ? "โครงการนี้มีกิจกรรมย่อย " +
                    target._kids.length +
                    " รายการ กิจกรรมทั้งหมดจะถูกลบไปด้วย"
                  : "รายการนี้จะหายไปจากทุกหน้าและทุกยอดรวม"}
              </div>
              <div className="small" style={{ marginTop: 4 }}>
                ผลการดำเนินงานและรายการงบประมาณที่เคยกรอกไว้ไม่ได้ถูกลบจากฐานข้อมูล
                แต่จะไม่ถูกนำมาแสดง เพราะไม่มีรายการในแผนให้ผูกอีกแล้ว
              </div>
            </div>
          ) : null}

          {/* ---------- มติอนุมัติ ---------- */}
          {info.needsApproval ? (
            <ApprovalFields value={approval} onChange={setApproval} idPrefix="pe" />
          ) : null}

          <div className="field">
            <label htmlFor="pe-note">หมายเหตุ (ไม่บังคับ)</label>
            <textarea
              id="pe-note"
              rows={2}
              value={note}
              placeholder="เหตุผลของการเปลี่ยนแปลง เพื่อให้คนอ่านถังการแก้ไขเข้าใจ"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {missing.length ? (
            <div className="banner">
              ยังกรอกไม่ครบ จึงยังกด{mode === "delete" ? "ลบ" : "อนุมัติ"}ไม่ได้ —
              ขาด {missing.join(" · ")}
            </div>
          ) : null}

          {err ? <div className="banner bad">{err}</div> : null}

          <div className="btnrow">
            {mode === "delete" ? (
              <button
                className="btn danger"
                disabled={!canApprove || busy}
                onClick={() => setAsk("delete")}
              >
                ลบโครงการ
              </button>
            ) : (
              <button
                className="btn"
                disabled={!canApprove || busy}
                onClick={() => setAsk("approve")}
              >
                {mode === "add" ? "อนุมัติโครงการ" : "บันทึกการแก้ไข"}
              </button>
            )}

            {/* ร่างมีเฉพาะโหมดเพิ่ม — โหมดอื่นเป็นการแก้ของที่มีอยู่แล้ว
                ถ้าเก็บเป็นร่างได้ด้วยจะกลายเป็นว่ามีค่าค้างที่ไม่มีผลกับอะไรเลย */}
            {mode === "add" ? (
              <button
                className="btn ghost"
                disabled={!canDraft || busy}
                onClick={() => submit("draft")}
              >
                บันทึกร่าง
              </button>
            ) : null}

            <Link className="btn ghost" href="/changes">
              ดูถังการแก้ไขข้อมูล
            </Link>
          </div>

          <div className="hint">
            <b>บันทึกร่าง</b> เก็บข้อมูลไว้เฉย ๆ ยังไม่ถูกนำไปคิดในแดชบอร์ดหรือยอดรวมใด ๆ ·{" "}
            <b>อนุมัติโครงการ</b> ทำให้รายการมีผลจริงกับทุกหน้าทันที
          </div>
        </fieldset>
      </section>

      {ask ? (
        <ConfirmDialog
          title={
            ask === "delete"
              ? "ยืนยันลบ " + (target ? target.name : "")
              : mode === "add"
              ? "อนุมัติเพิ่มโครงการนี้เข้าแผน"
              : "ยืนยันการแก้ไขแผน"
          }
          confirmLabel={ask === "delete" ? "ลบโครงการ" : "ยืนยัน"}
          danger={ask === "delete"}
          busy={busy}
          onConfirm={() => submit("approved")}
          onCancel={() => setAsk(null)}
        >
          <p>
            {ask === "delete"
              ? "รายการนี้จะหายไปจากทุกยอดรวมทันที และถูกบันทึกไว้ในถังการแก้ไขข้อมูลพร้อมมติที่อ้างถึง"
              : "การเปลี่ยนแปลงจะมีผลกับทุกหน้าทันที และถูกบันทึกไว้ในถังการแก้ไขข้อมูลพร้อมชื่อผู้แก้และเวลา"}
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/* ---------- ช่องตัวชี้วัด ใช้ทั้งโหมดเพิ่มและโหมดแก้ตัวชี้วัด ---------- */
function Indicators({ form, setForm }) {
  return (
    <>
      <div className="field">
        <label htmlFor="pe-output">ตัวชี้วัดผลผลิต (Output)</label>
        <textarea
          id="pe-output"
          rows={2}
          value={form.output}
          onChange={(e) => setForm({ ...form, output: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="pe-outcome">ตัวชี้วัดผลลัพธ์ (Outcome)</label>
        <textarea
          id="pe-outcome"
          rows={2}
          value={form.outcome}
          onChange={(e) => setForm({ ...form, outcome: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="pe-kpi">ตัวชี้วัดอื่น ๆ</label>
        <textarea
          id="pe-kpi"
          rows={2}
          value={form.kpi}
          onChange={(e) => setForm({ ...form, kpi: e.target.value })}
        />
      </div>
    </>
  );
}

/* ---------- แผนการดำเนินงานรายเดือน + ระยะเวลา ---------- */
function Schedule({ form, setForm }) {
  function toggle(i) {
    const next = (form.months || new Array(12).fill(0)).slice();
    next[i] = next[i] ? 0 : 1;
    setForm({ ...form, months: next });
  }

  const picked = (form.months || []).filter(Boolean).length;

  return (
    <>
      <div className="field">
        <label htmlFor="pe-period">ระยะเวลาดำเนินงาน (ข้อความ)</label>
        <input
          id="pe-period"
          type="text"
          value={form.period}
          placeholder="เช่น ต.ค. 2569 – ก.ย. 2570"
          onChange={(e) => setForm({ ...form, period: e.target.value })}
        />
      </div>

      <div className="field">
        <label>เดือนที่มีแผนดำเนินงาน ({picked} เดือน)</label>
        <div className="monthpick">
          {MONTHS_SHORT.map((m, i) => (
            <button
              key={m}
              type="button"
              aria-pressed={Boolean((form.months || [])[i])}
              title={MONTHS[i]}
              onClick={() => toggle(i)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 5 }}>
          เดือนที่เลือกไว้คือเดือนที่ระบบจะเตือนเมื่อถึงเวลาแล้วยังไม่รายงานผล
        </div>
      </div>
    </>
  );
}
