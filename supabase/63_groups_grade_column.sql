-- =====================================================================
--  63. КЛАСС КАК ОТДЕЛЬНОЕ ПОЛЕ У ГРУПП (+ доб. учеников без класса)
--
--  Аудит (сделан перед миграцией, см. переписку):
--   - students.grade УЖЕ существует, тип text, значения чистые:
--     166 × '10', 537 × '11', 30 × NULL. Новую колонку НЕ создаём —
--     это и есть каноничное поле, просто дозаполняем 30 пустых.
--   - groups такого поля не имеет вообще (id/name/archived/note/
--     capacity/office/lang/subject_name/monthly_fee) — добавляем.
--   - 275 из 287 активных групп начинаются с "10"/"11" — класс для
--     них однозначно берём из префикса имени (единственный источник
--     истины на сегодня, парсинг здесь оправдан как МИГРАЦИОННЫЙ шаг,
--     а не как постоянный способ — дальше группа создаётся уже с
--     явным полем grade, без всякого парсинга).
--   - 12 групп — служебные заглушки без класса ("профиль не выбран",
--     "думают над профилем", "творческий" и т.п.) — им класс
--     физически не определить, оставляем grade = NULL осознанно.
--   - Все 30 учеников без grade состоят ТОЛЬКО в группах "11..."
--     (проверено поимённо) — заполняем им grade='11' из факта
--     принадлежности к группам, а не гаданием.
--
--  Уникальность групп (name, office) НЕ меняю: класс для обычных
--  групп и так уже "зашит" в name (10 КМБ-1 и 11 КМБ-1 — разные
--  строки name), реальной коллизии это не создаёт. Менять индекс
--  ради нового поля, которое ничего не разрешает нового, — лишний
--  риск без пользы.
-- =====================================================================

alter table groups add column if not exists grade text;

-- ---------- 1. Класс групп — из префикса имени (миграционный разовый шаг) ----------
update groups
set grade = left(name, 2)
where archived = false and grade is null and left(name, 2) in ('10', '11');

-- ---------- 2. Класс учеников без grade — из ИХ ЖЕ фактических групп ----------
-- Заполняем ТОЛЬКО если у ученика есть хотя бы одна группа и ВСЕ его
-- группы согласны в классе (единственный вывод без гадания). Если у
-- ученика групп нет или они противоречат друг другу — остаётся NULL.
with derived as (
  select sg.student_id, g.grade
  from student_groups sg
  join groups g on g.id = sg.group_id and g.archived = false and g.grade is not null
  group by sg.student_id, g.grade
),
unambiguous as (
  select student_id, max(grade) as grade
  from derived
  group by student_id
  having count(distinct grade) = 1
)
update students s
set grade = u.grade
from unambiguous u
where s.id = u.student_id and s.archived = false and s.grade is null;

-- ---------- Проверка 1: у скольких активных групп остался пустой класс ----------
select id, name, office, lang, subject_name
from groups
where archived = false and grade is null
order by name;

-- ---------- Проверка 2: у скольких активных учеников остался пустой класс ----------
select count(*) as students_still_without_grade
from students
where archived = false and grade is null;

-- ---------- Проверка 3: итоговое распределение ----------
select 'groups' as what, grade, count(*) from groups where archived = false group by grade
union all
select 'students' as what, grade, count(*) from students where archived = false group by grade
order by what, grade;
