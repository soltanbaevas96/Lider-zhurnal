-- =====================================================================
--  67. РАСПИСАНИЕ ↔ ЗАНЯТИЯ: синхронизация, безопасное удаление,
--  защита проведённых занятий.
--
--  Проверено по факту в живой базе перед написанием (диагностика от
--  владельца, не предположения):
--   - lessons.schedule_id УЖЕ существует, FK на schedule(id)
--     ON DELETE SET NULL (не CASCADE — историю каскадом снести нельзя
--     даже при физическом DELETE строки schedule).
--   - Уникальный индекс uq_lesson_schedule_date(schedule_id, lesson_date)
--     УЖЕ есть — идемпотентность вставки уже обеспечена на уровне БД
--     (see generate_lessons: ON CONFLICT (schedule_id, lesson_date)
--     DO NOTHING). Дублей сейчас нет (проверено).
--   - lessons.status уже поддерживает 'planned' | 'проведён' |
--     'отменён' | 'перенесён'. Пока преподаватель не нажал «Провести
--     занятие», у lessons со статусом 'planned' НЕТ прикреплённых
--     фактических данных (посещаемость/план/тема пишутся ТОЛЬКО внутри
--     conductLesson() одним действием, которое сразу же меняет статус
--     на 'проведён') — поэтому 'planned' безопасно перегенерировать
--     (удалить и создать заново), а всё, что НЕ 'planned' — это уже
--     зафиксированный факт и не трогается никогда.
--   - lessons НЕ хранит office/room — они всегда берутся через join
--     (к schedule/группе), поэтому смена кабинета/офиса в schedule НЕ
--     требует никаких изменений в lessons вообще.
--   - Реальный найденный баг: save_schedule_slot проверял только
--     is_admin(), хотя RLS "schedule methodist all" уже даёт методисту
--     полный доступ к schedule, а кабинет методиста показывает кнопки
--     редактирования расписания. Чинится в этой же миграции.
--   - deleteSchedule во фронтенде был сырым UPDATE schedule SET
--     archived=true — вообще не трогал lessons. Заменяется на RPC.
--
--  Не создаём новых таблиц расписания/занятий — только новые функции
--  поверх существующих schedule/lessons, плюс один лёгкий журнал
--  изменений (п.26 ТЗ, "желательно").
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 66.
-- =====================================================================

-- ---------- 1. Журнал синхронизаций (п.26 ТЗ) ----------
create table if not exists schedule_sync_log (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedule(id) on delete set null,
  action text not null check (action in ('update','delete','sync_all')),
  performed_by uuid references profiles(id) on delete set null,
  performed_at timestamptz not null default now(),
  future_deleted int not null default 0,
  future_created int not null default 0,
  conducted_protected int not null default 0,
  details jsonb
);
alter table schedule_sync_log enable row level security;
drop policy if exists "schedule_sync_log admin read" on schedule_sync_log;
create policy "schedule_sync_log admin read" on schedule_sync_log
  for select using (is_admin() or is_methodist());

-- ---------- 2. Ядро синхронизации одного слота расписания ----------
-- Вызывается и из save_schedule_slot (после UPDATE существующего слота),
-- и из sync_all_schedules() (кнопка «Синхронизировать», п.21 ТЗ).
-- Логика (п.15,17,18 ТЗ):
--  1. Определяем горизонт — до какой даты уже были сгенерированы
--     будущие НЕПРОВЕДЁННЫЕ занятия этого слота. Мы НЕ придумываем
--     новый горизонт на пустом месте (п.16 ТЗ: расширять генерацию
--     самовольно нельзя) — только пересоздаём в уже существовавших
--     границах, дальше — как обычно, через «Создать занятия» или
--     «Синхронизировать».
--  2. Удаляем ВСЕ будущие (lesson_date >= сегодня) занятия этого слота
--     со статусом 'planned' — они ещё не содержат фактических данных
--     (см. обоснование в шапке файла), поэтому пересоздать их заново
--     безопасно. Прошлое НЕ трогаем вообще (ни статус, ни дату) —
--     ни давно проведённые, ни давно просроченные-но-так-и-не-
--     отмеченные (это отдельный, уже существующий механизм
--     get_missed_lessons, не касаемся).
--  3. Если слот всё ещё активен, подтверждён и остался горизонт —
--     пересоздаём занятия на этот горизонт УЖЕ по новым данным слота
--     (день недели/время/группа/преподаватель/ассистент/кол-во уроков).
create or replace function sync_schedule_slot(p_schedule_id uuid)
returns table(future_deleted integer, future_created integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  v_horizon date;
  v_deleted int := 0;
  v_created int := 0;
  v_rows int;
  d date;
begin
  select * into s from schedule where id = p_schedule_id;
  if not found then
    return query select 0, 0;
    return;
  end if;

  -- горизонт = самая поздняя дата среди уже существующих будущих
  -- непроведённых занятий этого слота (до удаления)
  select max(lesson_date) into v_horizon
  from lessons
  where schedule_id = p_schedule_id and status = 'planned' and lesson_date >= current_date;

  delete from lessons
  where schedule_id = p_schedule_id and status = 'planned' and lesson_date >= current_date;
  get diagnostics v_deleted = row_count;

  if v_horizon is not null
     and s.archived = false
     and s.status in ('confirmed', 'confirmed_special')
     and s.group_id is not null
  then
    d := greatest(current_date, s.active_from);
    while d <= least(v_horizon, coalesce(s.active_to, v_horizon)) loop
      if (case when extract(dow from d) = 0 then 7 else extract(dow from d)::int end) = s.weekday then
        insert into lessons(
          schedule_id, group_id, teacher_id, assistant_id,
          lesson_date, start_time, end_time, lessons_count, topic, status
        )
        values (
          s.id, s.group_id, s.teacher_id, s.assistant_id,
          d, s.start_time, s.end_time, s.lessons_count, '', 'planned'
        )
        on conflict (schedule_id, lesson_date) do nothing;
        get diagnostics v_rows = row_count;
        v_created := v_created + v_rows;
      end if;
      d := d + 1;
    end loop;
  end if;

  return query select v_deleted, v_created;
end;
$function$;

grant execute on function sync_schedule_slot(uuid) to authenticated;

-- ---------- 3. save_schedule_slot: доступ методисту + авто-синхронизация
--    будущих занятий после изменения СУЩЕСТВУЮЩЕГО слота ----------
-- Возвращаемый тип меняется (uuid -> таблица со статистикой синхронизации),
-- поэтому обязателен DROP перед CREATE.
drop function if exists save_schedule_slot(uuid, text, text, uuid, uuid, uuid, integer, time, time, integer, text, date, date, text);

create function save_schedule_slot(
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
    returning id into v_id;
    -- новый слот: генерация занятий по-прежнему через «Создать занятия»
    -- (п.30 ранее — массовое создание остаётся отдельным явным действием
    -- завуча), синхронизировать пока нечего.
  else
    v_id := p_id;
    update schedule set
      office = p_office, room = p_room, group_id = p_group_id, teacher_id = p_teacher_id, assistant_id = p_assistant_id,
      weekday = p_weekday, start_time = p_start_time, end_time = p_end_time, time_text = null,
      lessons_count = coalesce(p_lessons_count, 2), status = p_status,
      active_from = coalesce(p_active_from, current_date), active_to = p_active_to, notes = p_notes
    where id = p_id;

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

-- ---------- 4. Безопасное удаление слота расписания ----------
-- Заменяет сырой "UPDATE schedule SET archived=true" из фронтенда —
-- тот вообще не трогал lessons, отсюда и была основная проблема ТЗ.
create or replace function delete_schedule_slot(p_id uuid)
returns table(future_deleted integer, conducted_protected integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted int := 0;
  v_protected int := 0;
begin
  if not (is_admin() or is_methodist()) then
    raise exception 'Недостаточно прав для удаления расписания';
  end if;

  if not exists (select 1 from schedule where id = p_id) then
    raise exception 'Занятие расписания не найдено';
  end if;

  select count(*) into v_protected from lessons where schedule_id = p_id and status <> 'planned';

  -- удаляем только будущие непроведённые (п.9-10 ТЗ) — прошлые
  -- пропущенные ("missed", всё ещё 'planned', но дата уже прошла)
  -- намеренно НЕ трогаем: это отдельный существующий механизм учёта
  -- пропущенных занятий (get_missed_lessons), не наша зона удаления.
  delete from lessons
  where schedule_id = p_id and status = 'planned' and lesson_date >= current_date;
  get diagnostics v_deleted = row_count;

  update schedule set archived = true where id = p_id;

  insert into schedule_sync_log(schedule_id, action, performed_by, future_deleted, conducted_protected)
  values (p_id, 'delete', auth.uid(), v_deleted, v_protected);

  return query select v_deleted, v_protected;
end;
$function$;

grant execute on function delete_schedule_slot(uuid) to authenticated;

-- ---------- 5. Предпросмотр последствий удаления (для диалога
--    подтверждения на фронте, п.27 ТЗ) — только чтение ----------
create or replace function get_schedule_slot_impact(p_id uuid)
returns table(future_count integer, conducted_count integer)
language sql
security definer
set search_path to 'public'
as $function$
  select
    count(*) filter (where status = 'planned' and lesson_date >= current_date)::int,
    count(*) filter (where status <> 'planned')::int
  from lessons
  where schedule_id = p_id;
$function$;

grant execute on function get_schedule_slot_impact(uuid) to authenticated;

-- ---------- 6. Кнопка «Синхронизировать» — массовый пересчёт всех
--    активных слотов сразу (п.21 ТЗ, защитный механизм для уже
--    существующих данных) ----------
create or replace function sync_all_schedules()
returns table(slots_processed integer, future_deleted integer, future_created integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  v_total_deleted int := 0;
  v_total_created int := 0;
  v_count int := 0;
  v_d int; v_c int;
begin
  if not (is_admin() or is_methodist()) then
    raise exception 'Недостаточно прав для синхронизации расписания';
  end if;

  for s in select id from schedule where archived = false loop
    select sync_result.future_deleted, sync_result.future_created into v_d, v_c
    from sync_schedule_slot(s.id) as sync_result;
    v_total_deleted := v_total_deleted + v_d;
    v_total_created := v_total_created + v_c;
    v_count := v_count + 1;
  end loop;

  insert into schedule_sync_log(action, performed_by, future_deleted, future_created, details)
  values ('sync_all', auth.uid(), v_total_deleted, v_total_created, jsonb_build_object('slots_processed', v_count));

  return query select v_count, v_total_deleted, v_total_created;
end;
$function$;

grant execute on function sync_all_schedules() to authenticated;
