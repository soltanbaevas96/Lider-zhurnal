-- =====================================================================
--  65. КАБИНЕТ ПРЕПОДАВАТЕЛЯ/КУРАТОРА: 2 реальных пробела, найденных
--      аудитом перед переработкой интерфейса
--
--  1. get_my_lessons() не возвращал plan_path — «Мои занятия» физически
--     не могли показать бейдж «план прикреплён / нет плана» на карточке
--     занятия (а это явно нужно по ТЗ). Просто добавляем колонку —
--     сам список/фильтр/права функции не меняются.
--
--  2. Storage-политики bucket'а lesson-plans сейчас разрешают ЛЮБОМУ
--     авторизованному читать/загружать/заменять ЛЮБОЙ файл плана —
--     не только свой. Проверено (см. переписку): "plans read/write/
--     update authed" — просто auth.role()='authenticated', без всякой
--     привязки к владельцу. Значит один преподаватель мог посмотреть
--     или подменить план другого — нарушение прав.
--
--     Чинится ТОЛЬКО для новых файлов: путь загрузки меняется на
--     "<teacher_id>/<uuid>.<ext>" (было просто "<uuid>.<ext>"), и
--     политики теперь проверяют первый сегмент пути. Уже загруженные
--     старые файлы (без папки-префикса) останутся читаемы всем, как
--     раньше, — переносить существующие файлы в Storage через SQL
--     нельзя, это отдельная (более рискованная) операция с реальными
--     бинарными файлами, сюда сознательно не включена.
--
--  Выполнить в Supabase -> SQL Editor ЦЕЛИКОМ.
-- =====================================================================

-- ---------- 1. get_my_lessons: добавить plan_path ----------
create or replace function get_my_lessons(p_date date)
returns table(
  lesson_id uuid, group_id uuid, group_name text, subject_name text, office text,
  lesson_date date, lessons_count integer, topic text, status text,
  assistant_name text, students_count integer, time_text text, plan_path text
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
    l.plan_path
  from lessons l
  join groups g on g.id = l.group_id
  left join assistants a on a.id = l.assistant_id
  left join schedule sc on sc.id = l.schedule_id
  where l.lesson_date = p_date
    and l.teacher_id = my_teacher_id()
  order by sc.time_text nulls last, g.name;
$$;

-- ---------- 2. Storage: файл плана — только свой преподаватель (+ admin) ----------
drop policy if exists "plans read authed" on storage.objects;
drop policy if exists "plans write authed" on storage.objects;
drop policy if exists "plans update authed" on storage.objects;

create policy "plans read own" on storage.objects
  for select using (
    bucket_id = 'lesson-plans' and auth.uid() is not null and (
      is_admin()
      or (storage.foldername(name))[1] = my_teacher_id()::text
      -- старые файлы без папки-префикса (загружены до этой миграции) —
      -- у них foldername(name) пуст, оставляем читаемыми всем, чтобы
      -- не потерять доступ к уже прикреплённым планам.
      or cardinality(storage.foldername(name)) = 0
    )
  );

create policy "plans write own" on storage.objects
  for insert with check (
    bucket_id = 'lesson-plans' and auth.uid() is not null and (
      is_admin() or (storage.foldername(name))[1] = my_teacher_id()::text
    )
  );

create policy "plans update own" on storage.objects
  for update using (
    bucket_id = 'lesson-plans' and auth.uid() is not null and (
      is_admin() or (storage.foldername(name))[1] = my_teacher_id()::text
    )
  );

create policy "plans delete own" on storage.objects
  for delete using (
    bucket_id = 'lesson-plans' and auth.uid() is not null and (
      is_admin() or (storage.foldername(name))[1] = my_teacher_id()::text
    )
  );
