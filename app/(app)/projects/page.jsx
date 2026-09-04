"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ITEMS,
  PROJECTS,
  MONTHS_SHORT,
  monthsOf,
  FUNDS,
} from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import { ORG_UNITS, inUnit } from "@/lib/rollup";
import { useResults, projectTrack, monthlyOf, budgetRollup } from "@/lib/store";
import { buildAlerts, groupByUid, worstSev, rolledReport, SEV_LABEL } from "@/lib/alerts";
import MonthPicker from "@/components/month-picker";
import ProjectDrawer from "@/components/project-drawer";
import DownloadButton from "@/components/download-button";
import StatusBadge, { ReportBadge } from "@/components/status-badge";

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

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    const pool = showActs ? ITEMS.filter((x) => x.lvl >= 1) : PROJECTS;

    let out = pool.filter((p) => {
      if (sNo && p.sNo !== sNo) return false;
      if (fund && p.fund !== fund) return false;
      if (org && !inUnit(p, org)) return false;
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

  /* โครงการที่กำลังเปิดรายงานผลอยู่ — ใช้ซ่อนโครงการอื่นออกจากตาราง
     หาใน rows ไม่ใช่ใน ITEMS ทั้งหมด เพราะถ้าตัวกรองด้านบนถูกเปลี่ยน
     จนโครงการที่เปิดอยู่หลุดออกจากผลการกรอง ตารางควรกลับมาปกติ */
  const focused = openUid ? rows.find((p) => p.uid === openUid) || null : null;

  /* เมื่อเลือกยุทธศาสตร์ ให้แบ่งกลุ่มตามกลยุทธ์ จะได้เห็นชัดว่าโครงการไหนอยู่กลยุทธ์ไหน
     ไม่เลือกยุทธศาสตร์ก็แสดงรวดเดียวเหมือนเดิม เพราะข้ามยุทธศาสตร์แล้วกลุ่มจะเยอะเกินอ่าน */
  const grouped = useMemo(() => {
    if (!sNo) return null;

    const m = new Map();
    rows.forEach((p) => {
      const key = p.tNo || "(ไม่ระบุกลยุทธ์)";
      if (!m.has(key)) {
        m.set(key, { no: p.tNo, name: p.tactic || "(ไม่ระบุกลยุทธ์)", list: [], budget: 0 });
      }
      const g = m.get(key);
      g.list.push(p);
      if (p.lvl === 1) g.budget += p.budget || 0;
    });

    return [...m.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "th"))
      .map(([, g]) => g);
  }, [rows, sNo]);

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูลแผน…</div>;

  return (
    <>
      <MonthPicker />

      <section className="block">
        <h2>
          โครงการและกิจกรรม
          <small>
            แสดง {fmt(rows.length)} รายการ · งบระดับโครงการที่แสดง {money(shownBudget)} บาท
            {grouped ? " · แบ่งตามกลยุทธ์ " + grouped.length + " กลุ่ม" : ""}
          </small>
          <DownloadButton
            className="iconbtn"
            title="รายงานโครงการและกิจกรรม"
            sheets={() => [
              /* คอลัมน์ต้องครบเท่าที่ตาราง (และไฟล์ PDF) แสดง — ตัวชี้วัด
                 แผน/ผลรายเดือน และการแจ้งเตือน เดิมหายไปจากไฟล์ Excel
                 เดือนที่มีแผนเขียนเป็นรายชื่อเดือน ไม่ใช่แค่จำนวน
                 เพราะไฟล์ PDF แสดงเป็นจุดรายเดือนที่ดูออกว่าเดือนไหน */
              {
                name: "โครงการและกิจกรรม",
                widths: [12, 52, 20, 10, 14, 16, 16, 16, 16, 14, 40, 40, 26, 26, 12, 14, 20],
                rows: [
                  [
                    "รหัส",
                    "ชื่อรายการ",
                    "หน่วยงาน",
                    "ระดับ",
                    "ยุทธศาสตร์",
                    "กลยุทธ์",
                    "แหล่งเงิน",
                    "งบตามแผน",
                    "เบิกจ่าย",
                    "คงเหลือ",
                    "ตัวชี้วัดผลผลิต",
                    "ตัวชี้วัดผลลัพธ์",
                    "เดือนที่มีแผน",
                    "เดือนที่รายงานแล้ว",
                    "รายงานแล้ว/แผน",
                    "สถานะ",
                    "การแจ้งเตือน",
                  ],
                  ...rows.map((p) => {
                    const roll = budgetRollup(budget, p, null);
                    const rep = rolledReport(results, p);
                    const plan = monthsOf(p);
                    const planIdx = [];
                    const doneIdx = [];
                    for (let i = 0; i < 12; i++) {
                      if (plan[i]) planIdx.push(i);
                      if (rep.reported[i]) doneIdx.push(i);
                    }
                    const list = byUidAlerts.get(p.uid) || [];
                    const sev = worstSev(list);
                    return [
                      p.code,
                      p.name,
                      p.org || "",
                      p.lvl === 1 ? "โครงการ" : "กิจกรรม",
                      p.sNo ? "ที่ " + p.sNo : "",
                      p.tNo ? "ที่ " + p.tNo : "",
                      p.fund || "",
                      p.budget || 0,
                      roll.total,
                      (p.budget || 0) - roll.total,
                      p.output || "",
                      p.outcome || "",
                      planIdx.map((i) => MONTHS_SHORT[i]).join(" ") || "ไม่มีแผนรายเดือน",
                      doneIdx.map((i) => MONTHS_SHORT[i]).join(" ") || "ยังไม่รายงาน",
                      doneIdx.length + "/" + planIdx.length,
                      projectTrack(results, p.uid).status || "ยังไม่ระบุ",
                      sev
                        ? (SEV_LABEL[sev] || sev) + " " + list.length + " รายการ"
                        : "ไม่พบปัญหา",
                    ];
                  }),
                ],
              },
            ]}
            subtitle={
              (sNo ? "ยุทธศาสตร์ที่ " + sNo : "ทุกยุทธศาสตร์") +
              (org ? " · " + org : "") +
              " · " + rows.length + " รายการ"
            }
          />
        </h2>

        <div className="hint">
          หน้านี้ทำได้อย่างเดียวคือ <b>รายงานผลการดำเนินงาน</b> —
          คอลัมน์เบิกจ่ายดึงยอดมาจาก <Link href="/budget">งบประมาณโครงการ</Link>{" "}
          ซึ่งเป็นที่เดียวที่บันทึกงบได้ ส่วนการเพิ่ม ลบ หรือแก้ตัวแผน
          (งบที่จัดสรร ตัวชี้วัด แผนการดำเนินงาน) ทำที่{" "}
          <Link href="/plan-edit">แก้ไขแผน</Link> ที่เดียว
          เพราะต้องมีมติรองรับและต้องเก็บประวัติทุกครั้ง
        </div>

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
            {/* เลือกหน่วยงานตัวหน้า แล้วได้โครงการของหน่วยงานย่อยใต้สายนั้นมาด้วย
                เช่นเลือก ฝยศ. จะได้ ฝยศ./กนผ. ฝยศ./กบค. ฯลฯ ครบ */}
            <select id="p-o" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">ทุกหน่วยงาน</option>
              {ORG_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.name} ({u.count})
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
          <table className="stack">
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
              {(focused
                ? /* กำลังรายงานผลอยู่ — เหลือเฉพาะโครงการที่เลือก
                     ตารางยาว ๆ ข้างหลังลิ้นชักทำให้เสียสมาธิ และเลื่อนพลาด
                     ไปเปิดโครงการอื่นทับของที่กำลังกรอกค้างไว้ได้ง่าย */
                  [renderRow(focused)]
                : grouped
                ? /* แบ่งกลุ่มตามกลยุทธ์ โดยแทรกแถวหัวกลุ่มคั่นก่อนแต่ละชุด */
                  grouped.flatMap((g) => [
                    <tr className="exp-body" key={"grp/" + g.name}>
                      <td colSpan={8}>
                        <div className="groupbar">
                          <span className={"chip s" + (sNo || "")}>
                            {g.no ? "กลยุทธ์ที่ " + g.no : "ไม่ระบุกลยุทธ์"}
                          </span>
                          <b>{g.name}</b>
                          <span className="small muted">
                            {fmt(g.list.length)} รายการ · {money(g.budget)} บาท
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...g.list.map(renderRow),
                  ])
                : rows.map(renderRow))}
            </tbody>
          </table>
        </div>

        {focused ? (
          <div className="banner ok" style={{ marginTop: 14 }}>
            <b>กำลังรายงานผล {focused.name}</b> — ซ่อนโครงการอื่นไว้ชั่วคราว
            กดปิดในลิ้นชักเพื่อกลับไปดูทั้งหมด
          </div>
        ) : null}

        {!focused && rows.length === 0 ? (
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

  /* แยกการวาดแถวออกมาเป็นฟังก์ชัน เพราะต้องเรียกทั้งแบบแบนและแบบแบ่งกลุ่มตามกลยุทธ์ */
  function renderRow(p) {
    /* eslint-disable-next-line */
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
                    <td className="lead">
                      {p.sNo ? (
                        <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span>
                      ) : null}{" "}
                      {/* ชื่อโครงการหนากว่าชื่อกิจกรรมเสมอ กวาดตาแล้วแยกชั้นได้ทันที
                          โดยไม่ต้องอ่านรหัสว่ากี่หลัก (กติกาเดียวกันทุกหน้า) */}
                      <span className={p.lvl >= 2 ? "actname-sm" : "projname"}>
                        {p.name}
                      </span>
                      <div className="small muted">{p.code}</div>
                      <div className="badgerow">
                        <StatusBadge status={tk.status} />
                      </div>
                    </td>
                    <td className="small" data-label="หน่วยงาน">{p.org}</td>
                    {/* ตัวชี้วัดตามแผน กับผลล่าสุดที่รายงาน วางคู่กันให้เทียบได้ในบรรทัดเดียว */}
                    <td className="kpicell small wide" data-label="ตัวชี้วัดผลผลิต / ผลลัพธ์">
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
                    <td className="num" data-label="งบประมาณ">{money(p.budget)}</td>
                    <td className="wide" data-label="แผน / ผลรายเดือน">
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
                    <td className="num small" data-label="รายงานแล้ว">
                      <ReportBadge done={nRep} planned={nPlanned} />
                    </td>
                    <td className="num small" data-label="เบิกจ่าย">
                      {spent ? money(spent) : "–"}
                      {spent && p.budget ? (
                        <div className="muted">{pct((spent / p.budget) * 100)}</div>
                      ) : null}
                    </td>
                    <td data-label="แจ้งเตือน">
                      {sev ? (
                        <span className={"pill " + (sev === "crit" ? "bad" : "warn")}>
                          {SEV_LABEL[sev]} {list.length}
                        </span>
                      ) : (
                        <span className="pill ok">ไม่พบปัญหา</span>
                      )}
                    </td>
                  </tr>
                );
  }
}
