-- =====================================================================
--  ДИАГНОСТИКА (только чтение, ничего не меняет) — нужна перед миграцией
--  «Расписание: синхронизация, удаление, защита проведённых занятий».
--
--  Выполните ЦЕЛИКОМ в Supabase → SQL Editor и пришлите результат
--  (можно скриншотами каждого блока, как раньше с профилями сотрудников).
-- =====================================================================

-- 1. Структура schedule
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='schedule'
order by ordinal_position;

-- 2. Структура lessons
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='lessons'
order by ordinal_position;

-- 3. Структура attendance
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='attendance'
order by ordinal_position;

-- 4. Все ограничения (constraints) на schedule и lessons — включая
--    внешние ключи, unique, check (важно: ON DELETE поведение FK)
select
  tc.table_name, tc.constraint_name, tc.constraint_type,
  kcu.column_name,
  ccu.table_name as references_table, ccu.column_name as references_column,
  rc.delete_rule
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
left join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.table_schema = 'public' and tc.table_name in ('schedule','lessons','attendance')
order by tc.table_name, tc.constraint_type;

-- 5. Check-constraint для lessons.status (точный список допустимых значений)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.lessons'::regclass and contype = 'c';

-- 6. Индексы на schedule и lessons (уникальные особенно)
select tablename, indexname, indexdef
from pg_indexes
where schemaname='public' and tablename in ('schedule','lessons','attendance')
order by tablename, indexname;

-- 7. RLS-политики на schedule, lessons, attendance
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename in ('schedule','lessons','attendance')
order by tablename, policyname;

-- 8. Все функции, где в имени есть schedule/lesson (проверить, что уже есть)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname ilike '%schedule%' or p.proname ilike '%lesson%')
order by p.proname;

-- 9. Сколько lessons уже привязаны к schedule_id, сколько нет
select
  count(*) filter (where schedule_id is not null) as with_schedule_id,
  count(*) filter (where schedule_id is null) as without_schedule_id,
  count(*) as total
from lessons;

-- 10. Есть ли уже дубли по (schedule_id, lesson_date)
select schedule_id, lesson_date, count(*)
from lessons
where schedule_id is not null
group by schedule_id, lesson_date
having count(*) > 1;

-- 11. Разбивка lessons по статусу (сколько проведено/отменено/запланировано)
select status, count(*) from lessons group by status order by status;

-- 12. Сколько сейчас строк в schedule (всего и активных)
select
  count(*) as total,
  count(*) filter (where archived = false) as active,
  count(*) filter (where archived = true) as archived
from schedule;

-- 13. Пример: у скольких schedule-слотов есть хотя бы одно проведённое
--     занятие (важно для понимания масштаба «защищённых» слотов)
select
  count(distinct s.id) as slots_total,
  count(distinct case when l.status = 'проведён' then s.id end) as slots_with_conducted
from schedule s
left join lessons l on l.schedule_id = s.id
where s.archived = false;
