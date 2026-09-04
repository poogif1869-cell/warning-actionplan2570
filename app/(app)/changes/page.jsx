"use client";

/* =====================================================================
   ถังการแก้ไขข้อมูล — ประวัติการเปลี่ยนแปลงแผนทั้งหมดในที่เดียว

   เก็บการเปลี่ยนแปลงของ 4 เรื่องตามที่ตกลงกันไว้:
     โครงการ/กิจกรรม (เพิ่ม/ลบ) · งบประมาณ · ตัวชี้วัด · แผนการดำเนินงาน

   ทุกแถวบอกว่า **ใครแก้ เมื่อไหร่ จากอะไรเป็นอะไร** และอ้างมติอะไร
   ชื่อผู้แก้มาจาก updated_by ที่ trigger ในฐานข้อมูลใส่ให้เอง
   ไม่ได้ส่งมาจากเบราว์เซอร์ จึงปลอมไม่ได้

   ร่างแยกให้เห็นชัดว่ายังไม่มีผล — ไม่ปนกับรายการที่อนุมัติแล้ว
   เพราะสองอย่างนี้ต่างกันตรงที่อันหนึ่งเปลี่ยนตัวเลขทั้งเว็บ อีกอันไม่เปลี่ยนอะไรเลย
   ===================================================================== */

import Link from "next/link";
import { useMemo, useState } from "react";
import { byUid, MONTHS_SHORT } from "@/lib/plan";
import { money, fmt } from "@/lib/format";
import { useResults } from "@/lib/store";
import { approvalText } from "@/components/approval-fields";
import Bars from "@/components/bars";
import DownloadButton from "@/components/download-button";
import ConfirmDialog from "@/components/confirm-dialog";

const KIND_LABEL = {
  add: "เพิ่มโครงการ/กิจกรรม",
  delete: "ลบโครงการ/กิจกรรม",
  budget: "แก้งบประมาณ",
  kpi: "แก้ตัวชี้วัด",
  schedule: "แก้แผนการดำเนินงาน",
};

const KIND_ORDER = ["add", "delete", "budget", "kpi", "schedule"];

/* เวลาไทยแบบอ่านออก — ไม่ใช้ toLocaleString ทั้งก้อนเพราะรูปแบบต่างกัน
   ในแต่ละเบราว์เซอร์ ทำให้คนละเครื่องเห็นคนละแบบ */
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return (
    p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + (d.getFullYear() + 543) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes())
  );
}

/* เดือนที่มีแผนพร้อมเป้าหมาย — เขียนติดกันเป็น "ต.ค. 100" อ่านง่ายกว่า
   แยกสองบรรทัดแล้วต้องนับตำแหน่งเอาเองว่าเลขไหนของเดือนไหน */
function monthList(arr, targets) {
  if (!Array.isArray(arr)) return "–";
  const out = [];
  for (let i = 0; i < 12; i++) {
    if (!arr[i]) continue;
    const t = targets && targets[i] != null ? String(targets[i]).trim() : "";
    out.push(MONTHS_SHORT[i] + (t ? " " + t : ""));
  }
  return out.length ? out.join(" · ") : "ไม่มีเดือนที่มีแผน";
}

/* สรุปว่าแถวนี้เปลี่ยนอะไรจากอะไรเป็นอะไร — คืนเป็นคู่ [ก่อน, หลัง] */
function change(e) {
  const d = e.data || {};
  const p = e.prev || {};

  if (e.kind === "add") {
    return ["ไม่มีในแผนเดิม", (d.code || "") + " " + (d.name || "") + " · งบ " + money(d.budget || 0) + " บาท"];
  }
  if (e.kind === "delete") {
    return [(p.code || "") + " " + (p.name || "") + " · งบ " + money(p.budget || 0) + " บาท", "ถูกลบออกจากแผน"];
  }
  if (e.kind === "budget") {
    return [money(p.budget || 0) + " บาท", money(d.budget || 0) + " บาท"];
  }
  if (e.kind === "kpi") {
    return [
      "ผลผลิต: " + (p.output || "–") + "\nผลลัพธ์: " + (p.outcome || "–"),
      "ผลผลิต: " + (d.output || "–") + "\nผลลัพธ์: " + (d.outcome || "–"),
    ];
  }
  return [
    (p.period ? p.period + "\n" : "") + monthList(p.months, p.monthTargets),
    (d.period ? d.period + "\n" : "") + monthList(d.months, d.monthTargets),
  ];
}

export default function ChangesPage() {
  const { planEdits, hasPlanEdits, loaded, isAdmin, personName, deletePlanEdit } = useResults();
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return planEdits
      .filter((e) => {
        if (kind && e.kind !== kind) return false;
        if (status && e.status !== status) return false;
        if (needle) {
          const it = byUid.get(e.uid);
          const hay = (
            (e.uid || "") + " " +
            ((e.data || {}).name || "") + " " +
            ((e.prev || {}).name || "") + " " +
            (it ? it.code + " " + it.name + " " + (it.org || "") : "") + " " +
            (e.res_no || "") + " " + (e.doc_no || "") + " " + (e.note || "")
          ).toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [planEdits, kind, status, q]);

  const stat = useMemo(() => {
    const byKind = {};
    const orgs = new Map();
    let approved = 0;
    let draft = 0;
    let budgetDelta = 0;

    planEdits.forEach((e) => {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
      if (e.status === "approved") approved++;
      else draft++;
      if (e.status === "approved" && e.kind === "budget") {
        budgetDelta += (Number((e.data || {}).budget) || 0) - (Number((e.prev || {}).budget) || 0);
      }

      /* หน่วยงานของรายการที่ถูกแก้ — รายการที่ถูกลบไปแล้วหาใน byUid ไม่เจอ
         จึงต้องถอยไปอ่านจาก prev ที่เก็บไว้ตอนลบ */
      const it = byUid.get(e.uid);
      const name = (it && it.org) || (e.prev || {}).org || (e.data || {}).org || "";
      const key = String(name).split("/")[0].trim();
      if (key) orgs.set(key, (orgs.get(key) || 0) + 1);
    });

    const byOrg = [...orgs.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { byKind, approved, draft, budgetDelta, byOrg };
  }, [planEdits]);

  function nameOf(e) {
    const it = byUid.get(e.uid);
    if (it) return it.code + " " + it.name;
    const d = e.data || {};
    const p = e.prev || {};
    return (d.code || p.code || "") + " " + (d.name || p.name || "(ไม่ทราบชื่อ)");
  }

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  return (
    <>
      <section className="block">
        <h2>
          ถังการแก้ไขข้อมูล
          <small>ทุกการเปลี่ยนแปลงแผน พร้อมผู้แก้และเวลา</small>
          <DownloadButton
            className="iconbtn"
            title="ถังการแก้ไขข้อมูล"
            subtitle={"ทั้งหมด " + planEdits.length + " รายการ"}
            sheets={() => [
              {
                name: "สรุปการแก้ไข",
                widths: [40, 20, 30],
                rows: [
                  ["รายการ", "ค่า", "หมายเหตุ"],
                  ["รายการทั้งหมดในถัง", planEdits.length, ""],
                  ["อนุมัติแล้ว (มีผลจริง)", stat.approved, ""],
                  ["ร่าง (ยังไม่มีผล)", stat.draft, "ไม่ถูกนำไปคิดในแดชบอร์ด"],
                  [],
                  ["แยกตามประเภท", "จำนวน", ""],
                  ...KIND_ORDER.map((k) => [KIND_LABEL[k], stat.byKind[k] || 0, ""]),
                  [],
                  ["งบที่เปลี่ยนไปสุทธิ (บาท)", stat.budgetDelta, "เฉพาะรายการที่อนุมัติแล้ว"],
                ],
              },
              {
                name: "รายการแก้ไข",
                widths: [18, 12, 40, 40, 40, 34, 22, 18],
                rows: [
                  ["ประเภท", "สถานะ", "รายการ", "ค่าเดิม", "ค่าใหม่", "มติที่อ้างถึง", "ผู้แก้ไข", "เมื่อ"],
                  ...rows.map((e) => {
                    const [before, after] = change(e);
                    return [
                      KIND_LABEL[e.kind] || e.kind,
                      e.status === "approved" ? "อนุมัติแล้ว" : "ร่าง",
                      nameOf(e),
                      String(before).replace(/\n/g, " · "),
                      String(after).replace(/\n/g, " · "),
                      approvalText(e) || "–",
                      personName(e.updated_by) || "ไม่ทราบ",
                      when(e.updated_at),
                    ];
                  }),
                ],
              },
            ]}
          />
        </h2>

        {!hasPlanEdits ? (
          <div className="banner bad">
            ฐานข้อมูลยังไม่มีตาราง <code>plan_edits</code> —
            ให้ผู้ดูแลเอา <code>supabase/schema.sql</code> ไปรันใน Supabase SQL Editor
            แล้วถังนี้จะเริ่มเก็บประวัติให้เอง
          </div>
        ) : null}

        <div className="tiles">
          <div className="tile">
            <span className="lab">รายการทั้งหมด</span>
            <div className="val">{fmt(planEdits.length)}</div>
            <div className="note">การเปลี่ยนแปลงที่บันทึกไว้</div>
          </div>
          <div className="tile ok">
            <span className="lab">อนุมัติแล้ว</span>
            <div className="val st-ok">{fmt(stat.approved)}</div>
            <div className="note">มีผลกับตัวเลขทุกหน้า</div>
          </div>
          <div className="tile warn">
            <span className="lab">ร่าง</span>
            <div className="val st-warn">{fmt(stat.draft)}</div>
            <div className="note">ยังไม่ถูกนำไปคิด</div>
          </div>
          <div className="tile">
            <span className="lab">งบที่เปลี่ยนไปสุทธิ</span>
            <div className={"val " + (stat.budgetDelta < 0 ? "st-bad" : stat.budgetDelta > 0 ? "st-ok" : "")}>
              {stat.budgetDelta > 0 ? "+" : ""}
              {money(stat.budgetDelta)}
            </div>
            <div className="note">บาท · เฉพาะที่อนุมัติแล้ว</div>
          </div>
        </div>

      </section>

      {/* ---------- กราฟสรุป ----------
          หน้านี้เป็นแดชบอร์ดสำหรับ "อ่าน" ว่าแผนถูกแก้ไปแล้วแค่ไหน
          ไม่ใช่ที่ลงมือแก้ ปุ่มเพิ่ม/ลบจึงไม่อยู่ที่นี่ — อยู่หน้าแก้ไขแผนอย่างเดียว
          ไม่งั้นจะมีสองทางเข้าไปทำสิ่งเดียวกัน แล้วคนจะไม่แน่ใจว่าต่างกันไหม */}
      {planEdits.length ? (
        <section className="block">
          <h2>
            ภาพรวมการแก้ไข
            <small>แยกตามประเภท และตามหน่วยงานเจ้าของรายการที่ถูกแก้</small>
          </h2>

          <div className="cardgrid">
            <div className="card pad">
              <h3 className="cardtitle">แยกตามประเภทการแก้ไข</h3>
              <Bars
                data={KIND_ORDER.filter((k) => stat.byKind[k]).map((k) => ({
                  label: KIND_LABEL[k],
                  value: stat.byKind[k],
                  display: fmt(stat.byKind[k]) + " ครั้ง",
                }))}
              />
            </div>

            <div className="card pad">
              <h3 className="cardtitle">หน่วยงานที่มีการแก้มากที่สุด</h3>
              {stat.byOrg.length ? (
                <Bars
                  data={stat.byOrg.slice(0, 8).map((o) => ({
                    label: o.name,
                    value: o.count,
                    display: fmt(o.count) + " ครั้ง",
                  }))}
                />
              ) : (
                <div className="small muted">ยังระบุหน่วยงานของรายการที่แก้ไม่ได้</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="block">
        <h2>
          รายการเปลี่ยนแปลง
          <small>
            แสดง {fmt(rows.length)} จาก {fmt(planEdits.length)} รายการ · ใหม่สุดอยู่บน
          </small>
        </h2>

        <div className="filters">
          <div className="field">
            <label htmlFor="ch-q">ค้นหา</label>
            <input
              id="ch-q"
              type="search"
              placeholder="ชื่อโครงการ / รหัส / เลขมติ / เลขหนังสือ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ch-kind">ประเภทการแก้ไข</label>
            <select id="ch-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">ทุกประเภท</option>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ch-status">สถานะ</label>
            <select id="ch-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="draft">ร่าง</option>
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="banner">
            {planEdits.length
              ? "ไม่มีรายการที่ตรงกับตัวกรอง"
              : "ยังไม่มีการแก้ไขแผน — ถังนี้จะเริ่มมีข้อมูลเมื่อมีคนเพิ่ม ลบ หรือแก้โครงการ"}
          </div>
        ) : (
          <div className="tablewrap">
            <table className="stack">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>ประเภท</th>
                  <th>รายการ</th>
                  <th>เปลี่ยนจาก</th>
                  <th>เป็น</th>
                  <th style={{ width: 190 }}>ผู้แก้ไข / เมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const [before, after] = change(e);
                  return (
                    <tr key={e.id}>
                      <td data-label="ประเภท">
                        <span className={"pill " + (e.status === "approved" ? "ok" : "warn")}>
                          {e.status === "approved" ? "อนุมัติแล้ว" : "ร่าง"}
                        </span>
                        <div className="small" style={{ marginTop: 4 }}>
                          {KIND_LABEL[e.kind] || e.kind}
                        </div>
                      </td>
                      <td className="lead" data-label="รายการ">
                        {nameOf(e)}
                        {approvalText(e) ? (
                          <div className="small muted" style={{ marginTop: 3 }}>
                            {approvalText(e)}
                          </div>
                        ) : null}
                        {e.note ? (
                          <div className="small muted" style={{ marginTop: 3 }}>
                            หมายเหตุ: {e.note}
                          </div>
                        ) : null}
                      </td>
                      <td className="small was" data-label="เปลี่ยนจาก">
                        {before}
                      </td>
                      <td className="small now" data-label="เป็น">
                        {after}
                      </td>
                      <td className="small" data-label="ผู้แก้ไข">
                        {personName(e.updated_by) || "ไม่ทราบผู้แก้ไข"}
                        <div className="muted">{when(e.updated_at)}</div>
                        {e.status === "draft" ? (
                          <Link className="small" href={"/plan-edit?id=" + e.id}>
                            แก้ร่างต่อ
                          </Link>
                        ) : null}
                        {/* ลบได้เฉพาะผู้ดูแล และ RLS ในฐานข้อมูลบังคับซ้ำอีกชั้น
                            ถังนี้คือหลักฐาน ถ้าคนกรอกลบประวัติตัวเองได้ก็ไม่มีประโยชน์ */}
                        {isAdmin ? (
                          <button
                            className="linkbtn del"
                            onClick={() => setAskDel(e)}
                          >
                            ลบออกจากถัง
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="hint">
          ร่างไม่ถูกนำไปคิดในแดชบอร์ดหรือยอดรวมใด ๆ จนกว่าจะกดอนุมัติ ·
          การลบรายการออกจากถังทำได้เฉพาะผู้ดูแลระบบ และจะทำให้ผลของรายการนั้นย้อนกลับด้วย
        </div>
      </section>

      {askDel ? (
        <ConfirmDialog
          title="ลบรายการนี้ออกจากถังการแก้ไข"
          confirmLabel="ลบออกจากถัง"
          danger
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            await deletePlanEdit(askDel.id);
            setBusy(false);
            setAskDel(null);
          }}
          onCancel={() => setAskDel(null)}
        >
          <p>ผลของการแก้ครั้งนี้จะถูกย้อนกลับ และประวัติหายไปด้วย</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
