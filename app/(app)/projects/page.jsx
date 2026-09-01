"use client";

import { useMemo, useState } from "react";
import {
  ITEMS,
  PROJECTS,
  MONTHS_SHORT,
  monthsOf,
  FUNDS,
} from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import { useResults, projectTrack, monthlyOf } from "@/lib/store";
import { buildAlerts, groupByUid, worstSev, rolledReport, SEV_LABEL } from "@/lib/alerts";
import MonthPicker from "@/components/month-picker";
import ProjectDrawer from "@/components/project-drawer";

export default function ProjectsPage() {
  const { results, budget, risk, asOfMonth, loaded } = useResults();
  const [q, setQ] = useState("");
  const [sNo, setSNo] = useState("");
  const [fund, setFund] = useState("");
  const [org, setOrg] = useState("");
  const [only, setOnly] = useState(""); // "" | "alert" | "crit"
  const [showActs, setShowActs] = useState(false);
  const [sort, setSort] = useState("budget");
  const [dir, setDir] = useState(-1);
  const [openUid, setOpenUid] = useState(null);

  const alerts = useMemo(() => buildAlerts(results, asOfMonth, risk), [results, asOfMonth, risk]);
  const byUidAlerts = useMemo(() => groupByUid(alerts), [alerts]);

  const orgs = useMemo(
    () => [...new Set(PROJECTS.map((p) => p.org).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")),
    []
  );

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    const pool = showActs ? ITEMS.filter((x) => x.lvl >= 1) : PROJECTS;

    let out = pool.filter((p) => {
      if (sNo && p.sNo !== sNo) return false;
      if (fund && p.fund !== fund) return false;
      if (org && p.org !== org) return false;
      if (only) {
        const list = byUidAlerts.get(p.uid);
        if (!list || !list.length) return false;
        if (only === "crit" && worstSev(list) !== "crit") return false;
      }
      if (needle) {
        const hay = (
          p.code + " " + p.name + " " + p.org + " " + p.output + " " + p.outcome + " " + p.summary
        ).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    out = out.slice().sort((a, b) => {
      if (sort === "alerts") {
        const av = (byUidAlerts.get(a.uid) || []).length;
        const bv = (byUidAlerts.get(b.uid) || []).length;
        return (av - bv) * dir;
      }
      const va = a[sort];
      const vb = b[sort];
      if (typeof va === "number" || typeof vb === "number") return ((va || 0) - (vb || 0)) * dir;
      return String(va || "").localeCompare(String(vb || ""), "th") * dir;
    });

    return out;
  }, [q, sNo, fund, org, only, showActs, sort, dir, byUidAlerts]);

  function sortBy(key) {
    if (sort === key) setDir(-dir);
    else {
      setSort(key);
      setDir(key === "name" || key === "code" ? 1 : -1);
    }
  }

  const shownBudget = rows.reduce((a, p) => a + (p.lvl === 1 ? p.budget || 0 : 0), 0);

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูลแผน…</div>;

  return (
    <>
      <MonthPicker />

      <section className="block">
        <h2>
          โครงการและกิจกรรม
          <small>
            แสดง {fmt(rows.length)} รายการ · งบระดับโครงการที่แสดง {money(shownBudget)} บาท
          </small>
        </h2>

        <div className="filters">
          <div className="field">
            <label htmlFor="p-q">ค้นหา</label>
            <input
              id="p-q"
              type="search"
              placeholder="ชื่อ / รหัส / หน่วยงาน / ผลผลิต"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p-s">ยุทธศาสตร์</label>
            <select id="p-s" value={sNo} onChange={(e) => setSNo(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="1">ยุทธศาสตร์ที่ 1</option>
              <option value="2">ยุทธศาสตร์ที่ 2</option>
              <option value="3">ยุทธศาสตร์ที่ 3</option>
              <option value="4">ยุทธศาสตร์ที่ 4</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-f">แหล่งเงิน</label>
            <select id="p-f" value={fund} onChange={(e) => setFund(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {FUNDS.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-o">หน่วยงาน</label>
            <select id="p-o" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-a">การแจ้งเตือน</label>
            <select id="p-a" value={only} onChange={(e) => setOnly(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="alert">เฉพาะที่มีแจ้งเตือน</option>
              <option value="crit">เฉพาะวิกฤต</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-act">ระดับรายการ</label>
            <select
              id="p-act"
              value={showActs ? "all" : "proj"}
              onChange={(e) => setShowActs(e.target.value === "all")}
            >
              <option value="proj">เฉพาะโครงการ (121)</option>
              <option value="all">รวมกิจกรรม (551)</option>
            </select>
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => sortBy("name")}>
                  โครงการ / กิจกรรม
                </th>
                <th className="sortable" onClick={() => sortBy("org")}>
                  หน่วยงาน
                </th>
                <th className="kpicell">ตัวชี้วัดผลผลิต / ผลลัพธ์</th>
                <th className="num sortable" onClick={() => sortBy("budget")}>
                  งบประมาณ
                </th>
                <th>แผน / ผลรายเดือน</th>
                <th className="num">รายงานแล้ว</th>
                <th className="num">เบิกจ่าย</th>
                <th className="sortable" onClick={() => sortBy("alerts")}>
                  แจ้งเตือน
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const list = byUidAlerts.get(p.uid) || [];
                const sev = worstSev(list);
                const plan = monthsOf(p);
                const nPlanned = plan.filter(Boolean).length;
                // ใช้ยอดที่ม้วนจากกิจกรรมลูกเหมือนที่กลไกแจ้งเตือนใช้ ตัวเลขจะได้ตรงกัน
                const roll = rolledReport(results, p);
                const nRep = roll.reportedCount;
                const spent = roll.spentTo(11);
                const tk = projectTrack(results, p.uid);

                /* ผลผลิต/ผลลัพธ์ที่รายงานล่าสุดในเดือนที่ไม่เกิน "ณ เดือน" ที่เลือก */
                const rep = monthlyOf(results, p.uid);
                let lastReport = null;
                for (let i = 0; i <= asOfMonth; i++) {
                  const e = rep[i];
                  if (e && ((e.o && e.o !== "") || (e.r && e.r !== ""))) lastReport = { i, e };
                }

                return (
                  <tr
                    key={p.uid}
                    onClick={() => setOpenUid(p.uid)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      {p.sNo ? (
                        <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span>
                      ) : null}{" "}
                      <span className={p.lvl >= 2 ? "small muted" : ""}>{p.name}</span>
                      <div className="small muted">
                        {p.code}
                        {tk.status ? " · " + tk.status : ""}
                      </div>
                    </td>
                    <td className="small">{p.org}</td>
                    {/* ตัวชี้วัดตามแผน กับผลล่าสุดที่รายงาน วางคู่กันให้เทียบได้ในบรรทัดเดียว */}
                    <td className="kpicell small">
                      <div className="clamp2">
                        <span className="muted">ผลผลิต: </span>
                        {p.output || "–"}
                      </div>
                      <div className="clamp2">
                        <span className="muted">ผลลัพธ์: </span>
                        {p.outcome || "–"}
                      </div>
                      {lastReport ? (
                        <div style={{ marginTop: 4, color: "var(--accent)" }}>
                          ล่าสุด {MONTHS_SHORT[lastReport.i]}: {lastReport.e.o || "–"}
                          {lastReport.e.r ? " / " + lastReport.e.r : ""}
                        </div>
                      ) : (
                        <div className="muted" style={{ marginTop: 4 }}>
                          ยังไม่รายงานผล
                        </div>
                      )}
                    </td>
                    <td className="num">{money(p.budget)}</td>
                    <td>
                      {/* แถบเดือนแบบแกนต์: เขียว = มีแผน, เขียวเข้ม = รายงานแล้ว, แดง = ถึงกำหนดแต่ยังไม่รายงาน */}
                      <table className="gantt" style={{ width: "auto" }}>
                        <tbody>
                          <tr>
                            {MONTHS_SHORT.map((m, i) => {
                              const reported = roll.reported[i];
                              const missed = plan[i] && i <= asOfMonth && !reported;
                              return (
                                <td key={i} className="mcell" title={m}>
                                  {plan[i] || reported ? (
                                    <span
                                      className={
                                        "on" + (reported ? " done" : missed ? " late" : "")
                                      }
                                    />
                                  ) : null}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </td>
                    <td className="num small">
                      {nPlanned ? nRep + " / " + nPlanned : nRep ? nRep : "–"}
                    </td>
                    <td className="num small">
                      {spent ? money(spent) : "–"}
                      {spent && p.budget ? (
                        <div className="muted">{pct((spent / p.budget) * 100)}</div>
                      ) : null}
                    </td>
                    <td>
                      {sev ? (
                        <span className={"chip"} style={{ color: sev === "crit" ? "var(--bad)" : "var(--warn)" }}>
                          {SEV_LABEL[sev]} {list.length}
                        </span>
                      ) : (
                        <span className="small muted">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <div className="banner" style={{ marginTop: 14 }}>
            ไม่มีรายการที่ตรงกับตัวกรองที่เลือก
          </div>
        ) : null}
      </section>

      {openUid ? (
        <ProjectDrawer uid={openUid} alerts={alerts} onClose={() => setOpenUid(null)} />
      ) : null}
    </>
  );
}
