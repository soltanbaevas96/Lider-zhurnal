-- =====================================================================
--  ЛИДЕР+ · Миграция №38: закрытие privilege escalation через profiles.update()
--  P0-001 (см. AUDIT_BEFORE_FIX.md / P0_VERIFY_REPORT.md).
--
--  Проблема: policy "profiles self update" разрешала UPDATE любой строки,
--  где id = auth.uid(), но не имела WITH CHECK, ограничивающего ИЗМЕНЯЕМЫЕ
--  поля. Любой авторизованный пользователь мог выполнить
--    supabase.from('profiles').update({ role: 'admin' })
--  и сам себе назначить роль администратора (или чужой office).
--
--  Реальные security-sensitive колонки в этой схеме — только role и office
--  (колонок permissions/is_admin/status в profiles НЕТ, проверено
--  information_schema.columns на проде 2026-08-10).
--
--  Решение: BEFORE UPDATE триггер, который блокирует изменение role/office,
--  если вызывающий не администратор и не доверенный серверный вызов
--  (service_role — например, Edge Function invite-teacher). Обычное
--  редактирование остальных полей (full_name, username и т.д.) не
--  затрагивается и продолжает работать как раньше.
--
--  Существующий административный путь admin_set_role(...) НЕ меняется —
--  он уже проверен (P0_VERIFY_REPORT.md) и продолжит работать: is_admin()
--  внутри триггера корректно видит вызывающего администратора независимо
--  от того, что admin_set_role — SECURITY DEFINER (auth.uid() всегда
--  берётся из исходной JWT-сессии вызывающего, а не владельца функции).
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 01-04_*.sql.
--  Безопасно для уже работающей базы: старая policy заменяется на
--  эквивалентную по смыслу (id = auth.uid()), новый триггер добавляет
--  только доп. ограничение — ничего не удаляет и не меняет существующие
--  данные.
-- =====================================================================

-- ---------- 1. Явный WITH CHECK на policy (было: неявный из USING) -----
-- Смысл не меняется (id = auth.uid()), но теперь это явно закреплено,
-- а не полагается на поведение Postgres по умолчанию для UPDATE-политик.
drop policy if exists "profiles self update" on profiles;
create policy "profiles self update" on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- 2. Триггер-страж: запрещает менять role/office без прав ----
create or replace function protect_profiles_sensitive_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if (new.role is distinct from old.role or new.office is distinct from old.office) then
    if is_admin()
       or v_jwt_role = 'service_role'
       or current_user in ('postgres', 'supabase_admin', 'service_role')
    then
      return new;
    end if;
    raise exception 'Недостаточно прав для изменения role/office. Используйте admin_set_role().'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_sensitive_fields on profiles;
create trigger trg_protect_profiles_sensitive_fields
  before update on profiles
  for each row
  execute function protect_profiles_sensitive_fields();
