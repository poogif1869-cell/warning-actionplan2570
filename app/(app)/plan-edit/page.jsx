"use client";

/* =====================================================================
   หน้าแก้ไขแผน — ที่เดียวที่เปลี่ยนตัวแผนได้ (ไม่ใช่ผลการดำเนินงาน)

   สี่โหมด แบ่งตาม **สิ่งที่ผู้ใช้ตั้งใจจะทำ** ไม่ใช่ตามชนิดข้อมูลที่ถูกแก้

     project   เพิ่มโครงการใหม่          -> plan_edits kind = add (lvl 1)
     activity  เพิ่มกิจกรรมในโครงการเดิม  -> plan_edits kind = add (lvl 2)
     edit      แก้ไขโครงการ/กิจกรรม       -> kind kpi / budget / schedule
     delete    ลบโครงการ หรือ ลบบางกิจกรรม -> kind delete (ทีละรายการ)

   **ทำไมโหมด edit รวมสามอย่างไว้ด้วยกัน**
   ของจริงคนมักแก้หลายอย่างพร้อมกันในมติเดียว (เปลี่ยนงบแล้วตัวชี้วัดกับ
   แผนดำเนินงานก็ต้องเปลี่ยนตาม) ถ้าแยกเป็นสามโหมดต้องเลือกโครงการเดิมซ้ำสามรอบ
   และมีโอกาสลืมทำให้ข้อมูลสามชิ้นไม่สอดคล้องกัน

   เลือกโครงการครั้งเดียวแล้วติ๊กว่าจะแก้อะไรบ้าง ดีกว่า multi-select โครงการ
   เพราะค่าที่กรอกเป็นของเฉพาะโครงการนั้น (งบเท่านี้ ตัวชี้วัดแบบนี้)
   การเลือกหลายโครงการพร้อมกันจะทำได้แค่ตอนตั้งค่าเหมือนกันทุกโครงการ
   ซึ่งไม่ใช่กรณีที่เกิดขึ้นจริงในการแก้แผน

   ตอนบันทึกยังแยกเป็นคนละแถวในถังตามชนิดที่แก้ ไม่ยุบเป็นแถวเดียว
   ถังจะได้ตอบได้ว่า "งบโครงการนี้เคยเปลี่ยนกี่ครั้ง" โดยไม่ต้องแกะ jsonb
   ===================================================================== */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ITEMS, byUid, FUNDS, newUid } from "@/lib/plan";
import { STRATEGIES, PROGRAMS } from "@/lib/rollup";
import { money } from "@/lib/format";
import { useResults } from "@/lib/store";
import ApprovalFields, { isApprovalComplete } from "@/components/approval-fields";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  ItemPicker,
  OrgPicker,
  ScheduleFields,
  scheduleProblem,
} from "@/components/plan-pickers";

const MODES = [
  ["project", "เพิ่มโครงการใหม่"],
  ["activity", "เพิ่มกิจกรรมในโครงการเดิม"],
  ["edit", "แก้ไขโครงการ/กิจกรรม"],
  ["delete", "ลบโครงการ/กิจกรรม"],
];

const LEAD = {
  project:
    "กรอกรายละเอียดโครงการให้ครบ แล้วเลือกว่าจะบันทึกร่างไว้ก่อน หรืออนุมัติเข้าแผนเลย",
  activity:
    "เลือกโครงการเดิมแล้วเพิ่มกิจกรรมเข้าไป ไม่ต้องกรอกข้อมูลโครงการซ้ำ — ใช้ของโครงการแม่ทั้งหมด",
  edit: "เลือกโครงการครั้งเดียว แล้วติ๊กว่าจะแก้อะไรบ้าง แก้พร้อมกันได้ในรอบเดียว",
  delete: "เลือกได้ว่าจะลบทั้งโครงการ หรือลบเฉพาะบางกิจกรรม",
};

/* ส่วนที่แก้ได้ในโหมด edit — ตัวชี้วัดต้องมีมติ อีกสองอย่างแก้ได้เลย */
const PARTS = [
  {
    key: "kpi",
    label: "ตัวชี้วัด",
    hint: "ผลผลิต ผลลัพธ์ ตัวชี้วัดอื่น ๆ",
    needsApproval: true,
  },
  {
    key: "budget",
    label: "งบประมาณที่ได้รับจัดสรร",
    hint: "งบเดิมถูกเก็บไว้เทียบ ไม่ได้เขียนทับ",
    needsApproval: false,
  },
  {
    key: "schedule",
    label: "แผน / ระยะเวลาดำเนินงาน",
    hint: "เดือนที่มีแผนและเป้าหมายรายเดือน",
    needsApproval: false,
  },
];

const emptyForm = () => ({
  code: "",
  name: "",
  org: "",
  strategy: "",
  so: "",
  tactic: "",
  program: "",
  ptype: "",
  fund: "",
  budget: "",
  output: "",
  outcome: "",
  kpi: "",
  period: "",
  summary: "",
  outputTarget: "",
  outputUnit: "",
  months: new Array(12).fill(0),
  monthTargets: new Array(12).fill(""),
  nX: "",
  nGoal: "",
  nY: "",
  nSub: "",
  nSubGoal: "",
  mIssue: "",
  mWay: "",
});

export default function PlanEditPage() {
  const router = useRouter();
  const { canEdit, loaded, hasPlanEdits, savePlanEdit, planEdits } = useResults();

  const [mode, setMode] = useState("project");
  const [uid, setUid] = useState("");
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [approval, setApproval] = useState({});
  const [note, setNote] = useState("");
  const [parts, setParts] = useState({ kpi: false, budget: false, schedule: false });
  const [delScope, setDelScope] = useState("all"); // all | some
  const [delKids, setDelKids] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(null);
  const [ready, setReady] = useState(false);

  /* ---------- รับพารามิเตอร์จาก URL ----------
     อ่านจาก window.location แทน useSearchParams เพราะ useSearchParams
     บังคับให้ต้องมี <Suspense> ครอบตอน build ซึ่งเครื่องนี้ build เองไม่ได้ */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("mode");
    if (m && MODES.some(([k]) => k === m)) setMode(m);
    const u = q.get("uid");
    if (u) setUid(u);
    const id = q.get("id");
    if (id) setEditId(id);
    setReady(true);
  }, []);

  const target = uid ? byUid.get(uid) : null;

  /* ---------- เปิดร่างเดิมขึ้นมาแก้ต่อ ---------- */
  useEffect(() => {
    if (!editId || !planEdits.length) return;
    const row = planEdits.find((e) => e.id === editId);
    if (!row) return;
    setMode((row.data || {}).lvl === 2 ? "activity" : "project");
    setUid(row.uid);
    setApproval({
      res_no: row.res_no || "",
      res_date: row.res_date || "",
      doc_no: row.doc_no || "",
      doc_date: row.doc_date || "",
    });
    setNote(row.note || "");
    setForm({ ...emptyForm(), ...(row.data || {}) });
  }, [editId, planEdits]);

  /* ---------- เปลี่ยนรายการเป้าหมาย: เติมค่าปัจจุบันลงฟอร์ม ---------- */
  useEffect(() => {
    if (!target || mode === "project") return;
    if (mode === "edit") {
      setForm((f) => ({
        ...f,
        budget: target.budget == null ? "" : String(target.budget),
        output: target.output || "",
        outcome: target.outcome || "",
        kpi: target.kpi || "",
        period: target.period || "",
        outputTarget: target.outputTarget || "",
        outputUnit: target.outputUnit || "",
        months: (target.months || new Array(12).fill(0)).slice(),
        monthTargets: (target.monthTargets || new Array(12).fill("")).slice(),
      }));
    }
    if (mode === "delete") {
      setDelScope("all");
      setDelKids([]);
    }
  }, [target, mode]);

  const strategy = useMemo(
    () => STRATEGIES.find((s) => s.name === form.strategy) || null,
    [form.strategy]
  );

  /* ---------- ตรวจรหัส ---------- */
  const wantLen = mode === "activity" ? 8 : 6;
  const codeErr = useMemo(() => {
    if (mode !== "project" && mode !== "activity") return "";
    const c = String(form.code || "").trim();
    if (!c) return "ต้องกรอกรหัส";
    if (!/^\d+$/.test(c)) return "รหัสต้องเป็นตัวเลขล้วน";
    if (c.length !== wantLen) return "ต้องเป็นรหัส " + wantLen + " หลัก";
    if (mode === "activity") {
      if (!target) return "ยังไม่ได้เลือกโครงการแม่";
      if (c.slice(0, 6) !== target.code) {
        return "6 หลักแรกต้องเป็น " + target.code + " ตามรหัสโครงการแม่";
      }
    }
    if (ITEMS.some((x) => x.code === c)) return "รหัสนี้มีอยู่แล้วในแผน";
    return "";
  }, [mode, form.code, wantLen, target]);

  const anyPart = PARTS.some((p) => parts[p.key]);
  const needsApproval =
    mode === "project" ||
    mode === "activity" ||
    mode === "delete" ||
    (mode === "edit" && PARTS.some((p) => parts[p.key] && p.needsApproval));

  const schedErr =
    (mode === "project" || mode === "activity" || (mode === "edit" && parts.schedule))
      ? scheduleProblem(form)
      : "";

  const missing = useMemo(() => {
    const out = [];

    if (mode === "project") {
      if (!String(form.name || "").trim()) out.push("ชื่อโครงการ");
      if (codeErr) out.push("รหัสโครงการ (" + codeErr + ")");
      if (!String(form.org || "").trim()) out.push("หน่วยงานที่รับผิดชอบ");
      if (!String(form.strategy || "").trim()) out.push("ยุทธศาสตร์");
      if (!String(form.output || "").trim()) out.push("ตัวชี้วัดผลผลิต");
    }

    if (mode === "activity") {
      if (!target) out.push("โครงการแม่");
      if (!String(form.name || "").trim()) out.push("ชื่อกิจกรรม");
      if (codeErr) out.push("รหัสกิจกรรม (" + codeErr + ")");
      if (!String(form.output || "").trim()) out.push("ตัวชี้วัดผลผลิตของกิจกรรม");
    }

    if (mode === "edit") {
      if (!target) out.push("รายการที่จะแก้");
      if (!anyPart) out.push("เลือกอย่างน้อยหนึ่งอย่างที่จะแก้");
    }

    if (mode === "delete") {
      if (!target) out.push("รายการที่จะลบ");
      if (delScope === "some" && !delKids.length) out.push("กิจกรรมที่จะลบ");
    }

    if (schedErr) out.push(schedErr);
    if (needsApproval && !isApprovalComplete(approval)) out.push("มติอนุมัติให้ครบทั้งสี่ช่อง");
    return out;
  }, [
    mode, form, codeErr, target, anyPart, delScope, delKids,
    schedErr, needsApproval, approval,
  ]);

  const ok = missing.length === 0 && canEdit && hasPlanEdits;
  const canDraft =
    canEdit &&
    hasPlanEdits &&
    (mode === "project" || mode === "activity") &&
    String(form.name || "").trim() !== "";

  /* ---------- ประกอบแถวที่จะเขียนลงถัง ----------
     คืนเป็นอาร์เรย์เสมอ เพราะโหมด edit และโหมดลบบางกิจกรรม
     สร้างได้หลายแถวในการกดครั้งเดียว */
  function buildEdits(status) {
    const meta = {
      status,
      note,
      res_no: approval.res_no,
      res_date: approval.res_date,
      doc_no: approval.doc_no,
      doc_date: approval.doc_date,
    };

    if (mode === "project" || mode === "activity") {
      const isAct = mode === "activity";
      const parent = isAct ? target : null;
      return [
        {
          ...meta,
          id: editId || undefined,
          kind: "add",
          uid: (editId && uid) || newUid(String(form.code || "000000").trim()),
          data: {
            ...form,
            lvl: isAct ? 2 : 1,
            code: String(form.code || "").trim(),
            budget: Number(String(form.budget).replace(/,/g, "")) || 0,
            /* กิจกรรมรับข้อมูลบริบททั้งหมดจากโครงการแม่ ไม่ให้กรอกซ้ำ
               ไม่งั้นกิจกรรมจะหลุดยุทธศาสตร์/หน่วยงานของโครงการตัวเอง
               แล้วยอดตามยุทธศาสตร์กับตามหน่วยงานจะขาดหายไปเงียบ ๆ */
            org: isAct ? parent.org : form.org,
            strategy: isAct ? parent.strategy : form.strategy,
            so: isAct ? parent.so : strategy ? strategy.so || "" : form.so,
            tactic: isAct ? parent.tactic : form.tactic,
            program: isAct ? parent.program : form.program,
            ptype: isAct ? parent.ptype : form.ptype,
            fund: isAct ? parent.fund : form.fund,
            outcome: isAct ? "" : form.outcome,
            summary: isAct ? parent.summary : form.summary,
            nX: isAct ? parent.nX : form.nX,
            nGoal: isAct ? parent.nGoal : form.nGoal,
            nY: isAct ? parent.nY : form.nY,
            nSub: isAct ? parent.nSub : form.nSub,
            nSubGoal: isAct ? parent.nSubGoal : form.nSubGoal,
            mIssue: isAct ? parent.mIssue : form.mIssue,
            mWay: isAct ? parent.mWay : form.mWay,
          },
          prev: {},
        },
      ];
    }

    if (mode === "delete") {
      const victims =
        delScope === "all" ? [target] : delKids.map((k) => byUid.get(k)).filter(Boolean);
      return victims.map((v) => ({
        ...meta,
        kind: "delete",
        uid: v.uid,
        data: {},
        prev: {
          code: v.code,
          name: v.name,
          org: v.org,
          budget: v.budget || 0,
          lvl: v.lvl,
        },
      }));
    }

    // โหมด edit — หนึ่งแถวต่อหนึ่งชนิดที่ติ๊กไว้
    const out = [];
    if (parts.kpi) {
      out.push({
        ...meta,
        kind: "kpi",
        uid,
        data: { output: form.output, outcome: form.outcome, kpi: form.kpi },
        prev: { output: target.output, outcome: target.outcome, kpi: target.kpi },
      });
    }
    if (parts.budget) {
      out.push({
        ...meta,
        kind: "budget",
        uid,
        data: { budget: Number(String(form.budget).replace(/,/g, "")) || 0 },
        // เทียบกับงบตามไฟล์แผนเสมอ ไม่ใช่งบล่าสุด แดชบอร์ดจึงเทียบกับแผนเดิมได้ตรง
        prev: { budget: target.baseBudget == null ? target.budget || 0 : target.baseBudget },
      });
    }
    if (parts.schedule) {
      out.push({
        ...meta,
        kind: "schedule",
        uid,
        data: {
          months: form.months,
          monthTargets: form.monthTargets,
          period: form.period,
          outputTarget: form.outputTarget,
          outputUnit: form.outputUnit,
        },
        prev: {
          months: (target.months || []).slice(),
          monthTargets: (target.monthTargets || []).slice(),
          period: target.period,
          outputTarget: target.outputTarget || "",
          outputUnit: target.outputUnit || "",
        },
      });
    }
    return out;
  }

  async function submit(status) {
    setBusy(true);
    setErr("");
    const rows = buildEdits(status);
    for (let i = 0; i < rows.length; i++) {
      const saved = await savePlanEdit(rows[i]);
      if (!saved) {
        setBusy(false);
        setAsk(null);
        setErr("บันทึกไม่สำเร็จ — ดูข้อความแจ้งเตือนด้านบนของหน้า");
        return;
      }
    }
    setBusy(false);
    setAsk(null);
    router.push("/changes");
  }

  if (!loaded || !ready) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  const kids = target && target.lvl === 1 ? target._kids || [] : [];

  return (
    <>
      <section className="block">
        <h2>
          แก้ไขแผนปฏิบัติการ
          <small>{LEAD[mode]}</small>
        </h2>

        {!canEdit ? (
          <div className="banner bad">
            บัญชีของคุณเป็น <b>ผู้ดูอย่างเดียว</b> — แก้แผนไม่ได้
            ให้ผู้ดูแลระบบเปิดสิทธิ์ให้ก่อน
          </div>
        ) : null}

        {!hasPlanEdits ? (
          <div className="banner bad">
            ฐานข้อมูลยังไม่มีตาราง <code>plan_edits</code> — ให้ผู้ดูแลเอา{" "}
            <code>supabase/schema.sql</code> ไปรันใน Supabase SQL Editor ก่อน
          </div>
        ) : null}

        <div className="segmented" style={{ marginBottom: 18 }}>
          {MODES.map(([k, label]) => (
            <button
              key={k}
              aria-pressed={mode === k}
              onClick={() => {
                setMode(k);
                setErr("");
                if (k === "project") setUid("");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <fieldset className="plainset" disabled={!canEdit || busy}>
          {/* ================= เลือกรายการเป้าหมาย ================= */}
          {mode !== "project" ? (
            <>
              <h3 className="steptitle">
                <span className="stepno">1</span>
                {mode === "activity"
                  ? "เลือกโครงการที่จะเพิ่มกิจกรรมเข้าไป"
                  : mode === "delete"
                  ? "เลือกรายการที่จะลบ"
                  : "เลือกรายการที่จะแก้"}
              </h3>

              <ItemPicker
                value={uid}
                onChange={setUid}
                onlyProjects={mode === "activity" || mode === "delete"}
                label={mode === "activity" ? "ค้นหาโครงการแม่" : "ค้นหาโครงการ/กิจกรรม"}
              />

              {target ? (
                <div className="card pad picked">
                  <div className="small muted">รายการที่เลือก</div>
                  <div className="pickedname">
                    {target.code} {target.name}
                  </div>
                  <div className="small muted">
                    {target.lvl === 1 ? "โครงการ" : "กิจกรรม"} ·{" "}
                    {target.org || "ไม่ระบุหน่วยงาน"} · งบตามแผน {money(target.budget)} บาท
                    {kids.length ? " · มี " + kids.length + " กิจกรรม" : ""}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* ================= เพิ่มโครงการใหม่ ================= */}
          {mode === "project" ? (
            <>
              <h3 className="steptitle">
                <span className="stepno">1</span>ข้อมูลโครงการ
              </h3>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="pe-code">
                    รหัสโครงการ (6 หลัก)<span className="req"> *</span>
                  </label>
                  <input
                    id="pe-code"
                    type="text"
                    inputMode="numeric"
                    value={form.code}
                    placeholder="010101"
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
                  ชื่อโครงการ<span className="req"> *</span>
                </label>
                <input
                  id="pe-name"
                  type="text"
                  value={form.name}
                  placeholder="ชื่อโครงการตามที่ปรากฏในแผนปฏิบัติการ"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <OrgPicker value={form.org} onChange={(v) => setForm({ ...form, org: v })} />

              <div className="grid2">
                <div className="field">
                  <label htmlFor="pe-strategy">
                    ยุทธศาสตร์<span className="req"> *</span>
                  </label>
                  <select
                    id="pe-strategy"
                    value={form.strategy}
                    onChange={(e) => setForm({ ...form, strategy: e.target.value, tactic: "" })}
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
                  <label htmlFor="pe-tactic">กลยุทธ์</label>
                  <select
                    id="pe-tactic"
                    value={form.tactic}
                    disabled={!strategy}
                    onChange={(e) => setForm({ ...form, tactic: e.target.value })}
                  >
                    <option value="">{strategy ? "— ไม่ระบุ —" : "เลือกยุทธศาสตร์ก่อน"}</option>
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

              <div className="field">
                <label htmlFor="pe-summary">สาระสำคัญของโครงการ</label>
                <textarea
                  id="pe-summary"
                  rows={3}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>

              <h3 className="steptitle">
                <span className="stepno">2</span>ตัวชี้วัด
              </h3>
              <Indicators form={form} setForm={setForm} requireOutput />

              <h3 className="steptitle">
                <span className="stepno">3</span>แผนการดำเนินงาน
              </h3>
              <ScheduleFields form={form} setForm={setForm} />

              <h3 className="steptitle">
                <span className="stepno">4</span>ความเชื่อมโยงแผนระดับชาติ
              </h3>
              <PlanLinks form={form} setForm={setForm} />
            </>
          ) : null}

          {/* ================= เพิ่มกิจกรรมในโครงการเดิม ================= */}
          {mode === "activity" && target ? (
            <>
              <div className="banner ok">
                <b>ไม่ต้องกรอกข้อมูลโครงการซ้ำ</b> — กิจกรรมนี้จะใช้ยุทธศาสตร์
                กลยุทธ์ แผนงาน หน่วยงาน แหล่งเงิน และความเชื่อมโยงแผน
                ของโครงการ {target.code} ทั้งหมด
                <div className="small" style={{ marginTop: 4 }}>
                  {target.strategy || "ไม่ระบุยุทธศาสตร์"}
                  {target.tactic ? " · " + target.tactic : ""} ·{" "}
                  {target.org || "ไม่ระบุหน่วยงาน"}
                </div>
              </div>

              <h3 className="steptitle">
                <span className="stepno">2</span>ข้อมูลกิจกรรม
              </h3>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="ac-code">
                    รหัสกิจกรรม (8 หลัก)<span className="req"> *</span>
                  </label>
                  <input
                    id="ac-code"
                    type="text"
                    inputMode="numeric"
                    value={form.code}
                    placeholder={target.code + "01"}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                  {codeErr && form.code ? <div className="small st-bad">{codeErr}</div> : null}
                  <div className="small muted">
                    ขึ้นต้นด้วย {target.code} ตามรหัสโครงการแม่ แล้วต่อท้ายอีก 2 หลัก
                    {kids.length
                      ? " · กิจกรรมล่าสุดคือ " + kids[kids.length - 1].code
                      : ""}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="ac-budget">งบประมาณของกิจกรรม (บาท)</label>
                  <input
                    id="ac-budget"
                    type="text"
                    inputMode="numeric"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  />
                  <div className="small muted">
                    งบกิจกรรมรวมอยู่ในงบโครงการแม่แล้ว ยอดรวมทั้งแผนจึงไม่บวกซ้ำ
                  </div>
                </div>
              </div>

              <div className="field">
                <label htmlFor="ac-name">
                  ชื่อกิจกรรม<span className="req"> *</span>
                </label>
                <input
                  id="ac-name"
                  type="text"
                  value={form.name}
                  placeholder="ชื่อกิจกรรมภายใต้โครงการนี้"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="ac-output">
                  ตัวชี้วัดผลผลิตของกิจกรรม<span className="req"> *</span>
                </label>
                <textarea
                  id="ac-output"
                  rows={2}
                  value={form.output}
                  onChange={(e) => setForm({ ...form, output: e.target.value })}
                />
                <div className="small muted">
                  กิจกรรมไม่มีตัวชี้วัดผลลัพธ์ เพราะผลลัพธ์ (Outcome) เป็นของทั้งโครงการ
                </div>
              </div>

              <h3 className="steptitle">
                <span className="stepno">3</span>แผนการดำเนินงานของกิจกรรม
              </h3>
              <ScheduleFields form={form} setForm={setForm} />
            </>
          ) : null}

          {/* ================= แก้ไขโครงการ/กิจกรรม ================= */}
          {mode === "edit" && target ? (
            <>
              <h3 className="steptitle">
                <span className="stepno">2</span>เลือกสิ่งที่จะแก้ (เลือกได้หลายอย่าง)
              </h3>

              <div className="partpick">
                {PARTS.map((p) => (
                  <label className={"partrow" + (parts[p.key] ? " on" : "")} key={p.key}>
                    <input
                      type="checkbox"
                      checked={Boolean(parts[p.key])}
                      onChange={(e) => setParts({ ...parts, [p.key]: e.target.checked })}
                    />
                    <span>
                      <b>{p.label}</b>
                      <span className="small muted"> — {p.hint}</span>
                      {p.needsApproval ? (
                        <span className="pill warn" style={{ marginInlineStart: 6 }}>
                          ต้องมีมติ
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>

              {parts.kpi ? (
                <>
                  <h4>ตัวชี้วัด</h4>
                  <Indicators form={form} setForm={setForm} />
                </>
              ) : null}

              {parts.budget ? (
                <>
                  <h4>งบประมาณที่ได้รับจัดสรร</h4>
                  <div className="grid2">
                    <div className="field">
                      <label>งบเดิมตามไฟล์แผน (บาท)</label>
                      <input
                        type="text"
                        value={money(
                          target.baseBudget == null ? target.budget : target.baseBudget
                        )}
                        readOnly
                        disabled
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="ed-budget">งบที่ได้รับจัดสรรใหม่ (บาท)</label>
                      <input
                        id="ed-budget"
                        type="text"
                        inputMode="numeric"
                        value={form.budget}
                        onChange={(e) => setForm({ ...form, budget: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {parts.schedule ? (
                <>
                  <h4>แผน / ระยะเวลาดำเนินงาน</h4>
                  <ScheduleFields form={form} setForm={setForm} />
                </>
              ) : null}
            </>
          ) : null}

          {/* ================= ลบ ================= */}
          {mode === "delete" && target ? (
            <>
              <h3 className="steptitle">
                <span className="stepno">2</span>เลือกขอบเขตการลบ
              </h3>

              <div className="partpick">
                <label className={"partrow" + (delScope === "all" ? " on" : "")}>
                  <input
                    type="radio"
                    name="delscope"
                    checked={delScope === "all"}
                    onChange={() => setDelScope("all")}
                  />
                  <span>
                    <b>ลบทั้งโครงการ</b>
                    <span className="small muted">
                      {" "}
                      — กิจกรรมทั้ง {kids.length} รายการใต้โครงการนี้จะถูกลบไปด้วย
                    </span>
                  </span>
                </label>

                <label
                  className={
                    "partrow" + (delScope === "some" ? " on" : "") + (kids.length ? "" : " off")
                  }
                >
                  <input
                    type="radio"
                    name="delscope"
                    disabled={!kids.length}
                    checked={delScope === "some"}
                    onChange={() => setDelScope("some")}
                  />
                  <span>
                    <b>ลบเฉพาะบางกิจกรรม</b>
                    <span className="small muted">
                      {kids.length
                        ? " — เก็บโครงการไว้ ลบเฉพาะกิจกรรมที่เลือก"
                        : " — โครงการนี้ไม่มีกิจกรรมย่อย"}
                    </span>
                  </span>
                </label>
              </div>

              {delScope === "some" && kids.length ? (
                <div className="picklist" style={{ marginBottom: 14 }}>
                  {kids.map((k) => {
                    const on = delKids.includes(k.uid);
                    return (
                      <label className={"pickrow" + (on ? " on" : "")} key={k.uid}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setDelKids(
                              e.target.checked
                                ? delKids.concat([k.uid])
                                : delKids.filter((x) => x !== k.uid)
                            )
                          }
                        />
                        <span className="pickname">
                          <b>{k.code}</b> {k.name}
                          <span className="small muted"> · {money(k.budget)} บาท</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              <div className="banner bad">
                <b>
                  {delScope === "all"
                    ? "กำลังจะลบทั้งโครงการ " + target.code + " " + target.name
                    : "กำลังจะลบ " + delKids.length + " กิจกรรม"}
                </b>
                <div className="small" style={{ marginTop: 4 }}>
                  ผลการดำเนินงานและรายการงบประมาณที่เคยกรอกไว้ไม่ได้ถูกลบจากฐานข้อมูล
                  แต่จะไม่ถูกนำมาแสดง เพราะไม่มีรายการในแผนให้ผูกอีกแล้ว —
                  ถ้าถอนการลบออกจากถังการแก้ไข ข้อมูลจะกลับมาครบ
                </div>
              </div>
            </>
          ) : null}

          {/* ================= มติ + หมายเหตุ + ปุ่ม ================= */}
          {needsApproval ? (
            <>
              <h3 className="steptitle">
                <span className="stepno">✓</span>มติที่อนุมัติให้แก้
              </h3>
              <ApprovalFields value={approval} onChange={setApproval} idPrefix="pe" />
            </>
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
              <b>ยังกรอกไม่ครบ</b> — ขาด {missing.join(" · ")}
            </div>
          ) : null}

          {err ? <div className="banner bad">{err}</div> : null}

          <div className="btnrow">
            {mode === "delete" ? (
              <button className="btn danger" disabled={!ok} onClick={() => setAsk("delete")}>
                {delScope === "all" ? "ลบทั้งโครงการ" : "ลบกิจกรรมที่เลือก"}
              </button>
            ) : (
              <button className="btn" disabled={!ok} onClick={() => setAsk("approve")}>
                {mode === "project"
                  ? "อนุมัติโครงการ"
                  : mode === "activity"
                  ? "อนุมัติเพิ่มกิจกรรม"
                  : "บันทึกการแก้ไข"}
              </button>
            )}

            {/* ร่างมีเฉพาะตอนเพิ่มของใหม่ — การแก้ของเดิมไม่มีสถานะกลาง
                ถ้าเก็บร่างไว้ได้ จะกลายเป็นค่าค้างที่ไม่มีผลกับอะไรเลย */}
            {mode === "project" || mode === "activity" ? (
              <button className="btn ghost" disabled={!canDraft} onClick={() => submit("draft")}>
                บันทึกร่าง
              </button>
            ) : null}

            <Link className="btn ghost" href="/changes">
              ดูถังการแก้ไขข้อมูล
            </Link>
          </div>

          <div className="hint">
            <b>บันทึกร่าง</b> เก็บข้อมูลไว้เฉย ๆ ยังไม่ถูกนำไปคิดในแดชบอร์ดหรือยอดรวมใด ๆ ·{" "}
            <b>อนุมัติ</b> ทำให้มีผลจริงกับทุกหน้าทันที และบันทึกลงถังการแก้ไขพร้อมชื่อผู้แก้
          </div>
        </fieldset>
      </section>

      {ask ? (
        <ConfirmDialog
          title={
            ask === "delete"
              ? delScope === "all"
                ? "ยืนยันลบทั้งโครงการ"
                : "ยืนยันลบ " + delKids.length + " กิจกรรม"
              : mode === "project"
              ? "อนุมัติเพิ่มโครงการเข้าแผน"
              : mode === "activity"
              ? "อนุมัติเพิ่มกิจกรรมเข้าโครงการ"
              : "ยืนยันการแก้ไขแผน"
          }
          confirmLabel={ask === "delete" ? "ลบ" : "ยืนยัน"}
          danger={ask === "delete"}
          busy={busy}
          onConfirm={() => submit("approved")}
          onCancel={() => setAsk(null)}
        >
          <p>
            {ask === "delete"
              ? "รายการที่เลือกจะหายจากทุกยอดรวมทันที"
              : "มีผลกับทุกหน้าทันที และบันทึกลงถังการแก้ไข"}
          </p>
          {mode === "edit" ? (
            <p className="small muted">
              บันทึก {PARTS.filter((p) => parts[p.key]).length} รายการในถัง
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/* ---------- ช่องตัวชี้วัด ---------- */
function Indicators({ form, setForm, requireOutput }) {
  return (
    <>
      <div className="field">
        <label htmlFor="in-output">
          ตัวชี้วัดผลผลิต (Output)
          {requireOutput ? <span className="req"> *</span> : null}
        </label>
        <textarea
          id="in-output"
          rows={2}
          value={form.output}
          onChange={(e) => setForm({ ...form, output: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="in-outcome">ตัวชี้วัดผลลัพธ์ (Outcome)</label>
        <textarea
          id="in-outcome"
          rows={2}
          value={form.outcome}
          onChange={(e) => setForm({ ...form, outcome: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="in-kpi">ตัวชี้วัดอื่น ๆ</label>
        <textarea
          id="in-kpi"
          rows={2}
          value={form.kpi}
          onChange={(e) => setForm({ ...form, kpi: e.target.value })}
        />
      </div>
    </>
  );
}

/* ---------- ความเชื่อมโยงแผนระดับชาติ ----------
   ช่องพวกนี้คือสิ่งที่หน้า "ความเชื่อมโยงแผน" ใช้จัดกลุ่ม ถ้าไม่กรอก
   โครงการที่เพิ่มใหม่จะไปโผล่ในกลุ่ม "ยังไม่ระบุการเชื่อมโยง" ทันที */
function PlanLinks({ form, setForm }) {
  const rows = [
    ["nX", "ยุทธศาสตร์ชาติ"],
    ["nGoal", "เป้าหมายของยุทธศาสตร์ชาติ"],
    ["nY", "ประเด็นแผนแม่บทภายใต้ยุทธศาสตร์ชาติ"],
    ["nSub", "แผนย่อยของแผนแม่บทฯ"],
    ["nSubGoal", "เป้าหมายของแผนย่อย"],
    ["mIssue", "ประเด็น แผนปฏิบัติราชการ กษ."],
    ["mWay", "แนวทาง แผนปฏิบัติราชการ กษ."],
  ];

  /* ตัวเลือกที่มีอยู่แล้วในแผน — ให้เลือกจากของเดิมได้ ไม่ต้องพิมพ์ใหม่
     ทั้งเร็วกว่าและไม่พิมพ์ต่างกันนิดหน่อยจนกลายเป็นคนละกลุ่ม */
  function options(key) {
    const set = new Set();
    ITEMS.forEach((x) => {
      if (x.lvl === 1 && x[key]) set.add(x[key]);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }

  return (
    <>
      <div className="small muted" style={{ marginBottom: 10 }}>
        เลือกจากที่มีอยู่ในแผนได้ หรือพิมพ์ใหม่ก็ได้ — ไม่กรอกก็ได้
        แต่โครงการจะไปอยู่กลุ่ม “ยังไม่ระบุการเชื่อมโยง” ในหน้าความเชื่อมโยงแผน
      </div>
      {rows.map(([k, label]) => (
        <div className="field" key={k}>
          <label htmlFor={"pl-" + k}>{label}</label>
          <input
            id={"pl-" + k}
            type="text"
            list={"pl-list-" + k}
            value={form[k] || ""}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
          <datalist id={"pl-list-" + k}>
            {options(k).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
      ))}
    </>
  );
}
