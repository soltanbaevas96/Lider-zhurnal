-- =====================================================================
--  ДИАГНОСТИКА-2: другие функции, которые тоже читают attendance —
--  проверяем, не сидит ли в них та же ошибка (coalesce(status,'present')
--  без запасного варианта через present).
--  ТОЛЬКО ЧТЕНИЕ. Выполнить целиком, прислать результат.
-- =====================================================================
select p.proname as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'get_student_calendar', 'get_student_summary', 'get_student_groups',
    'get_groups_analytics', 'get_teachers_analytics', 'get_subjects_analytics'
  )
order by p.proname;
