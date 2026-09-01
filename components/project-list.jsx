"use client";

import { useEffect, useMemo, useState } from "react";
import { money, fmt } from "@/lib/format";
import ProjectDrawer from "@/components/project-drawer";

/* กล่องแสดงรายชื่อโครงการในกลุ่มหนึ่ง

   ใช้ตอนกดตัวเลข "จำนวนโครงการ" ที่ไหนก็ได้ในเว็บ เพื่อดูว่ากลุ่มนั้นมีโครงการอะไรบ้าง
   คลิกชื่อโครงการซ้ำเพื่อเปิดลิ้นชักรายละเอียดต่อได้ */
export default function ProjectList({ title, subtitle, items, onClose }) {
  const [q, setQ] = useState("");
  const [openUid, setOpenUid] = useState(null);

  useEffect(() => {
    function onKey(e) {
      // ถ้าลิ้นชักเปิดอยู่ ปล่อยให้ลิ้นชักจัดการ Esc ของตัวเอง
      if (e.key === "Escape" && !openUid) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, openUid]);

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    const list = needle
      ? items.filter((p) => (p.code + " " + p.name + " " + (p.org || "")).toLowerCase().includes(needle))
      : items;
    return list.slice().sort((a, b) => (b.budget || 0) - (a.budget || 0));
  }, [items, q]);

  const total = rows.reduce((a, p) => a + (p.budget || 0), 0);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>
            {title}
            <div className="small muted" style={{ fontWeight: 400 }}>
              {subtitle ? subtitle + " · " : ""}
              {fmt(rows.length)} โครงการ · {money(total)} บาท
            </div>
          </h3>
          <button className="iconbtn" onClick={onClose}>
            ปิด
          </button>
        </header>

        <div className="dbody">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="pl-q">ค้นหาในกลุ่มนี้</label>
            <input
              id="pl-q"
              type="search"
              placeholder="ชื่อโครงการ / รหัส / หน่วยงาน"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: "none", width: "100%" }}
            />
          </div>

          {rows.length ? (
            <div className="tablewrap">
              <table className="stack">
                <thead>
                  <tr>
                    <th>โครงการ</th>
                    <th className="num">งบประมาณ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.uid}
                      onClick={() => setOpenUid(p.uid)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="lead">
                        {p.sNo ? <span className={"chip s" + p.sNo}>{p.tNo || p.sNo}</span> : null}{" "}
                        {p.name}
                        <div className="small muted">
                          {p.code}
                          {p.org ? " · " + p.org : ""}
                        </div>
                      </td>
                      <td className="num" data-label="งบประมาณ">{money(p.budget)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="banner">ไม่พบโครงการที่ตรงกับคำค้น</div>
          )}
        </div>
      </aside>

      {openUid ? (
        <ProjectDrawer uid={openUid} alerts={[]} onClose={() => setOpenUid(null)} />
      ) : null}
    </>
  );
}
