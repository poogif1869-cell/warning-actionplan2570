"use client";

import { useEffect, useMemo, useState } from "react";
import { MONTHS, PROJECTS, FUNDS } from "@/lib/plan";
import { STRATEGIES, ORG_UNITS, ORG_OWNERS, inUnit, leadUnit } from "@/lib/rollup";
import { money, fmt, pct } from "@/lib/format";
import { useResults, entriesByCost, budgetRollup, COST_FIELDS } from "@/lib/store";
import MonthPicker from "@/components/month-picker";
import MonthBudget from "@/components/month-budget";
import BudgetReport from "@/components/budget-report";
import Bars from "@/components/bars";
import Donut from "@/components/donut";
import PrintButton from "@/components/print-button";

const S_COLORS = ["", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

/* สองหน้าต่างของหน้างบประมาณ — แยกกันเพราะคนละงาน
   แดชบอร์ด = ดูภาพรวม  ·  รายงาน = กรอกและพิมพ์รายโครงการ */
const PANES = [
  ["dash", "แดชบอร์ดสรุปงบประมาณ"],
  ["report", "รายงานงบประมาณโครงการ"],
];

const DONUT_VIEWS = [
  ["month", "เบิกจ่ายรายเดือน"],
  ["fund", "เบิกจ่ายตามแหล่งงบประมาณ"],
  ["strategy", "เบิกจ่ายตามยุทธศาสตร์"],
];

/* ขอบเขตของไฟล์ PDF ที่จะดาวน์โหลดในหน้ารายงาน */
const PDF_SCOPES = [
  ["all", "ทั้งหมดที่แสดงอยู่"],
  ["org", "เฉพาะหน่วยงานที่เลือก"],
  ["project", "เฉพาะโครงการที่เลือก"],
];

export default function BudgetPage() {
  const { budget, asOfMonth, asOfLabel, allMonths, loaded } = useResults();
  const [pane, setPane] = useState("dash");
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("");
  const [fund, setFund] = useState("");
  const [openUid, setOpenUid] = useState(null);
  const [view, setView] = useState("month");
  const [pdfScope, setPdfScope] = useState("all");
  const [pdfUid, setPdfUid] = useState("");
  const [printItem, setPrintItem] = useState(null);

  // ดรอปดาวน์ช่วงเวลาด้านบนคุมทั้งหน้า — ทั้งปี = null (ไม่กรองเดือน)
  const month = allMonths ? null : asOfMonth;

  /* ยอดของแต่ละโครงการ รวมรายการของกิจกรรมลูกด้วย */
  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return PROJECTS.filter((p) => {
      if (org && !inUnit(p, org)) return false;
      if (fund && p.fund !== fund) return false;
      if (needle) {
        const hay = (p.code + " " + p.name + " " + p.org).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
      .map((p) => ({ p, roll: budgetRollup(budget, p, month) }))
      .sort((a, b) => b.roll.total - a.roll.total || (b.p.budget || 0) - (a.p.budget || 0));
  }, [budget, org, fund, q, month]);

  const grand = rows.reduce((a, r) => a + r.roll.total, 0);
  const withEntries = rows.filter((r) => r.roll.count > 0);

  const byCost = useMemo(() => {
    const all = [];
    rows.forEach((r) => {
      all.push(...r.roll.own);
      r.roll.byActivity.forEach((a) => all.push(...a.list));
    });
    return entriesByCost(all);
  }, [rows]);

  /* ---------- สรุปตามหน่วยงานเจ้าของ ----------
     นับเฉพาะโครงการที่หน่วยงานนั้น "ขึ้นต้นสาย" เท่านั้น
     เช่น สวย./ฝอย. ไปรวมที่ สวย. อย่างเดียว ไม่ไปรวมที่ ฝอย. ด้วย
     ทำแบบนี้ผลรวมทุกแถวจึงเท่ากับยอดจริงของทั้งแผนพอดี ไม่มีการนับซ้ำ */
  const byOrg = useMemo(() => {
    return ORG_OWNERS.map((u) => {
      const list = u.list.filter((p) => !fund || p.fund === fund);
      const rolls = list.map((p) => budgetRollup(budget, p, month));
      const entries = rolls.flatMap((r) => [...r.own, ...r.byActivity.flatMap((a) => a.list)]);
      return {
        key: u.key,
        name: u.name,
        count: list.length,
        planned: list.reduce((a, p) => a + (p.budget || 0), 0),
        used: rolls.reduce((a, r) => a + r.total, 0),
        cost: entriesByCost(entries),
      };
    })
      .filter((u) => u.count > 0)
      .sort((a, b) => b.used - a.used || b.planned - a.planned);
  }, [budget, month, fund]);

  const orgTotals = useMemo(
    () => ({
      planned: byOrg.reduce((a, u) => a + u.planned, 0),
      used: byOrg.reduce((a, u) => a + u.used, 0),
      count: byOrg.reduce((a, u) => a + u.count, 0),
    }),
    [byOrg]
  );

  /* ---------- สรุปตามแหล่งงบประมาณ ---------- */
  const byFund = useMemo(() => {
    return FUNDS.map((f) => {
      const list = PROJECTS.filter((p) => p.fund === f.code && (!org || inUnit(p, org)));
      const rolls = list.map((p) => budgetRollup(budget, p, month));
      const entries = rolls.flatMap((r) => [...r.own, ...r.byActivity.flatMap((a) => a.list)]);
      return {
        ...f,
        count: list.length,
        planned: list.reduce((a, p) => a + (p.budget || 0), 0),
        used: rolls.reduce((a, r) => a + r.total, 0),
        cost: entriesByCost(entries),
      };
    }).filter((f) => f.count > 0);
  }, [budget, month, org]);

  /* ---------- ข้อมูลกราฟโดนัท 3 มุมมอง ---------- */
  const donutData = useMemo(() => {
    if (view === "month") {
      return MONTHS.map((label, i) => ({
        key: "m" + i,
        label,
        value: PROJECTS.reduce((a, p) => a + budgetRollup(budget, p, i).total, 0),
      }));
    }
    if (view === "fund") {
      return FUNDS.map((f) => ({
        key: f.code,
        label: f.name,
        value: PROJECTS.filter((p) => p.fund === f.code).reduce(
          (a, p) => a + budgetRollup(budget, p, month).total,
          0
        ),
      }));
    }
    return STRATEGIES.map((s) => ({
      key: s.no,
      label: "ยุทธศาสตร์ที่ " + s.no,
      color: S_COLORS[Number(s.no)],
      value: PROJECTS.filter((p) => p.sNo === s.no).reduce(
        (a, p) => a + budgetRollup(budget, p, month).total,
        0
      ),
    }));
  }, [view, budget, month]);

  const donutLabel = view === "month" ? "ทั้งปีงบประมาณ" : asOfLabel;

  /* ---------- พิมพ์รายงานรายโครงการ ----------
     ต้อง render DOM ของรายงานก่อนแล้วค่อยเรียก print ไม่งั้นได้หน้าว่าง */
  useEffect(() => {
    if (!printItem) return;
    document.body.classList.add("printing-report");
    const t = setTimeout(() => window.print(), 60);
    function done() {
      setPrintItem(null);
    }
    window.addEventListener("afterprint", done);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("printing-report");
    };
  }, [printItem]);

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  const orgName = org ? (ORG_UNITS.find((u) => u.key === org) || {}).name || org : "";

  return (
    <>
      <MonthPicker />

      {/* ---------- สลับหน้าต่าง ---------- */}
      <div className="segmented" style={{ marginBottom: 18 }}>
        {PANES.map(([k, label]) => (
          <button key={k} aria-pressed={pane === k} onClick={() => setPane(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* =================== หน้าต่างที่ 1: แดชบอร์ด =================== */}
      {pane === "dash" ? (
        <>
          <section className="block">
            <h2>
              แดชบอร์ดสรุปงบประมาณ
              <small>{asOfLabel}</small>
              <PrintButton
                className="iconbtn"
                label="ดาวน์โหลด PDF"
                title="แดชบอร์ดสรุปงบประมาณ"
                subtitle={asOfLabel}
              />
            </h2>

            <div className="tiles">
              <div className="tile">
                <span className="lab">ยอดเบิกจ่ายรวม</span>
                <div className="val">{money(grand)}</div>
                <div className="note">บาท</div>
              </div>
              <div className="tile">
                <span className="lab">โครงการที่มีรายการ</span>
                <div className="val">
                  {fmt(withEntries.length)}
                  <span className="unit">/ {fmt(rows.length)}</span>
                </div>
                <div className="note">
                  รวม {fmt(withEntries.reduce((a, r) => a + r.roll.count, 0))} รายการ
                </div>
              </div>
              {COST_FIELDS.slice(0, 2).map((c) => (
                <div className="tile" key={c.key}>
                  <span className="lab">{c.label}</span>
                  <div className="val">{money(byCost[c.key])}</div>
                  <div className="note">
                    {pct(grand ? (byCost[c.key] / grand) * 100 : 0)} ของยอดรวม
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="block">
            <h2>
              สัดส่วนยอดเบิกจ่าย
              <small>เลือกมุมมองที่ต้องการดู</small>
            </h2>
            <div className="segmented" style={{ marginBottom: 14 }}>
              {DONUT_VIEWS.map(([k, label]) => (
                <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="card pad">
              <Donut
                data={donutData}
                centerLabel={donutLabel}
                emptyText="ยังไม่มียอดเบิกจ่ายที่บันทึกไว้ในช่วงที่เลือก"
              />
            </div>
          </section>

          <section className="block">
            <h2>ยอดตามหมวดค่าใช้จ่าย</h2>
            <div className="card pad">
              <Bars
                data={COST_FIELDS.map((c) => ({
                  label: c.label,
                  value: byCost[c.key],
                  display: money(byCost[c.key]) + " บาท",
                }))}
              />
            </div>
          </section>

          <section className="block">
            <h2>
              สรุปงบประมาณตามหน่วยงานที่รับผิดชอบ
              <small>
                {fmt(byOrg.length)} หน่วยงาน · {fmt(orgTotals.count)} โครงการ
                {fund ? " · " + fund : ""}
              </small>
            </h2>
            <div className="hint">
              นับเฉพาะโครงการที่หน่วยงานนั้น<b>ขึ้นต้นสาย</b> เช่น “สวย./ฝอย.” นับให้ สวย.
              อย่างเดียว ไม่นับซ้ำที่ ฝอย. — ผลรวมทุกแถวจึงเท่ากับยอดจริงของทั้งแผนพอดี
            </div>
            <div className="tablewrap">
              <table className="stack">
                <thead>
                  <tr>
                    <th>หน่วยงาน</th>
                    <th className="num">โครงการ</th>
                    <th className="num">งบตามแผน</th>
                    <th className="num">เบิกจ่าย</th>
                    <th className="num">คงเหลือ</th>
                    {COST_FIELDS.map((c) => (
                      <th className="num" key={c.key}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byOrg.map((u) => (
                    <tr key={u.key}>
                      <td className="lead">
                        <button
                          className="exp-toggle"
                          onClick={() => {
                            setOrg(u.key);
                            setPane("report");
                          }}
                        >
                          {u.name}
                        </button>
                      </td>
                      <td className="num" data-label="โครงการ">
                        {fmt(u.count)}
                      </td>
                      <td className="num" data-label="งบตามแผน">
                        {money(u.planned)}
                      </td>
                      <td className="num" data-label="เบิกจ่าย">
                        {u.used ? money(u.used) : "–"}
                      </td>
                      <td
                        className={"num " + (u.planned - u.used < 0 ? "st-bad" : "")}
                        data-label="คงเหลือ"
                      >
                        {money(u.planned - u.used)}
                      </td>
                      {COST_FIELDS.map((c) => (
                        <td className="num" key={c.key} data-label={c.label}>
                          {u.cost[c.key] ? money(u.cost[c.key]) : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="lead">
                      <b>รวมทุกหน่วยงาน</b>
                    </td>
                    <td className="num" data-label="โครงการ">
                      <b>{fmt(orgTotals.count)}</b>
                    </td>
                    <td className="num" data-label="งบตามแผน">
                      <b>{money(orgTotals.planned)}</b>
                    </td>
                    <td className="num" data-label="เบิกจ่าย">
                      <b>{money(orgTotals.used)}</b>
                    </td>
                    <td className="num" data-label="คงเหลือ">
                      <b>{money(orgTotals.planned - orgTotals.used)}</b>
                    </td>
                    {COST_FIELDS.map((c) => (
                      <td key={c.key} />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="block">
            <h2>
              สรุปงบประมาณตามแหล่งงบประมาณ
              <small>
                {fmt(byFund.length)} แหล่ง{org ? " · เฉพาะ " + orgName : ""}
              </small>
            </h2>
            <div className="tablewrap">
              <table className="stack">
                <thead>
                  <tr>
                    <th>แหล่งงบประมาณ</th>
                    <th className="num">โครงการ</th>
                    <th className="num">เพดานงบ</th>
                    <th className="num">งบตามแผน</th>
                    <th className="num">เบิกจ่าย</th>
                    {COST_FIELDS.map((c) => (
                      <th className="num" key={c.key}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byFund.map((f) => (
                    <tr key={f.code}>
                      <td className="lead">
                        <button
                          className="exp-toggle"
                          onClick={() => {
                            setFund(f.code);
                            setPane("report");
                          }}
                        >
                          {f.name}
                        </button>
                      </td>
                      <td className="num" data-label="โครงการ">
                        {fmt(f.count)}
                      </td>
                      <td className="num" data-label="เพดานงบ">
                        {money(f.ceiling)}
                      </td>
                      <td className="num" data-label="งบตามแผน">
                        {money(f.planned)}
                      </td>
                      <td className="num" data-label="เบิกจ่าย">
                        {f.used ? money(f.used) : "–"}
                      </td>
                      {COST_FIELDS.map((c) => (
                        <td className="num" key={c.key} data-label={c.label}>
                          {f.cost[c.key] ? money(f.cost[c.key]) : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {/* =================== หน้าต่างที่ 2: รายงานรายโครงการ =================== */}
      {pane === "report" ? (
        <section className="block">
          <h2>
            รายงานงบประมาณโครงการ
            <small>
              {asOfLabel} · แสดง {fmt(rows.length)} โครงการ
              {org ? " · " + orgName : ""}
            </small>
          </h2>

          <div className="hint">
            เพิ่มได้หลายรายการต่อเดือน · โครงการที่มีกิจกรรมย่อยให้บันทึกที่กิจกรรมเท่านั้น ·
            แยก {COST_FIELDS.map((c) => c.label).join(" / ")}
          </div>

          <div className="filters">
            <div className="field">
              <label htmlFor="b-q">ค้นหา</label>
              <input
                id="b-q"
                type="search"
                placeholder="ชื่อโครงการ / รหัส / หน่วยงาน"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="b-org">หน่วยงาน</label>
              <select id="b-org" value={org} onChange={(e) => setOrg(e.target.value)}>
                <option value="">ทุกหน่วยงาน</option>
                {ORG_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.name} ({u.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-fund">แหล่งงบประมาณ</label>
              <select id="b-fund" value={fund} onChange={(e) => setFund(e.target.value)}>
                <option value="">ทุกแหล่ง</option>
                {FUNDS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ---------- เลือกขอบเขตไฟล์ PDF ---------- */}
          <div className="card pad" style={{ marginBottom: 16 }}>
            <div className="filters" style={{ marginBottom: 0 }}>
              <div className="field">
                <label htmlFor="b-pdf">ดาวน์โหลด PDF</label>
                <select
                  id="b-pdf"
                  value={pdfScope}
                  onChange={(e) => setPdfScope(e.target.value)}
                >
                  {PDF_SCOPES.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {pdfScope === "project" ? (
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="b-pdfp">เลือกโครงการ</label>
                  <select
                    id="b-pdfp"
                    value={pdfUid}
                    onChange={(e) => setPdfUid(e.target.value)}
                    style={{ maxWidth: 420 }}
                  >
                    <option value="">— เลือกโครงการ —</option>
                    {rows.map(({ p }) => (
                      <option key={p.uid} value={p.uid}>
                        {p.code} {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="field">
                <label>&nbsp;</label>
                {pdfScope === "project" ? (
                  <button
                    className="btn"
                    disabled={!pdfUid}
                    onClick={() => {
                      const hit = rows.find((r) => r.p.uid === pdfUid);
                      if (hit) setPrintItem(hit.p);
                    }}
                  >
                    ดาวน์โหลด PDF
                  </button>
                ) : (
                  <PrintButton
                    label="ดาวน์โหลด PDF"
                    title={
                      pdfScope === "org"
                        ? "รายงานงบประมาณ หน่วยงาน " + (orgName || "(ยังไม่เลือก)")
                        : "รายงานงบประมาณโครงการ"
                    }
                    subtitle={
                      asOfLabel +
                      " · " + rows.length + " โครงการ" +
                      (fund ? " · " + fund : "")
                    }
                  />
                )}
              </div>
            </div>

            <div className="small muted" style={{ marginTop: 8 }}>
              {pdfScope === "all"
                ? "ได้ทุกโครงการที่แสดงอยู่ตอนนี้ (ผ่านตัวกรองด้านบนแล้ว)"
                : pdfScope === "org"
                ? org
                  ? "ได้เฉพาะโครงการของ " + orgName + " ตามที่กรองไว้"
                  : "ยังไม่ได้เลือกหน่วยงาน — เลือกที่ช่อง “หน่วยงาน” ด้านบนก่อน ไม่งั้นจะได้ทุกโครงการ"
                : "ได้รายงานละเอียดของโครงการเดียว พร้อมตารางกิจกรรมและรายการเบิกจ่ายทุกรายการ"}
            </div>
          </div>

          <div className="tablewrap">
            <table className="stack">
              <thead>
                <tr>
                  <th>โครงการ</th>
                  <th className="num">งบตามแผน</th>
                  <th className="num">เบิกจ่าย</th>
                  <th className="num">คงเหลือ</th>
                  <th className="num">รายการ</th>
                  <th style={{ width: 210 }} />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map(({ p, roll }) => {
                  const open = openUid === p.uid;
                  const yearRoll = budgetRollup(budget, p, null);
                  const left = (p.budget || 0) - yearRoll.total;
                  return [
                    <tr key={p.uid}>
                      <td className="lead">
                        {p.sNo ? <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span> : null}{" "}
                        {p.name}
                        <div className="small muted">
                          {p.code} · {p.org}
                          {leadUnit(p) ? " · เจ้าของ " + leadUnit(p) : ""}
                          {roll.kidsTotal
                            ? " · จากกิจกรรม " + money(roll.kidsTotal) + " บาท"
                            : ""}
                        </div>
                      </td>
                      <td className="num" data-label="งบตามแผน">
                        {money(p.budget)}
                      </td>
                      <td className="num" data-label="เบิกจ่าย">
                        {roll.total ? money(roll.total) : "–"}
                      </td>
                      <td className={"num " + (left < 0 ? "st-bad" : "")} data-label="คงเหลือ">
                        {money(left)}
                      </td>
                      <td className="num" data-label="จำนวนรายการ">
                        {roll.count ? fmt(roll.count) : "–"}
                      </td>
                      <td className="nowrap wide" data-label="">
                        <button
                          className="btn ghost"
                          onClick={() => setOpenUid(open ? null : p.uid)}
                        >
                          {open ? "ปิด" : "รายงานงบประมาณ"}
                        </button>{" "}
                        <button
                          className="iconbtn"
                          onClick={() => setPrintItem(p)}
                          title="พิมพ์รายงานของโครงการนี้หรือบันทึกเป็น PDF"
                        >
                          PDF
                        </button>
                      </td>
                    </tr>,
                    open ? (
                      <tr className="exp-body" key={p.uid + "/entries"}>
                        <td colSpan={6}>
                          <div style={{ padding: "12px 14px" }}>
                            <MonthBudget item={p} month={asOfMonth} allMonths={allMonths} />
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 150 ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              แสดง 150 รายการแรกจาก {fmt(rows.length)} — ใช้ช่องค้นหาเพื่อจำกัดให้แคบลง
            </div>
          ) : null}
        </section>
      ) : null}

      {/* DOM ของรายงานต้องมีอยู่ก่อนเรียก print ไม่งั้นจะได้หน้าว่าง */}
      {printItem ? <BudgetReport item={printItem} budget={budget} /> : null}
    </>
  );
}
