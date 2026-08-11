-- =====================================================================
--  P0-FIX / шаг 1: только чтение. Смотрим реальные колонки profiles
--  и её текущие policies + триггеры ещё раз (свежий снимок перед фиксом).
-- =====================================================================

-- ЗАПРОС 1: колонки profiles -------------------------------------------
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- ЗАПРОС 2: все policies на profiles (все команды, не только UPDATE) ---
select policyname, cmd, roles::text, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;

-- ЗАПРОС 3: существующие триггеры на profiles ---------------------------
select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- ЗАПРОС 4: тип колонки role (enum ли, какие значения) -------------------
select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'user_role'
order by e.enumsortorder;
