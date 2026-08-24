-- =====================================================================
--  ПРОВЕРКА: смогут ли офис-менеджеры читать students и писать в
--  student_events (для вкладки «Риски» + кнопки «Связались»).
--  ТОЛЬКО ЧТЕНИЕ политик, ничего не меняет. Выполнить целиком,
--  прислать результат.
-- =====================================================================
select schemaname, tablename, policyname, cmd, roles,
       qual as using_expr, with_check as with_check_expr
from pg_policies
where tablename in ('students', 'student_events')
order by tablename, cmd, policyname;
