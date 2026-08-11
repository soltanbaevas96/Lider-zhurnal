-- Шаг B: выполнить ОТДЕЛЬНЫМ запуском, ПОСЛЕ того как 39A уже выполнен
-- и показал успех (значение 'accountant' уже зафиксировано в enum).

-- ---------- Хелпер: текущий пользователь — бухгалтер? ----------
create or replace function is_accountant()
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'accountant');
$$;

-- ---------- Чтение lessons/attendance для бухгалтера (нужно «Табелю») ----------
drop policy if exists "lessons accountant read" on lessons;
create policy "lessons accountant read" on lessons
  for select using (is_accountant());

drop policy if exists "attendance accountant read" on attendance;
create policy "attendance accountant read" on attendance
  for select using (is_accountant());

-- ---------- Узкая RPC для смены ставки (админ ИЛИ бухгалтер) ----------
create or replace function accountant_set_rate(p_kind text, p_id uuid, p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_admin() or is_accountant()) then
    raise exception 'Недостаточно прав для изменения ставки' using errcode = '42501';
  end if;

  if p_kind = 'teachers' then
    update teachers set rate = coalesce(p_rate, 0) where id = p_id;
  elsif p_kind = 'curators' then
    update curators set rate = coalesce(p_rate, 0) where id = p_id;
  elsif p_kind = 'assistants' then
    update assistants set rate = coalesce(p_rate, 0) where id = p_id;
  else
    raise exception 'Неизвестный тип сотрудника: %', p_kind;
  end if;
end;
$$;

grant execute on function accountant_set_rate(text, uuid, numeric) to authenticated;
