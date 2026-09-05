-- =====================================================================
--  61B. МЕТОДИСТ: RLS-политики + служебные функции
--
--  Выполнить ОТДЕЛЬНЫМ запуском, ПОСЛЕ того как 61A уже выполнен и
--  показал успех (значение 'methodist' уже зафиксировано в enum).
--
--  Что делает методист (по ТЗ «Новая вкладка Методисты»): управляет
--  учениками/группами/расписанием СВОЕГО офиса. НЕ трогает зарплаты,
--  ставки, роли пользователей, чужие офисы.
--
--  Важно про модель безопасности (проверено живыми политиками —
--  см. переписку, запрос pg_policies перед этой миграцией):
--   - Чтение students/groups/student_groups/schedule сейчас открыто
--     ЛЮБОМУ авторизованному пользователю (auth.role()='authenticated')
--     — это НЕ связано с методистом, так было для куратора/учителя и
--     раньше (куратору по бизнес-правилам нужно видеть учеников всех
--     офисов). Полностью закрыть чтение только для методиста, оставив
--     его широким для остальных ролей, — отдельная более крупная
--     переделка, здесь НЕ делается, чтобы не сломать куратора/учителя.
--   - А вот ЗАПИСЬ (создать/изменить/удалить) — здесь ограничивается
--     по-настоящему, на уровне RLS, а не только скрытием кнопок:
--     методист может писать только там, где office совпадает с его
--     office в profiles (my_office()). Это и проверяется в п.41-42 ТЗ.
--
--  Политики добавляются, а не заменяют существующие ("admin"/"om") —
--  никакого риска для admin/office_manager/teacher/curator и т.д.
-- =====================================================================

-- ---------- Хелпер: текущий пользователь — методист? ----------
create or replace function is_methodist()
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'methodist');
$$;

-- ---------- students: методист пишет только свой офис ----------
drop policy if exists "students methodist write" on students;
create policy "students methodist write" on students
for all
using (is_methodist() and office = my_office())
with check (is_methodist() and office = my_office());

-- ---------- groups: методист пишет только свой офис ----------
drop policy if exists "groups methodist write" on groups;
create policy "groups methodist write" on groups
for all
using (is_methodist() and office = my_office())
with check (is_methodist() and office = my_office());

-- ---------- student_groups: и ученик, и группа должны быть его офиса ----------
drop policy if exists "student_groups methodist write" on student_groups;
create policy "student_groups methodist write" on student_groups
for all
using (
  is_methodist()
  and exists (select 1 from students s where s.id = student_groups.student_id and s.office = my_office())
  and exists (select 1 from groups g where g.id = student_groups.group_id and g.office = my_office())
)
with check (
  is_methodist()
  and exists (select 1 from students s where s.id = student_groups.student_id and s.office = my_office())
  and exists (select 1 from groups g where g.id = student_groups.group_id and g.office = my_office())
);

-- ---------- schedule: у офис-менеджера доступа к расписанию нет вообще,
-- методисту он нужен по ТЗ — своя новая политика на весь CRUD в своём офисе ----------
drop policy if exists "schedule methodist all" on schedule;
create policy "schedule methodist all" on schedule
for all
using (is_methodist() and office = my_office())
with check (is_methodist() and office = my_office());

-- ---------- Список учёток по ролям + статус (активен/заблокирован) ----------
-- Обычный select из profiles не знает про блокировку входа (она хранится
-- в auth.users.banned_until, не в profiles) — поэтому отдельная RPC,
-- как и раньше для office_manager/accountant (fetchProfilesByRole).
-- Используется только для новой вкладки «Методисты» (там нужен статус),
-- остальные вкладки продолжают читать profiles напрямую, без изменений.
create or replace function admin_list_accounts(p_roles text[])
returns table(id uuid, full_name text, username text, role user_role, office text, active boolean)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select p.id, p.full_name, p.username, p.role, p.office,
         (u.banned_until is null or u.banned_until < now()) as active
  from profiles p
  join auth.users u on u.id = p.id
  where is_admin() and p.role = any(p_roles::user_role[])
  order by p.full_name;
$$;

grant execute on function admin_list_accounts(text[]) to authenticated;

-- ---------- Заблокировать/разблокировать учётку без физического удаления ----------
-- Использует встроенный механизм Supabase Auth (banned_until), а не
-- удаление auth.users — профиль, история назначений и все связанные
-- записи (student_groups, созданные группы и т.д.) остаются нетронуты.
create or replace function admin_set_account_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if not is_admin() then raise exception 'Недостаточно прав'; end if;
  update auth.users
  set banned_until = case when p_active then null else 'infinity'::timestamptz end
  where id = p_profile_id;
end;
$$;

grant execute on function admin_set_account_active(uuid, boolean) to authenticated;
