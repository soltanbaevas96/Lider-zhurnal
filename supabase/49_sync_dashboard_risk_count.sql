-- =====================================================================
--  ЛИДЕР+ · Миграция №49: синхронизация счётчика «в зоне риска»
--
--  Причина расхождения (Дашборд 40 vs вкладка «Риски» 30):
--  get_dashboard_kpi считал ВСЕХ учеников со статусом risk/attention.
--  Вкладка «Риски» (Risks.jsx) дополнительно скрывает тех, с кем уже
--  связались за последние 7 дней — это и есть «К отработке» (реально
--  требует действия прямо сейчас). Разница ровно = отработанные за
--  последнюю неделю.
--
--  Приводим дашборд к тому же определению, чтобы клик по плитке
--  «в зоне риска» вёл на вкладку «Риски» с ТЕМ ЖЕ числом.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 48.
-- =====================================================================

create or replace function get_dashboard_kpi(p_from date, p_to date)
returns table(
  attendance_pct integer, lessons_done integer, lessons_planned integer,
  lessons_missed integer, lessons_cancel integer, lesson_units integer,
  no_plan integer, students_active integer, students_risk integer,
  students_new integer, groups_active integer, groups_total integer,
  fill_pct integer, teachers_active integer, payroll_sum numeric
)
language sql
security definer
set search_path to 'public'
as $function$
  with les as (
    select l.*
    from lessons l
    where (p_from is null or l.lesson_date >= p_from)
      and (p_to   is null or l.lesson_date <= p_to)
  ),
  att as (
    select a.present
    from attendance a
    join les l on l.id = a.lesson_id
    where l.status = 'проведён'
  ),
  fill as (
    select
      coalesce(sum(g.capacity), 0)::int as cap,
      coalesce(sum(x.cnt), 0)::int      as filled
    from groups g
    left join (
      select sg.group_id, count(*)::int cnt
      from student_groups sg
      join students s on s.id = sg.student_id and s.archived = false
      group by sg.group_id
    ) x on x.group_id = g.id
    where g.archived = false
  )
  select
    coalesce((
      select round(count(*) filter (where present)::numeric * 100 / nullif(count(*), 0))::int
      from att
    ), 0),
    (select count(*) from les where status = 'проведён')::int,
    (select count(*) from les where status = 'planned' and lesson_date >= current_date)::int,
    (select count(*) from les where status = 'planned' and lesson_date <  current_date)::int,
    (select count(*) from les where status = 'отменён')::int,
    coalesce((select sum(lessons_count) from les where status = 'проведён'), 0)::int,
    (select count(*) from les where status = 'проведён' and plan_path is null)::int,
    (select count(*) from students where archived = false)::int,
    -- как на вкладке «Риски»: только те, с кем не связывались последние 7 дней
    (select count(*) from students
       where archived = false and status in ('risk','attention')
         and (last_contact_at is null or last_contact_at < now() - interval '7 days'))::int,
    (select count(*) from students
       where archived = false and enrolled_at is not null
         and (p_from is null or enrolled_at >= p_from)
         and (p_to   is null or enrolled_at <= p_to))::int,
    (select count(distinct group_id) from les where status = 'проведён')::int,
    (select count(*) from groups where archived = false)::int,
    (select case when cap > 0 then round(filled::numeric * 100 / cap)::int else 0 end from fill),
    (select count(distinct teacher_id) from les where status = 'проведён')::int,
    coalesce((
      select sum(l.lessons_count * coalesce(t.rate, 0))
      from les l join teachers t on t.id = l.teacher_id
      where l.status = 'проведён'
    ), 0);
$function$;
