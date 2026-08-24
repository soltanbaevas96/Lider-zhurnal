-- =====================================================================
--  ЛИДЕР+ · Миграция №45: офис-менеджеры — доступ к «Рискам»
--
--  Вкладка «Риски» уже добавлена в кабинет офис-менеджера (фронтенд).
--  Чтение students и запись (UPDATE) в students офис-менеджерам уже
--  разрешены политикой "students om write" (проверено в проде).
--
--  Не хватало только INSERT в student_events — туда кнопка «Связались»
--  пишет запись о контакте с родителем (saveContact в api.js).
--  Сейчас там только "events write" (ALL, только is_admin()).
--
--  Добавляем отдельную политику на INSERT, точно повторяющую логику
--  "students om write": обычный офис-менеджер — только по ученикам
--  своего офиса, старший офис-менеджер — по всем.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 44.
-- =====================================================================

create policy "student_events om write" on student_events
for insert
with check (
  is_admin()
  or my_role() = 'senior_office_manager'
  or (
    my_role() = 'office_manager'
    and exists (
      select 1 from students s
      where s.id = student_events.student_id
        and s.office = my_office()
    )
  )
);
