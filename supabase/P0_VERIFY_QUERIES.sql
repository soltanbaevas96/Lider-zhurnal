-- =====================================================================
--  P0-VERIFY: диагностические запросы (ТОЛЬКО ЧТЕНИЕ, ничего не меняют)
--  Цель: проверить 2 критические находки из AUDIT_BEFORE_FIX.md
--  Выполнить в Supabase → SQL Editor. Каждый блок можно запускать отдельно.
--  Результат каждого блока — скопировать и прислать обратно для отчёта.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ЗАПРОС 1 (для P0-1): реальная RLS-политика UPDATE на profiles
-- Смотрим именно USING и WITH CHECK — если WITH CHECK пустой (NULL) или
-- совпадает с USING и не ограничивает изменяемые значения role/office —
-- уязвимость подтверждается.
-- ---------------------------------------------------------------------
select
  policyname    as policy_name,
  cmd           as command,           -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles::text,
  qual          as using_expression,
  with_check    as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;


-- ---------------------------------------------------------------------
-- ЗАПРОС 2 (для P0-1, дополнительно): есть ли триггеры на profiles,
-- которые могли бы блокировать изменение role/office в UPDATE
-- (например BEFORE UPDATE проверка на роль вызывающего)?
-- ---------------------------------------------------------------------
select
  tgname as trigger_name,
  tgenabled,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;


-- ---------------------------------------------------------------------
-- ЗАПРОС 3 (для P0-1): гранты на колонки profiles для role authenticated
-- Если UPDATE разрешён на все колонки (включая role/office) —
-- ограничения на уровне GRANT тоже нет.
-- ---------------------------------------------------------------------
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('authenticated', 'anon')
order by column_name;


-- ---------------------------------------------------------------------
-- ЗАПРОС 4 (для P0-2): полное определение 4 критических RPC-функций.
-- Смотрим: SECURITY DEFINER/INVOKER, search_path, есть ли внутри
-- проверка is_admin()/role='admin'/auth.uid() сверки с профилем.
-- ---------------------------------------------------------------------
select
  p.proname                         as function_name,
  p.prosecdef                       as is_security_definer,
  p.proconfig                       as config_settings,        -- ищите search_path здесь
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid)         as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_set_role', 'admin_set_password', 'admin_create_account', 'admin_soft_delete')
order by p.proname;


-- ---------------------------------------------------------------------
-- ЗАПРОС 5 (для P0-2): кому вообще разрешено вызывать эти функции
-- (EXECUTE grant). Если 'authenticated' или 'public' имеет EXECUTE —
-- это ожидаемо (обычно так и есть для RPC), защита должна быть ВНУТРИ
-- функции, что и проверяет запрос 4.
-- ---------------------------------------------------------------------
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('admin_set_role', 'admin_set_password', 'admin_create_account', 'admin_soft_delete')
order by routine_name, grantee;


-- ---------------------------------------------------------------------
-- ЗАПРОС 6 (справочно, для is_admin()): определение самой функции
-- is_admin(), чтобы убедиться, что она действительно на profiles.role.
-- ---------------------------------------------------------------------
select pg_get_functiondef(oid) as is_admin_definition
from pg_proc
where proname = 'is_admin' and pronamespace = 'public'::regnamespace;
