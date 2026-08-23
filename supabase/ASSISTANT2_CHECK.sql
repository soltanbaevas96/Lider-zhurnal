-- Полный текст RPC зарплаты ассистентов + текущая колонка assistant_id в lessons
select string_agg(
  '===== ' || p.proname || ' ' || chr(10) || pg_get_functiondef(p.oid) || chr(10),
  chr(10) order by p.proname
) as defs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_assistant_payroll');

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'lessons'
  and column_name ilike '%assistant%';
