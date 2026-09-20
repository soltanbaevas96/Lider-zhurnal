-- =====================================================================
--  76. Преподаватель: право добавлять/убирать учеников ТОЛЬКО в своих
--  группах (ТЗ «Управление группами и общее расписание в кабинете
--  преподавателя»).
--
--  НАЙДЕНО ДИАГНОСТИКОЙ (TEACHER_GROUPS_ACCESS_AUDIT.sql, не гадание):
--  на student_groups сейчас есть ТОЛЬКО политики записи для is_admin(),
--  is_methodist() и office_manager/senior_office_manager — для роли
--  teacher нет ни одной. Значит новая вкладка «Управление» прямо
--  сейчас либо получает ошибку RLS при добавлении ученика (нарушение
--  WITH CHECK на INSERT), либо ТИХО ничего не делает при удалении
--  (DELETE, не подпадающий под USING ни одной политики, просто не
--  находит строк — Postgres не поднимает ошибку на DELETE 0 строк).
--  Второе особенно опасно как незаметный баг, а не как дыра в правах —
--  но фиксировать всё равно нужно именно так, как просит ТЗ: сервер
--  должен реально разрешать/отклонять запрос, а не полагаться на то,
--  что интерфейс не даст выбрать чужую группу.
--
--  ИСПРАВЛЕНИЕ: две новые ТОЧЕЧНЫЕ политики — INSERT и DELETE на
--  student_groups, разрешённые преподавателю ТОЛЬКО когда группа
--  закреплена за ним в teacher_groups (my_teacher_id() из auth.jsx/
--  профиля, та же функция, что и везде в проекте). Существующие
--  политики admin/methodist/office_manager НЕ трогаются и не сужаются —
--  политики RLS складываются через OR, значит методист/завуч/офис-
--  менеджер продолжают работать как раньше, преподавателю просто
--  добавляется собственный, более узкий путь доступа.
--
--  Чтение (SELECT) не меняется — students/groups/student_groups уже
--  открыты на чтение любому авторизованному сотруднику (auth.uid() is
--  not null / auth.role() = 'authenticated') — это существовавшее
--  ДО этой миграции решение (как минимум для быстрого поиска ученика
--  у куратора), эта миграция его не расширяет и не сужает.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ.
-- =====================================================================

drop policy if exists "student_groups teacher insert" on student_groups;
create policy "student_groups teacher insert" on student_groups
for insert
with check (
  exists (
    select 1 from teacher_groups tg
    where tg.group_id = student_groups.group_id and tg.teacher_id = my_teacher_id()
  )
);

drop policy if exists "student_groups teacher delete" on student_groups;
create policy "student_groups teacher delete" on student_groups
for delete
using (
  exists (
    select 1 from teacher_groups tg
    where tg.group_id = student_groups.group_id and tg.teacher_id = my_teacher_id()
  )
);
