-- =====================================================================
--  72. СРОЧНО: create_or_get_lesson падал с
--  "structure of query does not match function result type"
--  при сохранении урока через Журнал (в том числе за прошедшую дату,
--  напр. 03.09) — Ошибка №3 из ТЗ.
--
--  ПРИЧИНА (не гадание — механизм ошибки однозначен):
--   Функция была объявлена RETURNS TABLE(... 15 колонок с ЯВНЫМИ
--   типами ...). В language plpgsql внутри RETURN QUERY Postgres
--   СТРОГО сверяет тип каждой колонки SELECT с объявленным. Таблица
--   lessons создана напрямую в БД (не в этих миграциях), и фактические
--   типы части её колонок не совпали с моим объявлением — типично это
--   smallint вместо integer у lessons_count / students / test_max_score
--   и/или отдельный enum-тип у status. Функция get_my_lessons ту же
--   таблицу читает без проблем, потому что она language sql (там
--   приведение типов в выдаче автоматическое), а create_or_get_lesson —
--   language plpgsql, где сверка строгая.
--
--  ИСПРАВЛЕНИЕ: функция теперь RETURNS jsonb и отдаёт всю строку урока
--  как есть — to_jsonb(строки), какими бы ни были фактические типы
--  колонок, — плюс поле is_new. Никакой прикладной логики не меняется:
--   - та же проверка «незакрытое занятие из расписания уже есть»;
--   - та же защита от повторной отправки той же формы (по теме);
--   - тот же advisory-lock от двойного клика/двух вкладок;
--   - та же проверка прав (NULL-safe, как в миграциях 69/71).
--
--  Смена типа возврата (table -> jsonb) требует DROP перед CREATE.
--  Фронтенд (api.js -> createOrGetLesson) обновлён параллельно: теперь
--  ждёт скалярный jsonb, а не массив из одной строки.
--
--  НЕ маскировка ошибки на фронте (п.18,34,39 ТЗ) — устранена сама
--  причина на уровне функции.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 71.
-- =====================================================================

drop function if exists create_or_get_lesson(
  uuid, uuid, uuid, uuid, date, integer, text, integer, text, text, boolean, integer
);

create function create_or_get_lesson(
  p_teacher_id uuid, p_group_id uuid, p_assistant_id uuid, p_assistant2_id uuid,
  p_lesson_date date, p_lessons_count integer, p_topic text, p_students integer,
  p_status text, p_plan_path text, p_has_test boolean, p_test_max_score integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_row lessons;
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

  -- Сериализация конкурентных попыток для одного преподавателя+группы+дня.
  perform pg_advisory_xact_lock(
    hashtextextended(p_teacher_id::text || '|' || p_group_id::text || '|' || p_lesson_date::text, 0)
  );

  -- 1. Незакрытое занятие ИЗ РАСПИСАНИЯ на эту же группу+дату (исходный
  --    сценарий бага из ТЗ — п.3,13,14).
  select l.id into v_id
  from lessons l
  where l.teacher_id = p_teacher_id and l.group_id = p_group_id and l.lesson_date = p_lesson_date
    and l.status = 'planned'
  order by l.id
  limit 1;

  -- 2. Повторная отправка ЭТОЙ ЖЕ формы (та же тема слово в слово) —
  --    защита от двойного клика; занятие с ДРУГОЙ темой в тот же день
  --    дублем не считается (это законный второй урок, см. миграцию 71).
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
    returning id into v_id;

    select * into v_row from lessons where id = v_id;
    return to_jsonb(v_row) || jsonb_build_object('is_new', true);
  else
    select * into v_row from lessons where id = v_id;
    return to_jsonb(v_row) || jsonb_build_object('is_new', false);
  end if;
end;
$function$;

grant execute on function create_or_get_lesson(
  uuid, uuid, uuid, uuid, date, integer, text, integer, text, text, boolean, integer
) to authenticated;
