-- =====================================================================
--  62. МЕТОДИСТ — ДОСТУП КО ВСЕМ ОФИСАМ (не только к своему)
--
--  Меняем решение из 61B: там методист был ограничен своим офисом
--  (office = my_office()), по аналогии с обычным офис-менеджером.
--  Теперь — как договорились — ЛЮБОЙ методист видит и может
--  редактировать учеников/группы/расписание ВСЕХ офисов, без
--  исключений. Поле profile.office для методиста больше не имеет
--  значения (можно оставить как есть у уже созданных — просто не
--  используется политиками ниже).
--
--  Выполнить в Supabase -> SQL Editor ЦЕЛИКОМ, после 61A/61B.
-- =====================================================================

drop policy if exists "students methodist write" on students;
create policy "students methodist write" on students
for all
using (is_methodist())
with check (is_methodist());

drop policy if exists "groups methodist write" on groups;
create policy "groups methodist write" on groups
for all
using (is_methodist())
with check (is_methodist());

drop policy if exists "student_groups methodist write" on student_groups;
create policy "student_groups methodist write" on student_groups
for all
using (is_methodist())
with check (is_methodist());

drop policy if exists "schedule methodist all" on schedule;
create policy "schedule methodist all" on schedule
for all
using (is_methodist())
with check (is_methodist());
