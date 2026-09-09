-- =====================================================================
--  71. СРОЧНОЕ ИСПРАВЛЕНИЕ миграции 70 — create_or_get_lesson блокировал
--  ЗАКОННЫЕ вторые занятия той же группы в тот же день.
--
--  Что произошло: диагностика LESSON_DUPLICATES_DETAIL_B.sql показала,
--  что "дубли" (та же группа+дата, обе 'проведён') из первой проверки —
--  это НЕ дубли, а два РЕАЛЬНЫХ разных занятия одной группы в один день
--  (например, "Равномерное движения №1" + "Равномерное движения №1
--  (след. 40 мин)" — разная тема, разное количество уроков, разная
--  посещаемость). Это регулярная практика нескольких преподавателей.
--
--  Миграция 70 приняла ЛЮБОЙ существующий урок (преподаватель+группа+
--  дата, независимо от статуса) за повод не создавать новый — то есть
--  прямо сейчас (после 70, до этой миграции) вторую такую пару создать
--  через Журнал НЕЛЬЗЯ: система ошибочно ответит «занятие уже
--  существует». Это регрессия, внесённая 70-й, а не то, что просил ТЗ.
--
--  ИСПРАВЛЕНИЕ — блокировать создание нужно ТОЛЬКО в исходном сценарии
--  бага (п.3,13 ТЗ): когда для этой группы+даты уже есть НЕЗАКРЫТОЕ
--  занятие из РАСПИСАНИЯ (status = 'planned') — именно его преподаватель
--  не заметил и попытался создать заново. Если существующие занятия
--  этой группы+дня уже 'проведён'/'отменён' — это, как показала
--  диагностика, скорее всего РЕАЛЬНОЕ второе занятие, и создавать его
--  разрешаем как раньше (до миграции 70).
--
--  Отдельно — защита именно от двойного клика/двойной отправки ОДНОЙ
--  и той же формы (п.17-18,53 ТЗ, ТЕСТ №5): если среди уже проведённых/
--  отменённых занятий этой группы+дня есть с ТОЧНО ТАКОЙ ЖЕ (без учёта
--  регистра и пробелов) темой урока — это, очевидно, повторная отправка
--  одной и той же формы, а не второе занятие с другой темой. Такой
--  случай по-прежнему не создаёт дубль.
--
--  Сериализация (pg_advisory_xact_lock) и авторизация — без изменений.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 70.
-- =====================================================================

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
  if not is_admin() and (my_teacher_id() is null or p_teacher_id is distinct from my_teacher_id()) then
    raise exception 'Недостаточно прав: можно создавать уроки только от своего имени';
  end if;
  if p_status not in ('проведён', 'отменён') then
    raise exception 'Через журнал можно сохранить урок только со статусом «Проведён» или «Отменён»';
  end if;
  if p_group_id is null then
    raise exception 'Не указана группа';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_teacher_id::text || '|' || p_group_id::text || '|' || p_lesson_date::text, 0)
  );

  -- 1. Незакрытое занятие ИЗ РАСПИСАНИЯ на эту же группу+дату — исходный
  --    сценарий бага из ТЗ. Только этот случай блокирует создание.
  select l.id into v_id
  from lessons l
  where l.teacher_id = p_teacher_id and l.group_id = p_group_id and l.lesson_date = p_lesson_date
    and l.status = 'planned'
  order by l.id
  limit 1;

  -- 2. Если такого нет — проверяем именно повторную отправку ЭТОЙ ЖЕ
  --    формы (та же тема слово в слово), а не второе законное занятие
  --    с другой темой в тот же день (см. диагностику — это норма).
  if v_id is null then
    select l.id into v_id
    from lessons l
    where l.teacher_id = p_teacher_id and l.group_id = p_group_id and l.lesson_date = p_lesson_date
      and lower(trim(l.topic)) = lower(trim(coalesce(p_topic, '')))
      and trim(coalesce(p_topic, '')) <> ''
    order by l.id
    limit 1;
  end if;

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
    return query
    select l.id, l.teacher_id, l.group_id, l.assistant_id, l.assistant2_id, l.lesson_date,
           l.lessons_count, l.topic, l.students, l.status, l.plan_path, l.has_test, l.test_max_score,
           l.conducted_at, false
    from lessons l where l.id = v_id;
  end if;
end;
$function$;

grant execute on function create_or_get_lesson(uuid, uuid, uuid, uuid, date, integer, text, integer, text, text, boolean, integer) to authenticated;
