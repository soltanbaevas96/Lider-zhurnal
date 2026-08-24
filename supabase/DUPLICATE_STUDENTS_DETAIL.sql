-- =====================================================================
--  Подробности по каждой из 7 пар одноимённых учеников: контакты,
--  договор, группы, есть ли посещаемость/оплаты — чтобы понять,
--  какая карточка «призрак» (пустая), а какая настоящая.
--  ТОЛЬКО ЧТЕНИЕ. Один запрос — выполнить целиком, прислать результат.
-- =====================================================================
select
  s.full_name,
  s.id,
  s.office,
  s.lang,
  s.contract_no,
  s.phone,
  s.parent_name,
  s.parent_phone,
  s.created_at,
  s.enrolled_at,
  (select string_agg(g.name || ' (' || coalesce(g.office,'—') || ')', ', ')
     from student_groups sg join groups g on g.id = sg.group_id
     where sg.student_id = s.id) as groups,
  (select count(*) from attendance a where a.student_id = s.id) as attendance_rows
from students s
where s.archived = false
  and s.full_name in (
    'Аскарова Аиша', 'Жылкайдаров Алтынбек', 'Кабыш Мансур', 'Кужахмет Алихан',
    'Мухансаликова Амира', 'Сыздыкова Инабат', 'Торатхан Бислан'
  )
order by s.full_name, s.created_at;
