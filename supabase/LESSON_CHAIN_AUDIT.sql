-- =====================================================================
--  ДИАГНОСТИКА (только чтение) — полная связка
--  РАСПИСАНИЕ → LESSON → МОИ ЗАНЯТИЯ → ЖУРНАЛ → ПРОВЕДЕНИЕ.
--
--  Нужна для аудита по ТЗ «Полная стабилизация связки...»: таблицы
--  lessons/schedule и их RPC созданы напрямую в живой базе, локальных
--  DDL нет. Прежде чем что-то менять в функциях/типах (п.33-34,63 ТЗ:
--  «нельзя исправлять наугад»), нужно увидеть фактическую схему.
--
--  Выполните ЦЕЛИКОМ и пришлите результат КАЖДОГО блока (1-8).
--  Блокирующая ошибка №3 уже исправлена отдельно (миграция 72) — эта
--  диагностика для остального (ассистенты из расписания, сверка типов
--  во всех RPC, дубли).
-- =====================================================================

-- 1. lessons — все колонки и ТОЧНЫЕ типы (udt_name покажет enum, если есть)
select ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'lessons'
order by ordinal_position;

-- 2. schedule — все колонки и типы (важно: есть ли assistant2_id — Ошибка №1)
select ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'schedule'
order by ordinal_position;

-- 3. Enum-типы, связанные со статусом занятия/расписания
select t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname ilike '%status%' or t.typname ilike '%lesson%' or t.typname ilike '%schedule%'
group by t.typname;

-- 4. Ограничения и индексы на lessons (unique/FK/check + все индексы)
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.lessons'::regclass
order by contype, conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'lessons'
order by indexname;

-- 5. RLS-политики на lessons и attendance
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('lessons', 'attendance', 'lesson_students')
order by tablename, policyname;

-- 6. ПОЛНЫЕ тела всех функций, участвующих в цепочке lesson/schedule/
--    attendance/assistant — здесь и ищем несоответствия RETURNS/SELECT,
--    типы, NULL, потерю assistant2_id и т.п.
select proname,
       pg_get_function_identity_arguments(oid) as args,
       pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_my_lessons', 'create_or_get_lesson', 'conduct_lesson',
    'sync_schedule_slot', 'sync_all_schedules', 'save_schedule_slot',
    'delete_schedule_slot', 'generate_lessons', 'get_missed_lessons',
    'get_schedule_slot_impact', 'fetch_schedule_slots', 'schedule_conflicts',
    'check_schedule_conflicts', 'get_curator_lessons', 'create_curator_lesson',
    'my_teacher_id', 'my_curator_id'
  )
order by proname;

-- 7. Есть ли сейчас занятия из расписания, у которых в schedule указан
--    ассистент, а в lesson его нет (Ошибка №1/8 ТЗ — потеря ассистента)
select
  count(*) filter (where s.assistant_id is not null and l.assistant_id is null) as lost_assistant1,
  count(*) filter (where s.assistant_id is not null) as schedule_has_assistant1,
  count(*) as total_schedule_lessons
from lessons l
join schedule s on s.id = l.schedule_id;

-- 8. Список функций, где RETURNS TABLE (кандидаты на ту же ошибку типов)
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and prorettype = 'record'::regtype
  and proargmodes is not null
order by proname;
