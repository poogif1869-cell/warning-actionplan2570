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


-- =====================================================================
-- เพิ่มเมื่อ 29 ส.ค. 2569 — สถานะ "บันทึกแล้ว" ของรายการงบประมาณ
--
-- รายการที่กดบันทึกแล้วจะถูกล็อก แก้ไม่ได้จนกว่าจะกดปุ่มแก้ไข
-- ป้องกันการเผลอแก้ตัวเลขที่รายงานไปแล้ว
--
-- ใช้ add column if not exists จึงรันซ้ำได้ ข้อมูลเดิมไม่หาย
-- แถวเก่าที่มีอยู่แล้วจะได้ค่า true (ถือว่ารายงานไปแล้ว) ตามที่ตกลงไว้
-- =====================================================================

-- เพิ่มคอลัมน์ด้วย default true ก่อน เพื่อให้แถวที่มีอยู่แล้วได้ค่า true
-- (ถือว่ารายงานเสร็จไปแล้ว จึงล็อกไว้)
alter table public.budget_entries
  add column if not exists saved boolean not null default true;

-- แล้วเปลี่ยน default เป็น false เพื่อให้แถวที่เพิ่มใหม่เริ่มต้นแบบยังแก้ได้
-- ทำสองขั้นแบบนี้เพราะรันไฟล์ซ้ำแล้วต้องไม่ไปล็อกรายการที่ใครกำลังกรอกค้างอยู่
-- (ถ้าใช้ update ... set saved = true จะพังตรงนี้)
alter table public.budget_entries
  alter column saved set default false;

-- บอก PostgREST ให้โหลดโครงสร้างตารางใหม่ทันที
-- ไม่งั้นเว็บจะยังขึ้น "Could not find the ... column in the schema cache"
-- อยู่อีกพักหนึ่งกว่าจะรีเฟรชเอง
notify pgrst, 'reload schema';


-- =====================================================================
-- เพิ่มเมื่อ 1 ก.ย. 2569 — ปัญหาอุปสรรคและวิธีแก้ ในรายงานผลรายเดือน
--
-- เดิมรายงานรายเดือนมีแค่ผลผลิต/ผลลัพธ์/เบิกจ่าย
-- เพิ่มสองช่องนี้เพื่อให้บันทึกได้ว่าเดือนนั้นติดปัญหาอะไรและแก้ยังไง
-- ซึ่งเป็นข้อมูลที่ใช้ตอบเวลาผู้บริหารถามว่าทำไมไม่เป็นไปตามเป้า
-- =====================================================================

alter table public.monthly_reports
  add column if not exists issue text;      -- ปัญหาอุปสรรคที่พบในเดือนนั้น

alter table public.monthly_reports
  add column if not exists solution text;   -- วิธีการแก้ปัญหาที่ดำเนินการ

-- ให้ PostgREST เห็นคอลัมน์ใหม่ทันที ไม่ต้องรอ cache หมดอายุ
notify pgrst, 'reload schema';


-- =====================================================================
-- เพิ่มเมื่อ 1 ก.ย. 2569 — รายงานผลรายตัวชี้วัด (ไม่ใช่รายเดือน)
--
-- แยกจาก monthly_reports เพราะเป็นคนละอย่าง:
--   monthly_reports  = ผลของแต่ละเดือน (12 แถวต่อรายการ)
--   คอลัมน์ชุดนี้    = สรุปผลของตัวชี้วัดทั้งปี 1 ชุดต่อรายการ
--
-- ตัวชี้วัดผลผลิต (output) กับผลลัพธ์ (outcome) มีช่องรายงานผลและ
-- ปัญหาอุปสรรคแยกกัน เพราะสองตัวนี้ติดปัญหาคนละเรื่องกันได้
--
-- กิจกรรมย่อยใช้เฉพาะคู่ output_* เพราะผลลัพธ์เป็นตัวชี้วัดระดับโครงการ
-- =====================================================================

alter table public.project_results
  add column if not exists output_result text;    -- ผลที่รายงานของตัวชี้วัดผลผลิต

alter table public.project_results
  add column if not exists output_issue text;     -- ปัญหาอุปสรรคของผลผลิต

alter table public.project_results
  add column if not exists outcome_result text;   -- ผลที่รายงานของตัวชี้วัดผลลัพธ์

alter table public.project_results
  add column if not exists outcome_issue text;    -- ปัญหาอุปสรรคของผลลัพธ์

notify pgrst, 'reload schema';


-- =====================================================================
-- เพิ่มเมื่อ 4 ก.ย. — บทบาทผู้ใช้ และการแสดงว่าใครแก้ไขล่าสุด
--
-- ปัญหาที่แก้: เดิมทุกคนที่ล็อกอินแก้ได้ทุกอย่าง (RLS เป็น using(true) ล้วน)
-- ข้อมูลเป็นของใช้ร่วมกันทั้งองค์กร จึงต้องแยกว่าใครกรอกได้ ใครดูอย่างเดียว
--
-- ⚠️ **การซ่อนปุ่มในหน้าเว็บไม่ใช่ความปลอดภัย** anon key เป็นของสาธารณะ
-- โดยการออกแบบ ใครก็ยิง API ตรงได้ ด่านจริงมีแค่ RLS ในไฟล์นี้เท่านั้น
-- หน้าเว็บซ่อนปุ่มเพื่อ "ไม่ให้กดแล้วเจอ error" ไม่ใช่เพื่อกันคน
-- =====================================================================

-- ---------------------------------------------------------------------
-- ทะเบียนผู้ใช้ฝั่งที่เว็บอ่านได้
--
-- ตาราง auth.users ของ Supabase **อ่านจากฝั่งเว็บด้วย anon key ไม่ได้**
-- ถ้าจะแสดงว่า "แก้ไขล่าสุดโดยใคร" จึงต้องมีสำเนาชื่อ/อีเมลไว้ใน public
-- ตารางนี้จึงรับสองหน้าที่พร้อมกัน: บอกชื่อคน และเก็บบทบาท
--
-- คอลัมน์ org เตรียมไว้เผื่ออนาคตที่จะจำกัดสิทธิ์ตามหน่วยงาน ยังไม่ได้ใช้
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,                                -- ชื่อที่อยากให้คนอื่นเห็น
  role        text not null default 'viewer'
              check (role in ('viewer', 'editor', 'admin')),
  org         text,                                -- เผื่อไว้สำหรับจำกัดตามหน่วยงาน
  updated_at  timestamptz not null default now()
);

-- สร้างโปรไฟล์ให้อัตโนมัติทุกครั้งที่เพิ่มผู้ใช้ใน Supabase Dashboard
-- ผู้ใช้ใหม่เป็น viewer เสมอ ต้องมาเปิดสิทธิ์ให้ทีหลัง
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- เติมโปรไฟล์ให้ผู้ใช้ที่มีอยู่แล้ว
--
-- ⚠️ คนที่มีบัญชีอยู่ก่อนหน้านี้ตั้งเป็น **admin** โดยตั้งใจ
-- เพราะเดิมทุกคนแก้ได้ทุกอย่างอยู่แล้ว ถ้าตั้งเป็น viewer หมด
-- จะไม่เหลือใครแก้อะไรได้เลยแม้แต่คนที่รันสคริปต์นี้ — ระบบล็อกตัวเอง
--
-- หลังรันเสร็จให้ไปลดสิทธิ์คนที่ควรเป็นผู้ดูอย่างเดียวเอง (ดูคำสั่งท้ายไฟล์)
-- ส่วนผู้ใช้ที่สร้าง**หลังจากนี้**จะเป็น viewer อัตโนมัติ
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, role)
select id, email, 'admin' from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- ตัวช่วยอ่านบทบาท
--
-- ต้องเป็น security definer เพื่อ **ข้าม RLS ของ profiles เอง**
-- ไม่งั้น policy ของ profiles ที่เรียกฟังก์ชันนี้จะวนไม่รู้จบ
-- (policy → ฟังก์ชัน → select profiles → policy → ...)
--
-- stable บอก Postgres ว่าผลลัพธ์ไม่เปลี่ยนภายในคำสั่งเดียว
-- จะได้เรียกครั้งเดียวต่อคำสั่ง ไม่ใช่ทุกแถว
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer');
$$;

create or replace function public.can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() in ('editor', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() = 'admin';
$$;

-- ---------------------------------------------------------------------
-- RLS ของ profiles
--
-- อ่านได้ทุกคนที่ล็อกอิน เพราะต้องเอาชื่อไปแสดงว่า "แก้ไขล่าสุดโดยใคร"
-- ทุกคนในระบบเป็นเพื่อนร่วมงานกันอยู่แล้ว อีเมลจึงไม่ใช่ความลับ
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated using (true);

-- แก้ชื่อตัวเองได้ แต่ **เปลี่ยนบทบาทตัวเองไม่ได้** (with check บังคับให้ role เท่าเดิม)
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());

-- ผู้ดูแลเปลี่ยนบทบาทคนอื่นได้
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- เปลี่ยน RLS ของตารางข้อมูลทั้ง 5 ตาราง
--
-- อ่าน: ทุกคนที่ล็อกอิน — ข้อมูลแผนเป็นของใช้ร่วมกัน ทุกคนควรเห็นภาพรวม
-- เขียน/ลบ: เฉพาะ editor กับ admin
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'kpi_results', 'project_results', 'monthly_reports',
    'budget_entries', 'risk_reports'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_edit())',
      t || '_write', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_edit()) with check (public.can_edit())',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_edit())',
      t || '_delete', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- =====================================================================
-- คำสั่งที่ผู้ดูแลใช้บ่อย — คัดลอกไปรันทีละบรรทัดตามต้องการ
-- =====================================================================
--
-- ดูว่าตอนนี้ใครมีบทบาทอะไร:
--     select email, role from public.profiles order by role, email;
--
-- ตั้งให้คนหนึ่งเป็นผู้กรอกข้อมูล:
--     update public.profiles set role = 'editor' where email = 'someone@example.com';
--
-- ลดเหลือผู้ดูอย่างเดียว:
--     update public.profiles set role = 'viewer' where email = 'someone@example.com';
--
-- ตั้งผู้ดูแล (เปลี่ยนบทบาทคนอื่นได้):
--     update public.profiles set role = 'admin'  where email = 'someone@example.com';
--
-- ⚠️ ต้องเหลือ admin อย่างน้อยหนึ่งคนเสมอ ไม่งั้นจะไม่มีใครแก้บทบาทได้อีก
--    ต้องกลับมาแก้ผ่าน SQL Editor แบบนี้เท่านั้น


-- =====================================================================
-- เพิ่มเมื่อ 4 ก.ย. — หมวดค่าใช้จ่าย "อื่น ๆ" ในรายการงบประมาณ
--
-- ถังรวมของค่าใช้จ่ายที่ไม่เข้าสี่หมวดแรก เช่น ค่าอาหาร ค่าลงทะเบียน
-- ค่าวิทยากร ค่าอุปกรณ์ ค่าปัจจัยการผลิต
--
-- ไม่แตกเป็นหมวดละคอลัมน์ เพราะรายการพวกนี้ไม่ได้มีทุกโครงการ
-- แตกไปก็จะเป็นตารางที่ว่างเป็นส่วนใหญ่ ให้เขียนว่าเป็นค่าอะไรในช่อง note แทน
-- =====================================================================

alter table public.budget_entries
  add column if not exists other numeric not null default 0;

notify pgrst, 'reload schema';


-- =====================================================================
-- เพิ่มเมื่อ 4 ก.ย. — ส่วนงาน/หน่วยงานที่เป็นเจ้าของค่าใช้จ่ายแต่ละรายการ
--
-- เหตุผล: หนึ่งกิจกรรมมีหลายส่วนงานมาใช้งบประมาณร่วมกัน
-- ถ้าไม่ระบุไว้ที่ระดับ "รายการ" จะแยกไม่ได้ว่าเงินก้อนไหนของใคร
-- (คอลัมน์หน่วยงานในไฟล์แผนเป็นของทั้งโครงการ ไม่ใช่ของรายจ่ายแต่ละครั้ง)
--
-- เก็บเป็นข้อความอิสระ ไม่ใช่ foreign key ไปตารางหน่วยงาน
-- เพราะรายชื่อหน่วยงานอยู่ในไฟล์แผน (data/plan-data.json) ไม่ได้อยู่ในฐานข้อมูล
-- และชื่อหน่วยงานในไฟล์ต้นฉบับพิมพ์ไม่สม่ำเสมออยู่แล้ว (ฝพก. กับ ฝพก)
-- =====================================================================

alter table public.budget_entries
  add column if not exists org text;

create index if not exists budget_entries_org_idx on public.budget_entries (org);

notify pgrst, 'reload schema';


-- =====================================================================
-- เพิ่มเมื่อ 4 ก.ย. — การ "ส่งข้อมูลงบประมาณ" ของแต่ละโครงการในแต่ละเดือน
--
-- ต่างจาก budget_entries.saved ที่มีอยู่แล้ว อย่าสับสนกัน:
--
--   budget_entries.saved   ล็อก **รายการเดียว** ที่กรอกเสร็จแล้ว
--                          กันหน่วยงานอื่นมาแก้ตัวเลขที่ลงไว้
--                          ปลดล็อกเองได้ทันทีด้วยปุ่ม "แก้ไข" ที่แถวนั้น
--
--   budget_submissions     ปิด **ทั้งเดือน** ของโครงการนั้น = ส่งข้อมูลแล้ว
--                          เพิ่มรายการใหม่ไม่ได้ ต้องกด "แก้ไขงบประมาณ" ก่อน
--                          และเป็นเงื่อนไขว่าจะรายงานผลโครงการได้หรือยัง
--
-- ลำดับการทำงานที่ออกแบบไว้:
--   กรอกรายการ -> บันทึกรายการ (ล็อกทีละแถว) -> ส่งข้อมูลงบประมาณ (ปิดทั้งเดือน)
--   -> ถึงจะรายงานผลโครงการของเดือนนั้นได้
-- =====================================================================

create table if not exists public.budget_submissions (
  uid         text not null,
  month       smallint not null check (month between 0 and 11),
  submitted   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (uid, month)
);

create index if not exists budget_submissions_uid_idx on public.budget_submissions (uid);

drop trigger if exists stamp_budget_submissions on public.budget_submissions;
create trigger stamp_budget_submissions
  before insert or update on public.budget_submissions
  for each row execute function public.stamp_row();

alter table public.budget_submissions enable row level security;

drop policy if exists budget_submissions_read   on public.budget_submissions;
drop policy if exists budget_submissions_write  on public.budget_submissions;
drop policy if exists budget_submissions_update on public.budget_submissions;
drop policy if exists budget_submissions_delete on public.budget_submissions;

create policy budget_submissions_read on public.budget_submissions
  for select to authenticated using (true);
create policy budget_submissions_write on public.budget_submissions
  for insert to authenticated with check (public.can_edit());
create policy budget_submissions_update on public.budget_submissions
  for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy budget_submissions_delete on public.budget_submissions
  for delete to authenticated using (public.can_edit());

grant select, insert, update, delete on public.budget_submissions to authenticated;

notify pgrst, 'reload schema';


-- =====================================================================
-- เพิ่มเมื่อ 4 ก.ย. — ถังการแก้ไขข้อมูล (plan_edits)
--
-- แผนปฏิบัติการทั้งฉบับฝังมากับโค้ดเป็นไฟล์ data/plan-data.json
-- ตารางนี้จึงไม่ได้เก็บ "แผน" แต่เก็บ **สิ่งที่เปลี่ยนไปจากแผนฉบับนั้น**
-- แล้วเว็บเอามาทับตอนโหลด (ดู applyPlanEdits ใน lib/plan.js)
--
-- ข้อดีของการเก็บเป็นรายการเปลี่ยนแปลง ไม่ใช่เก็บแผนทั้งก้อน:
--   1. ไฟล์แผนต้นฉบับยังเทียบยอดได้อยู่เสมอ (reconcile ใช้ของเดิม)
--   2. ได้ประวัติว่าใครแก้อะไรเมื่อไหร่ฟรี ๆ เพราะทุกแถวคือการแก้หนึ่งครั้ง
--   3. งบเดิมกับงบใหม่อยู่ในแถวเดียวกัน (prev / data) เอาไปเทียบได้ทันที
--
-- kind:
--   add       เพิ่มโครงการ/กิจกรรมใหม่   data = ทั้งรายการ
--   delete    ลบโครงการ/กิจกรรม          prev = รายการที่ถูกลบ
--   budget    แก้งบที่ได้รับจัดสรร        prev.budget / data.budget
--   kpi       แก้ตัวชี้วัด                prev/data = output outcome kpi
--   schedule  แก้แผน/ระยะเวลาดำเนินงาน    prev/data = months period
--
-- status:
--   draft     บันทึกไว้เฉย ๆ **ไม่ถูกนำไปคิดในแดชบอร์ด**
--   approved  อนุมัติแล้ว มีผลกับทุกหน้าจริง
--
-- res_no / res_date  = มติ คกก.กยท. ครั้งที่ / เมื่อวันที่
-- doc_no / doc_date  = เลขหนังสือที่แจ้ง ฝยศ. / ลงวันที่
-- สี่ช่องนี้บังคับกรอกให้ครบตอนอนุมัติ ตรวจซ้ำที่ฐานข้อมูลด้วย (constraint
-- ด้านล่าง) ไม่ใช่ตรวจแค่ในหน้าเว็บ เพราะการซ่อนปุ่มไม่ใช่การป้องกัน
-- =====================================================================

create table if not exists public.plan_edits (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('add','delete','budget','kpi','schedule')),
  uid         text not null,
  status      text not null default 'draft' check (status in ('draft','approved')),
  data        jsonb not null default '{}'::jsonb,
  prev        jsonb not null default '{}'::jsonb,
  res_no      text,
  res_date    text,
  doc_no      text,
  doc_date    text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create index if not exists plan_edits_uid_idx    on public.plan_edits (uid);
create index if not exists plan_edits_status_idx on public.plan_edits (status);
create index if not exists plan_edits_kind_idx   on public.plan_edits (kind);

-- เพิ่ม/ลบ ที่อนุมัติแล้ว ต้องมีมติและหนังสือแจ้งครบทั้งสี่ช่อง
-- ส่วน budget/kpi/schedule แก้ได้เลยตามที่ตกลงไว้ แต่ยังถูกบันทึกลงถังทุกครั้ง
alter table public.plan_edits
  drop constraint if exists plan_edits_approval_required;
alter table public.plan_edits
  add constraint plan_edits_approval_required check (
    status <> 'approved'
    or kind not in ('add','delete','kpi')
    or (
      coalesce(btrim(res_no),   '') <> ''
      and coalesce(btrim(res_date), '') <> ''
      and coalesce(btrim(doc_no),   '') <> ''
      and coalesce(btrim(doc_date), '') <> ''
    )
  );

drop trigger if exists stamp_plan_edits on public.plan_edits;
create trigger stamp_plan_edits
  before insert or update on public.plan_edits
  for each row execute function public.stamp_row();

alter table public.plan_edits enable row level security;

drop policy if exists plan_edits_read   on public.plan_edits;
drop policy if exists plan_edits_write  on public.plan_edits;
drop policy if exists plan_edits_update on public.plan_edits;
drop policy if exists plan_edits_delete on public.plan_edits;

-- อ่านได้ทุกคน — ถังการแก้ไขคือประวัติที่ทุกคนควรตรวจสอบได้
create policy plan_edits_read on public.plan_edits
  for select to authenticated using (true);
create policy plan_edits_write on public.plan_edits
  for insert to authenticated with check (public.can_edit());
create policy plan_edits_update on public.plan_edits
  for update to authenticated using (public.can_edit()) with check (public.can_edit());
-- ลบแถวในถังได้เฉพาะผู้ดูแล เพราะถังนี้คือหลักฐานว่าใครแก้อะไร
-- ถ้าคนกรอกลบประวัติตัวเองได้ ถังก็ไม่มีประโยชน์
create policy plan_edits_delete on public.plan_edits
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.plan_edits to authenticated;

notify pgrst, 'reload schema';
