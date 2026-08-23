-- =====================================================================
--  ЛИДЕР+ · Миграция №42: второй ассистент на занятии
--
--  Добавляет lessons.assistant2_id (аналог assistant_id, тоже nullable,
--  тоже ссылается на assistants). Оба ассистента получают зарплату
--  независимо за один и тот же урок (у каждого своя ставка).
--
--  get_assistant_payroll — единственная серверная функция, завязанная
--  на assistant_id (проверено на проде) — расширяем join на оба поля,
--  остальная логика функции не меняется.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 41.
-- =====================================================================

-- ---------- 1. Новая колонка ----------
alter table lessons add column if not exists assistant2_id uuid references assistants(id) on delete set null;

-- Нельзя выбрать одного и того же ассистента дважды на одном занятии
alter table lessons drop constraint if exists lessons_assistants_distinct;
alter table lessons add constraint lessons_assistants_distinct
  check (assistant2_id is null or assistant_id is null or assistant2_id <> assistant_id);

create index if not exists idx_lessons_assistant2 on lessons (assistant2_id);

-- ---------- 2. get_assistant_payroll: считаем оба поля ----------
create or replace function get_assistant_payroll(p_from date, p_to date)
returns table(id uuid, full_name text, rate numeric, lessons_sum numeric, sessions integer, pay numeric)
language sql
security definer
set search_path to 'public'
as $function$
  select
    a.id, a.full_name, coalesce(a.rate,0) as rate,
    coalesce(sum(l.lessons_count) filter (where l.status='проведён'), 0) as lessons_sum,
    count(l.id) filter (where l.status='проведён')::int as sessions,
    (coalesce(sum(l.lessons_count) filter (where l.status='проведён'), 0) * coalesce(a.rate,0)) as pay
  from assistants a
  left join lessons l on (l.assistant_id = a.id or l.assistant2_id = a.id)
    and (p_from is null or l.lesson_date >= p_from)
    and (p_to   is null or l.lesson_date <= p_to)
  where a.archived = false
  group by a.id, a.full_name, a.rate
  order by a.full_name;
$function$;
