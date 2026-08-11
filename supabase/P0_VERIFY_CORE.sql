-- =====================================================================
--  P0-VERIFY-CORE: только 2 самых важных запроса (read-only)
--  Выполняйте по одному: выделите текст одного блока (между -----) и
--  нажмите Run (или Ctrl+Enter), либо вставляйте в отдельные новые вкладки.
-- =====================================================================


-- ЗАПРОС A (для P0-1) — политики profiles ------------------------------
select
  policyname    as policy_name,
  cmd           as command,
  roles::text,
  qual          as using_expression,
  with_check    as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;


-- ЗАПРОС B (для P0-2) — определения 4 admin-функций ---------------------
select
  p.proname                                 as function_name,
  p.prosecdef                               as is_security_definer,
  p.proconfig                               as config_settings,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid)                 as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_set_role', 'admin_set_password', 'admin_create_account', 'admin_soft_delete')
order by p.proname;
