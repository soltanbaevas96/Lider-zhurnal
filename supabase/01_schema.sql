-- =====================================================================
--  ЛИДЕР+ · Система учёта уроков — схема базы данных (Supabase / Postgres)
--  Выполнить в Supabase → SQL Editor целиком.
-- =====================================================================

-- ---------- РОЛИ ПОЛЬЗОВАТЕЛЕЙ ----------
-- teacher — преподаватель (видит только свои уроки)
-- admin   — завуч / администратор (видит всё, управляет справочниками)
create type user_role as enum ('teacher', 'admin');

-- ---------- ПРОФИЛИ (расширение auth.users) ----------
-- На каждого пользователя Supabase Auth создаётся строка в profiles.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        user_role not null default 'teacher',
  created_at  timestamptz not null default now()
);

-- ---------- СПРАВОЧНИКИ ----------
create table subjects (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique
);

create table groups (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  archived boolean not null default false
);

-- Преподаватель. Может быть связан с аккаунтом (profile) — тогда он входит в систему.
create table teachers (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references profiles(id) on delete set null,
  full_name   text not null,
  subject_id  uuid references subjects(id) on delete set null,
  phone       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Ассистенты — общий список на весь центр. Пока без входа (объект учёта).
create table assistants (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  phone      text,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- УРОКИ ----------
create table lessons (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references teachers(id) on delete cascade,
  group_id     uuid not null references groups(id) on delete restrict,
  assistant_id uuid references assistants(id) on delete set null,   -- может быть пустым
  lesson_date  date not null,
  start_time   time not null,
  end_time     time not null,
  topic        text not null,
  students     int not null default 0,
  status       text not null default 'проведён' check (status in ('проведён','отменён')),
  plan_path    text,                        -- путь к файлу плана в Storage (bucket lesson-plans)
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Отработанные часы урока (вычисляемое поле в минутах для удобных отчётов)
create or replace function lesson_minutes(l lessons)
returns int language sql immutable as $$
  select greatest(0, extract(epoch from (l.end_time - l.start_time)) / 60)::int;
$$;

create index on lessons (teacher_id);
create index on lessons (assistant_id);
create index on lessons (lesson_date);

-- ---------- АВТО-СОЗДАНИЕ ПРОФИЛЯ ПРИ РЕГИСТРАЦИИ ----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'teacher');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- ХЕЛПЕР: текущий пользователь — админ? ----------
create or replace function is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- ХЕЛПЕР: teacher_id, привязанный к текущему пользователю ----------
create or replace function my_teacher_id()
returns uuid language sql stable security definer as $$
  select id from teachers where profile_id = auth.uid() limit 1;
$$;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table profiles   enable row level security;
alter table subjects   enable row level security;
alter table groups     enable row level security;
alter table teachers   enable row level security;
alter table assistants enable row level security;
alter table lessons    enable row level security;

-- profiles: пользователь видит свой профиль; админ видит все
create policy "profiles self read"  on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles self update" on profiles for update using (id = auth.uid());

-- Справочники: читают все авторизованные, меняет только админ
create policy "subjects read"  on subjects for select using (auth.role() = 'authenticated');
create policy "subjects admin" on subjects for all using (is_admin()) with check (is_admin());

create policy "groups read"  on groups for select using (auth.role() = 'authenticated');
create policy "groups admin" on groups for all using (is_admin()) with check (is_admin());

create policy "teachers read"  on teachers for select using (auth.role() = 'authenticated');
create policy "teachers admin" on teachers for all using (is_admin()) with check (is_admin());

create policy "assistants read"  on assistants for select using (auth.role() = 'authenticated');
create policy "assistants admin" on assistants for all using (is_admin()) with check (is_admin());

-- lessons: админ — всё; преподаватель — только свои уроки
create policy "lessons admin all" on lessons
  for all using (is_admin()) with check (is_admin());

create policy "lessons teacher read" on lessons
  for select using (teacher_id = my_teacher_id());

create policy "lessons teacher insert" on lessons
  for insert with check (teacher_id = my_teacher_id());

create policy "lessons teacher update" on lessons
  for update using (teacher_id = my_teacher_id()) with check (teacher_id = my_teacher_id());

create policy "lessons teacher delete" on lessons
  for delete using (teacher_id = my_teacher_id());

-- =====================================================================
--  STORAGE: bucket для файлов планов уроков
-- =====================================================================
insert into storage.buckets (id, name, public) values ('lesson-plans','lesson-plans', false)
  on conflict (id) do nothing;

create policy "plans read authed" on storage.objects
  for select using (bucket_id = 'lesson-plans' and auth.role() = 'authenticated');
create policy "plans write authed" on storage.objects
  for insert with check (bucket_id = 'lesson-plans' and auth.role() = 'authenticated');
create policy "plans update authed" on storage.objects
  for update using (bucket_id = 'lesson-plans' and auth.role() = 'authenticated');
