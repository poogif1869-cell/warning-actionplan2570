"use client";

import { useEffect, useMemo, useState } from "react";
import { MONTHS, PROJECTS, FUNDS } from "@/lib/plan";
import { STRATEGIES } from "@/lib/rollup";
import { money, fmt, pct } from "@/lib/format";
import { useResults, entriesByCost, budgetRollup, COST_FIELDS } from "@/lib/store";
import MonthPicker from "@/components/month-picker";
import BudgetEntries from "@/components/budget-entries";
import BudgetReport from "@/components/budget-report";
import Bars from "@/components/bars";
import Donut from "@/components/donut";

const S_COLORS = ["", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

const VIEWS = [
  ["month", "เบิกจ่ายรายเดือน"],
  ["fund", "เบิกจ่ายตามแหล่งงบประมาณ"],
  ["strategy", "เบิกจ่ายตามยุทธศาสตร์"],
];

export default function BudgetPage() {
  const { budget, asOf, loaded } = useResults();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("");
  const [scope, setScope] = useState("month"); // month | year
  const [openUid, setOpenUid] = useState(null);
  const [view, setView] = useState("month");
  const [printItem, setPrintItem] = useState(null);

  const orgs = useMemo(
    () =>
      [...new Set(PROJECTS.map((p) => p.org).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    []
  );

  const month = scope === "month" ? asOf : null;

  /* ยอดของแต่ละโครงการ รวมรายการของกิจกรรมลูกด้วย */
  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return PROJECTS.filter((p) => {
      if (org && p.org !== org) return false;
      if (needle) {
        const hay = (p.code + " " + p.name + " " + p.org).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
      .map((p) => ({ p, roll: budgetRollup(budget, p, month) }))
      .sort((a, b) => b.roll.total - a.roll.total || (b.p.budget || 0) - (a.p.budget || 0));
  }, [budget, org, q, month]);

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

  const donutLabel =
    view === "month"
      ? "ทั้งปีงบประมาณ"
      : scope === "month"
      ? "เดือน " + MONTHS[asOf]
      : "ทั้งปีงบประมาณ";

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
            {scope === "month" ? "เฉพาะเดือน " + MONTHS[asOf] : "ทั้งปีงบประมาณ 2570"} ·
            ยอดนี้คือยอดเดียวกับ “เบิกจ่าย” ในรายงานผลการดำเนินงานรายเดือน
          </small>
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
          รายการงบประมาณรายโครงการ
          <small>
            เพิ่มได้หลายรายการต่อเดือน · บันทึกได้ทั้งระดับโครงการและระดับกิจกรรม ·
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
              <option value="">ทั้งหมด</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-scope">ช่วงเวลา</label>
            <select id="b-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="month">เฉพาะเดือนที่เลือก</option>
              <option value="year">ทั้งปีงบประมาณ</option>
            </select>
          </div>
        </div>

        <div className="tablewrap">
          <table>
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
                    <td>
                      {p.sNo ? <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span> : null}{" "}
                      {p.name}
                      <div className="small muted">
                        {p.code} · {p.org}
                        {roll.kidsTotal
                          ? " · จากกิจกรรม " + money(roll.kidsTotal) + " บาท"
                          : ""}
                      </div>
                    </td>
                    <td className="num">{money(p.budget)}</td>
                    <td className="num">{roll.total ? money(roll.total) : "–"}</td>
                    <td className={"num " + (left < 0 ? "st-bad" : "")}>{money(left)}</td>
                    <td className="num">{roll.count ? fmt(roll.count) : "–"}</td>
                    <td className="nowrap">
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
                          {/* ระดับโครงการ */}
                          <BudgetEntries
                            uid={p.uid}
                            month={month == null ? asOf : month}
                            title="ระดับโครงการ"
                          />

                          {/* ระดับกิจกรรม — บันทึกงบจากกิจกรรมได้โดยตรง */}
                          {p._kids && p._kids.length ? (
                            <div style={{ marginTop: 20 }}>
                              <div className="small muted" style={{ marginBottom: 8 }}>
                                บันทึกงบประมาณจากกิจกรรมภายใต้โครงการนี้ ({p._kids.length} กิจกรรม)
                                — ยอดจะถูกรวมขึ้นมาที่โครงการอัตโนมัติ
                                ระวังอย่ากรอกยอดเดียวกันซ้ำทั้งสองระดับ
                              </div>
                              {p._kids.map((k) => (
                                <div
                                  key={k.uid}
                                  style={{
                                    borderTop: "1px solid var(--border)",
                                    paddingTop: 12,
                                    marginTop: 12,
                                  }}
                                >
                                  <BudgetEntries
                                    uid={k.uid}
                                    month={month == null ? asOf : month}
                                    title={k.code + " " + k.name}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
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
