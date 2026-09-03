-- =====================================================================
--  53. РАСПИСАНИЕ — доработка существующей таблицы schedule (не создаём
--  вторую). Таблица сейчас пустая (0 строк) — можно спокойно добавлять
--  NOT NULL колонки без бэкафилла.
--
--  Что добавляем:
--   - office, room       — офис/кабинет слота. Храним явно на каждой
--                           строке (не только через group_id), потому что
--                           у РЕЗЕРВА и «занято другим центром» группы нет
--                           вообще, а кабинет проверять на конфликт всё
--                           равно нужно.
--   - start_time/end_time — структурированное время вместо текстового
--                           time_text (тот остаётся как есть, для
--                           обратной совместимости, но новый код его
--                           не использует).
--   - status              — 'confirmed' | 'confirmed_special' | 'reserve'
--                           | 'occupied_other'. Раньше в этой вкладке
--                           статуса/цвета не было вообще — в текущем коде
--                           Schedule.jsx нет никакой существующей
--                           бордовой/цветовой логики, которую нужно было
--                           бы сохранить. confirmed_special — просто
--                           дополнительный статус на будущее (особый тип
--                           подтверждённого занятия), не привязан к
--                           унаследованной логике, которой не существовало.
--   - notes               — свободный комментарий.
--   - group_id            — снимаем NOT NULL: у резерва/занято-другим
--                           группы нет и не должно быть.
--
--  generate_lessons() правится так, чтобы РЕЗЕРВ и ЗАНЯТО-ДРУГИМ-ЦЕНТРОМ
--  никогда не превращались в занятия (п.31 ТЗ) — раньше это было
--  невозможно (group_id было NOT NULL, только реальные группы), теперь,
--  когда group_id стал nullable, это нужно проверять явно.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 52.
-- =====================================================================

-- ---------- 1. Колонки ----------
alter table schedule
  alter column group_id drop not null;

alter table schedule
  add column if not exists office text,
  add column if not exists room text,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists status text not null default 'confirmed',
  add column if not exists notes text;

-- office/room/start_time/end_time обязательны для НОВЫХ строк (таблица
-- пуста, поэтому NOT NULL можно поставить сразу, без бэкафилла)
alter table schedule
  alter column office set not null,
  alter column room set not null,
  alter column start_time set not null,
  alter column end_time set not null;

alter table schedule drop constraint if exists schedule_status_check;
alter table schedule add constraint schedule_status_check
  check (status in ('confirmed','confirmed_special','reserve','occupied_other'));

alter table schedule drop constraint if exists schedule_time_check;
alter table schedule add constraint schedule_time_check
  check (end_time > start_time);

-- подтверждённый слот обязан иметь и группу, и преподавателя (п.16 ТЗ);
-- резерв/занято-другим — не должны иметь ни того, ни другого (текущего
-- центра) вообще
alter table schedule drop constraint if exists schedule_confirmed_needs_group_teacher;
alter table schedule add constraint schedule_confirmed_needs_group_teacher
  check (
    (status in ('confirmed','confirmed_special') and group_id is not null and teacher_id is not null)
    or (status in ('reserve','occupied_other') and group_id is null and teacher_id is null)
  );

alter table schedule drop constraint if exists schedule_weekday_check;
alter table schedule add constraint schedule_weekday_check check (weekday between 1 and 7);

create index if not exists idx_schedule_office_room on schedule (office, room, weekday) where archived = false;
create index if not exists idx_schedule_teacher on schedule (teacher_id, weekday) where archived = false;

-- ---------- 2. Проверка конфликтов (кабинет и преподаватель) ----------
-- Общая функция — переиспользуется и для «предварительной» проверки
-- с фронта (пока админ ещё заполняет форму), и внутри save_schedule_slot
-- как окончательный источник истины.
drop function if exists schedule_conflicts(text, text, uuid, integer, time, time, date, date, uuid);
create function schedule_conflicts(
  p_office text, p_room text, p_teacher_id uuid, p_weekday integer,
  p_start time, p_end time, p_active_from date, p_active_to date, p_exclude_id uuid
)
returns table(id uuid, kind text, office text, room text, weekday integer,
              start_time time, end_time time, group_name text, teacher_name text)
language sql
security definer
set search_path to 'public'
as $function$
  select s.id, 'room'::text as kind, s.office, s.room, s.weekday, s.start_time, s.end_time,
         g.name, t.full_name
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  where s.archived = false
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and s.office = p_office and s.room = p_room and s.weekday = p_weekday
    and s.start_time < p_end and s.end_time > p_start
    and s.active_from <= coalesce(p_active_to, 'infinity'::date)
    and coalesce(s.active_to, 'infinity'::date) >= p_active_from

  union all

  select s.id, 'teacher'::text as kind, s.office, s.room, s.weekday, s.start_time, s.end_time,
         g.name, t.full_name
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  where s.archived = false
    and p_teacher_id is not null
    and (p_exclude_id is null or s.id <> p_exclude_id)
    and s.teacher_id = p_teacher_id and s.weekday = p_weekday
    and s.start_time < p_end and s.end_time > p_start
    and s.active_from <= coalesce(p_active_to, 'infinity'::date)
    and coalesce(s.active_to, 'infinity'::date) >= p_active_from;
$function$;

grant execute on function schedule_conflicts(text, text, uuid, integer, time, time, date, date, uuid) to authenticated;

-- Только для предпросмотра с фронта (до сохранения) — read-only, вызывать
-- может любой залогиненный (как и чтение самого расписания), пишет
-- только save_schedule_slot.
drop function if exists check_schedule_conflicts(text, text, uuid, integer, time, time, date, date, uuid);
create function check_schedule_conflicts(
  p_office text, p_room text, p_teacher_id uuid, p_weekday integer,
  p_start time, p_end time, p_active_from date, p_active_to date, p_exclude_id uuid default null
)
returns table(id uuid, kind text, office text, room text, weekday integer,
              start_time time, end_time time, group_name text, teacher_name text)
language sql
security definer
set search_path to 'public'
as $function$
  select * from schedule_conflicts(p_office, p_room, p_teacher_id, p_weekday, p_start, p_end, p_active_from, p_active_to, p_exclude_id);
$function$;

grant execute on function check_schedule_conflicts(text, text, uuid, integer, time, time, date, date, uuid) to authenticated;

-- ---------- 3. Создание/редактирование слота (единственная точка записи,
--    admin-only — так же, как и раньше у schedule write RLS, но теперь
--    ещё и с проверкой конфликтов, которую RLS сама по себе не умеет) ----------
drop function if exists save_schedule_slot(uuid, text, text, uuid, uuid, uuid, integer, time, time, integer, text, date, date, text);
create function save_schedule_slot(
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
    p_office, p_room, p_teacher_id, p_weekday, p_start_time, p_end_time, p_active_from, p_active_to, p_id
  ) limit 1;

  if found then
    if v_conflict.kind = 'room' then
      raise exception 'Конфликт расписания. Кабинет % (%) уже занят % с % до %',
        v_conflict.room, v_conflict.office, coalesce(v_conflict.group_name, 'слотом'), v_conflict.start_time, v_conflict.end_time;
    else
      raise exception 'Преподаватель % уже занят с % до %', v_conflict.teacher_name, v_conflict.start_time, v_conflict.end_time;
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

-- ---------- 4. Чтение расписания — заменяет get_schedule_grid ----------
-- (LEFT JOIN вместо старого INNER JOIN — иначе резерв/занято, у которых
-- group_id = null, вообще пропали бы из выдачи)
drop function if exists get_schedule_grid();
create function get_schedule_slots(p_office text default null)
returns table(
  id uuid, office text, room text, status text,
  group_id uuid, group_name text, subject_name text, lang text,
  teacher_id uuid, teacher_name text, assistant_id uuid, assistant_name text,
  weekday integer, start_time time, end_time time, lessons_count integer,
  active_from date, active_to date, notes text, students_count integer
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    s.id, s.office, s.room, s.status,
    s.group_id, g.name, g.subject_name, g.lang,
    s.teacher_id, t.full_name, s.assistant_id, a.full_name,
    s.weekday, s.start_time, s.end_time, s.lessons_count,
    s.active_from, s.active_to, s.notes,
    case when s.group_id is null then 0 else
      (select count(*)::int from student_groups sg
        join students st on st.id = sg.student_id and st.archived = false
        where sg.group_id = s.group_id)
    end
  from schedule s
  left join groups g on g.id = s.group_id
  left join teachers t on t.id = s.teacher_id
  left join assistants a on a.id = s.assistant_id
  where s.archived = false
    and (p_office is null or s.office = p_office)
  order by s.office, s.room, s.weekday, s.start_time;
$function$;

grant execute on function get_schedule_slots(text) to authenticated;

-- ---------- 5. generate_lessons: резерв/занято НИКОГДА не создают
--    занятия (п.31 ТЗ) + переносим структурированное время в lessons ----------
create or replace function generate_lessons(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  d date;
  v_created int := 0;
  v_rows int;
begin
  if not is_admin() then
    raise exception 'Только завуч может генерировать занятия';
  end if;

  for s in
    select * from schedule
    where archived = false
      and status in ('confirmed', 'confirmed_special')  -- резерв/занято сюда никогда не попадают
      and group_id is not null
      and active_from <= p_to
      and (active_to is null or active_to >= p_from)
  loop
    d := p_from;
    while d <= p_to loop
      if (case when extract(dow from d) = 0 then 7 else extract(dow from d)::int end) = s.weekday
         and d >= s.active_from
         and (s.active_to is null or d <= s.active_to)
      then
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
  end loop;

  return v_created;
end;
$function$;
