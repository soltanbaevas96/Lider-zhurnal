-- =====================================================================
--  ЛИДЕР+ · Миграция №41: «Закрыть месяц» для кураторов
--
--  Сейчас close_payroll/payroll_rows/get_payroll работают ТОЛЬКО с
--  преподавателями (проверено на проде). get_curator_payroll всегда
--  считает вживую и не знает о закрытии месяца вообще.
--
--  Решение: отдельная таблица curator_payroll_rows, привязанная к тому
--  же payroll_periods.id (закрытие месяца — одно на весь центр, как и
--  раньше, просто теперь фиксирует ещё и кураторов). close_payroll
--  дополняется одним доп. INSERT (существующая логика по преподавателям
--  не меняется ни на строку). reopen_payroll трогать не нужно — при
--  удалении payroll_periods куратор-строки уйдут каскадом сами.
--  get_curator_payroll становится «умным», как get_payroll: если месяц
--  закрыт — отдаёт зафиксированные цифры, иначе считает вживую.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 40.
-- =====================================================================

-- ---------- 1. Таблица снимков зарплаты кураторов ----------
create table if not exists curator_payroll_rows (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references payroll_periods(id) on delete cascade,
  curator_id uuid not null references curators(id),
  curator_name text not null,
  subject text,
  rate numeric not null default 0,
  lesson_units int not null default 0,
  sessions int not null default 0,
  total numeric not null default 0
);

alter table curator_payroll_rows enable row level security;
drop policy if exists "curator_payroll_rows admin" on curator_payroll_rows;
create policy "curator_payroll_rows admin" on curator_payroll_rows
  for all using (is_admin()) with check (is_admin());

-- ---------- 2. close_payroll: тот же текст + один доп. INSERT ----------
create or replace function close_payroll(p_month text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_period_id uuid;
  v_count int := 0;
  v_sum numeric := 0;
  v_units int := 0;
begin
  if not is_admin() then
    raise exception 'Только завуч может закрывать период';
  end if;

  if exists (select 1 from payroll_periods where month = p_month) then
    raise exception 'Месяц % уже закрыт', p_month;
  end if;

  insert into payroll_periods(month, closed_by)
  values (p_month, auth.uid())
  returning id into v_period_id;

  -- фиксируем преподавателей (без изменений от исходной версии)
  insert into payroll_rows(period_id, teacher_id, teacher_name, rate, lesson_units, sessions, total)
  select
    v_period_id,
    t.id,
    t.full_name,
    coalesce(t.rate, 0),
    coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0)::int,
    count(l.id) filter (where l.status = 'проведён')::int,
    (coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0) * coalesce(t.rate, 0))::numeric
  from teachers t
  left join lessons l on l.teacher_id = t.id
    and to_char(l.lesson_date, 'YYYY-MM') = p_month
  where t.archived = false
  group by t.id, t.full_name, t.rate
  having count(l.id) filter (where l.status = 'проведён') > 0;

  get diagnostics v_count = row_count;

  -- фиксируем кураторов той же датой (тот же period_id) — новое
  insert into curator_payroll_rows(period_id, curator_id, curator_name, subject, rate, lesson_units, sessions, total)
  select
    v_period_id,
    c.id,
    c.full_name,
    c.subject,
    coalesce(c.rate, 0),
    coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0)::int,
    count(l.id) filter (where l.status = 'проведён')::int,
    (coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0) * coalesce(c.rate, 0))::numeric
  from curators c
  left join lessons l on l.curator_id = c.id
    and to_char(l.lesson_date, 'YYYY-MM') = p_month
  where c.archived = false
  group by c.id, c.full_name, c.subject, c.rate
  having count(l.id) filter (where l.status = 'проведён') > 0;

  -- итоги периода — по-прежнему только по преподавателям (как и было)
  select coalesce(sum(total), 0), coalesce(sum(lesson_units), 0)
  into v_sum, v_units
  from payroll_rows where period_id = v_period_id;

  update payroll_periods
  set total_sum = v_sum, total_units = v_units
  where id = v_period_id;

  return v_count;
end;
$function$;

-- ---------- 3. get_curator_payroll: теперь знает о закрытии месяца ----------
-- Меняем язык sql -> plpgsql (нужна ветка если/иначе) и добавляем
-- колонку is_closed — это меняет тип возврата, поэтому сначала дропаем.
drop function if exists get_curator_payroll(text);

create function get_curator_payroll(p_month text)
returns table(curator_id uuid, curator_name text, subject text, rate numeric, lesson_units integer, sessions integer, total numeric, is_closed boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_period_id uuid;
  v_has_snapshot boolean := false;
begin
  select id into v_period_id from payroll_periods where month = p_month;
  if v_period_id is not null then
    select exists(select 1 from curator_payroll_rows where period_id = v_period_id) into v_has_snapshot;
  end if;

  if v_has_snapshot then
    return query
    select cpr.curator_id, cpr.curator_name, cpr.subject, cpr.rate, cpr.lesson_units, cpr.sessions, cpr.total, true
    from curator_payroll_rows cpr where cpr.period_id = v_period_id
    order by cpr.curator_name;
  else
    return query
    select
      c.id, c.full_name, c.subject, coalesce(c.rate, 0),
      coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0)::int,
      count(l.id) filter (where l.status = 'проведён')::int,
      (coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0) * coalesce(c.rate, 0))::numeric,
      (v_period_id is not null)
    from curators c
    left join lessons l on l.curator_id = c.id and to_char(l.lesson_date, 'YYYY-MM') = p_month
    where c.archived = false
    group by c.id, c.full_name, c.subject, c.rate
    order by c.full_name;
  end if;
end;
$function$;
