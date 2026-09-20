-- =====================================================================
--  77. «Управление» у преподавателя — пересмотр модели доступа по
--  новому ТЗ: видит и может редактировать состав ЛЮБОЙ группы CRM
--  (не только закреплённой за ним в teacher_groups — предыдущее ТЗ и
--  миграция 76 требовали именно «только свои группы», это ТЗ прямо
--  отменяет то ограничение: п.3 «НЕ делать фильтрацию "только группы
--  преподавателя" — это неправильно», тест п.27 явно добавляет ученика
--  в группу, которую преподаватель не ведёт по расписанию).
--
--  Миграция 76 (student_groups teacher insert/delete, ограничение по
--  teacher_groups) НЕ отменяется — она просто становится более узким,
--  недостаточным путём и не используется новым кодом; ничего плохого
--  в том, чтобы она осталась (уже, а не шире того, что разрешает эта
--  миграция).
--
--  РЕШЕНИЕ (п.24 ТЗ — явно просит именно так, а не расширять RLS
--  таблицы): три проверенные SECURITY DEFINER RPC вместо прямого
--  INSERT/DELETE в student_groups. Раньше addStudentToGroup/
--  removeStudentFromGroup были обычным INSERT/DELETE в обход всякой
--  проверки роли (полагались только на RLS таблицы) — теперь есть
--  единая проверка прав внутри функции (is_admin() OR is_methodist()
--  OR my_teacher_id() is not null — то есть ЛЮБОЙ преподаватель, но не
--  куратор/ассистент/бухгалтер), и идемпотентность через
--  ON CONFLICT DO NOTHING на уже существующий uq_student_group
--  (проверено диагностикой — ограничение уже есть, ничего не создаём).
--
--  Frontend (api.js): addStudentToGroup/removeStudentFromGroup
--  переведены на эти RPC — тот же самый вызов у MethodistCabinet.jsx
--  продолжает работать (is_methodist() пропускает), у TeacherGroupsTab
--  теперь работает тоже (my_teacher_id() пропускает). Дублирующей
--  логики создания/удаления связи больше не осталось — один путь для
--  всех ролей (п.22-23 ТЗ).
--
--  Создание/удаление ГРУППЫ и УЧЕНИКА этими функциями не затрагивается
--  вообще — они умеют только ставить/убирать существующую связь
--  student_id + group_id, обе стороны должны уже существовать
--  (проверяется явно).
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 76.
-- =====================================================================

create or replace function teacher_add_student_to_group(p_student_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (is_admin() or is_methodist() or my_teacher_id() is not null) then
    raise exception 'Недостаточно прав для изменения состава группы';
  end if;
  if not exists (select 1 from students where id = p_student_id and archived = false) then
    raise exception 'Ученик не найден';
  end if;
  if not exists (select 1 from groups where id = p_group_id and archived = false) then
    raise exception 'Группа не найдена';
  end if;

  insert into student_groups(student_id, group_id)
  values (p_student_id, p_group_id)
  on conflict (student_id, group_id) do nothing;
end;
$function$;

grant execute on function teacher_add_student_to_group(uuid, uuid) to authenticated;

create or replace function teacher_remove_student_from_group(p_student_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (is_admin() or is_methodist() or my_teacher_id() is not null) then
    raise exception 'Недостаточно прав для изменения состава группы';
  end if;

  delete from student_groups where student_id = p_student_id and group_id = p_group_id;
end;
$function$;

grant execute on function teacher_remove_student_from_group(uuid, uuid) to authenticated;

-- Перевод — атомарно (одна транзакция функции): убрать старую связь,
-- поставить новую. Остальные предметные связи ученика (другие группы,
-- п.10 ТЗ — "ученик может быть в нескольких группах") не трогаются,
-- удаляется только указанная p_old_group_id.
create or replace function teacher_move_student_to_group(p_student_id uuid, p_old_group_id uuid, p_new_group_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (is_admin() or is_methodist() or my_teacher_id() is not null) then
    raise exception 'Недостаточно прав для изменения состава группы';
  end if;
  if not exists (select 1 from groups where id = p_new_group_id and archived = false) then
    raise exception 'Группа не найдена';
  end if;

  delete from student_groups where student_id = p_student_id and group_id = p_old_group_id;
  insert into student_groups(student_id, group_id)
  values (p_student_id, p_new_group_id)
  on conflict (student_id, group_id) do nothing;
end;
$function$;

grant execute on function teacher_move_student_to_group(uuid, uuid, uuid) to authenticated;
