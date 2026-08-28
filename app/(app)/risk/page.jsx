"use client";

import { useMemo, useState } from "react";
import { MONTHS, PROJECTS } from "@/lib/plan";
import {
  RISK_TYPES,
  RISK_ITEMS,
  RISK_LEVELS,
  CONTROL_FIELDS,
  riskLevelInfo,
} from "@/lib/rollup";
import { money, fmt, pct } from "@/lib/format";
import { useResults, riskOf, riskAt } from "@/lib/store";
import { buildAlerts, RISK_KINDS, KIND_LABEL, SEV_LABEL } from "@/lib/alerts";
import MonthPicker from "@/components/month-picker";
import ProjectDrawer from "@/components/project-drawer";
import Bars from "@/components/bars";

export default function RiskPage() {
  const { results, risk, asOf, loaded, setRisk } = useResults();
  const [openUid, setOpenUid] = useState(null);
  const [q, setQ] = useState("");
  const [onlyReported, setOnlyReported] = useState(false);

  const alerts = useMemo(() => buildAlerts(results, asOf, risk), [results, asOf, risk]);
  const riskAlerts = useMemo(
    () => alerts.filter((a) => RISK_KINDS.includes(a.kind)),
    [alerts]
  );

  /* แดชบอร์ด: นับโครงการตามระดับความเสี่ยงที่รายงานล่าสุด (ไม่เกินเดือนที่เลือก) */
  const dash = useMemo(() => {
    const byLevel = [0, 0, 0, 0, 0];
    let reported = 0;
    let budgetAtRisk = 0;
    const rows = [];

    PROJECTS.forEach((p) => {
      const mine = riskOf(risk, p.uid);
      let last = -1;
      for (let i = 0; i <= asOf; i++) {
        const e = mine[i];
        if (e && e.level !== "" && e.level != null) last = i;
      }
      const inRegister = !!(p.rScen || p.rFactor);
      if (last < 0) {
        if (inRegister || onlyReported === false) {
          rows.push({ p, level: null, month: null, entry: null, inRegister });
        }
        return;
      }
      const e = mine[last];
      const lv = Number(e.level);
      byLevel[lv] = (byLevel[lv] || 0) + 1;
      reported++;
      if (lv >= 3) budgetAtRisk += p.budget || 0;
      rows.push({ p, level: lv, month: last, entry: e, inRegister });
    });

    return { byLevel, reported, budgetAtRisk, rows };
  }, [risk, asOf, onlyReported]);

  const registerRows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    let list = dash.rows;
    if (onlyReported) list = list.filter((r) => r.level != null);
    if (needle) {
      list = list.filter((r) => {
        const hay = (
          r.p.code + " " + r.p.name + " " + r.p.org + " " +
          (r.p.rScen || "") + " " + (r.p.rFactor || "")
        ).toLowerCase();
        return hay.includes(needle);
      });
    }
    // เรียงให้ระดับสูงขึ้นก่อน แล้วตามงบประมาณ
    return list.slice().sort((a, b) => {
      const la = a.level == null ? -1 : a.level;
      const lb = b.level == null ? -1 : b.level;
      if (la !== lb) return lb - la;
      return (b.p.budget || 0) - (a.p.budget || 0);
    });
  }, [dash.rows, q, onlyReported]);

  const byType = useMemo(() => {
    const m2 = new Map();
    RISK_ITEMS.forEach((x) => {
      const k = x.rType || "(ไม่ระบุ)";
      m2.set(k, (m2.get(k) || 0) + 1);
    });
    return [...m2.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  return (
    <>
      <MonthPicker />

      <section className="block">
        <h2>
          แดชบอร์ดความเสี่ยง
          <small>อิงรายงานล่าสุดที่ไม่เกินเดือน {MONTHS[asOf]}</small>
        </h2>

        <div className="tiles">
          <div className="tile crit">
            <span className="lab">แจ้งเตือนความเสี่ยงวิกฤต</span>
            <div className="val st-bad">
              {fmt(riskAlerts.filter((a) => a.sev === "crit").length)}
            </div>
            <div className="note">ระดับสูงมาก</div>
          </div>
          <div className="tile warn">
            <span className="lab">แจ้งเตือนเฝ้าระวัง</span>
            <div className="val st-warn">
              {fmt(riskAlerts.filter((a) => a.sev === "warn").length)}
            </div>
            <div className="note">ระดับสูง หรือยังไม่รายงาน</div>
          </div>
          <div className="tile">
            <span className="lab">รายงานความเสี่ยงแล้ว</span>
            <div className="val">
              {fmt(dash.reported)}
              <span className="unit">/ {fmt(PROJECTS.length)}</span>
            </div>
            <div className="note">
              คิดเป็น {pct((dash.reported / PROJECTS.length) * 100)}
            </div>
          </div>
          <div className="tile">
            <span className="lab">งบของโครงการเสี่ยงสูง</span>
            <div className="val">{money(dash.budgetAtRisk)}</div>
            <div className="note">บาท</div>
          </div>
        </div>
      </section>

      <section className="block">
        <h2>จำนวนโครงการตามระดับความเสี่ยงที่รายงาน</h2>
        <div className="card pad">
          <Bars
            data={RISK_LEVELS.map((lv) => ({
              label: lv.label,
              value: dash.byLevel[lv.value] || 0,
              display: fmt(dash.byLevel[lv.value] || 0) + " โครงการ",
              color:
                lv.cls === "bad"
                  ? "var(--bad)"
                  : lv.cls === "warn"
                  ? "var(--warn)"
                  : "var(--ok)",
            }))}
          />
        </div>
      </section>

      {riskAlerts.length ? (
        <section className="block">
          <h2>
            รายการแจ้งเตือนความเสี่ยง
            <small>{fmt(riskAlerts.length)} รายการ · คลิกเพื่อเปิดรายละเอียดและรายงาน</small>
          </h2>
          <div className="alerts">
            {riskAlerts.map((a) => (
              <button
                key={a.id}
                className={"alert " + a.sev}
                onClick={() => a.uid && setOpenUid(a.uid)}
              >
                <span className="sev">{SEV_LABEL[a.sev]}</span>
                <div className="abody">
                  <div className="title">{a.title}</div>
                  <div className="detail">{a.detail}</div>
                  <div className="meta">
                    <span>{KIND_LABEL[a.kind]}</span>
                    {a.code ? <span>รหัส {a.code}</span> : null}
                    {a.org ? <span>{a.org}</span> : null}
                  </div>
                </div>
                {a.budget ? (
                  <div className="amount">
                    {money(a.budget)}
                    <br />
                    <span className="muted">บาท</span>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="block">
        <h2>
          ทะเบียนความเสี่ยงและการรายงานรายเดือน
          <small>
            ทะเบียนมาจากไฟล์แผน ({fmt(RISK_ITEMS.length)} รายการ) · ระดับความเสี่ยงกรอกเองรายเดือน
          </small>
        </h2>

        <div className="filters">
          <div className="field">
            <label htmlFor="r-q">ค้นหา</label>
            <input
              id="r-q"
              type="search"
              placeholder="ชื่อโครงการ / ปัจจัยเสี่ยง / หน่วยงาน"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="r-only">แสดง</label>
            <select
              id="r-only"
              value={onlyReported ? "yes" : "no"}
              onChange={(e) => setOnlyReported(e.target.value === "yes")}
            >
              <option value="no">ทุกโครงการ</option>
              <option value="yes">เฉพาะที่รายงานความเสี่ยงแล้ว</option>
            </select>
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>โครงการ</th>
                <th>ปัจจัยเสี่ยงตามทะเบียน</th>
                <th className="num">คุมภายใน</th>
                <th style={{ width: 150 }}>ระดับเดือน {MONTHS[asOf]}</th>
                <th style={{ minWidth: 200 }}>สถานการณ์ / มาตรการ</th>
              </tr>
            </thead>
            <tbody>
              {registerRows.slice(0, 200).map(({ p, level, month, inRegister }) => {
                const cur = riskAt(risk, p.uid, asOf) || {};
                const info = riskLevelInfo(cur.level === "" ? null : cur.level);
                return (
                  <tr key={p.uid}>
                    <td>
                      {p.sNo ? <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span> : null}{" "}
                      <button
                        className="exp-toggle"
                        onClick={() => setOpenUid(p.uid)}
                        style={{ textAlign: "start" }}
                      >
                        {p.name}
                      </button>
                      <div className="small muted">
                        {p.code} · {money(p.budget)} บาท
                        {level != null && month !== asOf
                          ? " · รายงานล่าสุด " + MONTHS[month] + ": " + riskLevelInfo(level).label
                          : ""}
                      </div>
                    </td>
                    <td className="small">
                      {inRegister ? (
                        <>
                          {p.rFactor || "–"}
                          <div className="muted">
                            {RISK_TYPES[p.rType] || p.rType || "ไม่ระบุประเภท"}
                          </div>
                        </>
                      ) : (
                        <span className="muted">ไม่อยู่ในทะเบียน</span>
                      )}
                    </td>
                    <td className="num small">
                      {p.rSum ? p.rSum + " / 9" : "–"}
                    </td>
                    <td>
                      <select
                        value={cur.level == null ? "" : cur.level}
                        onChange={(e) => setRisk(p.uid, asOf, { level: e.target.value })}
                        style={{
                          width: "100%",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "4px 7px",
                          fontSize: 12.5,
                        }}
                      >
                        <option value="">— ยังไม่รายงาน —</option>
                        {RISK_LEVELS.map((lv) => (
                          <option key={lv.value} value={lv.value}>
                            {lv.label}
                          </option>
                        ))}
                      </select>
                      <div className={"small st-" + info.cls} style={{ marginTop: 3 }}>
                        <span className={"dot bg-" + info.cls} />
                        {info.label}
                      </div>
                    </td>
                    <td>
                      <input
                        placeholder="สถานการณ์ที่พบ"
                        value={cur.situation || ""}
                        onChange={(e) => setRisk(p.uid, asOf, { situation: e.target.value })}
                        style={{
                          width: "100%",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "4px 7px",
                          fontSize: 12.5,
                          marginBottom: 4,
                        }}
                      />
                      <input
                        placeholder="มาตรการจัดการ"
                        value={cur.action || ""}
                        onChange={(e) => setRisk(p.uid, asOf, { action: e.target.value })}
                        style={{
                          width: "100%",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "4px 7px",
                          fontSize: 12.5,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {registerRows.length > 200 ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            แสดง 200 รายการแรกจาก {fmt(registerRows.length)} — ใช้ช่องค้นหาเพื่อจำกัดให้แคบลง
          </div>
        ) : null}
      </section>

      <section className="block">
        <h2>
          ทะเบียนความเสี่ยงตามประเภท
          <small>ตามที่ระบุไว้ในไฟล์แผน</small>
        </h2>
        <div className="card pad">
          <Bars
            data={byType.map(([k, v]) => ({
              label: RISK_TYPES[k] || k,
              value: v,
              display: fmt(v) + " รายการ",
            }))}
          />
          <div className="small muted" style={{ marginTop: 14 }}>
            คะแนนประเมินการควบคุมภายในเต็ม 9 แบ่งเป็น 3 ด้านละ 3 คะแนน:{" "}
            {CONTROL_FIELDS.map((c) => c.label).join(" · ")} — ยิ่งคะแนนน้อยยิ่งควรจับตา
          </div>
        </div>
      </section>

      {openUid ? (
        <ProjectDrawer uid={openUid} alerts={alerts} onClose={() => setOpenUid(null)} />
      ) : null}
    </>
  );
}
