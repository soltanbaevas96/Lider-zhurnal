-- Проверка после 39A + 39B — должно вернуться 3 строки, все true/ok.
select
  (select true from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='accountant') as enum_ok,
  (select prosecdef from pg_proc where proname='is_accountant') as is_accountant_exists,
  (select prosecdef from pg_proc where proname='accountant_set_rate') as accountant_set_rate_exists;
