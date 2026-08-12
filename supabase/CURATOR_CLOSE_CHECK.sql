select string_agg(
  '===== ' || p.proname || ' ' || chr(10)
  || pg_get_functiondef(p.oid) || chr(10),
  chr(10) || chr(10) order by p.proname
) as defs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('close_payroll', 'reopen_payroll', 'get_curator_payroll', 'get_payroll_periods', 'get_payroll');
