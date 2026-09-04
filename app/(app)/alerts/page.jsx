"use client";

import { useMemo, useState } from "react";
import { useResults, riskOf } from "@/lib/store";
import {
  buildAlerts,
  summarize,
  SEV_LABEL,
  KIND_LABEL,
  criteriaRows,
} from "@/lib/alerts";
import { PROJECTS, MONTHS, EXPECTED, reconcile } from "@/lib/plan";
import { ORG_UNITS, inUnit, RISK_LEVELS } from "@/lib/rollup";
import { money, mb, fmt, pct } from "@/lib/format";
import MonthPicker from "@/components/month-picker";
import ProjectDrawer from "@/components/project-drawer";
import Bars from "@/components/bars";
import DownloadButton from "@/components/download-button";

const KINDS = Object.keys(KIND_LABEL);

export default function AlertsPage() {
  const { results, asOfMonth, asOfLabel, risk, loaded } = useResults();
  const [sev, setSev] = useState("");
  const [kind, setKind] = useState("");
  const [sNo, setSNo] = useState("");
  const [org, setOrg] = useState("");
  const [q, setQ] = useState("");
  const [openUid, setOpenUid] = useState(null);

  const alerts = useMemo(() => buildAlerts(results, asOfMonth, risk), [results, asOfMonth, risk]);
  const stats = useMemo(() => summarize(alerts), [alerts]);

  /* ---------- สรุปความเสี่ยงสำหรับแดชบอร์ดที่ย้ายมาจากหน้า /risk ----------
     ดูระดับที่รายงาน "ล่าสุดแต่ไม่เกินเดือนที่เลือก" ของแต่ละโครงการ
     ไม่ใช่ค่าของเดือนที่เลือกตรง ๆ เพราะหลายโครงการไม่ได้รายงานทุกเดือน
     ถ้าดูเฉพาะเดือนที่เลือกจะกลายเป็น "ไม่มีความเสี่ยง" ทั้งที่เดือนก่อนรายงานว่าสูง */
  const riskStat = useMemo(() => {
    const byLevel = [0, 0, 0, 0, 0];
    let reported = 0;
    let budgetAtRisk = 0;
    let crit = 0;
    let warn = 0;

    PROJECTS.forEach((p) => {
      const mine = riskOf(risk, p.uid);
      let last = -1;
      for (let i = 0; i <= asOfMonth; i++) {
        const e = mine[i];
        if (e && e.level !== "" && e.level != null) last = i;
      }
      if (last < 0) {
        // อยู่ในทะเบียนความเสี่ยงแต่ยังไม่เคยรายงาน = เฝ้าระวัง
        if (p.rScen || p.rFactor) warn++;
        return;
      }
      const lv = Number(mine[last].level);
      byLevel[lv] = (byLevel[lv] || 0) + 1;
      reported++;
      if (lv >= 3) budgetAtRisk += p.budget || 0;
      if (lv === 4) crit++;
      else if (lv === 3) warn++;
    });

    return { byLevel, reported, budgetAtRisk, crit, warn };
  }, [risk, asOfMonth]);

  const shown = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return alerts.filter((a) => {
      if (sev && a.sev !== sev) return false;
      if (kind && a.kind !== kind) return false;
      if (sNo && String(a.sNo || "") !== sNo) return false;
      // เทียบแบบสายหน่วยงาน เลือกตัวหน้าแล้วได้หน่วยงานย่อยใต้สายนั้นด้วย
      if (org && !inUnit({ org: a.org }, org)) return false;
      if (needle) {
        const hay = ((a.title || "") + " " + (a.detail || "") + " " + (a.code || "") + " " + (a.org || "")).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [alerts, sev, kind, sNo, org, q]);

  // ยอดกระทบยอดกับไฟล์ต้นฉบับ ถ้าไม่ตรงแปลว่าข้อมูลที่ฝังมาผิด
  const check = useMemo(() => reconcile(), []);
  const checkOK =
    check.rows === EXPECTED.rows &&
    check.projects === EXPECTED.projects &&
    check.projectBudget === EXPECTED.projectBudget;

  const totalBudget = PROJECTS.reduce((a, p) => a + (p.budget || 0), 0);
  const riskShare = totalBudget ? (stats.budgetAtRisk / totalBudget) * 100 : 0;

  if (!loaded) {
    return <div className="muted">กำลังโหลดข้อมูลแผน…</div>;
  }

  return (
    <>
      <MonthPicker />

      <section className="block">
        <h2>
          สรุปการแจ้งเตือน
          <small>{asOfLabel}</small>
          <DownloadButton
            className="iconbtn"
            title="รายงานการแจ้งเตือน"
            subtitle={asOfLabel}
            sheets={() => [
              /* ---------- ชีตสรุป ----------
                 ไฟล์ PDF คือภาพหน้าจอทั้งหน้า มีทั้งไทล์สรุปและแดชบอร์ดความเสี่ยง
                 ไฟล์ Excel จึงต้องมีทุกก้อนเหมือนกัน ไม่ใช่มีแต่ตารางรายการ
                 ไทล์กับกราฟแท่งกลายเป็นแถว ป้าย/ค่า เพราะ Excel ไม่มีไทล์ */
              {
                name: "สรุปการแจ้งเตือน",
                widths: [40, 20, 34],
                rows: [
                  ["รายการ", "ค่า", "หมายเหตุ"],
                  ["ช่วงเวลาที่ดู", asOfLabel, ""],
                  ["วิกฤต", stats.crit, "ต้องเร่งแก้ไข"],
                  ["เฝ้าระวัง", stats.warn, "ยังพอแก้ไขทัน"],
                  ["โครงการที่ติดแจ้งเตือน", stats.projects, "จากทั้งหมด " + PROJECTS.length + " โครงการ"],
                  ["โครงการที่ยังไม่พบปัญหา", stats.okProjects, ""],
                  ["งบประมาณที่เกี่ยวข้อง (บาท)", stats.budgetAtRisk, "คิดเป็น " + pct(riskShare) + " ของงบโครงการทั้งหมด"],
                  [],
                  ["แยกตามประเภทการแจ้งเตือน", "จำนวนรายการ", ""],
                  ...KINDS.filter((k) => stats.byKind[k]).map((k) => [
                    KIND_LABEL[k],
                    stats.byKind[k],
                    "",
                  ]),
                ],
              },
              {
                name: "สรุปความเสี่ยง",
                widths: [40, 20, 34],
                rows: [
                  ["รายการ", "ค่า", "หมายเหตุ"],
                  ["อิงรายงานล่าสุดของ", asOfLabel, "ดูย้อนหลังได้ ไม่จำกัดเฉพาะเดือนที่เลือก"],
                  ["ความเสี่ยงระดับวิกฤต", riskStat.crit, "ระดับสูงมาก"],
                  ["ความเสี่ยงเฝ้าระวัง", riskStat.warn, "ระดับสูง หรือยังไม่รายงาน"],
                  ["รายงานความเสี่ยงแล้ว", riskStat.reported, "จากทั้งหมด " + PROJECTS.length + " โครงการ"],
                  ["งบของโครงการเสี่ยงสูง (บาท)", riskStat.budgetAtRisk, ""],
                  [],
                  ["แยกตามระดับความเสี่ยง", "จำนวนโครงการ", ""],
                  ...RISK_LEVELS.map((lv) => [lv.label, riskStat.byLevel[lv.value] || 0, ""]),
                ],
              },
              {
                name: "เกณฑ์ที่ใช้แจ้งเตือน",
                widths: [26, 62, 24, 24],
                rows: [["ประเภท", "เงื่อนไข", "วิกฤต", "เฝ้าระวัง"], ...criteriaRows(MONTHS)],
              },
              {
                name: "การแจ้งเตือน",
                widths: [10, 22, 14, 44, 40, 16, 14],
                rows: [
                  ["ความรุนแรง", "ประเภท", "รหัสโครงการ", "เรื่อง", "รายละเอียด", "หน่วยงาน", "งบตามแผน"],
                  ...shown.map((a) => [
                    SEV_LABEL[a.sev] || a.sev,
                    KIND_LABEL[a.kind] || a.kind,
                    a.code || "",
                    a.title || "",
                    a.detail || "",
                    a.org || "",
                    a.budget || 0,
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
              {fmt(stats.projects)}
              <span className="unit">/ {fmt(PROJECTS.length)} โครงการ</span>
            </div>
            <div className="note">ที่เหลือ {fmt(stats.okProjects)} โครงการยังไม่พบปัญหา</div>
          </div>
          <div className="tile ok">
            <span className="lab">งบประมาณที่เกี่ยวข้อง</span>
            <div className="val">
              {mb(stats.budgetAtRisk)}
              <span className="unit">ล้านบาท</span>
            </div>
            <div className="note">คิดเป็น {pct(riskShare)} ของงบโครงการทั้งหมด</div>
          </div>
        </div>
      </section>

      {stats.total > 0 ? (
        <section className="block">
          <h2>แยกตามประเภทการแจ้งเตือน</h2>
          <div className="card pad">
            <div className="hbars">
              {KINDS.filter((k) => stats.byKind[k]).map((k) => {
                const v = stats.byKind[k];
                const max = Math.max(...Object.values(stats.byKind), 1);
                return (
                  <div key={k}>
                    <div className="hbar-top">
                      <span className="lbl">{KIND_LABEL[k]}</span>
                      <span className="val">{fmt(v)} รายการ</span>
                    </div>
                    {/* แท่งเป็น div + CSS width % ไม่ใช้ SVG เพื่อไม่ให้ตัวอักษรไทยถูกยืด */}
                    <div className="bar">
                      <i style={{ width: (v / max) * 100 + "%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------- แดชบอร์ดความเสี่ยง ----------
          ย้ายมาจากหน้า /risk ที่ยุบทิ้ง ความเสี่ยงเป็นเรื่องของ "การเตือน"
          จึงอยู่หน้าเดียวกับการแจ้งเตือนอื่น ส่วนการรายงานความเสี่ยง
          ย้ายไปเป็นขั้นตอนหนึ่งของการรายงานผลโครงการที่หน้าโครงการ/กิจกรรม */}
      <section className="block">
        <h2>
          แดชบอร์ดความเสี่ยง
          <small>อิงรายงานล่าสุดของ{asOfLabel}</small>
        </h2>

        <div className="tiles">
          <div className="tile crit">
            <span className="lab">ความเสี่ยงระดับวิกฤต</span>
            <div className="val st-bad">
              {fmt(riskStat.crit)}
            </div>
            <div className="note">ระดับสูงมาก</div>
          </div>
          <div className="tile warn">
            <span className="lab">ความเสี่ยงเฝ้าระวัง</span>
            <div className="val st-warn">
              {fmt(riskStat.warn)}
            </div>
            <div className="note">ระดับสูง หรือยังไม่รายงาน</div>
          </div>
          <div className="tile">
            <span className="lab">รายงานความเสี่ยงแล้ว</span>
            <div className="val">
              {fmt(riskStat.reported)}
              <span className="unit">/ {fmt(PROJECTS.length)}</span>
            </div>
            <div className="note">
              คิดเป็น {pct((riskStat.reported / PROJECTS.length) * 100)}
            </div>
          </div>
          <div className="tile">
            <span className="lab">งบของโครงการเสี่ยงสูง</span>
            <div className="val">{money(riskStat.budgetAtRisk)}</div>
            <div className="note">บาท</div>
          </div>
        </div>

        <div className="card pad" style={{ marginTop: 14 }}>
          <Bars
            data={RISK_LEVELS.map((lv) => ({
              label: lv.label,
              value: riskStat.byLevel[lv.value] || 0,
              display: fmt(riskStat.byLevel[lv.value] || 0) + " โครงการ",
              color:
                lv.cls === "bad"
                  ? "var(--bad)"
                  : lv.cls === "warn"
                  ? "var(--warn)"
                  : "var(--ok)",
            }))}
          />
        </div>

        <div className="hint">
          รายงานความเสี่ยงรายเดือนกรอกที่หน้า <b>โครงการ/กิจกรรม</b> —
          เป็นขั้นตอนสุดท้ายของการรายงานผลแต่ละโครงการ
        </div>
      </section>

      <section className="block">
        <h2>
          รายการแจ้งเตือน
          <small>
            แสดง {fmt(shown.length)} จาก {fmt(alerts.length)} รายการ · คลิกเพื่อเปิดรายละเอียดและกรอกผล
          </small>
        </h2>

        {/* ---------- เลือกเรื่องที่จะดู ----------
            ดรอปดาวน์ "ประเภท" ยังอยู่ด้านล่างสำหรับคนที่ใช้ร่วมกับตัวกรองอื่น
            แต่ปุ่มชุดนี้ตอบคำถามที่คนถามบ่อยที่สุดโดยไม่ต้องเปิดดรอปดาวน์:
            "ตอนนี้มีเรื่องอะไรบ้าง และเรื่องละกี่รายการ"

            เรียงตามจำนวนจากมากไปน้อย เรื่องที่ไม่มีรายการเลยไม่ต้องขึ้นปุ่ม
            จะได้ไม่ต้องกดปุ่มที่รู้อยู่แล้วว่ากดไปก็ว่าง */}
        <div className="kindpick">
          <button
            type="button"
            aria-pressed={kind === ""}
            onClick={() => setKind("")}
          >
            ทั้งหมด
            <span className="n">{fmt(alerts.length)}</span>
          </button>
          {KINDS.filter((k) => stats.byKind[k]).map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={kind === k}
              onClick={() => setKind(kind === k ? "" : k)}
            >
              {KIND_LABEL[k]}
              <span className="n">{fmt(stats.byKind[k])}</span>
            </button>
          ))}
        </div>

        <div className="filters">
          <div className="field">
            <label htmlFor="f-q">ค้นหา</label>
            <input
              id="f-q"
              type="search"
              placeholder="ชื่อโครงการ / รหัส / หน่วยงาน"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-sev">ความรุนแรง</label>
            <select id="f-sev" value={sev} onChange={(e) => setSev(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="crit">วิกฤต</option>
              <option value="warn">เฝ้าระวัง</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-kind">ประเภท</label>
            <select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-s">ยุทธศาสตร์</label>
            <select id="f-s" value={sNo} onChange={(e) => setSNo(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="1">ยุทธศาสตร์ที่ 1</option>
              <option value="2">ยุทธศาสตร์ที่ 2</option>
              <option value="3">ยุทธศาสตร์ที่ 3</option>
              <option value="4">ยุทธศาสตร์ที่ 4</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-org">หน่วยงาน</label>
            <select id="f-org" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">ทุกหน่วยงาน</option>
              {ORG_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.name} ({u.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="banner ok">
            {alerts.length === 0
              ? asOfLabel + " ยังไม่พบผลการดำเนินงานที่ไม่เป็นไปตามเป้าหมาย — " +
                "ถ้ายังไม่ได้กรอกผลเลย ให้เลื่อน “ณ เดือน” ไปข้างหน้าเพื่อดูรายการที่ถึงกำหนดแล้ว"
              : "ไม่มีรายการที่ตรงกับตัวกรองที่เลือก"}
          </div>
        ) : (
          <div className="alerts">
            {shown.map((a) => (
              <button
                key={a.id}
                className={"alert " + a.sev}
                onClick={() => a.uid && setOpenUid(a.uid)}
                style={a.uid ? undefined : { cursor: "default" }}
              >
                <span className="sev">{SEV_LABEL[a.sev]}</span>
                <div className="abody">
                  <div className="title">{a.title}</div>
                  <div className="detail">{a.detail}</div>
                  <div className="meta">
                    <span>{KIND_LABEL[a.kind]}</span>
                    {a.code ? <span>รหัส {a.code}</span> : null}
                    {a.org ? <span>{a.org}</span> : null}
                    {a.sNo ? <span className={"chip s" + a.sNo}>ยุทธศาสตร์ที่ {a.sNo}</span> : null}
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
        )}
      </section>

      <section className="block">
        <h2>เกณฑ์ที่ใช้แจ้งเตือน</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>เงื่อนไข</th>
                <th>วิกฤต</th>
                <th>เฝ้าระวัง</th>
              </tr>
            </thead>
            <tbody>
              {criteriaRows(MONTHS).map((r) => (
                <tr key={r[0]}>
                  <td>{r[0]}</td>
                  <td className="small">{r[1]}</td>
                  <td className="small">{r[2]}</td>
                  <td className="small">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>ตรวจสอบยอดกับไฟล์ต้นฉบับ</h2>
        <div className={"banner " + (checkOK ? "ok" : "bad")}>
          {checkOK ? "ยอดตรงกับไฟล์ต้นฉบับ: " : "ยอดไม่ตรงกับไฟล์ต้นฉบับ — ตรวจสอบ data/plan-data.json: "}
          {fmt(check.rows)} รายการ · {fmt(check.projects)} โครงการ ·
          งบโครงการรวม {money(check.projectBudget)} บาท
          {checkOK ? "" : " (ควรเป็น " + money(EXPECTED.projectBudget) + " บาท)"}
        </div>
        <div className="small muted">
          ยอดรวมนับเฉพาะรายการระดับโครงการ (lvl 1) เท่านั้น เพราะงบของกิจกรรมย่อย
          รวมอยู่ในงบโครงการแม่แล้ว ถ้าบวกข้ามระดับจะได้ราว 25,500 ล้านบาทแทนที่จะเป็น 12,770 ล้านบาท
        </div>
      </section>

      {openUid ? (
        <ProjectDrawer uid={openUid} alerts={alerts} onClose={() => setOpenUid(null)} />
      ) : null}
    </>
  );
}
