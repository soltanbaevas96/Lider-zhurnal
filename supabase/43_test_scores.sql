-- =====================================================================
--  ЛИДЕР+ · Миграция №43: результаты тестирования (баллы) на уроке
--
--  lessons.has_test        — было ли на этом уроке тестирование
--  lessons.test_max_score  — максимум баллов за тест (один на весь урок)
--  attendance.score        — баллы конкретного ученика (может быть пустым,
--                            даже если has_test=true — не все сдавали)
--
--  Две новые RPC для просмотра результатов:
--   get_student_test_scores(p_student_id) — история тестов ученика
--   get_group_test_scores(p_group_id)     — все тесты группы, по ученикам
--
--  Права: без внутренней проверки роли, как и у остальных get_student_*/
--  get_*_analytics функций в этом проекте (доступ ограничивается на
--  уровне интерфейса, не RPC) — намеренно для единообразия с уже
--  существующими функциями чтения.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 42.
-- =====================================================================

alter table lessons add column if not exists has_test boolean not null default false;
alter table lessons add column if not exists test_max_score numeric;
alter table attendance add column if not exists score numeric;

-- ---------- История тестов ученика ----------
drop function if exists get_student_test_scores(uuid);
create function get_student_test_scores(p_student_id uuid)
returns table(
  lesson_id uuid, lesson_date date, group_name text, subject_name text,
  topic text, score numeric, max_score numeric, pct numeric
)
language sql
security definer
set search_path to 'public'
as $$
  select
    l.id, l.lesson_date, g.name, g.subject_name, l.topic,
    a.score, l.test_max_score,
    case when l.test_max_score > 0 and a.score is not null
      then round(a.score / l.test_max_score * 100)
      else null end
  from attendance a
  join lessons l on l.id = a.lesson_id
  left join groups g on g.id = l.group_id
  where a.student_id = p_student_id and l.has_test = true
  order by l.lesson_date desc;
$$;

-- ---------- Все тесты группы, с результатами по каждому ученику ----------
drop function if exists get_group_test_scores(uuid);
create function get_group_test_scores(p_group_id uuid)
returns table(
  lesson_id uuid, lesson_date date, topic text, max_score numeric,
  student_id uuid, student_name text, score numeric
)
language sql
security definer
set search_path to 'public'
as $$
  select l.id, l.lesson_date, l.topic, l.test_max_score, s.id, s.full_name, a.score
  from lessons l
  join attendance a on a.lesson_id = l.id
  join students s on s.id = a.student_id
  where l.group_id = p_group_id and l.has_test = true
  order by l.lesson_date desc, s.full_name;
$$;
