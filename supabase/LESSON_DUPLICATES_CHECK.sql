-- =====================================================================
--  ДИАГНОСТИКА (только чтение, ничего не меняет и не удаляет) — есть ли
--  УЖЕ в базе дубли занятий одного преподавателя+группы+дня.
--
--  Зачем: миграция 70 закрывает СОЗДАНИЕ новых дублей вперёд, но не
--  трогает то, что уже могло накопиться раньше (см. п.19 ТЗ — сначала
--  найти и показать количество, ничего не удалять автоматически).
--
--  Выполните и пришлите результат обоих запросов.
-- =====================================================================

-- 1. Группы (преподаватель, группа, дата), где больше одного lesson —
--    именно этот ключ теперь защищён миграцией 70 от НОВЫХ дублей.
select teacher_id, group_id, lesson_date, count(*) as dup_count,
       array_agg(id order by id) as lesson_ids,
       array_agg(status order by id) as statuses,
       array_agg(schedule_id order by id) as schedule_ids
from lessons
where teacher_id is not null and group_id is not null
group by teacher_id, group_id, lesson_date
having count(*) > 1
order by dup_count desc, lesson_date desc;

-- 2. Сколько всего непроведённых занятий в прошлом у каждого
--    преподавателя прямо сейчас — именно они появятся в блоке
--    «Непроведённые» после миграции 70 (полезно понять масштаб заранее).
select teacher_id, count(*) as overdue_count, min(lesson_date) as oldest, max(lesson_date) as newest
from lessons
where teacher_id is not null
  and lesson_date < current_date
  and status not in ('проведён', 'отменён')
group by teacher_id
order by overdue_count desc;
