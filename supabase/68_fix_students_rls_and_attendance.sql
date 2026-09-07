-- =====================================================================
--  68. ИСПРАВЛЕНИЕ: список учеников не грузится в Журнале при
--  редактировании урока.
--
--  Аудит (по коду, до правки):
--   - lesson → group_id → student_groups → students — цепочка в коде
--     (fetchStudentsOfGroup, AttendancePicker) написана ПРАВИЛЬНО:
--     сначала получаются ВСЕ ученики группы, потом поверх накладывается
--     attendance (LEFT JOIN, не INNER) — не единичный источник бага.
--   - RLS НА students/student_groups/teacher_groups/teacher_subjects
--     использует auth.role() = 'authenticated' (03_students_attendance.sql).
--     Это ТОТ ЖЕ класс политики, который в этом проекте уже один раз
--     реально ломал чтение (кураторы не читались именно из-за
--     auth.role() = 'authenticated' вместо auth.uid() is not null —
--     см. историю проекта). PostgREST при таком предикате может не
--     подставить встроенный объект students(...) в JOIN, и тогда
--     .filter((s) => s && !s.archived) молча отфильтрует всё —
--     результат: пустой список БЕЗ ошибки, ровно то, что описано в ТЗ.
--   - Отдельная, независимая, тоже реальная проблема в самом фронтенде
--     (LessonForm.jsx): при РЕДАКТИРОВАНИИ существующего урока, если
--     lesson.group_id почему-то отсутствует, код молча подставлял
--     dict.groups[0]?.id — ПЕРВУЮ ПОПАВШУЮСЯ группу — вместо явной
--     ошибки (нарушение п.19 ТЗ). Исправлено в src/components/LessonForm.jsx.
--   - saveAttendance() и conductLesson() делали DELETE ВСЕХ строк
--     attendance урока + INSERT заново (п.12 ТЗ: нельзя без необходимости).
--     Исправлено в src/lib/api.js на UPSERT по (lesson_id, student_id) —
--     без удаления, что заодно надёжнее защищает историю уже проведённых
--     занятий (п.10-11 ТЗ) при сбое посреди операции.
--
--  Это НЕ ослабление прав — auth.uid() is not null эквивалентно по
--  смыслу "залогинен", просто надёжно вычисляется в контексте RPC/
--  вложенных JOIN-ов, где auth.role() иногда не резолвится. RLS
--  ограничивают доступ по-прежнему только залогиненным пользователям;
--  attendance (реальные персональные данные посещаемости) как были
--  ограничены по my_teacher_id(), так и остаются — их эта миграция
--  не трогает.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 67.
-- =====================================================================

drop policy if exists "students read" on students;
create policy "students read" on students for select using (auth.uid() is not null);

drop policy if exists "sg read" on student_groups;
create policy "sg read" on student_groups for select using (auth.uid() is not null);

drop policy if exists "tg read" on teacher_groups;
create policy "tg read" on teacher_groups for select using (auth.uid() is not null);

drop policy if exists "ts read" on teacher_subjects;
create policy "ts read" on teacher_subjects for select using (auth.uid() is not null);
