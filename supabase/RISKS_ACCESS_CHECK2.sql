-- =====================================================================
--  Полный текст политики "students om write" (была обрезана в выдаче)
--  + определения функций is_admin/my_role/my_office, чтобы повторить
--  ту же логику в новой политике для student_events.
--  ТОЛЬКО ЧТЕНИЕ. Выполнить целиком, прислать результат.
-- =====================================================================
select policyname, cmd, qual as using_expr, with_check as with_check_expr
from pg_policies
where tablename = 'students' and policyname = 'students om write';

select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('is_admin', 'my_role', 'my_office')
order by p.proname;
