-- =====================================================================
--  78. «Контроль» — ежедневный автоматический аудит для завуча.
--  ТЗ «Ежедневный контроль и отчёт завуча».
--
--  АУДИТ ПЕРЕД НАПИСАНИЕМ (п.38 ТЗ — не гадание, использованы факты,
--  уже подтверждённые в этой сессии более ранними диагностиками):
--   - lessons: teacher_id, group_id, assistant_id, lesson_date, topic,
--     students, status, lessons_count, schedule_id, curator_id,
--     is_extra, assistant2_id, has_test, test_max_score — колонки уже
--     проверены (LESSON_CHAIN_AUDIT).
--   - groups: id,name,archived,office,lang,subject_name,grade,capacity.
--   - schedule: office,room,weekday,start_time,end_time,teacher_id,
--     assistant_id,status,archived,active_from,active_to.
--   - student_groups(student_id,group_id) — UNIQUE(student_id,group_id).
--   - teachers.profile_id / curators.profile_id — подтверждено телами
--     my_teacher_id()/my_curator_id().
--   - Кураторское занятие ВСЕГДА создаётся сразу со status='проведён'
--     (create_curator_lesson) — состояния "не проведено" у куратора
--     архитектурно не существует, поэтому проверки 6 ("проведены ли
--     занятия", "есть ли незаполненные за прошлые даты") для куратора
--     НЕ реализованы — это была бы заведомо всегда пустая/ложная
--     проверка (п.20 ТЗ: не создавать ложные проблемы).
--   - Конфликты преподавателя/кабинета/группы в расписании (п.8.5-8.7)
--     уже предотвращаются НА ЭТАПЕ СОХРАНЕНИЯ функцией
--     schedule_conflicts()/save_schedule_slot — при обычной работе
--     через интерфейс такие конфликты просто не могут попасть в БД,
--     поэтому отдельная ежедневная проверка на них здесь не добавлена
--     (иначе это была бы всегда пустая проверка при штатной работе).
--   - Ставки бухгалтерии (п.11 ТЗ) — не реализовано в этой миграции:
--     точная структура ставок/периодов зарплаты не была отдельно
--     продиагностирована в этой сессии, гадать по ней не стал —
--     см. итоговый отчёт, что нужно прислать для следующего шага.
--
--  ЧТО СОЗДАЁТСЯ:
--   1. Таблица control_tasks — ссылки на существующие сущности
--      (lesson_id/schedule_id/student_id/group_id), НЕ дублирует
--      students/groups/lessons/schedule.
--   2. run_control_checks() — SECURITY DEFINER, только is_admin().
--      Каждая проверка — INSERT ... ON CONFLICT (dedup_key) DO UPDATE:
--      повторный запуск не плодит дубли (п.18,30 ТЗ), обновляет уже
--      существующую задачу. В конце — все ЕЩЁ АКТИВНЫЕ задачи ранее
--      известных типов, чей dedup_key не встретился в этом прогоне
--      (то есть проблема реально исчезла), переводятся в 'resolved'
--      автоматически (п.19 ТЗ), история (created_at и сама запись) не
--      удаляется физически никогда.
--   3. RLS: полный доступ только is_admin() (это управленческий
--      инструмент завуча, п.28 ТЗ — «не выдавать доп. права через этот
--      модуль»); остальные роли получают SELECT только своих задач.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 77.
-- =====================================================================

create table if not exists control_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  detected_at timestamptz not null default now(),

  dedup_key text not null unique,
  type text not null,
  category text not null,
  priority text not null check (priority in ('critical', 'important', 'info')),

  responsible_user_id uuid references profiles(id) on delete set null,
  responsible_role text,
  office text,

  student_id uuid references students(id) on delete set null,
  group_id uuid references groups(id) on delete set null,
  schedule_id uuid references schedule(id) on delete set null,
  lesson_id uuid references lessons(id) on delete set null,

  title text not null,
  description text,
  action_required text,

  status text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'resolved', 'verified', 'rejected')),
  due_date date,

  assigned_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  verified_at timestamptz,

  created_by uuid references profiles(id) on delete set null,
  resolved_by uuid references profiles(id) on delete set null,
  verified_by uuid references profiles(id) on delete set null,

  comment_admin text,
  comment_responsible text
);

create index if not exists idx_control_tasks_status on control_tasks(status);
create index if not exists idx_control_tasks_priority on control_tasks(priority);
create index if not exists idx_control_tasks_responsible on control_tasks(responsible_user_id);
create index if not exists idx_control_tasks_office on control_tasks(office);
create index if not exists idx_control_tasks_category on control_tasks(category);

alter table control_tasks enable row level security;

drop policy if exists "control_tasks admin all" on control_tasks;
create policy "control_tasks admin all" on control_tasks
  for all using (is_admin()) with check (is_admin());

-- Остальные роли — только чтение СВОИХ задач (п.28 ТЗ), никаких
-- дополнительных прав на изменение бизнес-данных через этот модуль.
drop policy if exists "control_tasks self read" on control_tasks;
create policy "control_tasks self read" on control_tasks
  for select using (
    responsible_user_id = auth.uid()
    or (responsible_role = 'methodist' and is_methodist())
    or (responsible_role = 'accountant' and is_accountant())
    or (responsible_role = 'office_manager' and my_role() = any (array['office_manager', 'senior_office_manager']))
  );

-- ---------------------------------------------------------------------
-- run_control_checks() — запуск всех проверок разом.
-- ---------------------------------------------------------------------
create or replace function run_control_checks()
returns table(critical_count integer, important_count integer, info_count integer, total_active integer, auto_resolved integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_keys text[] := '{}';
  v_batch text[];
  v_resolved int := 0;
begin
  if not is_admin() then
    raise exception 'Недостаточно прав для запуска проверки';
  end if;

  -- ===== A1: незаполненные занятия преподавателя (запланировано,
  --      дата прошла, не проведено и не отменено). Это САМОЕ ГЛАВНОЕ
  --      правило ТЗ (п.4.1,5): занятие не пропадает, пока не обработано. =====
  with found as (
    select
      'teacher_lesson_unfilled:' || l.id as dedup_key,
      t.profile_id as responsible_user_id,
      g.office as office, l.group_id, l.schedule_id, l.id as lesson_id,
      'Не заполнено занятие ' || to_char(l.lesson_date, 'DD.MM') || ' — ' || coalesce(g.name, '—') as title,
      'Преподаватель: ' || coalesce(t.full_name, '—') || '. Группа: ' || coalesce(g.name, '—')
        || '. Офис: ' || coalesce(g.office, '—') || '. Предмет: ' || coalesce(split_part(g.subject_name, ' / ', 1), '—') as description,
      case when current_date - l.lesson_date > 14 then 'critical' else 'important' end as priority,
      l.lesson_date as due_date
    from lessons l
    join groups g on g.id = l.group_id
    left join teachers t on t.id = l.teacher_id
    where l.teacher_id is not null and l.status = 'planned' and l.lesson_date < current_date
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, office, group_id, schedule_id, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'teacher_lesson_unfilled', 'teacher', priority, responsible_user_id, 'teacher', office, group_id, schedule_id, lesson_id, title, description,
           'Заполнить занятие и указать посещаемость', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, description = excluded.description, priority = excluded.priority,
      responsible_user_id = excluded.responsible_user_id, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== A2: проведённый урок без посещаемости — КРИТИЧНО (п.4.2,3) =====
  with found as (
    select
      'teacher_lesson_no_attendance:' || l.id as dedup_key,
      t.profile_id as responsible_user_id,
      g.office as office, l.group_id, l.schedule_id, l.id as lesson_id,
      'Проведён урок без посещаемости — ' || to_char(l.lesson_date, 'DD.MM') || ' ' || coalesce(g.name, '—') as title,
      'Преподаватель: ' || coalesce(t.full_name, '—') || '. Группа: ' || coalesce(g.name, '—') as description,
      l.lesson_date as due_date
    from lessons l
    join groups g on g.id = l.group_id
    left join teachers t on t.id = l.teacher_id
    where l.status = 'проведён'
      and not exists (select 1 from attendance a where a.lesson_id = l.id)
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, office, group_id, schedule_id, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'teacher_lesson_no_attendance', 'teacher', 'critical', responsible_user_id, 'teacher', office, group_id, schedule_id, lesson_id, title, description,
           'Заполнить посещаемость', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, description = excluded.description, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== A3: проведённый урок без темы (п.4.3) =====
  with found as (
    select
      'teacher_lesson_no_topic:' || l.id as dedup_key,
      t.profile_id as responsible_user_id,
      g.office as office, l.group_id, l.schedule_id, l.id as lesson_id,
      'Не указана тема занятия — ' || to_char(l.lesson_date, 'DD.MM') || ' ' || coalesce(g.name, '—') as title,
      'Преподаватель: ' || coalesce(t.full_name, '—') as description,
      l.lesson_date as due_date
    from lessons l
    join groups g on g.id = l.group_id
    left join teachers t on t.id = l.teacher_id
    where l.status = 'проведён' and (l.topic is null or trim(l.topic) = '')
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, office, group_id, schedule_id, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'teacher_lesson_no_topic', 'teacher', 'important', responsible_user_id, 'teacher', office, group_id, schedule_id, lesson_id, title, description,
           'Указать тему занятия', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== A4: некорректное количество уроков (п.4.4) =====
  with found as (
    select
      'teacher_lesson_bad_count:' || l.id as dedup_key,
      t.profile_id as responsible_user_id,
      g.office as office, l.group_id, l.schedule_id, l.id as lesson_id,
      'Некорректно указано количество уроков — ' || to_char(l.lesson_date, 'DD.MM') || ' ' || coalesce(g.name, '—') as title,
      'Преподаватель: ' || coalesce(t.full_name, '—') || '. Указано: ' || coalesce(l.lessons_count::text, 'пусто') as description,
      l.lesson_date as due_date
    from lessons l
    join groups g on g.id = l.group_id
    left join teachers t on t.id = l.teacher_id
    where l.status = 'проведён' and (l.lessons_count is null or l.lessons_count not in (1, 2, 3))
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, office, group_id, schedule_id, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'teacher_lesson_bad_count', 'teacher', 'important', responsible_user_id, 'teacher', office, group_id, schedule_id, lesson_id, title, description,
           'Исправить количество уроков (1/2/3)', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, description = excluded.description, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== A5: в занятии из расписания с ассистентом ассистент не
  --      попал — только пока занятие ЕЩЁ НЕ проведено (проведённое —
  --      исторический факт, не трогаем и не жалуемся на него, п.4.5) =====
  with found as (
    select
      'teacher_lesson_missing_assistant:' || l.id as dedup_key,
      t.profile_id as responsible_user_id,
      g.office as office, l.group_id, l.schedule_id, l.id as lesson_id,
      'В занятии отсутствует ассистент — ' || to_char(l.lesson_date, 'DD.MM') || ' ' || coalesce(g.name, '—') as title,
      'По расписанию должен быть ассистент, но в занятии его нет' as description,
      l.lesson_date as due_date
    from lessons l
    join schedule sc on sc.id = l.schedule_id
    join groups g on g.id = l.group_id
    left join teachers t on t.id = l.teacher_id
    where l.status = 'planned' and sc.assistant_id is not null and l.assistant_id is null
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, office, group_id, schedule_id, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'teacher_lesson_missing_assistant', 'teacher', 'important', responsible_user_id, 'methodist', office, group_id, schedule_id, lesson_id, title, description,
           'Проверить синхронизацию расписания / указать ассистента', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== B1: кураторское занятие без темы (п.6, адаптировано под
  --      реальную архитектуру — see шапка файла) =====
  with found as (
    select
      'curator_lesson_no_topic:' || l.id as dedup_key,
      c.profile_id as responsible_user_id,
      l.id as lesson_id,
      'Кураторское занятие без темы — ' || to_char(l.lesson_date, 'DD.MM') as title,
      'Куратор: ' || coalesce(c.full_name, '—') as description,
      l.lesson_date as due_date
    from lessons l
    left join curators c on c.id = l.curator_id
    where l.is_extra = true and (l.topic is null or trim(l.topic) = '')
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'curator_lesson_no_topic', 'curator', 'important', responsible_user_id, 'curator', lesson_id, title, description,
           'Указать тему занятия', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== B2: кураторское занятие без учеников =====
  with found as (
    select
      'curator_lesson_no_students:' || l.id as dedup_key,
      c.profile_id as responsible_user_id,
      l.id as lesson_id,
      'Кураторское занятие без учеников — ' || to_char(l.lesson_date, 'DD.MM') as title,
      'Куратор: ' || coalesce(c.full_name, '—') as description,
      l.lesson_date as due_date
    from lessons l
    left join curators c on c.id = l.curator_id
    where l.is_extra = true
      and not exists (select 1 from lesson_students ls where ls.lesson_id = l.id)
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_user_id, responsible_role, lesson_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'curator_lesson_no_students', 'curator', 'important', responsible_user_id, 'curator', lesson_id, title, description,
           'Указать состав учеников занятия', due_date, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== C1: ученик без единой группы (п.7,10) =====
  with found as (
    select
      'student_no_group:' || s.id as dedup_key,
      s.id as student_id, s.office as office,
      'Ученик не распределён в группу — ' || s.full_name as title,
      'Офис: ' || coalesce(s.office, '—') as description
    from students s
    where s.archived = false
      and not exists (select 1 from student_groups sg where sg.student_id = s.id)
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_role, office, student_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'student_no_group', 'students', 'important', 'office_manager', office, student_id, title, description,
           'Распределить ученика в группу', current_date + 2, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== C2: группа без учеников — информационно, не срочно (п.10) =====
  with found as (
    select
      'group_no_students:' || g.id as dedup_key,
      g.id as group_id, g.office as office,
      'Группа без учеников — ' || g.name as title,
      'Офис: ' || coalesce(g.office, '—') as description
    from groups g
    where g.archived = false
      and not exists (select 1 from student_groups sg where sg.group_id = g.id)
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_role, office, group_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'group_no_students', 'students', 'info', 'office_manager', office, group_id, title, description,
           'Проверить, нужна ли эта группа', current_date + 7, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== D1: расписание ссылается на архивного преподавателя (п.8.3) =====
  with found as (
    select
      'schedule_inactive_teacher:' || sc.id as dedup_key,
      sc.id as schedule_id, sc.office as office, sc.group_id as group_id,
      'Расписание ссылается на неактивного преподавателя — ' || coalesce(g.name, sc.room) as title,
      'Преподаватель: ' || coalesce(t.full_name, '—') || ' (архивирован)' as description
    from schedule sc
    join teachers t on t.id = sc.teacher_id
    left join groups g on g.id = sc.group_id
    where sc.archived = false and t.archived = true
  ), ins as (
    insert into control_tasks(dedup_key, type, category, priority, responsible_role, office, group_id, schedule_id, title, description, action_required, due_date, created_by)
    select dedup_key, 'schedule_inactive_teacher', 'schedule', 'important', 'methodist', office, group_id, schedule_id, title, description,
           'Назначить действующего преподавателя в расписании', current_date + 1, auth.uid()
    from found
    on conflict (dedup_key) do update set
      title = excluded.title, updated_at = now(),
      status = case when control_tasks.status in ('resolved', 'verified') then 'new' else control_tasks.status end
    where control_tasks.status <> 'rejected'
    returning dedup_key
  )
  select array_agg(dedup_key) into v_batch from ins;
  v_keys := v_keys || coalesce(v_batch, '{}');

  -- ===== Авто-закрытие: проблема реально исчезла (п.19,34) — задача
  --      ранее известного (реализованного здесь) типа, всё ещё активная,
  --      но её dedup_key не встретился в этом прогоне ни в одном блоке
  --      выше. История НЕ удаляется, только смена статуса. =====
  update control_tasks
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
  where status in ('new', 'assigned', 'in_progress')
    and type in (
      'teacher_lesson_unfilled', 'teacher_lesson_no_attendance', 'teacher_lesson_no_topic',
      'teacher_lesson_bad_count', 'teacher_lesson_missing_assistant',
      'curator_lesson_no_topic', 'curator_lesson_no_students',
      'student_no_group', 'group_no_students', 'schedule_inactive_teacher'
    )
    and not (dedup_key = any (v_keys));
  get diagnostics v_resolved = row_count;

  return query
  select
    count(*) filter (where priority = 'critical')::int,
    count(*) filter (where priority = 'important')::int,
    count(*) filter (where priority = 'info')::int,
    count(*)::int,
    v_resolved
  from control_tasks
  where status in ('new', 'assigned', 'in_progress');
end;
$function$;

grant execute on function run_control_checks() to authenticated;

-- ---------------------------------------------------------------------
-- Изменение статуса/назначения/комментария — точечная RPC вместо
-- прямого UPDATE с фронта, чтобы правильно проставлять
-- assigned_at/started_at/resolved_at/verified_at и не давать менять
-- чужие задачи в обход RLS (та же admin-only проверка, что и у RLS-
-- политики на запись, но плюс history-таймстемпы одним действием).
-- ---------------------------------------------------------------------
create or replace function update_control_task(
  p_id uuid, p_status text, p_responsible_user_id uuid, p_due_date date, p_comment_admin text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'Недостаточно прав для изменения задачи контроля';
  end if;
  if p_status is not null and p_status not in ('new', 'assigned', 'in_progress', 'resolved', 'verified', 'rejected') then
    raise exception 'Неизвестный статус: %', p_status;
  end if;

  update control_tasks set
    status = coalesce(p_status, status),
    responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id),
    due_date = coalesce(p_due_date, due_date),
    comment_admin = coalesce(p_comment_admin, comment_admin),
    updated_at = now(),
    assigned_at = case when p_status = 'assigned' and assigned_at is null then now() else assigned_at end,
    started_at = case when p_status = 'in_progress' and started_at is null then now() else started_at end,
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
    resolved_by = case when p_status = 'resolved' then auth.uid() else resolved_by end,
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    verified_by = case when p_status = 'verified' then auth.uid() else verified_by end
  where id = p_id;
end;
$function$;

grant execute on function update_control_task(uuid, text, uuid, date, text) to authenticated;
