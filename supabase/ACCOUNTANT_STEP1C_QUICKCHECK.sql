-- =====================================================================
--  Роль «бухгалтер» / шаг 1C: компактная проверка — есть ли внутри
--  каждой функции проверка is_admin() (без чтения полного текста).
-- =====================================================================
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) ilike '%is_admin()%' as checks_is_admin,
  length(pg_get_functiondef(p.oid)) as definition_length_chars
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_payroll', 'close_payroll', 'reopen_payroll', 'get_payroll_periods',
    'get_curator_payroll', 'get_assistant_payroll',
    'get_students_payments', 'get_student_payments', 'add_payment', 'delete_payment'
  )
order by p.proname;
