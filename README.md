# ระบบแจ้งเตือนผลการดำเนินงาน กยท. ปีงบประมาณ 2570

เว็บแจ้งเตือนโครงการในแผนปฏิบัติการ การยางแห่งประเทศไทย ปีงบประมาณ 2570
ที่ผลการดำเนินงานไม่เป็นไปตามเป้าหมาย — Next.js App Router, deploy บน Vercel

รายละเอียดทั้งหมด (กติกาการแจ้งเตือน, ข้อตกลงเรื่องข้อมูล, กับดักที่เจอมาแล้ว)
อยู่ใน [docs/plan.txt](docs/plan.txt) — **อ่านไฟล์นั้นก่อนเริ่มแก้อะไร**

## เข้าสู่ระบบ

```
username  admin
password  raot4623
```

ทับได้ด้วย environment variable `APP_USER` / `APP_PASSWORD` บน Vercel
และควรตั้ง `AUTH_SECRET` เป็นข้อความสุ่มยาว ๆ ถ้า repo เป็น public

## deploy

เครื่องที่ใช้พัฒนาไม่มี Node.js และไม่จำเป็นต้องมี — Vercel รัน `npm install` และ
`next build` ให้เองบนคลาวด์

repo: [github.com/poogif1869-cell/warning-actionplan2570](https://github.com/poogif1869-cell/warning-actionplan2570)

```
git add -A
git commit -m "ข้อความอธิบายว่าแก้อะไร"
git push
```

แล้วเข้า vercel.com > Add New > Project > Import repo นี้ > Deploy
หลังจาก Import ครั้งแรกแล้ว ทุก push จะ deploy ใหม่อัตโนมัติ

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
| `lib/store.jsx` | ผลการดำเนินงาน = ไฟล์ baseline ใน repo + localStorage ของแต่ละเครื่อง |
| `lib/auth.js` + `middleware.js` | คุกกี้เซสชันเซ็นด้วย Web Crypto ไม่มี Database |
| `app/(app)/` | สามหน้า: แจ้งเตือน / โครงการ / กรอกผล |

**อย่าแก้ `data/plan-data.json` ด้วยมือ** — เป็นผลลัพธ์ที่แตกจาก `แผนปฏิบัติการ.xlsx`
ด้วยสคริปต์ในโปรเจกต์เดิมที่ `Desktop\Gif\build\`
