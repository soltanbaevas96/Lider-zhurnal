-- =====================================================================
--  ЛИДЕР+ · Расширение №4: количество уроков вместо времени
--  Урок теперь = 1, 2 или 3 проведённых занятия. Время начала/конца не нужно.
--  Выполнить в Supabase → SQL Editor ПОСЛЕ остальных.
-- =====================================================================

-- Колонка: сколько уроков проведено за эту запись (1..3)
alter table lessons add column if not exists lessons_count int not null default 1;

-- Время больше не обязательно (оставляем колонки, чтобы старые данные не потерять,
-- но новые записи их не заполняют). Делаем nullable, если ещё не.
alter table lessons alter column start_time drop not null;
alter table lessons alter column end_time drop not null;

-- Для старых записей проставим lessons_count = 1, если вдруг 0
update lessons set lessons_count = 1 where lessons_count is null or lessons_count = 0;
