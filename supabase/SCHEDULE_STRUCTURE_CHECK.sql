-- ДИАГНОСТИКА (только чтение, ничего не меняет) — перед доработкой вкладки
-- «Расписание». Выполнить в Supabase → SQL Editor и прислать результат
-- (Table Editor покажет только последний запрос — поэтому всё собрано
-- в один json_build_object).
select json_build_object(
  'schedule_columns', (
    select json_agg(json_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'schedule'
  ),
  'schedule_policies', (
    select json_agg(json_build_object('policy', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'with_check', with_check))
    from pg_policies
    where schemaname = 'public' and tablename = 'schedule'
  ),
  'schedule_row_count', (select count(*) from schedule),
  'schedule_sample', (
    select json_agg(row_to_json(s)) from (select * from schedule limit 3) s
  ),
  'get_schedule_grid_def', (
    select pg_get_functiondef(oid) from pg_proc where proname = 'get_schedule_grid' limit 1
  ),
  'generate_lessons_def', (
    select pg_get_functiondef(oid) from pg_proc where proname = 'generate_lessons' limit 1
  ),
  'get_missed_lessons_def', (
    select pg_get_functiondef(oid) from pg_proc where proname = 'get_missed_lessons' limit 1
  ),
  'has_rooms_table', (
    select exists(select 1 from information_schema.tables where table_schema='public' and table_name in ('rooms','cabinets'))
  ),
  'has_offices_table', (
    select exists(select 1 from information_schema.tables where table_schema='public' and table_name = 'offices')
  ),
  'groups_columns', (
    select json_agg(json_build_object('column', column_name, 'type', data_type) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'groups'
  ),
  'lessons_columns', (
    select json_agg(json_build_object('column', column_name, 'type', data_type) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons'
  )
) as result;
