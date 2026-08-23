-- =====================================================================
--  ЛИДЕР+ · Миграция №44: исправление посещаемости на дашборде и рисков
--
--  ПРИЧИНА (найдена в коде, подтверждена диагностикой):
--  Форма урока в журнале (LessonForm → saveAttendance) никогда не
--  записывала колонку attendance.status — только present/absence_reason.
--  Функции дашборда и recalc_risk_flags считали посещаемость через
--  coalesce(a.status,'present'), поэтому при пустом status ВСЕГДА
--  получали 'present', даже если present = false (реальный пропуск).
--  Отсюда: посещаемость почти всегда ~100% (иногда даже >100% —
--  из-за LEFT JOIN на уроки без единой отметки), а recalc_risk_flags
--  никогда не видел серий пропусков → список рисков всегда пуст.
--
--  ДАННЫЕ НЕ ПОВРЕЖДЕНЫ: поле attendance.present писалось верно
--  всегда (обоими путями сохранения). Бэкафилл не нужен — правим
--  только сами функции, чтобы читать present вместо status.
--
--  Не затронуты (уже были написаны правильно, через present):
--  get_dashboard_reasons, get_groups_analytics, get_teachers_analytics,
--  get_subjects_analytics, get_student_calendar, get_student_groups,
--  get_student_summary.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 43.
-- =====================================================================

-- ---------- 1. get_dashboard_kpi ----------
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
    (select count(*) from students where archived = false and status in ('risk','attention'))::int,
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

-- ---------- 2. get_dashboard_by_office ----------
create or replace function get_dashboard_by_office(p_from date, p_to date)
returns table(office text, lang text, lessons integer, total integer, present integer, pct integer)
language sql
security definer
set search_path to 'public'
as $function$
  select
    coalesce(g.office, '—'),
    coalesce(g.lang, '—'),
    count(distinct l.id)::int,
    count(a.lesson_id)::int,
    count(*) filter (where a.present)::int,
    case when count(a.lesson_id) > 0
      then round(count(*) filter (where a.present)::numeric * 100 / count(a.lesson_id))::int
      else 0 end
  from lessons l
  join groups g on g.id = l.group_id
  left join attendance a on a.lesson_id = l.id
  where l.status = 'проведён'
    and (p_from is null or l.lesson_date >= p_from)
    and (p_to   is null or l.lesson_date <= p_to)
  group by g.office, g.lang
  having count(a.lesson_id) > 0
  order by g.office, g.lang;
$function$;

-- ---------- 3. get_dashboard_by_subject ----------
create or replace function get_dashboard_by_subject(p_from date, p_to date)
returns table(subject_name text, lessons integer, students integer, pct integer)
language sql
security definer
set search_path to 'public'
as $function$
  select
    coalesce(split_part(g.subject_name, ' / ', 1), '—'),
    count(distinct l.id)::int,
    count(distinct a.student_id)::int,
    case when count(a.lesson_id) > 0
      then round(count(*) filter (where a.present)::numeric * 100 / count(a.lesson_id))::int
      else 0 end
  from lessons l
  join groups g on g.id = l.group_id
  left join attendance a on a.lesson_id = l.id
  where l.status = 'проведён'
    and (p_from is null or l.lesson_date >= p_from)
    and (p_to   is null or l.lesson_date <= p_to)
  group by split_part(g.subject_name, ' / ', 1)
  having count(a.lesson_id) > 0
  order by 4 asc;
$function$;

-- ---------- 4. get_dashboard_weeks ----------
create or replace function get_dashboard_weeks(p_weeks integer default 12)
returns table(week_start date, lessons integer, pct integer)
language sql
security definer
set search_path to 'public'
as $function$
  select
    date_trunc('week', l.lesson_date)::date,
    count(distinct l.id)::int,
    case when count(a.lesson_id) > 0
      then round(count(*) filter (where a.present)::numeric * 100 / count(a.lesson_id))::int
      else 0 end
  from lessons l
  left join attendance a on a.lesson_id = l.id
  where l.status = 'проведён'
    and l.lesson_date >= current_date - (p_weeks * 7)
  group by date_trunc('week', l.lesson_date)
  order by 1;
$function$;

-- ---------- 5. get_dashboard_worst_teachers ----------
create or replace function get_dashboard_worst_teachers(p_from date, p_to date, p_limit integer default 5)
returns table(teacher_id uuid, teacher_name text, lessons integer, pct integer, no_plan integer)
language sql
security definer
set search_path to 'public'
as $function$
  select
    t.id, t.full_name,
    count(distinct l.id)::int,
    case when count(a.lesson_id) > 0
      then round(count(*) filter (where a.present)::numeric * 100 / count(a.lesson_id))::int
      else 0 end,
    count(distinct l.id) filter (where l.plan_path is null)::int
  from lessons l
  join teachers t on t.id = l.teacher_id
  left join attendance a on a.lesson_id = l.id
  where l.status = 'проведён'
    and (p_from is null or l.lesson_date >= p_from)
    and (p_to   is null or l.lesson_date <= p_to)
  group by t.id, t.full_name
  having count(a.lesson_id) > 0
  order by 4 asc
  limit p_limit;
$function$;

-- ---------- 6. recalc_risk_flags ----------
create or replace function recalc_risk_flags()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  rr record;
  v_streak int;
  v_pct30 int;
  v_days_since int;
  v_status text;
  v_reason text;
  v_count int := 0;
begin
  for s in select id from students where coalesce(archived, false) = false loop
    v_status := 'active';
    v_reason := null;

    -- серия пропусков подряд с последнего занятия назад
    v_streak := 0;
    for rr in
      select coalesce(a.present, true) as was_present
      from student_groups sg
      join lessons l on l.group_id = sg.group_id
      left join attendance a on a.lesson_id = l.id and a.student_id = s.id
      where sg.student_id = s.id and l.status = 'проведён'
      order by l.lesson_date desc
      limit 30
    loop
      exit when rr.was_present;
      v_streak := v_streak + 1;
    end loop;

    -- посещаемость за 30 дней
    select case when count(l.id) > 0
      then round(count(*) filter (where coalesce(a.present, true))::numeric * 100 / count(l.id))::int
      else null end
    into v_pct30
    from student_groups sg
    join lessons l on l.group_id = sg.group_id
    left join attendance a on a.lesson_id = l.id and a.student_id = s.id
    where sg.student_id = s.id and l.status = 'проведён'
      and l.lesson_date >= current_date - interval '30 days';

    -- дней с последнего занятия
    select coalesce(current_date - max(l.lesson_date), 9999)
    into v_days_since
    from student_groups sg
    join lessons l on l.group_id = sg.group_id
    where sg.student_id = s.id and l.status = 'проведён';

    if v_streak >= 4 then
      v_status := 'risk'; v_reason := v_streak || ' пропуска подряд';
    elsif v_pct30 is not null and v_pct30 < 60 then
      v_status := 'risk'; v_reason := 'посещаемость ' || v_pct30 || '% за 30 дней';
    elsif v_days_since > 14 and v_days_since < 9999 then
      v_status := 'risk'; v_reason := 'нет занятий ' || v_days_since || ' дней';
    elsif v_streak = 3 then
      v_status := 'attention'; v_reason := '3 пропуска подряд';
    end if;

    update students
    set status = v_status, risk_reason = v_reason, risk_updated_at = now()
    where id = s.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- ---------- 7. Сразу пересчитать флаги риска по исправленной логике ----------
select recalc_risk_flags();
