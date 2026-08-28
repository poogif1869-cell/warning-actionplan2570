# ระบบแจ้งเตือนผลการดำเนินงาน กยท. ปีงบประมาณ 2570

เว็บแจ้งเตือนโครงการในแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570
ที่ผลการดำเนินงานไม่เป็นไปตามเป้าหมาย — Next.js App Router + Supabase, deploy บน Vercel

รายละเอียดทั้งหมด (กติกาการแจ้งเตือน, ข้อตกลงเรื่องข้อมูล, กับดักที่เจอมาแล้ว)
อยู่ใน [docs/plan.txt](docs/plan.txt) — **อ่านไฟล์นั้นก่อนเริ่มแก้อะไร**

## ตั้งค่า Supabase (ต้องทำก่อนถึงจะใช้ได้)

**1. รัน schema** — เปิด Supabase > SQL Editor วาง [supabase/schema.sql](supabase/schema.sql) ทั้งไฟล์ แล้ว Run

**2. ปิดการสมัครสมาชิกเอง** — Authentication > Sign In / Providers > Email
ปิด `Allow new users to sign up`
เว็บไม่มีหน้าสมัครอยู่แล้ว แต่ถ้าไม่ปิดตรงนี้ใครก็ยิง API สมัครเองได้ เพราะ anon key เป็นของสาธารณะ

**3. สร้างผู้ใช้** — Authentication > Users > Add user
ใส่อีเมลกับรหัสผ่าน และ**ติ๊ก Auto Confirm User** ไม่งั้นจะเข้าไม่ได้

**4. ใส่ env** — เอาค่าจาก Project Settings > Data API ไปใส่ที่
Vercel > Settings > Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

แล้ว **Redeploy หนึ่งครั้ง** — จำเป็นเสมอ เพราะ `NEXT_PUBLIC_*` ถูกฝังตอน build ไม่ใช่ตอนรัน
ถ้ายังตั้งไม่ครบ เว็บจะพาไปหน้า `/setup` ที่บอกวิธีตั้งค่า

รันในเครื่อง: คัดลอก `.env.local.example` เป็น `.env.local` แล้วใส่ค่าจริง

> anon key เปิดเผยได้โดยการออกแบบ ความปลอดภัยอยู่ที่ Row Level Security ใน schema
> **ห้ามเอา service_role key มาใส่ใน `NEXT_PUBLIC_*`** เพราะคีย์นั้นข้าม RLS ทั้งหมด

## deploy

เครื่องที่ใช้พัฒนาไม่มี Node.js และไม่จำเป็นต้องมี — Vercel รัน `npm install` และ
`next build` ให้เองบนคลาวด์

repo: [github.com/poogif1869-cell/warning-actionplan2570](https://github.com/poogif1869-cell/warning-actionplan2570)

```
git add -A
git commit -m "ข้อความอธิบายว่าแก้อะไร"
git push
```

**เครือข่ายนี้บล็อก SSH port 22** remote จึงตั้งเป็น `ssh://git@ssh.github.com:443/...`
ไม่ใช่ `git@github.com:...` ตามที่ GitHub แนะนำ ไม่งั้น push จะค้างแล้วขึ้น Connection timed out

## ตรวจก่อน push

รัน `next build` ในเครื่องไม่ได้ จึงต้องพึ่งสองสคริปต์นี้แทน

```powershell
powershell -File check\verify-data.ps1      # กระทบยอดข้อมูลกับไฟล์ต้นฉบับ 26 ข้อ
powershell -File check\verify-imports.ps1   # ตรวจ import/export และวงเล็บทุกไฟล์
```

## โครงสร้างโดยย่อ

| ที่อยู่ | ทำอะไร |
|---|---|
| `lib/plan.js` | แปลง `data/plan-data.json` เป็น `ITEMS` / `PROJECTS`, `monthsOf()`, `achievement()` |
| `lib/alerts.js` | กลไกแจ้งเตือน 6 กฎ เกณฑ์ตัวเลขอยู่ที่ `RULES` |
| `lib/store.jsx` | โหลด/บันทึกผลการดำเนินงานกับ Supabase |
| `lib/supabase/` | อ่าน env + สร้าง browser client |
| `middleware.js` | ต่ออายุเซสชัน Supabase + กันคนที่ยังไม่ล็อกอิน |
| `supabase/schema.sql` | 3 ตาราง + trigger + Row Level Security |
| `app/(app)/` | สามหน้า: แจ้งเตือน / โครงการ / กรอกผล |

**อย่าแก้ `data/plan-data.json` ด้วยมือ** — เป็นผลลัพธ์ที่แตกจาก `แผนปฏิบัติการ.xlsx`
ด้วยสคริปต์ในโปรเจกต์เดิมที่ `Desktop\Gif\build\`
