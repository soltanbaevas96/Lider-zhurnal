-- =====================================================================
--  66. РАСПИСАНИЕ — конфликты только внутри офиса (кабинет/группа) +
--  преподаватель/ассистент — глобально по всем офисам.
--
--  Что было не так (проверено по факту — 53_schedule_rebuild.sql):
--   - Конфликт КАБИНЕТА уже и раньше проверялся ПРАВИЛЬНО — только
--     внутри одного офиса (s.office = p_office). Ложные «конфликты
--     между офисами», которые видел завуч, были не отсюда — это
--     фронтенд Schedule.jsx сам считал визуальные конфликты на клиенте
--     без учёта офиса вообще (см. коммит фронтенда в этом же ТЗ).
--   - Конфликт ГРУППЫ вообще не проверялся — у одной группы теоретически
--     могли оказаться два перекрывающихся слота, это нигде не ловилось.
--   - Конфликт АССИСТЕНТА вообще не проверялся.
--   - Конфликт ПРЕПОДАВАТЕЛЯ уже был глобальным (без учёта офиса) —
--     это ПРАВИЛЬНО согласно бизнес-правилу (человек не может физически
--     вести занятие в двух офисах одновременно), оставляем как есть.
--
--  Меняем: добавляем параметры p_assistant_id/p_group_id и две новые
--  ветки конфликта (group — внутри офиса, assistant — глобально),
--  плюс более понятные сообщения об ошибке (с указанием офиса).
--
--  Существующая таблица schedule не меняется, RLS не меняется — только
--  тело функций (SECURITY DEFINER).
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 65.
-- =====================================================================

-- ---------- 1. Пересоздаём schedule_conflicts()/check_schedule_conflicts()
--    с новым списком параметров (Postgres не даёт менять список
--    параметров через CREATE OR REPLACE — нужен DROP) ----------
drop function if exists schedule_conflicts(text, text, uuid, integer, time, time, date, date, uuid);
drop function if exists check_schedule_conflicts(text, text, uuid, integer, time, time, date, date, uuid);

create function schedule_conflicts(
  p_office text, p_room text, p_teacher_id uuid, p_assistant_id uuid, p_group_id uuid, p_weekday integer,
  p_start time, p_end time, p_active_from date, p_active_to date, p_exclude_id uuid
)
returns table(id uuid, kind text, office text, room text, weekday integer,
              start_time time, end_time time, group_name text, teacher_name text, assistant_name text)
language sql
security definer
set search_path to 'public'
as $function$
  -- КАБИНЕТ: конфликт только внутри ОДНОГО офиса. Разные офисы физически
  -- разные места — кабинет «2» в Маргулане и кабинет «2» в Усолке никак
  -- не связаны (п.5, 32 ТЗ).
  select s.id, 'room'::text, s.office, s.room, s.weekday, s.start_time, s.end_time,
         g.name, t.full_name, a.full_name
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  left join assistants a on a.id = s.assistant_id
  where s.archived = false
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and s.office = p_office and s.room = p_room and s.weekday = p_weekday
    and s.start_time < p_end and s.end_time > p_start
    and s.active_from <= coalesce(p_active_to, 'infinity'::date)
    and coalesce(s.active_to, 'infinity'::date) >= p_active_from

  union all

  -- ГРУППА: конфликт тоже только внутри одного офиса — у одной группы
  -- не может быть двух занятий одновременно (п.5, 33 ТЗ).
  select s.id, 'group'::text, s.office, s.room, s.weekday, s.start_time, s.end_time,
         g.name, t.full_name, a.full_name
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  left join assistants a on a.id = s.assistant_id
  where s.archived = false
    and p_group_id is not null
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and s.office = p_office and s.group_id = p_group_id and s.weekday = p_weekday
    and s.start_time < p_end and s.end_time > p_start
    and s.active_from <= coalesce(p_active_to, 'infinity'::date)
    and coalesce(s.active_to, 'infinity'::date) >= p_active_from

  union all

  -- ПРЕПОДАВАТЕЛЬ: ГЛОБАЛЬНО, без учёта офиса — один и тот же человек
  -- физически не может одновременно вести занятие в двух офисах центра
  -- (п.8, 34 ТЗ). Это было верно и до этой миграции — оставляем.
  select s.id, 'teacher'::text, s.office, s.room, s.weekday, s.start_time, s.end_time,
         g.name, t.full_name, a.full_name
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  left join assistants a on a.id = s.assistant_id
  where s.archived = false
    and p_teacher_id is not null
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and s.teacher_id = p_teacher_id and s.weekday = p_weekday
    and s.start_time < p_end and s.end_time > p_start
    and s.active_from <= coalesce(p_active_to, 'infinity'::date)
    and coalesce(s.active_to, 'infinity'::date) >= p_active_from

  union all

  -- АССИСТЕНТ: та же логика, что и преподаватель — глобально, без учёта
  -- офиса (п.35 ТЗ: «аналогично»; отдельной старой бизнес-логики для
  -- ассистента в базе не было — проверено, нигде не встречается).
  select s.id, 'assistant'::text, s.office, s.room, s.weekday, s.start_time, s.end_time,
         g.name, t.full_name, a.full_name
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  left join assistants a on a.id = s.assistant_id
  where s.archived = false
    and p_assistant_id is not null
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and s.assistant_id = p_assistant_id and s.weekday = p_weekday
    and s.start_time < p_end and s.end_time > p_start
    and s.active_from <= coalesce(p_active_to, 'infinity'::date)
    and coalesce(s.active_to, 'infinity'::date) >= p_active_from;
$function$;

grant execute on function schedule_conflicts(text, text, uuid, uuid, uuid, integer, time, time, date, date, uuid) to authenticated;

-- Только для предпросмотра с фронта (до сохранения) — read-only, вызывать
-- может любой залогиненный, как и раньше.
create function check_schedule_conflicts(
  p_office text, p_room text, p_teacher_id uuid, p_assistant_id uuid, p_group_id uuid, p_weekday integer,
  p_start time, p_end time, p_active_from date, p_active_to date, p_exclude_id uuid default null
)
returns table(id uuid, kind text, office text, room text, weekday integer,
              start_time time, end_time time, group_name text, teacher_name text, assistant_name text)
language sql
security definer
set search_path to 'public'
as $function$
  select * from schedule_conflicts(p_office, p_room, p_teacher_id, p_assistant_id, p_group_id, p_weekday, p_start, p_end, p_active_from, p_active_to, p_exclude_id);
$function$;

grant execute on function check_schedule_conflicts(text, text, uuid, uuid, uuid, integer, time, time, date, date, uuid) to authenticated;

-- ---------- 2. save_schedule_slot: передаём p_assistant_id/p_group_id
--    в проверку конфликтов + понятные сообщения об ошибке (с офисом,
--    п.34 ТЗ). Список параметров самой функции НЕ меняется — CREATE OR
--    REPLACE работает без DROP. ----------
create or replace function save_schedule_slot(
  p_id uuid, p_office text, p_room text, p_group_id uuid, p_teacher_id uuid, p_assistant_id uuid,
  p_weekday integer, p_start_time time, p_end_time time, p_lessons_count integer,
  p_status text, p_active_from date, p_active_to date, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_conflict record;
begin
  if not is_admin() then
    raise exception 'Только завуч может редактировать расписание';
  end if;

  if p_status not in ('confirmed','confirmed_special','reserve','occupied_other') then
    raise exception 'Неизвестный статус: %', p_status;
  end if;
  if p_status in ('confirmed','confirmed_special') and (p_group_id is null or p_teacher_id is null) then
    raise exception 'Для подтверждённого занятия обязательны группа и преподаватель';
  end if;
  if p_status in ('reserve','occupied_other') and (p_group_id is not null or p_teacher_id is not null) then
    raise exception 'Резерв/занято не должны иметь группу или преподавателя';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'Время окончания должно быть позже времени начала';
  end if;

  select * into v_conflict from schedule_conflicts(
    p_office, p_room, p_teacher_id, p_assistant_id, p_group_id, p_weekday, p_start_time, p_end_time, p_active_from, p_active_to, p_id
  ) limit 1;

  if found then
    if v_conflict.kind = 'room' then
      raise exception 'Конфликт расписания. Кабинет % (%) уже занят % с % до %',
        v_conflict.room, v_conflict.office, coalesce(v_conflict.group_name, 'слотом'), v_conflict.start_time, v_conflict.end_time;
    elsif v_conflict.kind = 'group' then
      raise exception 'Группа % уже занята с % до % (%)', v_conflict.group_name, v_conflict.start_time, v_conflict.end_time, v_conflict.office;
    elsif v_conflict.kind = 'assistant' then
      raise exception 'Ассистент % уже занят в % с % до %', v_conflict.assistant_name, v_conflict.office, v_conflict.start_time, v_conflict.end_time;
    else
      raise exception 'Преподаватель % уже занят в % с % до %', v_conflict.teacher_name, v_conflict.office, v_conflict.start_time, v_conflict.end_time;
    end if;
  end if;

  if p_id is null then
    insert into schedule(office, room, group_id, teacher_id, assistant_id, weekday, start_time, end_time,
                          lessons_count, status, active_from, active_to, notes)
    values (p_office, p_room, p_group_id, p_teacher_id, p_assistant_id, p_weekday, p_start_time, p_end_time,
            coalesce(p_lessons_count, 2), p_status, coalesce(p_active_from, current_date), p_active_to, p_notes)
    returning id into v_id;
  else
    update schedule set
      office = p_office, room = p_room, group_id = p_group_id, teacher_id = p_teacher_id, assistant_id = p_assistant_id,
      weekday = p_weekday, start_time = p_start_time, end_time = p_end_time, time_text = null,
      lessons_count = coalesce(p_lessons_count, 2), status = p_status,
      active_from = coalesce(p_active_from, current_date), active_to = p_active_to, notes = p_notes
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

grant execute on function save_schedule_slot(uuid, text, text, uuid, uuid, uuid, integer, time, time, integer, text, date, date, text) to authenticated;

-- ---------- Готово ----------
-- get_schedule_slots(p_office) уже существовал и уже поддерживал фильтр
-- по офису (миграция 53) — не трогаем, фронтенд по-прежнему грузит все
-- офисы одним запросом (нужно преподавателю/ассистенту для глобальной
-- проверки конфликтов), а офис-контекст применяется на клиенте сразу
-- после загрузки, до любого расчёта конфликтов/ширины карточек/статистики.
