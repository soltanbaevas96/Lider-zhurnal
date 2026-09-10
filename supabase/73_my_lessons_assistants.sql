-- =====================================================================
--  73. «МОИ ЗАНЯТИЯ»: ассистент и второй ассистент в форме проведения.
--
--  ПРОБЛЕМА (Ошибка №1/№8/№9 ТЗ «Полная стабилизация связки...»):
--   Аудит показал, что цепочка schedule.assistant_id → lesson.assistant_id
--   в базе работает верно (generate_lessons и sync_schedule_slot копируют
--   s.assistant_id в занятие). НО:
--    - get_my_lessons отдавала только assistant_name (одного), без
--      assistant_id / assistant2_id / имени второго ассистента;
--    - карточка проведения занятия в «Мои занятия» (ConductCard) вообще
--      не давала выбрать/поменять ассистента — только показывала имя
--      первого, если оно было. То есть провести занятие из расписания
--      и при этом указать ассистента было невозможно, приходилось идти
--      в Журнал.
--   Отдельно: у таблицы schedule НЕТ колонки assistant2_id (в расписании
--   один ассистент). Второй ассистент существует только на уровне
--   занятия и задаётся вручную при проведении — это ОК, менять
--   расписание в этой миграции не нужно.
--
--  ЧТО МЕНЯЕТСЯ:
--   Только get_my_lessons — добавлены колонки assistant_id, assistant2_id
--   и assistant2_name (через ещё один left join assistants). Тип
--   возврата меняется → обязателен DROP. Фронтенд (ConductCard) получает
--   возможность выбрать обоих ассистентов и сохранить их вместе с
--   проведением (conductLesson).
--
--  НЕ трогает: sync_schedule_slot / generate_lessons (там всё верно),
--  историю проведённых занятий, права, RLS.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 72.
-- =====================================================================

drop function if exists get_my_lessons(date);

create function get_my_lessons(p_date date)
returns table(
  lesson_id uuid, group_id uuid, group_name text, subject_name text, office text,
  lesson_date date, lessons_count integer, topic text, status text,
  assistant_name text, assistant_id uuid, assistant2_id uuid, assistant2_name text,
  students_count integer, time_text text, plan_path text, is_overdue boolean
)
language sql
security definer
set search_path to 'public'
as $$
  select
    l.id, g.id, g.name, g.subject_name, g.office,
    l.lesson_date, l.lessons_count, l.topic, l.status,
    a.full_name, l.assistant_id, l.assistant2_id, a2.full_name,
    (select count(*)::int from student_groups sg
      join students st on st.id = sg.student_id and st.archived = false
      where sg.group_id = g.id),
    sc.time_text,
    l.plan_path,
    (l.lesson_date < current_date and l.status not in ('проведён', 'отменён')) as is_overdue
  from lessons l
  join groups g on g.id = l.group_id
  left join assistants a on a.id = l.assistant_id
  left join assistants a2 on a2.id = l.assistant2_id
  left join schedule sc on sc.id = l.schedule_id
  where l.teacher_id = my_teacher_id()
    and (
      l.lesson_date = p_date
      or (l.lesson_date < current_date and l.status not in ('проведён', 'отменён'))
    )
  order by
    (l.lesson_date < current_date and l.status not in ('проведён', 'отменён')) desc,
    l.lesson_date desc,
    sc.time_text nulls last,
    g.name;
$$;

grant execute on function get_my_lessons(date) to authenticated;
