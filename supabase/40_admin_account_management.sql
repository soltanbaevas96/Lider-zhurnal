-- =====================================================================
--  ЛИДЕР+ · Миграция №40: управление офис-менеджерами/бухгалтерами
--  и удаление учеников из «Управления».
--
--  У office_manager/senior_office_manager/accountant НЕТ отдельной
--  карточки-таблицы (в отличие от teachers/curators/assistants) — это
--  просто роль в profiles. Значит:
--   - список получаем напрямую (RLS уже разрешает admin читать все
--     profiles: policy "profiles self read" содержит `OR is_admin()`);
--   - создание учётки уже работает через существующую Edge Function
--     invite-teacher (kind/card_id просто не передаются);
--   - смена роли/офиса — уже работает через admin_set_role;
--   - смена пароля — уже работает через admin_set_password;
--   - НЕ хватает: (1) редактирования ФИО, (2) удаления такой учётки
--     (admin_soft_delete умеет удалять только карточки teachers/
--     curators/assistants).
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 39B.
-- =====================================================================

-- ---------- 1. Редактирование ФИО любого профиля (только админ) ----------
create or replace function admin_update_profile_name(p_profile_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  update profiles set full_name = p_full_name where id = p_profile_id;
end;
$$;

grant execute on function admin_update_profile_name(uuid, text) to authenticated;

-- ---------- 2. admin_soft_delete: добавляем kind = 'accounts' ----------
-- Для 'accounts' p_id — это СРАЗУ profile_id (нет отдельной карточки).
-- Остальная логика (teachers/curators/assistants) не изменена.
create or replace function admin_soft_delete(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_profile uuid;
begin
  if not is_admin() then raise exception 'Недостаточно прав'; end if;

  if p_kind = 'teachers' then
    select profile_id into v_profile from teachers where id = p_id;
    update teachers set archived = true where id = p_id;
  elsif p_kind = 'curators' then
    select profile_id into v_profile from curators where id = p_id;
    update curators set archived = true where id = p_id;
  elsif p_kind = 'assistants' then
    select profile_id into v_profile from assistants where id = p_id;
    update assistants set archived = true where id = p_id;
  elsif p_kind = 'accounts' then
    v_profile := p_id;
  end if;

  -- гасим вход (удаляем учётку), профиль и identity уйдут каскадом.
  -- уроки остаются: teacher_id остаётся в lessons, карточка лишь архивирована.
  if v_profile is not null then
    delete from auth.users where id = v_profile;
    delete from _issued_logins where profile_id = v_profile;
  end if;
end;
$$;
