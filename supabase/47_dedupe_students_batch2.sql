-- =====================================================================
--  ЛИДЕР+ · Разовая чистка №2 — оставшиеся 4 пары дублей учеников
--  (решения приняты владельцем после сверки дат занятий и групп)
--
--  A) Жылкайдаров Алтынбек — 0f509698… архивируем: все 8 дат занятий
--     уже есть у 817e2002… (главная), группы у обеих карточек те же.
--  B) Мухансаликова Амира — 4758be35… архивируем: все 3 даты уже есть
--     у 71c19cc4… (главная, ведётся активно с 08-12 по сей день).
--  C) Кабыш Мансур — 4e9786e3… переносим целиком в 46a07997… (главная):
--     группы, посещаемость, событий, недостающие поля — и архивируем.
--  D) Аскарова Аиша — 0ac69bae… переносим целиком в 77d6dbbc… (главная)
--     тем же способом.
--
--  При переносе группы/посещаемость, которые уже есть у главной
--  карточки (совпадение), просто пропускаются (on conflict do nothing) —
--  ничего не задваивается и не падает с ошибкой.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ.
-- =====================================================================

-- ---------- A. Жылкайдаров Алтынбек ----------
delete from student_groups where student_id = '0f509698-45b9-4274-91b2-77395fd23700';
update students set archived = true where id = '0f509698-45b9-4274-91b2-77395fd23700';

-- ---------- B. Мухансаликова Амира ----------
delete from student_groups where student_id = '4758be35-b13d-4e8f-810f-c7baffd83e10';
update students set archived = true where id = '4758be35-b13d-4e8f-810f-c7baffd83e10';

-- ---------- C. Кабыш Мансур: 4e9786e3… -> 46a07997… ----------
insert into student_groups (student_id, group_id)
select '46a07997-d34d-49ec-a426-d0656a0eeb4a', group_id
from student_groups where student_id = '4e9786e3-5181-4106-9999-2a3a9b38a20a'
on conflict (student_id, group_id) do nothing;

insert into attendance (lesson_id, student_id, present, status, absence_reason, score, comment)
select lesson_id, '46a07997-d34d-49ec-a426-d0656a0eeb4a', present, status, absence_reason, score, comment
from attendance where student_id = '4e9786e3-5181-4106-9999-2a3a9b38a20a'
on conflict (lesson_id, student_id) do nothing;

update student_events set student_id = '46a07997-d34d-49ec-a426-d0656a0eeb4a'
where student_id = '4e9786e3-5181-4106-9999-2a3a9b38a20a';

update students k set
  grade = coalesce(k.grade, l.grade),
  school = coalesce(k.school, l.school),
  enrolled_at = coalesce(k.enrolled_at, l.enrolled_at),
  contract_no = coalesce(k.contract_no, l.contract_no),
  phone = coalesce(k.phone, l.phone),
  parent_name = coalesce(k.parent_name, l.parent_name),
  parent_phone = coalesce(k.parent_phone, l.parent_phone)
from students l
where k.id = '46a07997-d34d-49ec-a426-d0656a0eeb4a' and l.id = '4e9786e3-5181-4106-9999-2a3a9b38a20a';

delete from student_groups where student_id = '4e9786e3-5181-4106-9999-2a3a9b38a20a';
delete from attendance where student_id = '4e9786e3-5181-4106-9999-2a3a9b38a20a';
update students set archived = true where id = '4e9786e3-5181-4106-9999-2a3a9b38a20a';

-- ---------- D. Аскарова Аиша: 0ac69bae… -> 77d6dbbc… ----------
insert into student_groups (student_id, group_id)
select '77d6dbbc-342e-4ff1-938e-46d17c2e5afb', group_id
from student_groups where student_id = '0ac69bae-274a-42db-9287-5bbc9838f923'
on conflict (student_id, group_id) do nothing;

insert into attendance (lesson_id, student_id, present, status, absence_reason, score, comment)
select lesson_id, '77d6dbbc-342e-4ff1-938e-46d17c2e5afb', present, status, absence_reason, score, comment
from attendance where student_id = '0ac69bae-274a-42db-9287-5bbc9838f923'
on conflict (lesson_id, student_id) do nothing;

update student_events set student_id = '77d6dbbc-342e-4ff1-938e-46d17c2e5afb'
where student_id = '0ac69bae-274a-42db-9287-5bbc9838f923';

update students k set
  grade = coalesce(k.grade, l.grade),
  school = coalesce(k.school, l.school),
  enrolled_at = coalesce(k.enrolled_at, l.enrolled_at),
  contract_no = coalesce(k.contract_no, l.contract_no),
  phone = coalesce(k.phone, l.phone),
  parent_name = coalesce(k.parent_name, l.parent_name),
  parent_phone = coalesce(k.parent_phone, l.parent_phone)
from students l
where k.id = '77d6dbbc-342e-4ff1-938e-46d17c2e5afb' and l.id = '0ac69bae-274a-42db-9287-5bbc9838f923';

delete from student_groups where student_id = '0ac69bae-274a-42db-9287-5bbc9838f923';
delete from attendance where student_id = '0ac69bae-274a-42db-9287-5bbc9838f923';
update students set archived = true where id = '0ac69bae-274a-42db-9287-5bbc9838f923';

-- ---------- Проверка результата ----------
select s.id, s.full_name, s.archived,
       (select count(*) from student_groups sg where sg.student_id = s.id) as groups_n,
       (select count(*) from attendance a where a.student_id = s.id) as attendance_n
from students s
where s.id in (
  '0f509698-45b9-4274-91b2-77395fd23700', '817e2002-1092-4512-beb1-d32617cb47a5',
  '4758be35-b13d-4e8f-810f-c7baffd83e10', '71c19cc4-d646-4ef9-a60e-2fc1d137e804',
  '4e9786e3-5181-4106-9999-2a3a9b38a20a', '46a07997-d34d-49ec-a426-d0656a0eeb4a',
  '0ac69bae-274a-42db-9287-5bbc9838f923', '77d6dbbc-342e-4ff1-938e-46d17c2e5afb'
)
order by full_name, archived;
