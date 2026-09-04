"use client";

import { useMemo, useState } from "react";
import { PLAN_LINKS, groupByField, missingCount } from "@/lib/rollup";
import { PROJECTS } from "@/lib/plan";
import { money, fmt, pct } from "@/lib/format";
import ProjectDrawer from "@/components/project-drawer";
import Donut from "@/components/donut";
import DownloadButton from "@/components/download-button";

export default function LinkagePage() {
  const [planKey, setPlanKey] = useState(PLAN_LINKS[0].key);
  const [levelKey, setLevelKey] = useState(PLAN_LINKS[0].levels[0].key);
  const [openUid, setOpenUid] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [q, setQ] = useState("");

  const plan = PLAN_LINKS.find((p) => p.key === planKey) || PLAN_LINKS[0];
  const level =
    plan.levels.find((l) => l.key === levelKey) || plan.levels[0];

  const allGroups = useMemo(() => groupByField(level.key), [level.key]);
  const missing = useMemo(() => missingCount(level.key), [level.key]);

  /* ค้นหาโครงการจากชื่อหรือรหัส — กรองทั้งรายชื่อในกลุ่มและตัวกลุ่มเอง
     กลุ่มที่ไม่มีโครงการตรงคำค้นเลยจะถูกซ่อน จะได้เห็นทันทีว่าโครงการนั้นผูกอยู่กับอะไร */
  const groups = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return allGroups;

    return allGroups
      .map((g) => {
        const list = g.list.filter((p) =>
          (p.code + " " + p.name + " " + (p.org || "")).toLowerCase().includes(needle)
        );
        return { ...g, list, budget: list.reduce((a, p) => a + (p.budget || 0), 0) };
      })
      .filter((g) => g.list.length > 0);
  }, [allGroups, q]);

  const totalBudget = useMemo(() => groups.reduce((a, g) => a + g.budget, 0), [groups]);

  const matchCount = useMemo(
    () => groups.reduce((a, g) => a + g.list.length, 0),
    [groups]
  );

  function pickPlan(key) {
    const p = PLAN_LINKS.find((x) => x.key === key);
    setPlanKey(key);
    setLevelKey(p.levels[0].key);
    setExpanded(null);
  }

  return (
    <>
      <section className="block">
        <h2>
          ความเชื่อมโยงแผน
          <small>เลือกแผนที่ต้องการดู แล้วเลือกชั้นภายในแผนนั้น</small>
          <DownloadButton
            className="iconbtn"
            title="รายงานความเชื่อมโยงแผน"
            subtitle={plan.name + " · " + level.label}
            sheets={() => [
              {
                name: "สรุปการเชื่อมโยง",
                widths: [40, 22, 34],
                rows: [
                  ["รายการ", "ค่า", "หมายเหตุ"],
                  ["แผนที่เชื่อมโยง", plan.name, ""],
                  ["ชั้นที่ดู", level.label, q ? "กรองด้วยคำค้น “" + q + "”" : ""],
                  ["จำนวนรายการในชั้นนี้", groups.length, ""],
                  ["โครงการที่เชื่อมโยงแล้ว", PROJECTS.length - missing, "จากทั้งหมด " + PROJECTS.length + " โครงการ"],
                  ["ยังไม่ระบุการเชื่อมโยง", missing, "โครงการ"],
                  ["งบประมาณที่เชื่อมโยง (บาท)", totalBudget, ""],
                ],
              },
              {
                name: "สรุปรายชั้น",
                widths: [56, 14, 20, 14],
                rows: [
                  [level.label, "จำนวนโครงการ", "งบประมาณ", "สัดส่วน (%)"],
                  ...groups.map((g) => [
                    g.value,
                    g.list.length,
                    g.budget,
                    totalBudget ? Math.round((g.budget / totalBudget) * 1000) / 10 : 0,
                  ]),
                ],
              },
              /* g.value ไม่ใช่ g.name — ของเดิมเขียน g.name ไว้ คอลัมน์แรก
                 จึงว่างทั้งไฟล์ ทั้งที่บนหน้าจอแสดงชื่อชั้นได้ถูกต้อง
                 และเติมหน่วยงานกับงบรายโครงการ ให้ตรงกับที่กางดูบนหน้าจอ */
              {
                name: "โครงการรายชั้น",
                widths: [50, 12, 46, 22, 18],
                rows: [
                  [level.label, "รหัสโครงการ", "โครงการ", "หน่วยงาน", "งบตามแผน"],
                  ...groups.flatMap((g) =>
                    g.list.map((p) => [g.value, p.code, p.name, p.org || "", p.budget || 0])
                  ),
                ],
              },
            ]}
          />
        </h2>

        <div className="small muted" style={{ marginBottom: 7 }}>
          แผนที่เชื่อมโยง
        </div>
        <div className="monthpick" style={{ marginBottom: 14 }}>
          {PLAN_LINKS.map((p) => (
            <button
              key={p.key}
              aria-pressed={p.key === planKey}
              onClick={() => pickPlan(p.key)}
            >
              {p.short}
            </button>
          ))}
        </div>

        <div className="small muted" style={{ marginBottom: 7 }}>
          ชั้นของ{plan.name}
        </div>
        <div className="monthpick" style={{ marginBottom: 16 }}>
          {plan.levels.map((l) => (
            <button
              key={l.key}
              aria-pressed={l.key === levelKey}
              onClick={() => {
                setLevelKey(l.key);
                setExpanded(null);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* ---------- ช่องค้นหาแบบเด่น ----------
            หน้านี้คนเข้ามาด้วยคำถามเดียวเป็นส่วนใหญ่: "โครงการนี้ผูกกับแผนไหน"
            ช่องค้นหาจึงเป็นเครื่องมือหลักของหน้า ไม่ใช่ตัวกรองรองแบบหน้าอื่น
            เดิมเป็น .field ธรรมดาที่หน้าตาเท่ากับดรอปดาวน์ทั่วไป มองผ่านได้ง่าย */}
        <div className="searchbig">
          <span className="searchbig-ico" aria-hidden="true">🔍</span>
          <input
            id="lk-q"
            type="search"
            aria-label="ค้นหาโครงการ"
            placeholder="พิมพ์ชื่อหรือรหัสโครงการ เพื่อดูว่าผูกกับแผนไหน"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setExpanded(null);
            }}
          />
          {q ? (
            <button
              type="button"
              className="searchbig-x"
              aria-label="ล้างคำค้น"
              onClick={() => {
                setQ("");
                setExpanded(null);
              }}
            >
              ×
            </button>
          ) : null}
        </div>

        {q ? (
          <div className="small muted" style={{ margin: "-6px 0 14px" }}>
            พบ {fmt(matchCount)} โครงการ ใน {fmt(groups.length)} รายการของชั้นนี้ ·
            กางทุกกลุ่มให้อัตโนมัติแล้ว
          </div>
        ) : null}

        <div className="tiles">
          <div className="tile">
            <span className="lab">จำนวนรายการในชั้นนี้</span>
            <div className="val">{fmt(groups.length)}</div>
            <div className="note">
              {level.label}
              {q ? " (กรองด้วยคำค้นแล้ว)" : ""}
            </div>
          </div>
          <div className="tile">
            <span className="lab">โครงการที่เชื่อมโยงแล้ว</span>
            <div className="val">
              {fmt(PROJECTS.length - missing)}
              <span className="unit">/ {fmt(PROJECTS.length)}</span>
            </div>
            <div className="note">
              คิดเป็น {pct(((PROJECTS.length - missing) / PROJECTS.length) * 100)}
            </div>
          </div>
          <div className={"tile " + (missing ? "warn" : "ok")}>
            <span className="lab">ยังไม่ระบุการเชื่อมโยง</span>
            <div className={"val " + (missing ? "st-warn" : "st-ok")}>{fmt(missing)}</div>
            <div className="note">โครงการ</div>
          </div>
          <div className="tile">
            <span className="lab">งบประมาณที่เชื่อมโยง</span>
            <div className="val">{money(totalBudget)}</div>
            <div className="note">บาท</div>
          </div>
        </div>
      </section>

      <section className="block">
        <h2>
          {level.label}
          <small>คลิกจำนวนโครงการเพื่อกางดูรายชื่อ · คลิกชื่อโครงการเพื่อเปิดรายละเอียด</small>
        </h2>

        {/* ---------- โดนัทสัดส่วนงบตามชั้นที่เลือก ----------
            ตารางข้างล่างมีคอลัมน์ "สัดส่วน" เป็น % อยู่แล้ว แต่ต้องอ่านทีละแถว
            แล้วเทียบเอาเองว่าอันไหนใหญ่กว่ากันมาก โดนัทตอบได้ในภาพเดียว

            แสดง 8 อันดับแรก ที่เหลือรวมเป็น "อื่น ๆ" — ชั้นอย่างแผนย่อย
            มี 86 รายการ ถ้าวาดหมดจะเป็นเส้นบาง ๆ 80 เส้นที่อ่านไม่ออก */}
        {groups.length > 1 ? (
          <div className="card pad" style={{ marginBottom: 16 }}>
            <Donut
              centerLabel={"งบตาม" + level.label}
              emptyText="ยังไม่มีโครงการที่ระบุการเชื่อมโยงในชั้นนี้"
              data={(() => {
                const top = groups.slice(0, 8).map((g) => ({
                  key: g.value,
                  label: g.value,
                  value: g.budget,
                }));
                const rest = groups.slice(8).reduce((a, g) => a + g.budget, 0);
                return rest
                  ? top.concat([
                      {
                        key: "__rest",
                        label: "อื่น ๆ อีก " + (groups.length - 8) + " รายการ",
                        value: rest,
                        color: "var(--none)",
                      },
                    ])
                  : top;
              })()}
            />
          </div>
        ) : null}

        {groups.length === 0 ? (
          <div className="banner">
            {q
              ? "ไม่พบโครงการที่ตรงกับ “" + q + "” ในชั้นนี้ — ลองเปลี่ยนแผนหรือชั้นที่ดูอยู่"
              : "ไม่มีโครงการที่ระบุ" + level.label + "ไว้ในไฟล์แผน"}
          </div>
        ) : (
          <div className="tablewrap">
            <table className="stack">
              <thead>
                <tr>
                  <th>{level.label}</th>
                  <th className="num">โครงการ</th>
                  <th className="num">งบประมาณ (บาท)</th>
                  <th className="num">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  // ตอนค้นหาให้กางทุกกลุ่มอัตโนมัติ จะได้เห็นโครงการที่หาทันทีไม่ต้องกดทีละอัน
                  const open = q ? true : expanded === g.value;
                  return [
                    <tr key={g.value}>
                      <td className="lead small">{g.value}</td>
                      <td className="num" data-label="โครงการ">
                        <button
                          className="exp-toggle"
                          onClick={() => setExpanded(open ? null : g.value)}
                        >
                          {fmt(g.list.length)} โครงการ {open ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="num" data-label="งบประมาณ">{money(g.budget)}</td>
                      <td className="num" data-label="สัดส่วน">
                        {pct(totalBudget ? (g.budget / totalBudget) * 100 : 0)}
                      </td>
                    </tr>,
                    open ? (
                      <tr className="exp-body" key={g.value + "/detail"}>
                        <td colSpan={4}>
                          <div className="exp-list">
                            {g.list
                              .slice()
                              .sort((a, b) => (b.budget || 0) - (a.budget || 0))
                              .map((p) => (
                                <button key={p.uid} onClick={() => setOpenUid(p.uid)}>
                                  <span className="c">{p.code}</span>
                                  {p.sNo ? (
                                    <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span>
                                  ) : null}
                                  <span>{p.name}</span>
                                  <span className="b">{money(p.budget)}</span>
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openUid ? (
        <ProjectDrawer uid={openUid} alerts={[]} onClose={() => setOpenUid(null)} />
      ) : null}
    </>
  );
}
