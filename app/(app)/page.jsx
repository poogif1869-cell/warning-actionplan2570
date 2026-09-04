"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useResults } from "@/lib/store";
import { buildAlerts, summarize } from "@/lib/alerts";
import { META, PROJECTS, EXPECTED, reconcile } from "@/lib/plan";
import { STRATEGIES, FUND_ROLLUP, PROGRAMS, ORGS } from "@/lib/rollup";
import { money, mb, fmt, pct } from "@/lib/format";
import MonthPicker from "@/components/month-picker";
import Bars from "@/components/bars";
import ProjectList from "@/components/project-list";
import DownloadButton from "@/components/download-button";

const S_COLORS = ["", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

export default function OverviewPage() {
  const {
    results,
    risk,
    asOfMonth,
    asOfLabel,
    loaded,
    isAdmin,
    exportJson,
    importJson,
    refresh,
    saveNow,
  } = useResults();
  const [msg, setMsg] = useState("");
  // กลุ่มโครงการที่กำลังกางดูอยู่ ตั้งจากการกดตัวเลข/แท่งกราฟที่ไหนก็ได้ในหน้านี้
  const [group, setGroup] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const alerts = useMemo(() => buildAlerts(results, asOfMonth, risk), [results, asOfMonth, risk]);
  const stats = useMemo(() => summarize(alerts), [alerts]);

  const check = useMemo(() => reconcile(), []);
  const checkOK =
    check.rows === EXPECTED.rows &&
    check.projects === EXPECTED.projects &&
    check.projectBudget === EXPECTED.projectBudget;

  /* งบเดิมเทียบงบปัจจุบัน — deps ว่างได้เพราะทั้งหน้า remount
     เมื่อ planVersion เปลี่ยน (ดู key={planVersion} ใน shell.jsx) */
  const planDiff = useMemo(() => {
    const base = check.projectBudget;
    const now = PROJECTS.reduce((a, p) => a + (p.budget || 0), 0);
    const changed = PROJECTS.filter(
      (p) => p.baseBudget != null && p.baseBudget !== (p.budget || 0)
    ).sort((a, b) => Math.abs(b.budget - b.baseBudget) - Math.abs(a.budget - a.baseBudget));
    return { base, now, diff: now - base, changed };
  }, [check]);

  const totals = META.totals;
  const ceilingTotal = FUND_ROLLUP.reduce((a, f) => a + (f.ceiling || 0), 0);
  const usedTotal = FUND_ROLLUP.reduce((a, f) => a + f.used, 0);

  function download() {
    try {
      const blob = new Blob([exportJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp =
        d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0");
      a.href = url;
      a.download = "results-2570-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("ส่งออกไฟล์สำรองแล้ว");
    } catch (e) {
      setMsg("ส่งออกไม่สำเร็จ: " + e.message);
    }
  }

  function pickFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        const { rows } = await importJson(String(reader.result));
        setMsg("นำเข้าเรียบร้อย เขียนลง Supabase " + rows + " แถว");
      } catch (err) {
        setMsg("นำเข้าไม่สำเร็จ: " + err.message);
      }
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  return (
    <>
      {/* แถบแจ้งเตือนไว้บนสุด เพราะเป็นเหตุผลหลักที่เว็บนี้มีอยู่ */}
      <section className="block">
        <h2>
          สถานะการแจ้งเตือน
          <small>{asOfLabel}</small>
          <DownloadButton
            className="iconbtn"
            title="รายงานภาพรวมแผนปฏิบัติการ"
            subtitle={asOfLabel}
            sheets={() => [
              /* ไฟล์ PDF คือทั้งหน้า จึงมีไทล์สรุปกับตารางกระทบยอดอยู่ด้วย
                 ชีตแรกนี้เก็บทุกอย่างที่เป็นไทล์ ให้ Excel มีเนื้อหาเท่ากัน */
              {
                name: "สรุปภาพรวม",
                widths: [40, 22, 34],
                rows: [
                  ["รายการ", "ค่า", "หมายเหตุ"],
                  ["ช่วงเวลาที่ดู", asOfLabel, ""],
                  ["แผน", META.plan, META.org],
                  [],
                  ["สถานะการแจ้งเตือน", "", ""],
                  ["วิกฤต", stats.crit, "ต้องเร่งแก้ไข"],
                  ["เฝ้าระวัง", stats.warn, "ยังพอแก้ไขทัน"],
                  ["โครงการที่ติดแจ้งเตือน", stats.projects, "จากทั้งหมด " + PROJECTS.length + " โครงการ"],
                  ["โครงการที่ยังไม่พบปัญหา", stats.okProjects, ""],
                  [],
                  ["งบประมาณตามแผน (บาท)", "", ""],
                  ["งบประมาณรวมทั้งสิ้น", totals.grand, ""],
                  ["งบโครงการ", totals.projects, fmt(totals.projectCount) + " โครงการ"],
                  ["ค่าใช้จ่ายอื่น ๆ", totals.other, "ไม่นับเป็นโครงการ"],
                  ["งบลงทุนของ กยท.", totals.capital, "ครุภัณฑ์และสิ่งก่อสร้าง"],
                  [],
                  ["เพดานงบรวมทุกแหล่ง", ceilingTotal, ""],
                  ["จัดสรรลงโครงการแล้ว", usedTotal, ""],
                  [],
                  ["ตรวจสอบยอดกับไฟล์ต้นฉบับ", checkOK ? "ตรงกัน" : "ไม่ตรงกัน", ""],
                  ["จำนวนแถวในแผน", check.rows, "ควรเป็น " + EXPECTED.rows],
                  ["จำนวนโครงการ", check.projects, "ควรเป็น " + EXPECTED.projects],
                  ["งบโครงการรวม", check.projectBudget, "ควรเป็น " + EXPECTED.projectBudget],
                ],
              },
              {
                name: "สรุปตามยุทธศาสตร์",
                widths: [14, 50, 12, 18],
                rows: [
                  ["ยุทธศาสตร์", "ชื่อยุทธศาสตร์", "จำนวนโครงการ", "งบตามแผน"],
                  ...STRATEGIES.map((s) => ["ที่ " + s.no, s.name, s.count, s.budget]),
                ],
              },
              {
                name: "สรุปตามแหล่งเงิน",
                widths: [16, 44, 12, 18, 18, 18],
                rows: [
                  ["รหัสแหล่งเงิน", "ชื่อแหล่งเงิน", "จำนวนโครงการ", "เพดานงบ", "จัดสรรแล้ว", "คงเหลือจากเพดาน"],
                  ...FUND_ROLLUP.map((f) => [f.code, f.name, f.count, f.ceiling || 0, f.used, f.left]),
                ],
              },
              {
                name: "สรุปตามแผนงาน",
                widths: [56, 12, 18],
                rows: [
                  ["แผนงาน", "จำนวนโครงการ", "งบตามแผน"],
                  ...PROGRAMS.map((g) => [g.name, g.count, g.budget]),
                ],
              },
              {
                name: "สรุปตามหน่วยงาน",
                widths: [46, 12, 18],
                rows: [
                  ["หน่วยงานเจ้าของโครงการ", "จำนวนโครงการ", "งบตามแผน"],
                  ...ORGS.map((o) => [o.name, o.count, o.budget]),
                ],
              },
              {
                name: "โครงการทั้งหมด",
                widths: [12, 52, 22, 14, 16, 16, 16, 26],
                rows: [
                  [
                    "รหัส",
                    "โครงการ",
                    "หน่วยงาน",
                    "ยุทธศาสตร์",
                    "กลยุทธ์",
                    "แหล่งเงิน",
                    "งบตามแผน",
                    "แผนงาน",
                  ],
                  ...PROJECTS.map((p) => [
                    p.code,
                    p.name,
                    p.org || "",
                    p.sNo ? "ที่ " + p.sNo : "",
                    p.tNo ? "ที่ " + p.tNo : "",
                    p.fund || "",
                    p.budget || 0,
                    p.program || "",
                  ]),
                ],
              },
            ]}
          />
        </h2>
        <div className="tiles">
          <div className="tile crit">
            <span className="lab">วิกฤต</span>
            <div className="val st-bad">{fmt(stats.crit)}</div>
            <div className="note">ต้องเร่งแก้ไข</div>
          </div>
          <div className="tile warn">
            <span className="lab">เฝ้าระวัง</span>
            <div className="val st-warn">{fmt(stats.warn)}</div>
            <div className="note">ยังพอแก้ไขทัน</div>
          </div>
          <div className="tile">
            <span className="lab">โครงการที่ติดแจ้งเตือน</span>
            <div className="val">
              <button
                className="exp-toggle"
                style={{ font: "inherit", color: "inherit" }}
                onClick={() => {
                  const flagged = new Set(alerts.map((a) => a.uid).filter(Boolean));
                  setGroup({
                    title: "โครงการที่ติดแจ้งเตือน",
                    subtitle: asOfLabel,
                    items: PROJECTS.filter((p) => flagged.has(p.uid)),
                  });
                }}
              >
                {fmt(stats.projects)}
              </button>
              <span className="unit">/ {fmt(PROJECTS.length)}</span>
            </div>
            <div className="note">
              อีก{" "}
              <button
                className="exp-toggle"
                onClick={() => {
                  const flagged = new Set(alerts.map((a) => a.uid).filter(Boolean));
                  setGroup({
                    title: "โครงการที่ยังไม่พบปัญหา",
                    subtitle: asOfLabel,
                    items: PROJECTS.filter((p) => !flagged.has(p.uid)),
                  });
                }}
              >
                {fmt(stats.okProjects)} โครงการ
              </button>{" "}
              ยังไม่พบปัญหา
            </div>
          </div>
          <div className="tile ok">
            <span className="lab">งบประมาณที่เกี่ยวข้อง</span>
            <div className="val">
              {mb(stats.budgetAtRisk)}
              <span className="unit">ล้านบาท</span>
            </div>
            <div className="note">
              <Link href="/alerts">ดูรายการแจ้งเตือนทั้งหมด →</Link>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <MonthPicker />
        </div>
      </section>

      <section className="block">
        <h2>
          งบประมาณตามแผน
          <small>{META.plan}</small>
        </h2>
        <div className="tiles">
          <div className="tile">
            <span className="lab">งบประมาณรวมทั้งสิ้น</span>
            <div className="val">
              {mb(totals.grand)}
              <span className="unit">ล้านบาท</span>
            </div>
            <div className="note">{money(totals.grand)} บาท</div>
          </div>
          <div className="tile">
            <span className="lab">งบโครงการ</span>
            <div className="val">
              {mb(totals.projects)}
              <span className="unit">ล้านบาท</span>
            </div>
            <div className="note">{fmt(totals.projectCount)} โครงการ</div>
          </div>
          <div className="tile">
            <span className="lab">ค่าใช้จ่ายอื่น ๆ</span>
            <div className="val">
              {mb(totals.other)}
              <span className="unit">ล้านบาท</span>
            </div>
            <div className="note">ไม่นับเป็นโครงการ</div>
          </div>
          <div className="tile">
            <span className="lab">งบลงทุนของ กยท.</span>
            <div className="val">
              {mb(totals.capital)}
              <span className="unit">ล้านบาท</span>
            </div>
            <div className="note">ครุภัณฑ์และสิ่งก่อสร้าง</div>
          </div>
        </div>
      </section>

      {/* ---------- งบเดิม vs งบปัจจุบัน ----------
          โผล่เฉพาะเมื่อมีการแก้แผนจริงเท่านั้น ถ้ายังไม่มีใครแก้อะไร
          สองตัวเลขนี้เท่ากันเป๊ะ การแสดงไว้ตลอดจึงเป็นแค่ที่ว่างเปล่า

          "งบตามแผนเดิม" นับจากไฟล์แผนต้นฉบับเสมอ (reconcile) ไม่ใช่ผลรวม
          ของ baseBudget ในรายการปัจจุบัน เพราะโครงการที่ถูกลบไปแล้ว
          จะหายจากรายการปัจจุบัน แล้วยอดเดิมจะลดตามไปด้วยอย่างเงียบ ๆ */}
      {planDiff.changed.length || planDiff.diff !== 0 ? (
        <section className="block">
          <h2>
            งบประมาณ: แผนเดิม เทียบกับ ปัจจุบัน
            <small>
              มีการแก้ไขแผน {fmt(planDiff.changed.length)} รายการ ·
              ดูที่มาได้ที่ <Link href="/changes">ถังการแก้ไขข้อมูล</Link>
            </small>
          </h2>
          <div className="tiles">
            <div className="tile">
              <span className="lab">งบตามแผนเดิม</span>
              <div className="val">
                {mb(planDiff.base)}
                <span className="unit">ล้านบาท</span>
              </div>
              <div className="note">ตามไฟล์แผนปฏิบัติการต้นฉบับ</div>
            </div>
            <div className="tile ok">
              <span className="lab">งบปัจจุบัน</span>
              <div className="val">
                {mb(planDiff.now)}
                <span className="unit">ล้านบาท</span>
              </div>
              <div className="note">หลังการแก้ไขที่อนุมัติแล้วทั้งหมด</div>
            </div>
            <div className={"tile " + (planDiff.diff < 0 ? "crit" : "warn")}>
              <span className="lab">ผลต่าง</span>
              <div className={"val " + (planDiff.diff < 0 ? "st-bad" : "st-ok")}>
                {planDiff.diff > 0 ? "+" : ""}
                {mb(planDiff.diff)}
                <span className="unit">ล้านบาท</span>
              </div>
              <div className="note">{money(planDiff.diff)} บาท</div>
            </div>
            <div className="tile">
              <span className="lab">จำนวนโครงการ</span>
              <div className="val">
                {fmt(PROJECTS.length)}
                <span className="unit">/ {fmt(EXPECTED.projects)} เดิม</span>
              </div>
              <div className="note">
                {PROJECTS.length === EXPECTED.projects
                  ? "เท่าเดิม"
                  : PROJECTS.length > EXPECTED.projects
                  ? "เพิ่มขึ้น " + fmt(PROJECTS.length - EXPECTED.projects) + " โครงการ"
                  : "ลดลง " + fmt(EXPECTED.projects - PROJECTS.length) + " โครงการ"}
              </div>
            </div>
          </div>

          {planDiff.changed.length ? (
            <div className="tablewrap" style={{ marginTop: 14 }}>
              <table className="stack">
                <thead>
                  <tr>
                    <th>โครงการที่งบเปลี่ยน</th>
                    <th className="num">งบเดิม</th>
                    <th className="num">งบปัจจุบัน</th>
                    <th className="num">ผลต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {planDiff.changed.map((p) => (
                    <tr key={p.uid}>
                      <td className="lead small">
                        {p.code} {p.name}
                        {p._added ? <span className="pill ok"> เพิ่มใหม่</span> : null}
                      </td>
                      <td className="num" data-label="งบเดิม">{money(p.baseBudget)}</td>
                      <td className="num" data-label="งบปัจจุบัน">{money(p.budget)}</td>
                      <td
                        className={"num " + (p.budget < p.baseBudget ? "st-bad" : "st-ok")}
                        data-label="ผลต่าง"
                      >
                        {p.budget > p.baseBudget ? "+" : ""}
                        {money(p.budget - p.baseBudget)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="block">
        <h2>
          งบประมาณตามยุทธศาสตร์
          <small>{STRATEGIES.length} ยุทธศาสตร์ · นับเฉพาะระดับโครงการ</small>
        </h2>
        <div className="card pad">
          <Bars
            data={STRATEGIES.map((s) => ({
              key: "s" + s.no,
              label: "ยุทธศาสตร์ที่ " + s.no + " · " + s.count + " โครงการ",
              value: s.budget,
              display: money(s.budget) + " บาท",
              color: S_COLORS[Number(s.no)] || "var(--accent)",
              items: PROJECTS.filter((p) => p.sNo === s.no),
            }))}
            onSelect={(d) =>
              setGroup({ title: d.label, subtitle: "งบตามยุทธศาสตร์", items: d.items })
            }
          />
        </div>
      </section>

      <section className="block">
        <h2>
          เพดานงบตามแหล่งเงิน เทียบกับที่จัดสรรลงโครงการ
          <small>7 แหล่ง · ตามมาตรา 13 และกองทุนพัฒนายางพารา มาตรา 49</small>
        </h2>
        <div className="tablewrap">
          <table className="stack">
            <thead>
              <tr>
                <th>แหล่งเงิน</th>
                <th className="num">เพดานงบ</th>
                <th className="num">จัดสรรลงโครงการ</th>
                <th className="num">คงเหลือ</th>
                <th className="num">โครงการ</th>
                <th style={{ minWidth: 120 }}>สัดส่วนที่ใช้</th>
              </tr>
            </thead>
            <tbody>
              {FUND_ROLLUP.map((f) => {
                const ratio = f.ceiling ? (f.used / f.ceiling) * 100 : 0;
                const over = f.left < 0;
                return (
                  <tr key={f.code}>
                    <td className="lead small">{f.name}</td>
                    <td className="num" data-label="เพดานงบ">{money(f.ceiling)}</td>
                    <td className="num" data-label="จัดสรรแล้ว">{money(f.used)}</td>
                    <td className={"num " + (over ? "st-bad" : "")} data-label="คงเหลือ">{money(f.left)}</td>
                    <td className="num" data-label="โครงการ">
                      {f.count ? (
                        <button
                          className="exp-toggle"
                          onClick={() =>
                            setGroup({
                              title: f.name,
                              subtitle: "โครงการที่ใช้แหล่งเงินนี้",
                              items: PROJECTS.filter((p) => p.fund === f.code),
                            })
                          }
                        >
                          {fmt(f.count)} ▸
                        </button>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="wide" data-label="สัดส่วนที่ใช้">
                      <div className="bar">
                        <i
                          style={{
                            width: Math.min(100, ratio) + "%",
                            background: over ? "var(--bad)" : "var(--accent)",
                          }}
                        />
                      </div>
                      <div className="small muted">{pct(ratio)}</div>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <b>รวม</b>
                </td>
                <td className="num">
                  <b>{money(ceilingTotal)}</b>
                </td>
                <td className="num">
                  <b>{money(usedTotal)}</b>
                </td>
                <td className="num">
                  <b>{money(ceilingTotal - usedTotal)}</b>
                </td>
                <td className="num">
                  <b>{fmt(PROJECTS.length)}</b>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>
          งบประมาณตามแผนงาน
          <small>{PROGRAMS.length} แผนงาน</small>
        </h2>
        <div className="card pad">
          <Bars
            data={PROGRAMS.slice(0, 12).map((p) => ({
              key: p.name,
              label: p.name + " · " + p.count + " โครงการ",
              value: p.budget,
              display: money(p.budget) + " บาท",
              items: PROJECTS.filter((x) => (x.program || "(ไม่ระบุแผนงาน)") === p.name),
            }))}
            onSelect={(d) => setGroup({ title: d.key, subtitle: "แผนงาน", items: d.items })}
          />
        </div>
      </section>

      <section className="block">
        <h2>
          หน่วยงานที่รับผิดชอบงบสูงสุด
          <small>แสดง 10 อันดับแรกจาก {ORGS.length} หน่วยงาน</small>
        </h2>
        <div className="card pad">
          <Bars
            data={ORGS.slice(0, 10).map((o) => ({
              key: o.name,
              label: o.name + " · " + o.count + " โครงการ",
              value: o.budget,
              display: money(o.budget) + " บาท",
              items: PROJECTS.filter((x) => (x.org || "(ไม่ระบุหน่วยงาน)") === o.name),
            }))}
            onSelect={(d) => setGroup({ title: d.key, subtitle: "หน่วยงานรับผิดชอบ", items: d.items })}
          />
        </div>
      </section>

      <section className="block">
        <h2>ข้อมูลและการสำรอง</h2>
        <div className="card pad">
          <p style={{ marginTop: 0 }} className="small">
            ทุกอย่างที่กรอกถูกบันทึกขึ้น <b>Supabase</b> อัตโนมัติหลังหยุดพิมพ์ประมาณ 1 วินาที
            ทุกคนที่เข้าสู่ระบบเห็นข้อมูลชุดเดียวกัน
          </p>
          <div className="btnrow">
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await saveNow();
                setMsg("บันทึกขึ้น Supabase แล้ว");
                setBusy(false);
              }}
            >
              บันทึกเดี๋ยวนี้
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await refresh();
                setMsg(ok ? "ดึงข้อมูลล่าสุดจาก Supabase แล้ว" : "ดึงข้อมูลไม่สำเร็จ");
                setBusy(false);
              }}
            >
              ดึงข้อมูลใหม่
            </button>
            <button className="btn ghost" disabled={busy} onClick={download}>
              ส่งออกไฟล์สำรอง (.json)
            </button>

            {/* นำเข้าไฟล์สำรอง = เขียนทับข้อมูลของทุกหน้าพร้อมกันจากหน้าภาพรวม
                ซึ่งขัดกับกติกาที่ว่าข้อมูลแต่ละชนิดกรอกได้ที่หน้าเจ้าของเท่านั้น
                จึงจำกัดไว้เฉพาะผู้ดูแลระบบ เป็นเครื่องมือกู้คืน ไม่ใช่ช่องทางกรอกปกติ */}
            {isAdmin ? (
              <>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => fileRef.current && fileRef.current.click()}
                >
                  นำเข้าไฟล์สำรอง
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={pickFile}
                />
              </>
            ) : null}
          </div>

          {!isAdmin ? (
            <div className="small muted" style={{ marginTop: 10 }}>
              การนำเข้าไฟล์สำรองเขียนทับข้อมูลทุกหน้าพร้อมกัน จึงสงวนไว้ให้ผู้ดูแลระบบ
            </div>
          ) : null}
          {msg ? (
            <div className="banner" style={{ marginTop: 14, marginBottom: 0 }}>
              {msg}
            </div>
          ) : null}
        </div>
      </section>

      <section className="block">
        <h2>ตรวจสอบยอดกับไฟล์ต้นฉบับ</h2>
        <div className={"banner " + (checkOK ? "ok" : "bad")}>
          {checkOK
            ? "ยอดตรงกับไฟล์ต้นฉบับ: "
            : "ยอดไม่ตรงกับไฟล์ต้นฉบับ — ตรวจสอบ data/plan-data.json: "}
          {fmt(check.rows)} รายการ · {fmt(check.projects)} โครงการ · งบโครงการรวม{" "}
          {money(check.projectBudget)} บาท
          {checkOK ? "" : " (ควรเป็น " + money(EXPECTED.projectBudget) + " บาท)"}
        </div>
        <div className="small muted">
          ยอดรวมนับเฉพาะรายการระดับโครงการ (lvl 1) เพราะงบของกิจกรรมย่อยรวมอยู่ในงบโครงการแม่แล้ว
        </div>
      </section>

      {group ? (
        <ProjectList
          title={group.title}
          subtitle={group.subtitle}
          items={group.items}
          onClose={() => setGroup(null)}
        />
      ) : null}
    </>
  );
}
