"use client";

import { useEffect, useState } from "react";
import { MONTHS, STATUSES, monthsOf, byUid } from "@/lib/plan";
import { RISK_TYPES, RISK_LEVELS, CONTROL_FIELDS, riskLevelInfo } from "@/lib/rollup";
import { money, pct } from "@/lib/format";
import {
  useResults,
  hasReport,
  monthlyOf,
  projectTrack,
  spentTotal,
  entriesOf,
  entriesTotal,
  riskAt,
} from "@/lib/store";
import { KIND_LABEL, SEV_LABEL } from "@/lib/alerts";
import MonthBudget from "@/components/month-budget";

/* ลิ้นชักรายละเอียดโครงการ — ใช้ร่วมกันทุกหน้า
   รวมรายงานผลรายเดือน (ผลผลิต/ผลลัพธ์), รายการงบประมาณ และรายงานความเสี่ยงรายเดือน */
export default function ProjectDrawer({ uid, alerts, onClose }) {
  const { results, budget, risk, asOfMonth, setProject, setMonthly, setRisk, clearProject } =
    useResults();
  const [openMonth, setOpenMonth] = useState(null);
  const [tab, setTab] = useState("report");

  // ปิดด้วย Esc
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = byUid.get(uid);
  if (!p) return null;

  const plan = monthsOf(p);
  const rep = monthlyOf(results, uid);
  const tk = projectTrack(results, uid);
  const spent = spentTotal(results, uid);
  const mine = (alerts || []).filter((a) => a.uid === uid);

  const rows = [
    ["รหัส", p.code],
    ["ระดับ", p.lvl === 1 ? "โครงการ" : p.lvl === 0 ? "ค่าใช้จ่ายอื่น" : "กิจกรรม"],
    ["ยุทธศาสตร์", p.strategy],
    ["กลยุทธ์", p.tactic],
    ["ตัวชี้วัดโครงการ", p.kpi],
    ["แผนงาน", p.program],
    ["ประเภทโครงการ", p.ptype],
    ["หน่วยงานรับผิดชอบ", p.org],
    ["แหล่งเงิน", p.fund],
    ["งบประมาณ", p.budget ? money(p.budget) + " บาท" : "–"],
    ["ระยะเวลา", p.period],
    ["สาระสำคัญ", p.summary],
  ].filter(([, v]) => v != null && v !== "");

  const linkRows = [
    ["ยุทธศาสตร์ชาติ", p.nX],
    ["เป้าหมายยุทธศาสตร์ชาติ", p.nGoal],
    ["ประเด็นแผนแม่บทฯ", p.nY],
    ["แผนย่อยของแผนแม่บทฯ", p.nSub],
    ["เป้าหมายแผนย่อย", p.nSubGoal],
    ["ประเด็น แผนปฏิบัติราชการ กษ.", p.mIssue],
    ["แนวทาง แผนปฏิบัติราชการ กษ.", p.mWay],
  ].filter(([, v]) => v != null && v !== "");

  const inputStyle = {
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 7px",
    fontSize: 12.5,
  };

  const TABS = [
    ["report", "รายงานผลรายเดือน"],
    ["risk", "ความเสี่ยง"],
    ["info", "รายละเอียดตามแผน"],
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={p.name}>
        <header>
          <h3>{p.name}</h3>
          <button className="iconbtn" onClick={onClose}>
            ปิด
          </button>
        </header>

        <div className="dbody">
          {mine.length ? (
            <div className="alerts" style={{ marginBottom: 18 }}>
              {mine.map((a) => (
                <div key={a.id} className={"alert " + a.sev} style={{ cursor: "default" }}>
                  <span className="sev">{SEV_LABEL[a.sev]}</span>
                  <div className="abody">
                    <div className="title" style={{ fontSize: 13 }}>
                      {KIND_LABEL[a.kind]}
                    </div>
                    <div className="detail">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="segmented" style={{ marginBottom: 16 }}>
            {TABS.map(([k, label]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {/* ---------------- รายงานผลรายเดือน ---------------- */}
          {tab === "report" ? (
            <>
              <h4>สถานะการดำเนินงาน</h4>
              <div className="trackgrid">
                <div>
                  <label className="small muted" htmlFor={"st-" + uid}>
                    สถานะ
                  </label>
                  <select
                    id={"st-" + uid}
                    value={tk.status || ""}
                    onChange={(e) => setProject(uid, { status: e.target.value })}
                  >
                    <option value="">— ยังไม่ระบุ —</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="small muted" htmlFor={"pg-" + uid}>
                    ความก้าวหน้า (%)
                  </label>
                  <input
                    id={"pg-" + uid}
                    inputMode="decimal"
                    value={tk.progress == null ? "" : tk.progress}
                    onChange={(e) => setProject(uid, { progress: e.target.value })}
                  />
                </div>
              </div>
              <textarea
                placeholder="หมายเหตุ / ปัญหาอุปสรรค"
                value={tk.note || ""}
                onChange={(e) => setProject(uid, { note: e.target.value })}
                style={{ width: "100%", marginBottom: 12 }}
              />

              {/* ตัวชี้วัดความสำเร็จตามแผน วางไว้เหนือช่องกรอกเพื่อให้กรอกเทียบได้ */}
              <h4>ตัวชี้วัดความสำเร็จตามแผน</h4>
              <dl className="dl">
                <dt>ผลผลิต (Output)</dt>
                <dd>{p.output || "–"}</dd>
                <dt>ผลลัพธ์ (Outcome)</dt>
                <dd>{p.outcome || "–"}</dd>
              </dl>

              <h4>
                รายงานผลการดำเนินงานรายเดือน
                <span className="muted small" style={{ fontWeight: 400, marginInlineStart: 8 }}>
                  เบิกจ่ายรวม {money(spent)} บาท
                  {p.budget
                    ? " จาก " + money(p.budget) + " บาท (" + pct((spent / p.budget) * 100) + ")"
                    : ""}
                </span>
              </h4>

              {/* คอลัมน์แผนรายเดือนในไฟล์ต้นฉบับใช้ปนกันระหว่างจำนวนเงินกับจำนวนครั้ง/หน่วย
                  จึงแสดงตามที่มีมา ไม่นำมารวมเป็นยอดเงิน */}
              <div className="tablewrap">
                <table className="mrep">
                  <thead>
                    <tr>
                      <th>เดือน</th>
                      <th className="num">แผน</th>
                      <th>ผลผลิต (Output)</th>
                      <th>ผลลัพธ์ (Outcome)</th>
                      <th className="num">เบิกจ่าย (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((label, i) => {
                      const e = rep[i] || {};
                      const reported = hasReport(e);
                      const missed = plan[i] && i <= asOfMonth && !reported;
                      const list = entriesOf(budget, uid, i);
                      const monthSpend = entriesTotal(list);
                      const open = openMonth === i;

                      return [
                        <tr key={i} className={reported ? "reported" : missed ? "missed" : ""}>
                          <td className="nowrap">
                            {label}
                            {i === asOfMonth ? (
                              <span className="chip" style={{ marginInlineStart: 6 }}>
                                ณ เดือนนี้
                              </span>
                            ) : null}
                          </td>
                          <td className="plan">
                            {plan[i] ? (plan[i] > 1000 ? money(plan[i]) : "มีแผน") : "–"}
                          </td>
                          <td>
                            <input
                              value={e.o == null ? "" : e.o}
                              onChange={(ev) => setMonthly(uid, i, { o: ev.target.value })}
                              style={{ ...inputStyle, textAlign: "start" }}
                            />
                          </td>
                          <td>
                            <input
                              value={e.r == null ? "" : e.r}
                              onChange={(ev) => setMonthly(uid, i, { r: ev.target.value })}
                              style={{ ...inputStyle, textAlign: "start" }}
                            />
                          </td>
                          <td className="num">
                            {/* ยอดนี้คำนวณจากรายการงบประมาณ ไม่ให้กรอกมือ
                                เพื่อให้ตรงกับหน้ารายงานงบประมาณโครงการเสมอ */}
                            <button
                              className="exp-toggle"
                              onClick={() => setOpenMonth(open ? null : i)}
                            >
                              {list.length ? money(monthSpend) : "เพิ่มรายการ"}{" "}
                              {open ? "▾" : "▸"}
                            </button>
                            <div className="small muted">
                              {list.length
                                ? list.length + " รายการ"
                                : e.s
                                ? "ยอดเดิม " + money(Number(e.s))
                                : ""}
                            </div>
                          </td>
                        </tr>,
                        open ? (
                          <tr className="exp-body" key={i + "/entries"}>
                            <td colSpan={5}>
                              <div style={{ padding: "10px 12px" }}>
                                <MonthBudget item={p} month={i} />
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <div className="small muted" style={{ marginTop: 7 }}>
                ยอดเบิกจ่ายมาจากรายการงบประมาณของเดือนนั้น กดที่ตัวเลขเพื่อเพิ่ม/แก้ไขรายการ
                แต่ละรายการแยก {["ค่าเบี้ยเลี้ยง", "ค่าที่พัก", "ค่าเดินทาง", "ค่าน้ำมันเชื้อเพลิง"].join(" · ")}
              </div>
            </>
          ) : null}

          {/* ---------------- ความเสี่ยง ---------------- */}
          {tab === "risk" ? (
            <>
              {p.rScen || p.rFactor ? (
                <>
                  <h4>ทะเบียนความเสี่ยงตามแผน</h4>
                  <dl className="dl">
                    {p.rFactor ? (
                      <>
                        <dt>ปัจจัยเสี่ยง</dt>
                        <dd>{p.rFactor}</dd>
                      </>
                    ) : null}
                    {p.rScen ? (
                      <>
                        <dt>สถานการณ์ความเสี่ยง</dt>
                        <dd>{p.rScen}</dd>
                      </>
                    ) : null}
                    <dt>ประเภทความเสี่ยง</dt>
                    <dd>{RISK_TYPES[p.rType] || p.rType || "ไม่ระบุ"}</dd>
                    {CONTROL_FIELDS.map((c) =>
                      p[c.key] ? (
                        <div key={c.key} style={{ display: "contents" }}>
                          <dt>{c.label}</dt>
                          <dd>{p[c.key]} / 3</dd>
                        </div>
                      ) : null
                    )}
                    <dt>สรุปคะแนนควบคุมภายใน</dt>
                    <dd>{p.rSum ? p.rSum + " / 9" : "–"}</dd>
                  </dl>
                </>
              ) : (
                <div className="banner">โครงการนี้ไม่ได้อยู่ในทะเบียนความเสี่ยงตามไฟล์แผน</div>
              )}

              <h4>รายงานความเสี่ยงรายเดือน</h4>
              <div className="tablewrap">
                <table className="mrep">
                  <thead>
                    <tr>
                      <th>เดือน</th>
                      <th style={{ width: 130 }}>ระดับ</th>
                      <th>สถานการณ์ที่พบ</th>
                      <th>มาตรการจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((label, i) => {
                      const cur = riskAt(risk, uid, i) || {};
                      const info = riskLevelInfo(cur.level === "" ? null : cur.level);
                      return (
                        <tr key={i}>
                          <td className="nowrap">
                            {label}
                            {i === asOfMonth ? (
                              <span className="chip" style={{ marginInlineStart: 6 }}>
                                ณ เดือนนี้
                              </span>
                            ) : null}
                            <div className={"small st-" + info.cls}>
                              <span className={"dot bg-" + info.cls} />
                              {info.label}
                            </div>
                          </td>
                          <td>
                            <select
                              value={cur.level == null ? "" : cur.level}
                              onChange={(ev) => setRisk(uid, i, { level: ev.target.value })}
                              style={{ ...inputStyle, textAlign: "start" }}
                            >
                              <option value="">— ยังไม่รายงาน —</option>
                              {RISK_LEVELS.map((lv) => (
                                <option key={lv.value} value={lv.value}>
                                  {lv.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={cur.situation || ""}
                              onChange={(ev) => setRisk(uid, i, { situation: ev.target.value })}
                              style={{ ...inputStyle, textAlign: "start" }}
                            />
                          </td>
                          <td>
                            <input
                              value={cur.action || ""}
                              onChange={(ev) => setRisk(uid, i, { action: ev.target.value })}
                              style={{ ...inputStyle, textAlign: "start" }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {/* ---------------- รายละเอียดตามแผน ---------------- */}
          {tab === "info" ? (
            <>
              <h4>รายละเอียดโครงการ</h4>
              <dl className="dl">
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>

              {linkRows.length ? (
                <>
                  <h4>ความเชื่อมโยงแผน</h4>
                  <dl className="dl">
                    {linkRows.map(([k, v]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : null}

              {p._kids && p._kids.length ? (
                <>
                  <h4>กิจกรรมภายใต้โครงการ ({p._kids.length})</h4>
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>กิจกรรม</th>
                          <th className="num">งบประมาณ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p._kids.map((k) => (
                          <tr key={k.uid}>
                            <td className="small">{k.name}</td>
                            <td className="num small">{money(k.budget)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="small muted" style={{ marginTop: 7 }}>
                    งบของกิจกรรมรวมอยู่ในงบโครงการแม่แล้ว ไม่ต้องนำมาบวกซ้ำ
                  </div>
                </>
              ) : null}

              <div className="btnrow">
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (
                      confirm(
                        "ล้างข้อมูลที่กรอกไว้ของโครงการนี้ทั้งหมด (ผลรายเดือน รายการงบประมาณ และรายงานความเสี่ยง)?\nทุกคนจะเห็นผลทันที"
                      )
                    ) {
                      clearProject(uid);
                    }
                  }}
                >
                  ล้างข้อมูลที่กรอกของโครงการนี้
                </button>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
