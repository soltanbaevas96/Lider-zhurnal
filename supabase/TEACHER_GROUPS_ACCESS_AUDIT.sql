-- =====================================================================
--  ДИАГНОСТИКА (только чтение) — для ТЗ «Управление группами и общее
--  расписание в кабинете преподавателя».
--
--  Зачем: новая вкладка «Управление» даёт преподавателю добавлять/
--  убирать/переводить учеников между СВОИМИ группами, а вкладка
--  «Расписание» — читать общее расписание всех офисов. Обе операции
--  либо уже проходят через RLS сегодня, либо нет — угадывать нельзя
--  (ТЗ прямо требует: «нельзя сделать безопасность только через
--  скрытие кнопок», «сервер должен отказать» на прямой запрос).
--  Не собираюсь трогать students/groups/student_groups/schedule без
--  того, чтобы сначала увидеть, как они защищены сейчас.
--
--  Выполните ЦЕЛИКОМ и пришлите результат всех 6 блоков.
-- =====================================================================

-- 1. RLS-политики на group/student-related таблицах — самое важное:
--    есть ли уже ограничение по teacher_groups/my_teacher_id() на
--    INSERT/DELETE student_groups, или сейчас это открыто любому
--    авторизованному (как read у students/groups, миграция 68).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('students', 'groups', 'student_groups', 'teacher_groups', 'teacher_subjects')
order by tablename, cmd, policyname;

-- 2. RLS-политики на schedule — читает ли их сегодня кто-то, кроме
--    admin/methodist (нужно для вкладки «Расписание» преподавателя).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'schedule'
order by cmd, policyname;

-- 3. Тело и права на get_schedule_slots — тем же путём будет читать
--    расписание преподаватель.
select proname, pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'get_schedule_slots';

select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public' and routine_name = 'get_schedule_slots';

-- 4. Структура student_groups (точные имена колонок, ограничения)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'student_groups'
order by ordinal_position;

select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.student_groups'::regclass;

-- 5. groups — какие поля есть (office/lang/grade/capacity уже видел во
--    фронтенде, сверяю точные имена перед RLS-правкой)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'groups'
order by ordinal_position;

-- 6. Есть ли уже готовая RPC для поиска/добавления/перевода ученика
--    (не хочу дублировать, если что-то уже есть под похожим именем)
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and (proname ilike '%student%group%' or proname ilike '%move%student%' or proname ilike '%transfer%student%');
