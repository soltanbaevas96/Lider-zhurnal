-- =====================================================================
--  ПРОВЕРКА: дубли учеников (не дубли ссылок на группу — это физически
--  невозможно, у student_groups уже есть primary key student_id+group_id).
--  ТОЛЬКО ЧТЕНИЕ. Выполнить целиком, прислать результат.
-- =====================================================================

-- 1. Конкретно "Сыздыкова Инабат" — сколько карточек, все поля,
--    в каких группах состоит каждая.
select s.id, s.full_name, s.office, s.lang, s.contract_no, s.archived,
       s.created_at, s.enrolled_at,
       (select string_agg(g.name, ', ') from student_groups sg
          join groups g on g.id = sg.group_id where sg.student_id = s.id) as groups
from students s
where s.full_name ilike '%Сыздыкова Инабат%'
order by s.created_at;

-- 2. Общая картина: сколько ещё таких же "тёзок" (не архивных) по всей базе.
select full_name, count(*) as cnt,
       array_agg(id) as ids,
       array_agg(coalesce(office,'—')) as offices
from students
where archived = false
group by full_name
having count(*) > 1
order by cnt desc, full_name;
