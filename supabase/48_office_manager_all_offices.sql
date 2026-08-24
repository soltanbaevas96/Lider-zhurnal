-- =====================================================================
--  ЛИДЕР+ · Миграция №48: офис-менеджерам — полный доступ ко всем
--  офисам по ученикам и группам (как у старшего офис-менеджера)
--
--  Причина: ученик может ходить на занятия в другой офис, чем тот,
--  где он изначально заведён — офис-менеджеру нужно находить и
--  привязывать таких учеников к группам своего офиса, и наоборот.
--
--  student_groups уже не ограничена по офису (проверено) — правим
--  только students и groups: убираем условие "office = my_office()"
--  для office_manager, оставляя его наравне с senior_office_manager.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ.
-- =====================================================================

drop policy if exists "students om write" on students;
create policy "students om write" on students
for all
using (is_admin() OR my_role() = ANY (ARRAY['senior_office_manager','office_manager']))
with check (is_admin() OR my_role() = ANY (ARRAY['senior_office_manager','office_manager']));

drop policy if exists "groups om write" on groups;
create policy "groups om write" on groups
for all
using (is_admin() OR my_role() = ANY (ARRAY['senior_office_manager','office_manager']))
with check (is_admin() OR my_role() = ANY (ARRAY['senior_office_manager','office_manager']));
