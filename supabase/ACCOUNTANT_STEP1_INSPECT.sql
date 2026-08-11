-- =====================================================================
--  Роль «бухгалтер» / шаг 1: только чтение. Смотрим реальные определения
--  RPC зарплаты/оплат и текущие RLS-policies на lessons/attendance/
--  teachers/curators/assistants — нужно понять, что реально придётся
--  расширить для новой роли accountant.
-- =====================================================================

-- ЗАПРОС 1: RPC зарплаты и оплат — полные определения --------------------
select
  p.proname                                 as function_name,
  p.prosecdef                               as is_security_definer,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid)                 as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_payroll', 'close_payroll', 'reopen_payroll', 'get_payroll_periods',
    'get_curator_payroll', 'get_assistant_payroll',
    'get_students_payments', 'get_student_payments', 'add_payment', 'delete_payment'
  )
order by p.proname;

-- ЗАПРОС 2: все policies на lessons и attendance --------------------------
select tablename, policyname, cmd, roles::text, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename in ('lessons', 'attendance')
order by tablename, cmd;

-- ЗАПРОС 3: все policies на teachers/curators/assistants ------------------
select tablename, policyname, cmd, roles::text, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename in ('teachers', 'curators', 'assistants')
order by tablename, cmd;

-- ЗАПРОС 4: колонки teachers/curators/assistants (проверяем rate) --------
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('teachers', 'curators', 'assistants')
  and column_name in ('rate', 'id', 'archived')
order by table_name, column_name;
