-- =====================================================================
-- ฐานข้อมูลผลการดำเนินงาน แผนปฏิบัติการ กยท. ปีงบประมาณ 2570
--
-- วิธีใช้: เปิด Supabase > SQL Editor > วางไฟล์นี้ทั้งไฟล์ > Run
-- รันซ้ำได้ ไม่ลบข้อมูลเดิม (ใช้ if not exists / drop policy if exists)
--
-- ข้อมูลแผน (553 รายการ, 121 โครงการ) ไม่ได้เก็บที่นี่ — อยู่ในไฟล์
-- data/plan-data.json ที่ฝังไปกับเว็บ เพราะเป็นข้อมูลนิ่งที่ไม่มีใครแก้
-- ตารางพวกนี้เก็บเฉพาะ "ผลการดำเนินงาน" ที่ผู้ใช้กรอกเข้ามา
-- =====================================================================

-- ---------------------------------------------------------------------
-- ผลตัวชี้วัดระดับองค์กร 13 ตัว
-- ---------------------------------------------------------------------
create table if not exists public.kpi_results (
  no          text primary key,                    -- เลขตัวชี้วัด เช่น "1.1"
  actual      text,                                -- ผลที่รายงาน เก็บเป็นข้อความตามที่กรอก
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------
-- สถานะรายโครงการ
--
-- คีย์เป็น uid = "<รหัสโครงการ>#<ลำดับแถวในไฟล์แผน>" ไม่ใช่รหัสโครงการเปล่า ๆ
-- เพราะไฟล์ต้นฉบับมีรหัสซ้ำกัน 9 รหัส โดย 4 คู่เป็นคนละโครงการจริง ๆ
-- ถ้าใช้รหัสเป็นคีย์ สองโครงการนั้นจะเขียนทับกัน (ดู docs/plan.txt)
-- ---------------------------------------------------------------------
create table if not exists public.project_results (
  uid         text primary key,
  code        text,                                -- รหัสโครงการ เก็บไว้ให้ query ง่าย
  status      text,                                -- ยังไม่เริ่ม / กำลังดำเนินการ / แล้วเสร็จ / ล่าช้า / ยกเลิก
  progress    text,                                -- ความก้าวหน้า %
  note        text,                                -- หมายเหตุ / ปัญหาอุปสรรค
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------
-- รายงานผลรายเดือน 12 เดือน (ต.ค. 69 = 0 ถึง ก.ย. 70 = 11)
--
-- แยกเป็นตารางต่างหากแทนที่จะยัดเป็น jsonb ก้อนเดียวในตารางบน
-- เพื่อให้สองคนแก้คนละเดือนของโครงการเดียวกันพร้อมกันแล้วไม่ทับกัน
-- ---------------------------------------------------------------------
create table if not exists public.monthly_reports (
  uid         text not null,
  month       smallint not null check (month between 0 and 11),
  output      text,                                -- ผลผลิต (Output)
  outcome     text,                                -- ผลลัพธ์ (Outcome)
  spend       numeric,                             -- เบิกจ่าย (บาท)
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (uid, month)
);

create index if not exists monthly_reports_uid_idx on public.monthly_reports (uid);

-- ---------------------------------------------------------------------
-- ประทับเวลาและผู้แก้ไขอัตโนมัติ
-- ---------------------------------------------------------------------
create or replace function public.stamp_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_kpi_results on public.kpi_results;
create trigger stamp_kpi_results
  before insert or update on public.kpi_results
  for each row execute function public.stamp_row();

drop trigger if exists stamp_project_results on public.project_results;
create trigger stamp_project_results
  before insert or update on public.project_results
  for each row execute function public.stamp_row();

drop trigger if exists stamp_monthly_reports on public.monthly_reports;
create trigger stamp_monthly_reports
  before insert or update on public.monthly_reports
  for each row execute function public.stamp_row();

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- สำคัญมาก: เว็บใช้ anon key ซึ่งเปิดเผยต่อสาธารณะโดยธรรมชาติ
-- ความปลอดภัยทั้งหมดอยู่ที่ตรงนี้ ไม่ใช่ที่การซ่อนคีย์
-- นโยบายด้านล่างให้เฉพาะผู้ที่ล็อกอินแล้ว (authenticated) เท่านั้นที่อ่าน/เขียนได้
-- ผู้ใช้ที่ยังไม่ล็อกอิน (anon) ทำอะไรไม่ได้เลย
--
-- ทุกคนที่ล็อกอินเห็นและแก้ข้อมูลชุดเดียวกัน เพราะเป็นแผนขององค์กร
-- ถ้าต้องการให้แก้ได้เฉพาะของหน่วยงานตัวเอง ต้องเพิ่มตาราง profiles
-- แล้วเปลี่ยน using(...) ให้เทียบกับหน่วยงาน
-- ---------------------------------------------------------------------
alter table public.kpi_results      enable row level security;
alter table public.project_results  enable row level security;
alter table public.monthly_reports  enable row level security;

drop policy if exists kpi_results_read   on public.kpi_results;
drop policy if exists kpi_results_write  on public.kpi_results;
drop policy if exists kpi_results_update on public.kpi_results;
drop policy if exists kpi_results_delete on public.kpi_results;

create policy kpi_results_read   on public.kpi_results for select to authenticated using (true);
create policy kpi_results_write  on public.kpi_results for insert to authenticated with check (true);
create policy kpi_results_update on public.kpi_results for update to authenticated using (true) with check (true);
create policy kpi_results_delete on public.kpi_results for delete to authenticated using (true);

drop policy if exists project_results_read   on public.project_results;
drop policy if exists project_results_write  on public.project_results;
drop policy if exists project_results_update on public.project_results;
drop policy if exists project_results_delete on public.project_results;

create policy project_results_read   on public.project_results for select to authenticated using (true);
create policy project_results_write  on public.project_results for insert to authenticated with check (true);
create policy project_results_update on public.project_results for update to authenticated using (true) with check (true);
create policy project_results_delete on public.project_results for delete to authenticated using (true);

drop policy if exists monthly_reports_read   on public.monthly_reports;
drop policy if exists monthly_reports_write  on public.monthly_reports;
drop policy if exists monthly_reports_update on public.monthly_reports;
drop policy if exists monthly_reports_delete on public.monthly_reports;

create policy monthly_reports_read   on public.monthly_reports for select to authenticated using (true);
create policy monthly_reports_write  on public.monthly_reports for insert to authenticated with check (true);
create policy monthly_reports_update on public.monthly_reports for update to authenticated using (true) with check (true);
create policy monthly_reports_delete on public.monthly_reports for delete to authenticated using (true);

-- =====================================================================
-- หลังรันไฟล์นี้แล้วต้องทำอีกสองอย่างในหน้า Supabase
--
-- 1) ปิดการสมัครสมาชิกเอง
--    Authentication > Sign In / Providers > Email
--    ปิด "Allow new users to sign up"
--    เว็บไม่มีหน้าสมัครอยู่แล้ว แต่ถ้าไม่ปิดตรงนี้ ใครก็ยิง API สมัครเองได้
--    เพราะ anon key เป็นของสาธารณะ
--
-- 2) สร้างผู้ใช้
--    Authentication > Users > Add user > Create new user
--    ใส่อีเมลกับรหัสผ่าน และติ๊ก "Auto Confirm User"
--    ไม่งั้นจะเข้าไม่ได้จนกว่าจะยืนยันอีเมล
-- =====================================================================


-- =====================================================================
-- ส่วนที่เพิ่มเมื่อ 28 ส.ค. 2569 — รายงานงบประมาณโครงการ และรายงานความเสี่ยงรายเดือน
-- รันไฟล์นี้ซ้ำได้ ของเดิมไม่หาย
-- =====================================================================

-- ---------------------------------------------------------------------
-- รายการเบิกจ่ายงบประมาณโครงการ
--
-- หนึ่งโครงการมีได้หลายรายการในเดือนเดียวกัน (เช่น เดินทางหลายครั้ง)
-- จึงใช้ id เป็นคีย์ ไม่ใช่ (uid, month) แบบตารางอื่น
--
-- ยอดเบิกจ่ายรายเดือนในรายงานผลการดำเนินงาน = ผลรวมของรายการในตารางนี้
-- ไม่ได้ให้กรอกมือแล้ว (ดู lib/store.jsx -> spendFromEntries)
-- ---------------------------------------------------------------------
create table if not exists public.budget_entries (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null,                       -- รหัสโครงการ + "#" + ลำดับแถว
  month       smallint not null check (month between 0 and 11),
  occurred_on date,                                -- วันที่เกิดค่าใช้จ่าย (ไม่บังคับ)
  note        text,                                -- รายละเอียด/กิจกรรมที่ใช้งบ
  perdiem     numeric not null default 0,          -- ค่าเบี้ยเลี้ยง
  lodging     numeric not null default 0,          -- ค่าที่พัก
  travel      numeric not null default 0,          -- ค่าเดินทาง
  fuel        numeric not null default 0,          -- ค่าน้ำมันเชื้อเพลิง
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create index if not exists budget_entries_uid_idx        on public.budget_entries (uid);
create index if not exists budget_entries_uid_month_idx  on public.budget_entries (uid, month);

-- ---------------------------------------------------------------------
-- รายงานความเสี่ยงรายเดือน
--
-- ทะเบียนความเสี่ยง (สถานการณ์, ปัจจัยเสี่ยง, คะแนนควบคุมภายใน) มาจากไฟล์แผน
-- อยู่ใน data/plan-data.json แล้ว ตารางนี้เก็บเฉพาะ "ผลการติดตามรายเดือน"
--
-- level: 0 = ไม่มีความเสี่ยง, 1 = ต่ำ, 2 = ปานกลาง, 3 = สูง, 4 = สูงมาก
-- ---------------------------------------------------------------------
create table if not exists public.risk_reports (
  uid         text not null,
  month       smallint not null check (month between 0 and 11),
  level       smallint check (level between 0 and 4),
  situation   text,                                -- สถานการณ์ความเสี่ยงที่พบในเดือนนั้น
  action      text,                                -- มาตรการจัดการที่ดำเนินการไปแล้ว
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (uid, month)
);

create index if not exists risk_reports_uid_idx on public.risk_reports (uid);

-- ---------------------------------------------------------------------
-- trigger ประทับเวลา (ใช้ฟังก์ชัน stamp_row เดิม)
-- ---------------------------------------------------------------------
drop trigger if exists stamp_budget_entries on public.budget_entries;
create trigger stamp_budget_entries
  before insert or update on public.budget_entries
  for each row execute function public.stamp_row();

drop trigger if exists stamp_risk_reports on public.risk_reports;
create trigger stamp_risk_reports
  before insert or update on public.risk_reports
  for each row execute function public.stamp_row();

-- ---------------------------------------------------------------------
-- Row Level Security — เงื่อนไขเดียวกับตารางอื่น
-- ---------------------------------------------------------------------
alter table public.budget_entries enable row level security;
alter table public.risk_reports   enable row level security;

drop policy if exists budget_entries_read   on public.budget_entries;
drop policy if exists budget_entries_write  on public.budget_entries;
drop policy if exists budget_entries_update on public.budget_entries;
drop policy if exists budget_entries_delete on public.budget_entries;

create policy budget_entries_read   on public.budget_entries for select to authenticated using (true);
create policy budget_entries_write  on public.budget_entries for insert to authenticated with check (true);
create policy budget_entries_update on public.budget_entries for update to authenticated using (true) with check (true);
create policy budget_entries_delete on public.budget_entries for delete to authenticated using (true);

drop policy if exists risk_reports_read   on public.risk_reports;
drop policy if exists risk_reports_write  on public.risk_reports;
drop policy if exists risk_reports_update on public.risk_reports;
drop policy if exists risk_reports_delete on public.risk_reports;

create policy risk_reports_read   on public.risk_reports for select to authenticated using (true);
create policy risk_reports_write  on public.risk_reports for insert to authenticated with check (true);
create policy risk_reports_update on public.risk_reports for update to authenticated using (true) with check (true);
create policy risk_reports_delete on public.risk_reports for delete to authenticated using (true);


-- =====================================================================
-- สิทธิ์ระดับตาราง (GRANT) — เพิ่มเมื่อ 28 ส.ค. 2569
--
-- ทำไมต้องมี: Row Level Security กรอง "แถวไหนเห็นได้" ก็จริง
-- แต่ก่อนจะถึงชั้นนั้น Postgres ตรวจ "สิทธิ์ระดับตาราง" ก่อน
-- ถ้า role authenticated ไม่มีสิทธิ์ระดับตารางเลย จะได้ error
--     permission denied for table kpi_results
-- ซึ่งต่างจากกรณี RLS ไม่ผ่าน (กรณีนั้นจะได้ผลลัพธ์ว่าง 0 แถว ไม่ใช่ error)
--
-- ปกติ Supabase ตั้ง default privileges ให้ตารางที่สร้างใหม่ในสคีมา public
-- อัตโนมัติ แต่บางโปรเจกต์ไม่ได้ตั้งมา จึงต้องเขียนให้ชัดเจนตรงนี้
-- คำสั่ง grant รันซ้ำได้ ไม่มีผลข้างเคียง
--
-- ให้สิทธิ์เฉพาะ authenticated เท่านั้น — anon (ยังไม่ล็อกอิน) ไม่ได้อะไรเลย
-- =====================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.kpi_results      to authenticated;
grant select, insert, update, delete on public.project_results  to authenticated;
grant select, insert, update, delete on public.monthly_reports  to authenticated;
grant select, insert, update, delete on public.budget_entries   to authenticated;
grant select, insert, update, delete on public.risk_reports     to authenticated;

-- ตั้ง default privileges ไว้ด้วย เผื่อเพิ่มตารางใหม่ในอนาคตจะได้ไม่ติดปัญหาเดิมอีก
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
