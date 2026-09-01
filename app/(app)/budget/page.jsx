"use client";

import { useEffect, useMemo, useState } from "react";
import { MONTHS, PROJECTS, FUNDS } from "@/lib/plan";
import { STRATEGIES, ORG_UNITS, inUnit } from "@/lib/rollup";
import { money, fmt, pct } from "@/lib/format";
import { useResults, entriesByCost, budgetRollup, COST_FIELDS } from "@/lib/store";
import MonthPicker from "@/components/month-picker";
import MonthBudget from "@/components/month-budget";
import BudgetReport from "@/components/budget-report";
import Bars from "@/components/bars";
import Donut from "@/components/donut";
import PrintButton from "@/components/print-button";

const S_COLORS = ["", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

const VIEWS = [
  ["month", "เบิกจ่ายรายเดือน"],
  ["fund", "เบิกจ่ายตามแหล่งงบประมาณ"],
  ["strategy", "เบิกจ่ายตามยุทธศาสตร์"],
];

export default function BudgetPage() {
  const { budget, asOfMonth, asOfLabel, allMonths, loaded } = useResults();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("");
  const [fund, setFund] = useState("");
  // ขอบเขตของรายงานที่จะพิมพ์: ทั้งหมด / แยกตามหน่วยงาน / แยกตามแหล่งงบ / แยกตามหมวด
  const [scope, setScope] = useState("all");
  const [openUid, setOpenUid] = useState(null);
  const [view, setView] = useState("month");
  const [printItem, setPrintItem] = useState(null);

  // ดรอปดาวน์ "ช่วงเวลา" ด้านบนคุมทั้งหน้า — ทั้งปี = null (ไม่กรองเดือน)
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

  /* สรุปงบตามหน่วยงานที่รับผิดชอบ
     โครงการหนึ่งอยู่ได้หลายหน่วยงาน (เช่น "ฝยศ./กนผ./กคพ.") ยอดจึงนับให้ทุกหน่วยงานในสาย
     ผลรวมทุกแถวจึงมากกว่ายอดจริง — ต้องเขียนบอกไว้ ไม่งั้นจะเข้าใจว่าตัวเลขผิด */
  const byOrg = useMemo(() => {
    return ORG_UNITS.map((u) => {
      const list = PROJECTS.filter(
        (p) => inUnit(p, u.key) && (!fund || p.fund === fund)
      );
      const rolls = list.map((p) => budgetRollup(budget, p, month));
      const entries = rolls.flatMap((r) => [...r.own, ...r.byActivity.flatMap((a) => a.list)]);
      return {
        ...u,
        planned: list.reduce((a, p) => a + (p.budget || 0), 0),
        used: rolls.reduce((a, r) => a + r.total, 0),
        items: rolls.reduce((a, r) => a + r.count, 0),
        cost: entriesByCost(entries),
        count: list.length,
      };
    })
      .filter((u) => u.count > 0)
      .sort((a, b) => b.used - a.used || b.planned - a.planned);
  }, [budget, month, fund]);

  /* สรุปตามแหล่งงบประมาณ */
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

  /* ---------- ข้อมูลของกราฟโดนัท 3 มุมมอง ---------- */
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

  /* มุมมองรายเดือนแสดงทั้ง 12 เดือนเสมอ เพราะการแบ่งตามเดือนคือสาระของมันอยู่แล้ว
     อีกสองมุมมองจึงเป็นตัวที่ขึ้นกับช่วงเวลาที่เลือก */
  const donutLabel = view === "month" ? "ทั้งปีงบประมาณ" : asOfLabel;

  /* ---------- พิมพ์เป็น PDF ----------
     ต้อง render DOM ของรายงานก่อน แล้วค่อยเรียก print ใน effect
     ถ้าเรียก print ทันทีในตอนกดปุ่มจะได้หน้าว่าง เพราะ DOM ยังไม่ทันถูกสร้าง */
  useEffect(() => {
    if (!printItem) return;

    /* ติดคลาสไว้ที่ body เพื่อให้ @media print รู้ว่ากำลังพิมพ์ "รายงาน" อยู่
       ถ้าไม่มีคลาสนี้ การกด Ctrl+P เองจากเมนูเบราว์เซอร์จะพิมพ์หน้าเว็บตามปกติ
       แทนที่จะได้กระดาษเปล่าเพราะ CSS ไปซ่อนทุก section ทิ้ง */
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

  return (
    <>
      <MonthPicker />

      <section className="block">
        <h2>
          รายงานงบประมาณโครงการ
          <small>
            {asOfLabel} · ยอดนี้คือยอดเดียวกับ “เบิกจ่าย” ในรายงานผลการดำเนินงานรายเดือน
          </small>
          <PrintButton
            className="iconbtn"
            label="ดาวน์โหลด PDF"
            title={
              scope === "org"
                ? "รายงานงบประมาณ แยกตามหน่วยงาน"
                : scope === "fund"
                ? "รายงานงบประมาณ แยกตามแหล่งงบประมาณ"
                : scope === "cost"
                ? "รายงานงบประมาณ แยกตามหมวดค่าใช้จ่าย"
                : "รายงานงบประมาณโครงการ"
            }
            subtitle={
              asOfLabel +
              (org ? " · หน่วยงาน " + org : "") +
              (fund ? " · " + fund : "")
            }
          />
        </h2>

        {/* ขอบเขตรายงานคุมว่าจะแสดง (และพิมพ์) ส่วนไหนบ้าง
            เลือกได้ทั้งดูรวมทั้งหมด หรือเจาะเฉพาะหมวดที่ต้องการรายงาน */}
        <div className="filters">
          <div className="field">
            <label htmlFor="b-scope">ขอบเขตรายงาน</label>
            <select id="b-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">ทั้งหมด</option>
              <option value="org">แยกตามหน่วยงาน</option>
              <option value="fund">แยกตามแหล่งงบประมาณ</option>
              <option value="cost">แยกตามหมวดค่าใช้จ่าย</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-org2">เจาะหน่วยงาน</label>
            <select id="b-org2" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">ทุกหน่วยงาน</option>
              {ORG_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.name} ({u.count})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-fund2">เจาะแหล่งงบประมาณ</label>
            <select id="b-fund2" value={fund} onChange={(e) => setFund(e.target.value)}>
              <option value="">ทุกแหล่ง</option>
              {FUNDS.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

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
          {VIEWS.map(([k, label]) => (
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

      {scope === "all" || scope === "cost" ? (
        <section className="block">
          <h2>
            ยอดตามหมวดค่าใช้จ่าย
            <small>{asOfLabel}</small>
          </h2>
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
      ) : null}

      {scope === "all" || scope === "org" ? (
        <section className="block">
          <h2>
            สรุปงบประมาณตามหน่วยงานที่รับผิดชอบ
            <small>
              {fmt(byOrg.length)} หน่วยงาน · {asOfLabel}
              {fund ? " · " + fund : ""}
            </small>
          </h2>
          <div className="hint">
            โครงการหนึ่งมีหน่วยงานรับผิดชอบได้หลายหน่วย (เช่น “ฝยศ./กนผ./กคพ.”)
            ยอดจึงถูกนับให้ทุกหน่วยงานในสาย <b>ผลรวมทุกแถวจึงมากกว่ายอดจริงของทั้งแผน</b>
            ตารางนี้ใช้ดูภาระของแต่ละหน่วยงาน ไม่ใช่ใช้บวกหายอดรวม
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
                      <button className="exp-toggle" onClick={() => setOrg(u.key)}>
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
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {scope === "all" || scope === "fund" ? (
        <section className="block">
          <h2>
            สรุปงบประมาณตามแหล่งงบประมาณ
            <small>
              {fmt(byFund.length)} แหล่ง · {asOfLabel}
              {org ? " · เฉพาะ " + org : ""}
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
                      <button className="exp-toggle" onClick={() => setFund(f.code)}>
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
      ) : null}

      <section className="block">
        <h2>
          รายการงบประมาณรายโครงการ
          <small>
            เพิ่มได้หลายรายการต่อเดือน · โครงการที่มีกิจกรรมย่อยให้บันทึกที่กิจกรรมเท่านั้น ·
            แยก {COST_FIELDS.map((c) => c.label).join(" / ")}
          </small>
        </h2>

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
                        {roll.kidsTotal
                          ? " · จากกิจกรรม " + money(roll.kidsTotal) + " บาท"
                          : ""}
                      </div>
                    </td>
                    <td className="num" data-label="งบตามแผน">{money(p.budget)}</td>
                    <td className="num" data-label="เบิกจ่าย">{roll.total ? money(roll.total) : "–"}</td>
                    <td className={"num " + (left < 0 ? "st-bad" : "")} data-label="คงเหลือ">{money(left)}</td>
                    <td className="num" data-label="จำนวนรายการ">{roll.count ? fmt(roll.count) : "–"}</td>
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
                        title="พิมพ์รายงานหรือบันทึกเป็น PDF"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>,
                  open ? (
                    <tr className="exp-body" key={p.uid + "/entries"}>
                      <td colSpan={6}>
                        <div style={{ padding: "12px 14px" }}>
                          {/* โครงการที่มีกิจกรรมย่อยจะบันทึกที่ระดับโครงการไม่ได้
                              เงื่อนไขอยู่ใน MonthBudget เพื่อให้ลิ้นชักใช้กติกาเดียวกัน */}
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

      {/* DOM ของรายงานต้องมีอยู่ก่อนเรียก print ไม่งั้นจะได้หน้าว่าง */}
      {printItem ? <BudgetReport item={printItem} budget={budget} /> : null}
    </>
  );
}
