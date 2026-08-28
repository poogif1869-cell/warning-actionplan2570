import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

export const metadata = { title: "ยังไม่ได้ตั้งค่า Supabase" };

/* หน้าที่ middleware พามาเมื่อยังไม่ได้ตั้ง env ของ Supabase
   ตั้งใจให้บอกวิธีแก้ตรง ๆ แทนที่จะปล่อยให้เว็บพังเงียบ ๆ หรือขึ้น error ที่อ่านไม่รู้เรื่อง */
export default function SetupPage() {
  const rows = [
    ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
  ];

  return (
    <main style={{ maxWidth: 760 }}>
      <section className="block">
        <h2>ยังตั้งค่า Supabase ไม่ครบ</h2>

        <div className="banner bad">
          เว็บนี้ใช้ Supabase เป็นทั้งระบบเข้าสู่ระบบและฐานข้อมูล
          จึงเปิดใช้งานไม่ได้จนกว่าจะตั้งค่าสองตัวนี้ครบ
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>ตัวแปร</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, value]) => (
                <tr key={name}>
                  <td className="mono small">{name}</td>
                  <td className={value ? "st-ok" : "st-bad"}>
                    {value ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>วิธีตั้งค่า</h2>
        <div className="card pad">
          <p style={{ marginTop: 0 }}>
            <b>1.</b> เปิดโปรเจกต์ที่ <span className="mono">supabase.com</span> ไปที่{" "}
            <b>Project Settings → Data API</b> แล้วคัดลอก <b>Project URL</b> กับ{" "}
            <b>anon public key</b>
          </p>
          <p>
            <b>2.</b> ที่ <span className="mono">vercel.com</span> ของโปรเจกต์นี้ ไปที่{" "}
            <b>Settings → Environment Variables</b> แล้วเพิ่มสองตัวข้างบน
          </p>
          <p>
            <b>3.</b> กด <b>Redeploy</b> หนึ่งครั้ง — จำเป็นเสมอ เพราะค่า{" "}
            <span className="mono">NEXT_PUBLIC_*</span> ถูกฝังลงบันเดิลตอน build
            ไม่ได้อ่านตอนรัน การเพิ่ม env เฉย ๆ โดยไม่ deploy ใหม่จะไม่มีผล
          </p>
          <p style={{ marginBottom: 0 }}>
            <b>4.</b> รัน <span className="mono">supabase/schema.sql</span> ใน{" "}
            <b>SQL Editor</b> ของ Supabase เพื่อสร้างตารางและ Row Level Security
            แล้วสร้างผู้ใช้ที่ <b>Authentication → Users → Add user</b>
          </p>
        </div>
      </section>

      <section className="block">
        <h2>ถ้ารันในเครื่อง</h2>
        <div className="card pad">
          <p style={{ margin: 0 }} className="small">
            คัดลอก <span className="mono">.env.local.example</span> เป็น{" "}
            <span className="mono">.env.local</span> แล้วใส่ค่าจริง
            (ไฟล์นี้ถูก .gitignore ไว้แล้ว จึงไม่หลุดขึ้น repo)
          </p>
        </div>
      </section>
    </main>
  );
}
