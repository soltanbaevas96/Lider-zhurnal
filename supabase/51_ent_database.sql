-- =====================================================================
--  ЛИДЕР+ · Миграция №51: «База учеников / ЕНТ»
--
--  НИЧЕГО не дублирует существующие сущности:
--  - Ученики — та же таблица students (office/lang/school уже есть).
--  - Офисы/языки — те же 3 офиса и 2 языка, что и везде в проекте
--    (жёстко заданы константой OFFICES в utils.js — так уже сделано
--    для всего приложения, отдельного справочника офисов в БД нет).
--  - Предметы — тот же справочник subjects (id, name), что и у
--    преподавателей/групп. Профильный предмет 1/2 — просто ссылка на
--    ту же таблицу, добавленная у ученика.
--  - Школа — то же текстовое поле students.school, что и было.
--    Отдельного справочника школ не создаём (это не отдельная
--    сущность со своими связями, а просто подсказки в интерфейсе по
--    уже введённым значениям — задваивания это не создаёт).
--
--  Новое — только:
--  1) students.profile_subject_1_id / profile_subject_2_id (ссылки на
--     subjects) — профильные предметы ЕНТ конкретного ученика.
--  2) Таблица ent_attempts — попытки пробного ЕНТ. Название предмета
--     сохраняется В КАЖДОЙ попытке отдельно (subject1_name/2_name),
--     поэтому смена профиля ученика не портит историю старых попыток.
--  3) Итоговый балл — generated column (нельзя ввести вручную,
--     считается Postgres'ом всегда правильно).
--
--  Права: читать может любой авторизованный (как и саму students —
--  так уже устроено во всём проекте), редактировать — только завуч
--  (is_admin()), как и остальные справочники/карточки учеников через
--  «Управление». Учитель никакого нового доступа к ученикам не
--  получает — вкладка вообще не показывается ему на фронтенде.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 50.
-- =====================================================================

-- ---------- 1. Профильные предметы ученика ----------
alter table students add column if not exists profile_subject_1_id uuid references subjects(id) on delete set null;
alter table students add column if not exists profile_subject_2_id uuid references subjects(id) on delete set null;

-- ---------- 2. Попытки пробного ЕНТ ----------
create table if not exists ent_attempts (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references students(id) on delete cascade,
  attempt_date        date not null default current_date,

  history_kz_score    numeric not null check (history_kz_score >= 0 and history_kz_score <= 20),
  reading_score       numeric not null check (reading_score    >= 0 and reading_score    <= 10),
  math_literacy_score numeric not null check (math_literacy_score >= 0 and math_literacy_score <= 10),

  -- ссылка на текущий справочник (для будущей аналитики по предметам) +
  -- снимок названия на момент попытки (чтобы смена профиля ученика
  -- не меняла задним числом уже сданные результаты)
  subject1_id    uuid references subjects(id) on delete set null,
  subject1_name  text not null,
  subject1_score numeric not null check (subject1_score >= 0 and subject1_score <= 50),

  subject2_id    uuid references subjects(id) on delete set null,
  subject2_name  text not null,
  subject2_score numeric not null check (subject2_score >= 0 and subject2_score <= 50),

  -- считается всегда сервером — вручную поле не редактируется никогда
  total_score numeric generated always as (
    history_kz_score + reading_score + math_literacy_score + subject1_score + subject2_score
  ) stored,

  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ent_attempts_student on ent_attempts (student_id);

-- ---------- 3. RLS ----------
alter table ent_attempts enable row level security;

drop policy if exists "ent read" on ent_attempts;
create policy "ent read" on ent_attempts for select using (auth.role() = 'authenticated');

drop policy if exists "ent admin write" on ent_attempts;
create policy "ent admin write" on ent_attempts for all
  using (is_admin()) with check (is_admin());

-- students.profile_subject_1_id/2_id новых политик не требуют — это
-- обычные колонки существующей таблицы students, они уже защищены
-- действующими политиками "students admin" / "students om write".
