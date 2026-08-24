-- Полный текст политики "students om write" (нужна только она,
-- одним запросом, чтобы точно не обрезалась в выдаче).
select qual as using_expr, with_check as with_check_expr
from pg_policies
where tablename = 'students' and policyname = 'students om write';
