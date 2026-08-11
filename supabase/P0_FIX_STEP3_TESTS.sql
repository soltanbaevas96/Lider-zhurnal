-- =====================================================================
--  P0-FIX / шаг 3 (v4): security-тесты для 38_security_profiles_update.sql
--  ОДИН единственный SQL-statement (весь скрипт — один DO-блок).
--  Это важно: предыдущая версия с BEGIN/CREATE TEMP TABLE/…/ROLLBACK как
--  отдельными шагами не сработала (SQL Editor, похоже, не гарантирует
--  одну сессию на несколько отдельных statement'ов). Один DO-блок —
--  гарантированно один statement = одна транзакция.
--
--  Как это безопасно без явного ROLLBACK: блок в самом конце ВСЕГДА
--  выбрасывает RAISE EXCEPTION с текстом отчёта. Необработанное
--  исключение в Postgres автоматически откатывает ВСЕ изменения этого
--  statement'а — включая «успешные» тестовые UPDATE/admin_set_role
--  внутри. То есть в базе гарантированно ничего не останется, что бы
--  тесты ни показали.
--
--  Результат появится как ERROR в Results — это ожидаемо, читайте текст
--  сообщения (там 7 строк TEST 1..7), это не сбой миграции.
-- =====================================================================

do $$
declare
  v_report text := '';
  v_id uuid;
  v_own_office text;
  v_other_office text;
  v_admin_id uuid;
  v_target_id uuid;
  v_target_role_after user_role;
begin
  -- TEST 1: teacher пытается role = 'admin' -----------------------------
  select id into v_id from profiles where role = 'teacher' limit 1;
  if v_id is null then
    v_report := v_report || 'TEST 1: SKIPPED — нет профиля role=teacher' || chr(10);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      update profiles set role = 'admin' where id = v_id;
      v_report := v_report || 'TEST 1: FAIL — role=admin прошёл, УЯЗВИМОСТЬ НЕ ЗАКРЫТА' || chr(10);
    exception when insufficient_privilege then
      v_report := v_report || 'TEST 1: PASS — role=admin отклонён (DENIED), как и ожидалось' || chr(10);
    end;
    reset role;
  end if;

  -- TEST 2/3: колонок нет ------------------------------------------------
  v_report := v_report || 'TEST 2: N/A — колонки permissions в profiles не существует' || chr(10);
  v_report := v_report || 'TEST 3: N/A — колонки is_admin в profiles не существует' || chr(10);

  -- TEST 4: teacher пытается сменить office на чужой ----------------------
  select id, office into v_id, v_own_office from profiles where role = 'teacher' limit 1;
  if v_id is null then
    v_report := v_report || 'TEST 4: SKIPPED — нет профиля role=teacher' || chr(10);
  else
    v_other_office := case when coalesce(v_own_office,'') = 'Маргулана' then 'Усолка' else 'Маргулана' end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      update profiles set office = v_other_office where id = v_id;
      v_report := v_report || 'TEST 4: FAIL — смена office прошла, УЯЗВИМОСТЬ НЕ ЗАКРЫТА' || chr(10);
    exception when insufficient_privilege then
      v_report := v_report || 'TEST 4: PASS — смена office отклонена (DENIED), как и ожидалось' || chr(10);
    end;
    reset role;
  end if;

  -- TEST 5: teacher меняет своё обычное поле (full_name) ------------------
  select id into v_id from profiles where role = 'teacher' limit 1;
  if v_id is null then
    v_report := v_report || 'TEST 5: SKIPPED — нет профиля role=teacher' || chr(10);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      update profiles set full_name = full_name || '' where id = v_id;
      v_report := v_report || 'TEST 5: PASS — обычное поле (full_name) изменено успешно, как и ожидалось' || chr(10);
    exception when insufficient_privilege then
      v_report := v_report || 'TEST 5: FAIL — обычное редактирование профиля сломано' || chr(10);
    end;
    reset role;
  end if;

  -- TEST 6 (регресс): admin меняет роль другого через admin_set_role ------
  select id into v_admin_id from profiles where role = 'admin' limit 1;
  select id into v_target_id from profiles where role = 'teacher' limit 1;
  if v_admin_id is null or v_target_id is null then
    v_report := v_report || 'TEST 6: SKIPPED — нет admin или teacher' || chr(10);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform admin_set_role(v_target_id, 'assistant', null);
      select role into v_target_role_after from profiles where id = v_target_id;
      if v_target_role_after = 'assistant' then
        v_report := v_report || 'TEST 6: PASS — admin_set_role сработал (role -> assistant)' || chr(10);
      else
        v_report := v_report || 'TEST 6: FAIL — admin_set_role не изменил роль' || chr(10);
      end if;
    exception when others then
      v_report := v_report || 'TEST 6: FAIL — admin_set_role выбросил ошибку: ' || sqlerrm || chr(10);
    end;
    reset role;
  end if;

  -- TEST 7 (регресс): service_role меняет role (как invite-teacher) -------
  select id into v_id from profiles where role = 'teacher' limit 1;
  if v_id is null then
    v_report := v_report || 'TEST 7: SKIPPED — нет профиля role=teacher' || chr(10);
  else
    set local role service_role;
    begin
      update profiles set role = 'teacher' where id = v_id;
      v_report := v_report || 'TEST 7: PASS — service_role может писать role (invite-teacher не сломается)' || chr(10);
    exception when insufficient_privilege then
      v_report := v_report || 'TEST 7: FAIL — service_role заблокирован, invite-teacher СЛОМАЕТСЯ' || chr(10);
    end;
    reset role;
  end if;

  -- Гарантированный откат ВСЕГО (включая «успешные» UPDATE выше) ----------
  raise exception E'\n=== РЕЗУЛЬТАТЫ ТЕСТОВ (транзакция откачена, база не изменена) ===\n%', v_report;
end $$;
