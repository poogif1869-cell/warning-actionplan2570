"use client";

import { useEffect, useMemo, useState } from "react";
import { MONTHS, PROJECTS, FUNDS } from "@/lib/plan";
import { STRATEGIES, ORG_UNITS, ORG_OWNERS, inUnit, leadUnit } from "@/lib/rollup";
import { money, fmt, pct } from "@/lib/format";
import {
  useResults,
  entriesByCost,
  entriesTotal,
  budgetRollup,
  COST_FIELDS,
} from "@/lib/store";
import MonthPicker from "@/components/month-picker";
import MonthBudget from "@/components/month-budget";
import BudgetReport from "@/components/budget-report";
import Bars from "@/components/bars";
import Donut from "@/components/donut";
import DownloadButton from "@/components/download-button";

const S_COLORS = ["", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

/* สองหน้าต่างของหน้างบประมาณ — แยกกันเพราะคนละงาน
   แดชบอร์ด = ดูภาพรวม  ·  รายงาน = กรอกและพิมพ์รายโครงการ */
/* เรียงตามลำดับงานจริง: มาหน้านี้เพื่อ "กรอกงบ" ก่อน แล้วค่อยดูสรุป
   หน้าต่างแรกจึงเป็นที่บันทึกงบ ไม่ใช่แดชบอร์ด และเป็นค่าตั้งต้นด้วย */
const PANES = [
  ["report", "รายงานงบประมาณโครงการ"],
  ["dash", "แดชบอร์ดสรุปงบประมาณ"],
];

const DONUT_VIEWS = [
  ["month", "เบิกจ่ายรายเดือน"],
  ["fund", "เบิกจ่ายตามแหล่งงบประมาณ"],
  ["strategy", "เบิกจ่ายตามยุทธศาสตร์"],
  /* ส่วนงานที่ระบุไว้ในแต่ละ "รายการ" ค่าใช้จ่าย ไม่ใช่หน่วยงานเจ้าของโครงการ
     หนึ่งกิจกรรมมีหลายส่วนงานมาใช้งบร่วมกัน มุมมองนี้จึงตอบคำถามที่
     ตารางสรุปตามหน่วยงานเจ้าของงบตอบไม่ได้ */
  ["orgunit", "เบิกจ่ายตามส่วนงานที่ใช้งบ"],
];

/* ขอบเขตของไฟล์ PDF ที่จะดาวน์โหลดในหน้ารายงาน */
const PDF_SCOPES = [
  ["all", "ทั้งหมดที่แสดงอยู่"],
  ["org", "เฉพาะหน่วยงานที่เลือก"],
  ["project", "เฉพาะโครงการที่เลือก"],
];

export default function BudgetPage() {
  const { budget, asOfMonth, asOfLabel, allMonths, loaded, budgetSubmitted } = useResults();
  const [pane, setPane] = useState("report");
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

  /* ---------------------------------------------------------------
     เข้ามาจากปุ่ม "รายงานงบประมาณ" ในหน้ารายงานผล — /budget?uid=xxx
     ให้เปิดหน้าต่างรายงานและกางแผงกรอกงบของโครงการนั้นเลย

     อ่านจาก window.location ใน useEffect แทน useSearchParams เพราะ
     useSearchParams บังคับให้ต้องมี <Suspense> ครอบตอน build ของ Next
     ซึ่งเครื่องนี้ build ไม่ได้ จะรู้ว่าพังก็ต่อเมื่อขึ้น Vercel แล้ว
     --------------------------------------------------------------- */
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("uid");
    if (!want) return;
    setPane("report");
    setOpenUid(want);
    // ล้าง query ทิ้ง ไม่งั้นกดปิดแผงแล้วรีเฟรชหน้า มันจะเด้งกลับมาเปิดอีก
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  /* เลื่อนไปที่แถวที่ถูกสั่งให้เปิด ไม่งั้นแผงกางอยู่นอกจอ
     คนที่กดปุ่มมาจะนึกว่าไม่มีอะไรเกิดขึ้น */
  useEffect(() => {
    if (!openUid || !loaded) return;
    const el = document.getElementById("bud-" + openUid);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
  }, [openUid, loaded]);

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

  /* ---------- ข้อมูลกราฟโดนัท 4 มุมมอง ---------- */
  const donutData = useMemo(() => {
    if (view === "orgunit") {
      /* อ่านจากช่อง org ของ "รายการ" ค่าใช้จ่ายโดยตรง จึงต้องไล่ทุกรายการ
         ไม่ใช่รวมจากหน่วยงานเจ้าของโครงการเหมือนตารางด้านล่าง */
      const m = new Map();
      PROJECTS.forEach((p) => {
        const r = budgetRollup(budget, p, month);
        [...r.own, ...r.byActivity.flatMap((a) => a.list)].forEach((e) => {
          const k = (e.org || "").trim() || "(ไม่ระบุส่วนงาน)";
          m.set(k, (m.get(k) || 0) + entriesTotal([e]));
        });
      });
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ key: label, label, value }));
    }
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
              <DownloadButton
                className="iconbtn"
                title="แดชบอร์ดสรุปงบประมาณ"
                subtitle={asOfLabel}
                sheets={() => [
                  /* ไฟล์ PDF เป็นภาพทั้งแดชบอร์ด มีไทล์ โดนัท และกราฟหมวดค่าใช้จ่าย
                     ชีตแรกจึงเก็บทุกก้อนที่ไม่ใช่ตาราง ให้ Excel มีข้อมูลเท่ากัน */
                  {
                    name: "สรุปแดชบอร์ด",
                    widths: [40, 22, 30],
                    rows: [
                      ["รายการ", "ค่า", "หมายเหตุ"],
                      ["ช่วงเวลาที่ดู", asOfLabel, ""],
                      ["ตัวกรองหน่วยงาน", orgName || "ทั้งหมด", ""],
                      ["ตัวกรองแหล่งเงิน", fund || "ทั้งหมด", ""],
                      [],
                      ["ยอดเบิกจ่ายรวม (บาท)", grand, ""],
                      ["โครงการที่มีรายการ", withEntries.length, "จากที่แสดง " + rows.length + " โครงการ"],
                      ["จำนวนรายการค่าใช้จ่าย", withEntries.reduce((a, r) => a + r.roll.count, 0), ""],
                      [],
                      ["ยอดตามหมวดค่าใช้จ่าย (บาท)", "", "สัดส่วนของยอดรวม"],
                      ...COST_FIELDS.map((c) => [
                        c.label,
                        byCost[c.key],
                        grand ? Math.round((byCost[c.key] / grand) * 1000) / 10 + "%" : "0%",
                      ]),
                      [],
                      ["สัดส่วนยอดเบิกจ่าย — " + donutLabel, "บาท", ""],
                      ...donutData.map((d) => [d.label, d.value, ""]),
                    ],
                  },
                  {
                    name: "สรุปตามหน่วยงาน",
                    widths: [24, 12, 16, 16, 16].concat(COST_FIELDS.map(() => 16)),
                    rows: [
                      ["หน่วยงานเจ้าของโครงการ", "โครงการ", "งบตามแผน", "เบิกจ่าย", "คงเหลือ"].concat(
                        COST_FIELDS.map((c) => c.label)
                      ),
                      ...byOrg.map((u) =>
                        [u.name, u.count, u.planned, u.used, u.planned - u.used].concat(
                          COST_FIELDS.map((c) => u.cost[c.key] || 0)
                        )
                      ),
                    ],
                  },
                  {
                    name: "สรุปตามแหล่งงบประมาณ",
                    widths: [16, 40, 12, 16, 16, 16].concat(COST_FIELDS.map(() => 16)),
                    rows: [
                      ["รหัสแหล่งเงิน", "ชื่อแหล่งเงิน", "โครงการ", "เพดานงบ", "งบตามแผน", "เบิกจ่าย"].concat(
                        COST_FIELDS.map((c) => c.label)
                      ),
                      ...byFund.map((f) =>
                        [f.code, f.name, f.count, f.ceiling || 0, f.planned, f.used].concat(
                          COST_FIELDS.map((c) => (f.cost || {})[c.key] || 0)
                        )
                      ),
                    ],
                  },
                ]}
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

            {/* กันสับสนกับตาราง "สรุปตามหน่วยงานที่รับผิดชอบ" ด้านล่าง
                สองอันตอบคนละคำถาม ยอดไม่ต้องตรงกัน */}
            {view === "orgunit" ? (
              <div className="hint">
                นับจากช่อง <b>ส่วนงานที่ใช้งบ</b> ที่กรอกไว้ในแต่ละรายการค่าใช้จ่าย
                เพราะหนึ่งกิจกรรมมีหลายส่วนงานมาใช้งบร่วมกัน —
                <b>คนละอย่างกับตารางสรุปตามหน่วยงานที่รับผิดชอบด้านล่าง</b>
                ซึ่งรวมตามหน่วยงานเจ้าของโครงการตามไฟล์แผน ยอดสองอันจึงไม่ต้องตรงกัน
              </div>
            ) : null}

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
                  <DownloadButton
                    sheets={() => [
                      {
                        name: "รายการเบิกจ่าย",
                        widths: [12, 40, 10, 14, 20, 30].concat(COST_FIELDS.map(() => 14)).concat([16, 14]),
                        rows: [
                          ["รหัสโครงการ", "โครงการ", "เดือน", "วันที่", "ส่วนงานที่ใช้งบ", "รายละเอียด"]
                            .concat(COST_FIELDS.map((c) => c.label))
                            .concat(["รวมรายการ", "สถานะรายการ"]),
                          ...rows.flatMap(({ p, roll }) =>
                            [...roll.own, ...roll.byActivity.flatMap((a) => a.list)].map((e) =>
                              [
                                p.code,
                                p.name,
                                MONTHS[e.month] || "",
                                e.occurred_on || "",
                                e.org || "",
                                e.note || "",
                              ]
                                .concat(COST_FIELDS.map((c) => Number(String(e[c.key] || "0").replace(/,/g, "")) || 0))
                                .concat([entriesTotal([e]), e.saved ? "บันทึกแล้ว" : "ร่าง"])
                            )
                          ),
                        ],
                      },
                      {
                        name: "สรุปรายโครงการ",
                        widths: [12, 44, 20, 16, 16, 16, 12, 18].concat(
                          COST_FIELDS.map(() => 14)
                        ),
                        rows: [
                          [
                            "รหัส",
                            "โครงการ",
                            "หน่วยงาน",
                            "งบตามแผน",
                            "เบิกจ่าย",
                            "คงเหลือ",
                            "จำนวนรายการ",
                            "สถานะการส่งงบ",
                          ].concat(COST_FIELDS.map((c) => c.label)),
                          ...rows.map(({ p, roll }) =>
                            [
                              p.code,
                              p.name,
                              p.org || "",
                              p.budget || 0,
                              roll.total,
                              (p.budget || 0) - roll.total,
                              roll.count,
                              allMonths
                                ? "ดูทั้งปี ไม่ระบุรายเดือน"
                                : budgetSubmitted(p.uid, asOfMonth)
                                ? "ส่งข้อมูลแล้ว"
                                : "ยังไม่ส่ง",
                            ].concat(
                              COST_FIELDS.map(
                                (c) =>
                                  entriesByCost([
                                    ...roll.own,
                                    ...roll.byActivity.flatMap((a) => a.list),
                                  ])[c.key] || 0
                              )
                            )
                          ),
                        ],
                      },
                    ]}
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
                    <tr key={p.uid} id={"bud-" + p.uid}>
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
                        {/* ปุ่มกรอกงบเป็นงานหลักของแถวนี้ จึงเป็นปุ่มทึบสีหลัก
                            ส่วน PDF เป็นงานรอง ให้เป็นปุ่มโครงสีทองแบบเดียว
                            กับปุ่มดาวน์โหลดที่หัวข้อ ไม่แย่งสายตากัน */}
                        <button
                          className={open ? "btn ghost" : "btn"}
                          onClick={() => setOpenUid(open ? null : p.uid)}
                        >
                          {open ? "ปิด" : "รายงานงบประมาณ"}
                        </button>{" "}
                        <button
                          className="iconbtn pdfbtn"
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
