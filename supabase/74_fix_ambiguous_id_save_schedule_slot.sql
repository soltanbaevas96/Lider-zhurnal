-- =====================================================================
--  74. РАСПИСАНИЕ: "column reference \"id\" is ambiguous"
--
--  ПЕРВОПРИЧИНА (найдена точно по телу функции, не гадание):
--   save_schedule_slot объявлена как
--     RETURNS TABLE(id uuid, future_synced integer, conducted_protected integer)
--   В PL/pgSQL колонки RETURNS TABLE — это неявные OUT-параметры, то
--   есть внутри тела функции появляется переменная с именем "id".
--   По умолчанию plpgsql.variable_conflict = error, поэтому ЛЮБАЯ
--   НЕквалифицированная ссылка на "id" внутри SQL-команд этой функции
--   становится неоднозначной между переменной id (OUT-параметр) и
--   реальной колонкой schedule.id — Postgres не угадывает, а падает
--   с ошибкой.
--
--   Ровно это происходило в двух местах:
--     1. insert into schedule(...) ... returning id into v_id;   -- при СОЗДАНИИ нового слота
--     2. update schedule set ... where id = p_id;                -- при РЕДАКТИРОВАНИИ существующего
--
--   Именно ветка №1 — то, что ловит пользователь на "Расписание →
--   Добавить занятие": это ВСЕГДА создание нового слота (p_id is null),
--   то есть ветка "if not v_editing" с "returning id" — отсюда ошибка
--   на каждое новое расписание. Ветка №2 задета тем же дефектом и
--   почти наверняка так же ломала бы редактирование существующих
--   слотов (не только создание) — обе поправлены заодно.
--
--  ПРОВЕРЕНО (не только эта функция, п.2-3,35 ТЗ) — по полным телам
--  всех функций цепочки schedule/lesson (LESSON_CHAIN_AUDIT, п.6,8):
--  save_schedule_slot — ЕДИНСТВЕННАЯ, где совпали все три условия
--  бага одновременно (RETURNS TABLE содержит "id" + language plpgsql +
--  внутри есть НЕквалифицированная ссылка на "id"):
--    - check_schedule_conflicts / schedule_conflicts — тоже отдают
--      колонку "id", но language sql (там нет PL/pgSQL-переменных,
--      этот класс ошибки там технически невозможен) — безопасны;
--    - get_curator_lessons — language plpgsql и RETURNS TABLE содержит
--      "id", но внутри ВСЕ ссылки уже квалифицированы (l.id, s.id) —
--      безопасна;
--    - get_my_lessons, get_missed_lessons — колонка называется
--      lesson_id, не id, плюс language sql — безопасны;
--    - sync_schedule_slot, sync_all_schedules, delete_schedule_slot,
--      get_schedule_slot_impact — в RETURNS TABLE вообще нет колонки
--      "id" — класс ошибки неприменим, хотя внутри и есть
--      неквалифицированные "id" (это нормально, раз коллизии нет).
--
--  ИСПРАВЛЕНИЕ: квалифицировать обе ссылки как schedule.id — этого
--  достаточно, чтобы Postgres однозначно понимал, что имеется в виду
--  колонка таблицы, а не OUT-параметр функции. Больше НИЧЕГО в логике
--  функции не меняется — ни проверки конфликтов, ни синхронизация, ни
--  права, ни защита проведённых занятий (она была верна и раньше —
--  см. sync_schedule_slot/delete_schedule_slot, не тронуты).
--
--  Сигнатура и тип возврата НЕ меняются — CREATE OR REPLACE без DROP.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 73.
-- =====================================================================

create or replace function save_schedule_slot(
  p_id uuid, p_office text, p_room text, p_group_id uuid, p_teacher_id uuid, p_assistant_id uuid,
  p_weekday integer, p_start_time time, p_end_time time, p_lessons_count integer,
  p_status text, p_active_from date, p_active_to date, p_notes text
)
returns table(id uuid, future_synced integer, conducted_protected integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_conflict record;
  v_editing boolean := p_id is not null;
  v_deleted int := 0;
  v_created int := 0;
  v_protected int := 0;
begin
  if not (is_admin() or is_methodist()) then
    raise exception 'Недостаточно прав для редактирования расписания';
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

  if not v_editing then
    insert into schedule(office, room, group_id, teacher_id, assistant_id, weekday, start_time, end_time,
                          lessons_count, status, active_from, active_to, notes)
    values (p_office, p_room, p_group_id, p_teacher_id, p_assistant_id, p_weekday, p_start_time, p_end_time,
            coalesce(p_lessons_count, 2), p_status, coalesce(p_active_from, current_date), p_active_to, p_notes)
    returning schedule.id into v_id;
    -- новый слот: генерация занятий по-прежнему через «Создать занятия»,
    -- синхронизировать пока нечего.
  else
    v_id := p_id;
    update schedule set
      office = p_office, room = p_room, group_id = p_group_id, teacher_id = p_teacher_id, assistant_id = p_assistant_id,
      weekday = p_weekday, start_time = p_start_time, end_time = p_end_time, time_text = null,
      lessons_count = coalesce(p_lessons_count, 2), status = p_status,
      active_from = coalesce(p_active_from, current_date), active_to = p_active_to, notes = p_notes
    where schedule.id = p_id;

    select sync_result.future_deleted, sync_result.future_created into v_deleted, v_created
    from sync_schedule_slot(p_id) as sync_result;
    select count(*) into v_protected from lessons where lessons.schedule_id = p_id and status <> 'planned';

    insert into schedule_sync_log(schedule_id, action, performed_by, future_deleted, future_created, conducted_protected)
    values (p_id, 'update', auth.uid(), v_deleted, v_created, v_protected);
  end if;

  return query select v_id, v_created, v_protected;
end;
$function$;

grant execute on function save_schedule_slot(uuid, text, text, uuid, uuid, uuid, integer, time, time, integer, text, date, date, text) to authenticated;
