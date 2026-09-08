-- =====================================================================
--  69. КАБИНЕТ КУРАТОРА — реальная дыра в правах доступа (не RLS, а
--  сами RPC), найденная по факту (тела функций получены из живой базы).
--
--  Белый экран уже исправлен на фронтенде (отсутствовавший импорт
--  todayStr) — этой миграцией закрывается САМОЕ серьёзное из
--  найденного при полном аудите (п.32,15,TEST 15 ТЗ):
--
--   - create_curator_lesson(p_curator_id, ...) НЕ проверяла, что
--     вызывающий пользователь — это и есть куратор p_curator_id.
--     Любой залогиненный мог создать занятие ОТ ИМЕНИ ЛЮБОГО куратора,
--     просто передав чужой curator_id.
--   - get_curator_lessons(p_curator_id, ...) — та же проблема:
--     p_curator_id вообще не сверялся с вызывающим пользователем.
--     Любой залогиненный мог прочитать чужие занятия и ФИО учеников
--     ЛЮБОГО куратора — TEST 15 из ТЗ («куратор не может получить
--     данные другого куратора») ФАКТИЧЕСКИ НЕ ВЫПОЛНЯЛСЯ.
--   - delete_curator_lesson(p_lesson_id) — удаляла занятие ПО ID БЕЗ
--     всякой проверки владельца. Любой залогиненный мог удалить ЛЮБОЕ
--     занятие любого куратора.
--   - get_curator_payroll(p_month) — отдавала ставки и суммы ВСЕХ
--     кураторов без проверки роли вызывающего (не строго часть
--     кабинета куратора, но раз уже здесь — закрываем и это).
--   - RLS на lesson_students (write И read) стояла как
--     "auth.uid() is not null" — по сути без ограничений: любой
--     залогиненный мог напрямую (в обход RPC) дописать/удалить состав
--     учеников в ЛЮБОМ занятии куратора.
--
--  Почему это не было видно раньше: в приложении сейчас единственный
--  вызывающий — сам куратор через свой кабинет с собственным
--  curator_id, поэтому баг не проявлялся в обычной работе. Но
--  SECURITY DEFINER-функции полностью обходят RLS, и без явной
--  проверки внутри они доверяли параметрам от клиента — ровно то,
--  от чего явно предостерегает п.32 ТЗ («не полагаться только на
--  frontend»).
--
--  Заодно (п.13-15 ТЗ, на будущее): get_curator_lessons считал ВСЕ
--  занятия куратора независимо от статуса, тогда как get_curator_payroll
--  считает только status='проведён'. Сейчас у всех занятий куратора
--  статус 'проведён' (удаление — физическое, отмены как отдельного
--  статуса ещё не бывает), поэтому расхождения нет, но если в будущем
--  появится отмена — цифра «уроков за месяц» в кабинете куратора и
--  реальная зарплата разойдутся. Синхронизировано заранее.
--
--  НЕ создано новых таблиц, НЕ изменена бизнес-логика подсчёта
--  (сессии vs уроки — уже считалось верно), НЕ создано новых статусов.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 68.
-- =====================================================================

-- ---------- 1. create_curator_lesson: только свой curator_id (или admin) ----------
create or replace function create_curator_lesson(
  p_curator_id uuid, p_date date, p_lessons_count integer, p_topic text, p_student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_lesson uuid; v_sid uuid;
begin
  if not is_admin() and (my_curator_id() is null or p_curator_id is distinct from my_curator_id()) then
    raise exception 'Недостаточно прав: можно создавать занятия только от своего имени';
  end if;

  insert into lessons (curator_id, is_extra, lesson_date, lessons_count, topic, status, students, created_by)
  values (p_curator_id, true, coalesce(p_date, current_date), greatest(p_lessons_count,1),
          coalesce(p_topic,''), 'проведён', coalesce(array_length(p_student_ids,1),0), auth.uid())
  returning id into v_lesson;

  if p_student_ids is not null then
    foreach v_sid in array p_student_ids loop
      insert into lesson_students (lesson_id, student_id) values (v_lesson, v_sid)
      on conflict do nothing;
    end loop;
  end if;
  return v_lesson;
end $function$;

grant execute on function create_curator_lesson(uuid, date, integer, text, uuid[]) to authenticated;

-- ---------- 2. get_curator_lessons: только свой curator_id (или admin/
--    бухгалтер — им уже разрешено читать lessons/attendance по другим
--    политикам, логично дать и здесь) + считаем только 'проведён',
--    как и зарплата ----------
create or replace function get_curator_lessons(p_curator_id uuid, p_from date, p_to date)
returns table(id uuid, lesson_date date, lessons_count integer, topic text, student_count integer, student_names text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (is_admin() or is_accountant())
     and (my_curator_id() is null or p_curator_id is distinct from my_curator_id()) then
    raise exception 'Недостаточно прав: можно смотреть только свои занятия';
  end if;

  return query
  select
    l.id, l.lesson_date, l.lessons_count, l.topic,
    (select count(*) from lesson_students ls where ls.lesson_id = l.id)::int,
    (select string_agg(s.full_name, ', ') from lesson_students ls
       join students s on s.id = ls.student_id where ls.lesson_id = l.id)
  from lessons l
  where l.curator_id = p_curator_id and l.is_extra = true and l.status = 'проведён'
    and (p_from is null or l.lesson_date >= p_from)
    and (p_to   is null or l.lesson_date <= p_to)
  order by l.lesson_date desc;
end;
$function$;

grant execute on function get_curator_lessons(uuid, date, date) to authenticated;

-- ---------- 3. delete_curator_lesson: только своё занятие (или admin) ----------
create or replace function delete_curator_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() and not exists (
    select 1 from lessons where id = p_lesson_id and is_extra = true and curator_id = my_curator_id()
  ) then
    raise exception 'Недостаточно прав для удаления этого занятия';
  end if;
  delete from lessons where id = p_lesson_id and is_extra = true;
end;
$function$;

grant execute on function delete_curator_lesson(uuid) to authenticated;

-- ---------- 4. get_curator_payroll: только завуч/директор/бухгалтер ----------
create or replace function get_curator_payroll(p_month text)
returns table(curator_id uuid, curator_name text, subject text, rate numeric, lesson_units integer, sessions integer, total numeric, is_closed boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_period_id uuid;
  v_has_snapshot boolean := false;
begin
  if not (is_admin() or is_accountant()) then
    raise exception 'Недостаточно прав для просмотра зарплаты кураторов';
  end if;

  select id into v_period_id from payroll_periods where month = p_month;
  if v_period_id is not null then
    select exists(select 1 from curator_payroll_rows where period_id = v_period_id) into v_has_snapshot;
  end if;

  if v_has_snapshot then
    return query
    select cpr.curator_id, cpr.curator_name, cpr.subject, cpr.rate, cpr.lesson_units, cpr.sessions, cpr.total, true
    from curator_payroll_rows cpr where cpr.period_id = v_period_id
    order by cpr.curator_name;
  else
    return query
    select
      c.id, c.full_name, c.subject, coalesce(c.rate, 0),
      coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0)::int,
      count(l.id) filter (where l.status = 'проведён')::int,
      (coalesce(sum(l.lessons_count) filter (where l.status = 'проведён'), 0) * coalesce(c.rate, 0))::numeric,
      (v_period_id is not null)
    from curators c
    left join lessons l on l.curator_id = c.id and to_char(l.lesson_date, 'YYYY-MM') = p_month
    where c.archived = false
    group by c.id, c.full_name, c.subject, c.rate
    order by c.full_name;
  end if;
end;
$function$;

grant execute on function get_curator_payroll(text) to authenticated;

-- ---------- 5. RLS lesson_students: закрываем прямой доступ в обход RPC
--    (сами RPC — SECURITY DEFINER и эту RLS не проходят, так что для
--    штатной работы приложения ничего не меняется; закрывается только
--    обход через прямой запрос к таблице) ----------
drop policy if exists "lesson_students read" on lesson_students;
create policy "lesson_students read" on lesson_students
for select using (
  is_admin() or is_accountant()
  or exists (select 1 from lessons l where l.id = lesson_students.lesson_id and l.curator_id = my_curator_id())
);

drop policy if exists "lesson_students write" on lesson_students;
create policy "lesson_students write" on lesson_students
for all using (
  is_admin()
  or exists (select 1 from lessons l where l.id = lesson_students.lesson_id and l.curator_id = my_curator_id())
) with check (
  is_admin()
  or exists (select 1 from lessons l where l.id = lesson_students.lesson_id and l.curator_id = my_curator_id())
);
