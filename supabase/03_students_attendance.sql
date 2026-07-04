-- =====================================================================
--  ЛИДЕР+ · Расширение №2: ученики, посещаемость, привязки, вход по логину
--  Выполнить ЦЕЛИКОМ в Supabase → SQL Editor ПОСЛЕ 01_schema.sql.
--  Безопасно выполнять на уже работающей базе (использует IF NOT EXISTS).
-- =====================================================================

-- ---------- ВХОД ПО ЛОГИНУ ----------
-- Логин хранится в profiles. Внутри Supabase Auth по-прежнему email вида
-- login@lider.local, но пользователь видит и вводит только логин.
alter table profiles add column if not exists username text unique;

-- ---------- ПРИВЯЗКА ГРУПП К ПРЕПОДАВАТЕЛЮ ----------
create table if not exists teacher_groups (
  teacher_id uuid not null references teachers(id) on delete cascade,
  group_id   uuid not null references groups(id) on delete cascade,
  primary key (teacher_id, group_id)
);

-- ---------- ПРИВЯЗКА ПРЕДМЕТОВ К ПРЕПОДАВАТЕЛЮ ----------
create table if not exists teacher_subjects (
  teacher_id uuid not null references teachers(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);

-- ---------- УЧЕНИКИ ----------
create table if not exists students (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  contact    text,                       -- телефон/родитель (необязательно)
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ученик может состоять в нескольких группах
create table if not exists student_groups (
  student_id uuid not null references students(id) on delete cascade,
  group_id   uuid not null references groups(id) on delete cascade,
  primary key (student_id, group_id)
);

-- ---------- ПОСЕЩАЕМОСТЬ ----------
-- На каждый урок × ученик — отметка «был / не был».
create table if not exists attendance (
  lesson_id  uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  present    boolean not null default true,
  primary key (lesson_id, student_id)
);

create index if not exists idx_attendance_student on attendance (student_id);
create index if not exists idx_student_groups_group on student_groups (group_id);
create index if not exists idx_teacher_groups_teacher on teacher_groups (teacher_id);

-- =====================================================================
--  RLS для новых таблиц
-- =====================================================================
alter table teacher_groups   enable row level security;
alter table teacher_subjects enable row level security;
alter table students         enable row level security;
alter table student_groups   enable row level security;
alter table attendance       enable row level security;

-- Привязки преподавателя: читают все авторизованные, меняет админ
drop policy if exists "tg read" on teacher_groups;
drop policy if exists "tg admin" on teacher_groups;
create policy "tg read"  on teacher_groups for select using (auth.role() = 'authenticated');
create policy "tg admin" on teacher_groups for all using (is_admin()) with check (is_admin());

drop policy if exists "ts read" on teacher_subjects;
drop policy if exists "ts admin" on teacher_subjects;
create policy "ts read"  on teacher_subjects for select using (auth.role() = 'authenticated');
create policy "ts admin" on teacher_subjects for all using (is_admin()) with check (is_admin());

-- Ученики и их группы: читают все авторизованные, меняет админ
drop policy if exists "students read" on students;
drop policy if exists "students admin" on students;
create policy "students read"  on students for select using (auth.role() = 'authenticated');
create policy "students admin" on students for all using (is_admin()) with check (is_admin());

drop policy if exists "sg read" on student_groups;
drop policy if exists "sg admin" on student_groups;
create policy "sg read"  on student_groups for select using (auth.role() = 'authenticated');
create policy "sg admin" on student_groups for all using (is_admin()) with check (is_admin());

-- Посещаемость: админ — всё; преподаватель — только для своих уроков
drop policy if exists "att admin" on attendance;
drop policy if exists "att teacher read" on attendance;
drop policy if exists "att teacher write" on attendance;
drop policy if exists "att teacher update" on attendance;
drop policy if exists "att teacher delete" on attendance;

create policy "att admin" on attendance
  for all using (is_admin()) with check (is_admin());

create policy "att teacher read" on attendance for select using (
  exists (select 1 from lessons l where l.id = attendance.lesson_id and l.teacher_id = my_teacher_id())
);
create policy "att teacher write" on attendance for insert with check (
  exists (select 1 from lessons l where l.id = attendance.lesson_id and l.teacher_id = my_teacher_id())
);
create policy "att teacher update" on attendance for update using (
  exists (select 1 from lessons l where l.id = attendance.lesson_id and l.teacher_id = my_teacher_id())
);
create policy "att teacher delete" on attendance for delete using (
  exists (select 1 from lessons l where l.id = attendance.lesson_id and l.teacher_id = my_teacher_id())
);

-- ---------- ВХОД ПО ЛОГИНУ: функция поиска email по логину ----------
-- Клиент отправляет логин, получает технический email для Supabase Auth.
create or replace function email_for_login(p_login text)
returns text language sql security definer set search_path = public as $$
  select u.email from auth.users u
  join profiles p on p.id = u.id
  where p.username = lower(p_login)
  limit 1;
$$;

grant execute on function email_for_login(text) to anon, authenticated;
