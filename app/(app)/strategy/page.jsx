"use client";

import { useMemo } from "react";
import { KPIS, achievement, statusOf } from "@/lib/plan";
import { STRATEGIES } from "@/lib/rollup";
import { money, fmt, pct } from "@/lib/format";
import { useResults, kpiActual } from "@/lib/store";
import Bars from "@/components/bars";
import DownloadButton from "@/components/download-button";

const S_COLORS = ["", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

export default function StrategyPage() {
  const { results, loaded, setKpi } = useResults();

  /* สรุปภาพรวมองค์กรจากตัวชี้วัดที่กรอกแล้ว */
  const summary = useMemo(() => {
    let sum = 0;
    let n = 0;
    let ok = 0;
    let below = 0;
    KPIS.forEach((k) => {
      const p = achievement(kpiActual(results, k.no), k.target, k.dir);
      if (p == null) return;
      sum += p;
      n++;
      if (p >= 100) ok++;
      else below++;
    });
    return { avg: n ? sum / n : null, n, ok, below, pending: KPIS.length - n };
  }, [results]);

  /* ตัวชี้วัดจัดกลุ่มตามยุทธศาสตร์ที่สังกัด (ฟิลด์ s ในไฟล์ .docx) */
  const kpisByStrategy = useMemo(() => {
    const m = new Map();
    KPIS.forEach((k) => {
      const key = String(k.s || "");
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(k);
    });
    return m;
  }, []);

  if (!loaded) return <div className="muted">กำลังโหลดข้อมูล…</div>;

  return (
    <>
      <section className="block">
        <h2>
          ภาพรวมการบรรลุตัวชี้วัดองค์กร
          <small>ตัวชี้วัด {KPIS.length} ตัว · ค่าเป้าหมายปี 2570</small>
          <DownloadButton
            className="iconbtn"
            title="รายงานยุทธศาสตร์และตัวชี้วัด"
            subtitle="ปีงบประมาณ 2570"
            sheets={() => [
              {
                name: "ตัวชี้วัดองค์กร",
                widths: [10, 52, 14, 12, 12, 12, 14, 18],
                rows: [
                  ["ตัวชี้วัดที่", "ชื่อตัวชี้วัด", "ยุทธศาสตร์", "เป้าหมาย", "หน่วย", "ผลที่รายงาน", "บรรลุ (%)", "สถานะ"],
                  ...KPIS.map((k) => {
                    const actual = kpiActual(results, k.no);
                    const p = achievement(actual, k.target, k.dir);
                    return [
                      k.no,
                      k.name,
                      k.s ? "ที่ " + k.s : "",
                      k.target,
                      k.unit || "",
                      actual == null || actual === "" ? "ยังไม่รายงาน" : actual,
                      p == null ? "" : Math.round(p * 10) / 10,
                      statusOf(p).label,
                    ];
                  }),
                ],
              },
            ]}
          />
        </h2>
        <div className="tiles">
          <div className="tile">
            <span className="lab">บรรลุเฉลี่ย</span>
            <div className="val">{summary.avg == null ? "–" : pct(summary.avg)}</div>
            <div className="note">จาก {fmt(summary.n)} ตัวที่รายงานแล้ว</div>
          </div>
          <div className="tile ok">
            <span className="lab">บรรลุเป้าหมาย</span>
            <div className="val st-ok">{fmt(summary.ok)}</div>
            <div className="note">ตัวชี้วัด</div>
          </div>
          <div className="tile crit">
            <span className="lab">ยังไม่บรรลุ</span>
            <div className="val st-bad">{fmt(summary.below)}</div>
            <div className="note">ตัวชี้วัด</div>
          </div>
          <div className="tile">
            <span className="lab">ยังไม่รายงานผล</span>
            <div className="val st-none">{fmt(summary.pending)}</div>
            <div className="note">ตัวชี้วัด</div>
          </div>
        </div>
      </section>

      <section className="block">
        <h2>
          งบประมาณตามยุทธศาสตร์และกลยุทธ์
          <small>นับเฉพาะระดับโครงการ (lvl 1) ไม่บวกข้ามระดับ</small>
        </h2>
        <div className="card pad">
          <Bars
            data={STRATEGIES.map((s) => ({
              label: "ยุทธศาสตร์ที่ " + s.no + " · " + s.count + " โครงการ",
              value: s.budget,
              display: money(s.budget) + " บาท",
              color: S_COLORS[Number(s.no)] || "var(--accent)",
            }))}
          />
        </div>
      </section>

      {STRATEGIES.map((s) => {
        const kpis = kpisByStrategy.get(String(s.no)) || [];
        return (
          <section className="block" key={s.no}>
            <h2>
              <span className={"chip s" + s.no}>ยุทธศาสตร์ที่ {s.no}</span>
              {s.name}
              <small>
                {fmt(s.count)} โครงการ · {money(s.budget)} บาท · {kpis.length} ตัวชี้วัด
              </small>
            </h2>

            {s.so ? <div className="small muted" style={{ marginBottom: 10 }}>{s.so}</div> : null}

            <div className="tablewrap" style={{ marginBottom: 14 }}>
              <table className="stack">
                <thead>
                  <tr>
                    <th>กลยุทธ์</th>
                    <th className="num">โครงการ</th>
                    <th className="num">งบประมาณ (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {s.tactics.map((t) => (
                    <tr key={t.no || t.name}>
                      <td className="lead small">{t.name || "(ไม่ระบุกลยุทธ์)"}</td>
                      <td className="num" data-label="โครงการ">{fmt(t.count)}</td>
                      <td className="num" data-label="งบประมาณ">{money(t.budget)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {kpis.length ? (
              <div className="tablewrap">
                <table className="stack">
                  <thead>
                    <tr>
                      <th style={{ width: 46 }}>ที่</th>
                      <th>ตัวชี้วัด</th>
                      <th>หน่วยนับ</th>
                      <th className="num">เป้าหมาย 2570</th>
                      <th className="num" style={{ width: 150 }}>
                        ผลการดำเนินงาน
                      </th>
                      <th className="num">บรรลุ</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((k) => {
                      const actual = kpiActual(results, k.no);
                      const p = achievement(actual, k.target, k.dir);
                      const st = statusOf(p);
                      return (
                        <tr key={k.no}>
                          <td className="mono small" data-label="ตัวชี้วัดที่">{k.no}</td>
                          <td className="lead">
                            {k.name}
                            {k.dir === "down" ? (
                              <span className="chip" style={{ marginInlineStart: 6 }}>
                                ยิ่งน้อยยิ่งดี
                              </span>
                            ) : null}
                            {k.cum ? (
                              <div className="small muted">ค่าสะสมตาม .xlsx: {k.cum}</div>
                            ) : null}
                          </td>
                          <td className="small" data-label="หน่วยนับ">{k.unit}</td>
                          <td className="num" data-label="เป้าหมาย 2570">{fmt(k.target)}</td>
                          <td className="num wide" data-label="ผลการดำเนินงาน">
                            <input
                              className="mono"
                              inputMode="decimal"
                              style={{
                                width: "100%",
                                textAlign: "end",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                padding: "4px 7px",
                              }}
                              value={actual == null ? "" : actual}
                              onChange={(e) => setKpi(k.no, e.target.value)}
                            />
                          </td>
                          <td className="num" data-label="บรรลุ">{p == null ? "–" : pct(p)}</td>
                          <td className="nowrap small" data-label="สถานะ">
                            <span className={"dot bg-" + st.cls} />
                            <span className={"st-" + st.cls}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="small muted">ไม่มีตัวชี้วัดระดับองค์กรผูกกับยุทธศาสตร์นี้</div>
            )}
          </section>
        );
      })}
    </>
  );
}
