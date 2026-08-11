-- =====================================================================
--  Роль «бухгалтер» / шаг 1B: то же самое, но всё склеено в одну ячейку
--  на каждый запрос — кликните один раз на итоговую ячейку, чтобы
--  увидеть всё целиком (как раньше с is_admin_definition).
-- =====================================================================

-- ЗАПРОС 1: все 10 функций одной строкой ----------------------------------
select string_agg(
  '===== ' || p.proname || '  (security_definer=' || p.prosecdef || ') ' || chr(10)
  || pg_get_functiondef(p.oid) || chr(10),
  chr(10) || chr(10) order by p.proname
) as all_function_definitions
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_payroll', 'close_payroll', 'reopen_payroll', 'get_payroll_periods',
    'get_curator_payroll', 'get_assistant_payroll',
    'get_students_payments', 'get_student_payments', 'add_payment', 'delete_payment'
  );

-- ЗАПРОС 2: все policies lessons + attendance одной строкой ---------------
select string_agg(
  '===== ' || tablename || ' / ' || policyname || '  (' || cmd || ') ' || chr(10)
  || 'USING: ' || coalesce(qual, 'NULL') || chr(10)
  || 'WITH CHECK: ' || coalesce(with_check, 'NULL') || chr(10),
  chr(10) order by tablename, cmd
) as all_policies
from pg_policies
where schemaname = 'public' and tablename in ('lessons', 'attendance');

-- ЗАПРОС 3: все policies teachers/curators/assistants одной строкой -------
select string_agg(
  '===== ' || tablename || ' / ' || policyname || '  (' || cmd || ') ' || chr(10)
  || 'USING: ' || coalesce(qual, 'NULL') || chr(10)
  || 'WITH CHECK: ' || coalesce(with_check, 'NULL') || chr(10),
  chr(10) order by tablename, cmd
) as all_policies
from pg_policies
where schemaname = 'public' and tablename in ('teachers', 'curators', 'assistants');
