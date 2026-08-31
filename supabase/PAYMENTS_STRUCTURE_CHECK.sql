-- =====================================================================
--  ПРОВЕРКА перед переделкой «Оплаты»: структура таблицы платежей,
--  её RLS, код RPC-функций и есть ли уже где-то тариф/стоимость.
--  ТОЛЬКО ЧТЕНИЕ. Всё собрано в ОДИН результат (JSON), чтобы не
--  выполнять по частям — в результате будет одна строка с одной
--  колонкой result; кликните на неё («View cell details»), чтобы
--  увидеть текст целиком, и пришлите его.
-- =====================================================================
select json_build_object(
  'payments_columns', (select json_agg(row_to_json(t)) from (
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name in ('payments', 'student_payments')
    order by table_name, ordinal_position
  ) t),
  'payments_rls', (select json_agg(row_to_json(t)) from (
    select tablename, policyname, cmd, qual::text as using_expr, with_check::text as with_check_expr
    from pg_policies where tablename in ('payments', 'student_payments')
  ) t),
  'rpc_defs', (select json_agg(row_to_json(t)) from (
    select p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('get_students_payments', 'get_student_payments', 'add_payment', 'delete_payment')
  ) t),
  'tariff_columns', (select json_agg(row_to_json(t)) from (
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name in ('groups', 'students')
      and (column_name ilike '%price%' or column_name ilike '%tariff%' or column_name ilike '%fee%' or column_name ilike '%cost%')
  ) t)
) as result;
