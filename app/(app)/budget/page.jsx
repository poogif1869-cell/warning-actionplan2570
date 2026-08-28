"use client";

import { useMemo, useState } from "react";
import { MONTHS, MONTHS_SHORT, PROJECTS } from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import {
  useResults,
  entriesOf,
  entriesTotal,
  entryTotal,
  COST_FIELDS,
} from "@/lib/store";
import MonthPicker from "@/components/month-picker";
import BudgetEntries from "@/components/budget-entries";
import Bars from "@/components/bars";

export default function BudgetPage() {
  const { budget, asOf, loaded } = useResults();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("");
  const [scope, setScope] = useState("month"); // month | year
  const [openUid, setOpenUid] = useState(null);

  const orgs = useMemo(
    () =>
      [...new Set(PROJECTS.map((p) => p.org).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    []
  );

  const month = scope === "month" ? asOf : null;

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
      .map((p) => {
        const list = entriesOf(budget, p.uid, month);
        return { p, list, total: entriesTotal(list) };
      })
      .sort((a, b) => b.total - a.total || (b.p.budget || 0) - (a.p.budget || 0));
  }, [budget, org, q, month]);

  /* ยอดรวมแยกตามหมวดค่าใช้จ่าย 4 หมวด */
  const byCost = useMemo(() => {
    const sums = {};
    COST_FIELDS.forEach((c) => (sums[c.key] = 0));
    rows.forEach((r) =>
      r.list.forEach((e) =>
        COST_FIELDS.forEach((c) => {
          const v = parseFloat(String(e[c.key] || "").replace(/,/g, ""));
          sums[c.key] += isFinite(v) ? v : 0;
        })
      )
    );
    return sums;
  }, [rows]);

  /* ยอดเบิกจ่ายรายเดือนทั้งแผน */
  const byMonth = useMemo(() => {
    const out = new Array(12).fill(0);
    Object.keys(budget || {}).forEach((uid) => {
      (budget[uid] || []).forEach((e) => {
        out[Number(e.month)] += entryTotal(e);
      });
    });
    return out;
  }, [budget]);

  const grand = rows.reduce((a, r) => a + r.total, 0);
  const withEntries = rows.filter((r) => r.list.length > 0);

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
              รวม {fmt(withEntries.reduce((a, r) => a + r.list.length, 0))} รายการ
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
          ยอดเบิกจ่ายรายเดือนทั้งแผน
          <small>ต.ค. 69 – ก.ย. 70</small>
        </h2>
        <div className="card pad">
          <Bars
            data={byMonth.map((v, i) => ({
              key: "m" + i,
              label: MONTHS[i],
              value: v,
              display: money(v) + " บาท",
              color: i === asOf ? "var(--gold)" : "var(--accent)",
            }))}
          />
        </div>
      </section>

      <section className="block">
        <h2>
          รายการงบประมาณรายโครงการ
          <small>
            เพิ่มได้หลายรายการต่อเดือน แก้ไขได้ทุกรายการ · แยก{" "}
            {COST_FIELDS.map((c) => c.label).join(" / ")}
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
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 150).map(({ p, list, total }) => {
                const open = openUid === p.uid;
                const left = (p.budget || 0) - entriesTotal(entriesOf(budget, p.uid, null));
                return [
                  <tr key={p.uid}>
                    <td>
                      {p.sNo ? <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span> : null}{" "}
                      {p.name}
                      <div className="small muted">
                        {p.code} · {p.org}
                      </div>
                    </td>
                    <td className="num">{money(p.budget)}</td>
                    <td className="num">{total ? money(total) : "–"}</td>
                    <td className={"num " + (left < 0 ? "st-bad" : "")}>{money(left)}</td>
                    <td className="num">{list.length ? fmt(list.length) : "–"}</td>
                    <td>
                      <button
                        className="btn ghost"
                        onClick={() => setOpenUid(open ? null : p.uid)}
                      >
                        {open ? "ปิด" : "จัดการ"}
                      </button>
                    </td>
                  </tr>,
                  open ? (
                    <tr className="exp-body" key={p.uid + "/entries"}>
                      <td colSpan={6}>
                        <div style={{ padding: "12px 14px" }}>
                          <BudgetEntries uid={p.uid} month={month == null ? asOf : month} />
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
    </>
  );
}
