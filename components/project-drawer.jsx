"use client";

import { useEffect } from "react";
import { MONTHS, STATUSES, monthsOf, byUid } from "@/lib/plan";
import { money, pct } from "@/lib/format";
import { useResults, hasReport, monthlyOf, projectTrack, spentTotal } from "@/lib/store";
import { KIND_LABEL, SEV_LABEL } from "@/lib/alerts";

/* ลิ้นชักรายละเอียดโครงการ + ฟอร์มรายงานผลรายเดือน 12 เดือน
   ใช้ร่วมกันระหว่างหน้าแจ้งเตือนกับหน้าโครงการ */
export default function ProjectDrawer({ uid, alerts, onClose }) {
  const { results, asOf, setProject, setMonthly, clearProject } = useResults();

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
    ["ตัวชี้วัด", p.kpi],
    ["แผนงาน", p.program],
    ["ประเภทโครงการ", p.ptype],
    ["หน่วยงานรับผิดชอบ", p.org],
    ["แหล่งเงิน", p.fund],
    ["งบประมาณ", p.budget ? money(p.budget) + " บาท" : "–"],
    ["ระยะเวลา", p.period],
    ["ผลผลิต (Output) ตามแผน", p.output],
    ["ผลลัพธ์ (Outcome) ตามแผน", p.outcome],
    ["สาระสำคัญ", p.summary],
  ].filter(([, v]) => v != null && v !== "");

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
            <>
              <h4>การแจ้งเตือนของโครงการนี้ ({mine.length})</h4>
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
            </>
          ) : null}

          <h4>รายละเอียดตามแผน</h4>
          <dl className="dl">
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

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

          <h4>
            รายงานผลการดำเนินงานรายเดือน
            <span className="muted small" style={{ fontWeight: 400, marginInlineStart: 8 }}>
              เบิกจ่ายรวม {money(spent)} บาท
              {p.budget ? " จาก " + money(p.budget) + " บาท (" + pct((spent / p.budget) * 100) + ")" : ""}
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
                  <th>ผลผลิต</th>
                  <th>ผลลัพธ์</th>
                  <th className="num">เบิกจ่าย (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((label, i) => {
                  const e = rep[i] || {};
                  const reported = hasReport(e);
                  const missed = plan[i] && i <= asOf && !reported;
                  return (
                    <tr key={i} className={reported ? "reported" : missed ? "missed" : ""}>
                      <td className="nowrap">
                        {label}
                        {i === asOf ? (
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
                          style={{ textAlign: "start" }}
                        />
                      </td>
                      <td>
                        <input
                          value={e.r == null ? "" : e.r}
                          onChange={(ev) => setMonthly(uid, i, { r: ev.target.value })}
                          style={{ textAlign: "start" }}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={e.s == null ? "" : e.s}
                          onChange={(ev) => setMonthly(uid, i, { s: ev.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
                if (confirm("ล้างข้อมูลที่กรอกไว้ของโครงการนี้ในเครื่องนี้?")) clearProject(uid);
              }}
            >
              ล้างข้อมูลที่กรอกของโครงการนี้
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
