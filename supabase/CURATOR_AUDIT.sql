-- =====================================================================
--  ДИАГНОСТИКА (только чтение) — кабинет куратора.
--  Белый экран уже найден и исправлен (отсутствовавший импорт во
--  фронтенде) — эта диагностика нужна для оставшейся части полного
--  аудита ТЗ: структура lesson_students/curators нигде не определена
--  в локальных SQL-файлах (создана прямо в живой базе).
--
--  Выполните ЦЕЛИКОМ в Supabase → SQL Editor и пришлите результат.
-- =====================================================================

-- 1. Структура curators
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='curators'
order by ordinal_position;

-- 2. Структура lesson_students (или как называется таблица связи
--    занятие-куратора ↔ ученик, если имя другое — тоже покажет)
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name ilike '%lesson_student%'
order by table_name, ordinal_position;

-- 3. Ограничения (constraints) на curators/lesson_students/lessons —
--    особенно unique/FK и их delete_rule
select tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name,
       ccu.table_name as references_table, ccu.column_name as references_column,
       rc.delete_rule
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
left join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
left join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name and rc.constraint_schema=tc.table_schema
where tc.table_schema='public' and tc.table_name in ('curators','lesson_students','lessons')
order by tc.table_name, tc.constraint_type;

-- 4. RLS-политики на curators/lesson_students
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in ('curators','lesson_students')
order by tablename, policyname;

-- 5. Тела функций куратора (полный код — важно для проверки
--    идемпотентности/защиты от дублей/корректности расчётов)
select proname, pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('create_curator_lesson','get_curator_lessons','delete_curator_lesson','my_curator_id','get_curator_payroll');

-- 6. Есть ли уже дубли занятий куратора (тот же куратор, та же дата,
--    та же тема, тот же список учеников — на всякий случай смотрим
--    просто по (curator_id, lesson_date, topic))
select curator_id, lesson_date, topic, count(*)
from lessons
where curator_id is not null and is_extra = true
group by curator_id, lesson_date, topic
having count(*) > 1;

-- 7. Сколько всего занятий куратора и с какими статусами
select status, count(*) from lessons where curator_id is not null group by status;
