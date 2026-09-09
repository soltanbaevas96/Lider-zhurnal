-- =====================================================================
--  70. «МОИ ЗАНЯТИЯ»: непроведённые занятия не должны исчезать на
--  следующий день + защита от дублей при создании урока через Журнал.
--
--  ПРОБЛЕМА (по факту, из get_my_lessons — миграция 65, тело функции
--  уже было у нас, живую базу для этого НЕ запрашивали заново):
--   get_my_lessons(p_date) отдаёт СТРОГО "where lesson_date = p_date".
--   Стоило преподавателю не нажать «Провести занятие» и открыть «Мои
--   занятия» на следующий день — вчерашнее непроведённое занятие
--   просто не попадало в выборку и визуально исчезало, хотя строка в
--   lessons никуда не девалась. Не видя его, преподаватель шёл в
--   Журнал → «Добавить урок» и создавал НОВУЮ запись для той же
--   группы/даты — реальный источник дублей (LessonForm → createLesson
--   был обычным INSERT без единой проверки на существование).
--
--  ЧТО МЕНЯЕТСЯ:
--   1. get_my_lessons — та же функция, тот же вызов с фронта, но кроме
--      занятий на p_date дополнительно (и всегда, независимо от того,
--      какой день сейчас смотрит преподаватель) возвращает ВСЕ его
--      занятия с датой в прошлom и статусом НЕ 'проведён'/'отменён' —
--      с флагом is_overdue. Синхронизация расписания (sync_schedule_slot,
--      миграция 67) прошлые занятия не трогает вообще — эта функция
--      только ЧИТАЕТ то, что там уже давно лежит нетронутым.
--   2. Новая функция create_or_get_lesson() — единая точка создания
--      УРОКА ВРУЧНУЮ (Журнал → «Добавить урок», LessonForm.jsx). Перед
--      INSERT ищет уже существующий урок этого же преподавателя+группы+
--      даты (независимо от того, пришёл ли он из расписания или тоже
--      создан вручную) — если нашла, ничего не вставляет и возвращает
--      найденную строку с is_new=false; фронт открывает её вместо
--      создания дубля. От гонки (двойной клик/две вкладки) защищает
--      pg_advisory_xact_lock на ключ (преподаватель, группа, дата) —
--      сериализует конкурентные вызовы для одной и той же тройки на
--      время транзакции, без необходимости в новом UNIQUE-ограничении
--      (см. ниже, почему обычный UNIQUE здесь не подходит).
--
--  ПОЧЕМУ НЕ ПРОСТО UNIQUE INDEX (teacher_id, group_id, lesson_date):
--   потому что это запретило бы ЗАКОННЫЙ случай (п.55 ТЗ, тест №7) —
--   одна и та же группа дважды в один день в РАЗНОЕ время по РАЗНЫМ
--   слотам расписания (у каждого свой schedule_id, дубли между ними и
--   так исключены существующим uq_lesson_schedule_date из миграции 67).
--   Ручная форма Журнала при этом вообще не знает времени урока, поэтому
--   единственный доступный ей признак дубля — «тот же преподаватель +
--   группа + день», и именно это проверяет create_or_get_lesson, но
--   ТОЛЬКО в момент ручного создания — на уже существующие занятия из
--   расписания (несколько слотов в день) эта проверка никак не давит,
--   она их не создаёт и не удаляет, только читает при поиске дубля.
--
--  Ничего не удаляет и не объединяет автоматически — обе функции
--  только читают/создают, история проведённых/отменённых занятий не
--  трогается. Новых таблиц нет.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 69.
-- =====================================================================

-- ---------- 1. get_my_lessons: + непроведённые из прошлого ----------
-- Возвращаемые колонки меняются (добавлена is_overdue) — обязателен DROP.
drop function if exists get_my_lessons(date);

create function get_my_lessons(p_date date)
returns table(
  lesson_id uuid, group_id uuid, group_name text, subject_name text, office text,
  lesson_date date, lessons_count integer, topic text, status text,
  assistant_name text, students_count integer, time_text text, plan_path text,
  is_overdue boolean
)
language sql
security definer
set search_path to 'public'
as $$
  select
    l.id, g.id, g.name, g.subject_name, g.office,
    l.lesson_date, l.lessons_count, l.topic, l.status,
    a.full_name,
    (select count(*)::int from student_groups sg
      join students st on st.id = sg.student_id and st.archived = false
      where sg.group_id = g.id),
    sc.time_text,
    l.plan_path,
    (l.lesson_date < current_date and l.status not in ('проведён', 'отменён')) as is_overdue
  from lessons l
  join groups g on g.id = l.group_id
  left join assistants a on a.id = l.assistant_id
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

-- ---------- 2. create_or_get_lesson: единая точка ручного создания
--    урока (заменяет прямой INSERT из LessonForm.jsx) ----------
create or replace function create_or_get_lesson(
  p_teacher_id uuid, p_group_id uuid, p_assistant_id uuid, p_assistant2_id uuid,
  p_lesson_date date, p_lessons_count integer, p_topic text, p_students integer,
  p_status text, p_plan_path text, p_has_test boolean, p_test_max_score integer
)
returns table(
  id uuid, teacher_id uuid, group_id uuid, assistant_id uuid, assistant2_id uuid,
  lesson_date date, lessons_count integer, topic text, students integer, status text,
  plan_path text, has_test boolean, test_max_score integer, conducted_at timestamptz,
  is_new boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  -- Создавать урок можно только от своего имени (my_teacher_id()) или
  -- админом/директором от имени любого преподавателя (AdminCabinet и
  -- Analytics используют эту же форму для чужих уроков) — та же
  -- NULL-safe проверка, что и в миграции 69.
  if not is_admin() and (my_teacher_id() is null or p_teacher_id is distinct from my_teacher_id()) then
    raise exception 'Недостаточно прав: можно создавать уроки только от своего имени';
  end if;
  if p_status not in ('проведён', 'отменён') then
    raise exception 'Через журнал можно сохранить урок только со статусом «Проведён» или «Отменён»';
  end if;
  if p_group_id is null then
    raise exception 'Не указана группа';
  end if;

  -- Сериализация конкурентных попыток для ОДНОГО И ТОГО ЖЕ преподавателя
  -- + группы + дня (двойной клик, две открытые вкладки, п.17-18,45 ТЗ).
  -- Держится до конца транзакции и снимается сама. Ключ намеренно БЕЗ
  -- schedule_id — см. обоснование в шапке файла.
  perform pg_advisory_xact_lock(
    hashtextextended(p_teacher_id::text || '|' || p_group_id::text || '|' || p_lesson_date::text, 0)
  );

  select l.id into v_id
  from lessons l
  where l.teacher_id = p_teacher_id and l.group_id = p_group_id and l.lesson_date = p_lesson_date
  order by l.id
  limit 1;

  if v_id is null then
    insert into lessons(
      teacher_id, group_id, assistant_id, assistant2_id, lesson_date, lessons_count,
      topic, students, status, plan_path, has_test, test_max_score, conducted_at
    ) values (
      p_teacher_id, p_group_id, p_assistant_id, p_assistant2_id, p_lesson_date, p_lessons_count,
      coalesce(p_topic, ''), p_students, p_status, p_plan_path, coalesce(p_has_test, false), p_test_max_score,
      case when p_status = 'проведён' then now() else null end
    )
    returning lessons.id into v_id;

    return query
    select l.id, l.teacher_id, l.group_id, l.assistant_id, l.assistant2_id, l.lesson_date,
           l.lessons_count, l.topic, l.students, l.status, l.plan_path, l.has_test, l.test_max_score,
           l.conducted_at, true
    from lessons l where l.id = v_id;
  else
    -- Урок для этого преподавателя+группы+дня уже существует (пришёл ли
    -- он из расписания со статусом 'planned', уже проведён, или тоже
    -- был создан вручную ранее) — НЕ создаём второй, возвращаем
    -- найденный с is_new=false. Фронт открывает его вместо создания.
    return query
    select l.id, l.teacher_id, l.group_id, l.assistant_id, l.assistant2_id, l.lesson_date,
           l.lessons_count, l.topic, l.students, l.status, l.plan_path, l.has_test, l.test_max_score,
           l.conducted_at, false
    from lessons l where l.id = v_id;
  end if;
end;
$function$;

grant execute on function create_or_get_lesson(uuid, uuid, uuid, uuid, date, integer, text, integer, text, text, boolean, integer) to authenticated;
