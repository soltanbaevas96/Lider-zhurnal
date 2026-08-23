-- Структура таблицы payments (или как она называется) + текущая RPC add_payment
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name ilike '%payment%'
order by table_name, ordinal_position;

-- Полный текст RPC-функций по оплатам — покажет реальное имя таблицы и колонок
select string_agg(
  '===== ' || p.proname || ' ' || chr(10) || pg_get_functiondef(p.oid) || chr(10),
  chr(10) order by p.proname
) as defs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_payment', 'get_students_payments', 'get_student_payments', 'delete_payment');
