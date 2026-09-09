-- =====================================================================
--  ДИАГНОСТИКА (только чтение) — детали по дублям категории «Б»
--  (обе записи уже «проведён», см. предыдущий результат
--  LESSON_DUPLICATES_CHECK.sql). Ничего не удаляет и не меняет.
--
--  Цель: понять, отличаются ли записи в каждой паре по факту (тема,
--  план, посещаемость) — если посещаемость РАЗНАЯ, это может быть два
--  реальных разных занятия, объединять/удалять нельзя. Если
--  посещаемость идентична или у одной записи посещаемости нет вообще —
--  это, скорее всего, настоящий дубль (двойной клик до этой правки).
--
--  Выполните и пришлите результат.
-- =====================================================================

with dup_pairs as (
  select teacher_id, group_id, lesson_date
  from lessons
  where teacher_id is not null and group_id is not null and status = 'проведён'
  group by teacher_id, group_id, lesson_date
  having count(*) > 1
)
select
  l.id, l.teacher_id, l.group_id, l.lesson_date, l.lessons_count,
  l.topic, l.plan_path, l.created_at,
  (select count(*) from attendance a where a.lesson_id = l.id) as attendance_rows,
  (select count(*) from attendance a where a.lesson_id = l.id and a.present) as attendance_present
from lessons l
join dup_pairs dp on dp.teacher_id = l.teacher_id and dp.group_id = l.group_id and dp.lesson_date = l.lesson_date
where l.status = 'проведён'
order by l.teacher_id, l.group_id, l.lesson_date, l.created_at;
