-- =====================================================================
--  ПРОВЕРКА: текущие RLS-политики на students, student_groups, groups —
--  нужно перед тем, как открыть офис-менеджерам полный доступ ко всем
--  офисам (сейчас "students om write" ограничивает office_manager
--  своим office = my_office()).
--  ТОЛЬКО ЧТЕНИЕ. Выполнить целиком, прислать результат.
-- =====================================================================
select tablename, policyname, cmd, roles, qual as using_expr, with_check as with_check_expr
from pg_policies
where tablename in ('students', 'student_groups', 'groups')
order by tablename, cmd, policyname;
