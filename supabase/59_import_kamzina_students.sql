-- =====================================================================
--  59. ИМПОРТ УЧЕНИКОВ ОФИСА «КАМЗИНА» ИЗ EXCEL
--
--  Тот же исходный файл ("Лист Microsoft Excel.xlsx", те же 4 листа),
--  та же логика, что и в 56_full_reconciliation_sept2026.sql — просто
--  теперь берём офис «Камзина», который раньше сознательно исключался
--  как "не наш центр". Отдельной логики не создаём, работаем в той же
--  таблице отчёта import_report_sept2026.
--
--  Что нашлось в Excel по Камзине (только 11 класс — 10-го для
--  Камзины в этом файле нет; проверено по всем 4 листам):
--   - "ЕНТ 11 класс рус": 2 строки под меткой "КАМЗИНА" —
--       Ибраева Дамина (зелёная, групп нет — все предметы "х")
--       Рамазанов Мансур (СЕРЫЙ, Примечание "отказ..." -> ИСКЛЮЧЁН)
--   - "11 класс ЕНТ каз": 3 строки под меткой "КАМЗИНА", все зелёные —
--       Сапаргалиев Ерназар -> 11 КММ-6 (МАТЕМ), 11 КМИНФ-2 (ИНФОРМАТ)
--       Алимов Диас         -> 11 КММ-6 (МАТЕМ), 11 КМФ-3 (ФИЗИКА)
--       Дауытбай Мансур     -> 11 КММ-6 (МАТЕМ), 11 КМФ-3 (ФИЗИКА)
--  Итого 4 ученика к обработке (5-й пропущен как отказавшийся).
--
--  Как и в 56: решает не цвет, а факт "нашёлся/не нашёлся по ФИО".
--  Группы определяются по тексту кода (регексп ^1[01]), офис = Камзина.
--  Дополнительно (по вашему новому ТЗ, п.2) — после дедупа по ФИО
--  дополнительно проверяем, не совпадает ли телефон ученика или номер
--  договора с ДРУГИМ (по имени) уже существующим учеником — если да,
--  ученика всё равно не трогаем (не объединяем автоматически), а
--  только помечаем в отчёте как "phone_or_contract_conflict" для
--  вашей ручной проверки — это безопаснее, чем гадать.
--
--  Идемпотентно: повторный запуск не создаст новых записей.
-- =====================================================================

do $$
declare
  v_run_at timestamptz := now();
  v_student jsonb;
  v_group jsonb;
  v_existing_id uuid;
  v_new_id uuid;
  v_group_id uuid;
  v_group_lang text;
  v_was_new boolean;
  v_link_rows int;
  v_match_count int;
  v_conflict record;
  v_students jsonb := '[
    {"name":"Ибраева Дамина","school":"Жетекши СОШ","grade":"11","office":"Камзина","lang":"рус","groups":[],"student_phone":"87016008752","parent_phone":"87710422257п","contract":"KMZ250826/002","parent_name":"Ибраев Кайрат","note":"","green":1}
    ,{"name":"Сапаргалиев Ерназар","school":"19","grade":"11","office":"Камзина","lang":"каз","groups":[{"code":"11 КММ-6","subject":"МАТЕМ"},{"code":"11 КМИНФ-2","subject":"ИНФОРМАТ"}],"student_phone":"87054070005","parent_phone":"87777856464м/87777856333п","contract":"KMZ130826/002","parent_name":"Абикенова Айнур","note":"новый","green":1}
    ,{"name":"Алимов Диас","school":"1","grade":"11","office":"Камзина","lang":"каз","groups":[{"code":"11 КММ-6","subject":"МАТЕМ"},{"code":"11 КМФ-3","subject":"ФИЗИКА"}],"student_phone":"87773060677","parent_phone":"87052377700","contract":"KMZ190826/003","parent_name":"Алимова Ботагоз","note":"новый","green":1}
    ,{"name":"Дауытбай Мансур","school":"1","grade":"11","office":"Камзина","lang":"каз","groups":[{"code":"11 КММ-6","subject":"МАТЕМ"},{"code":"11 КМФ-3","subject":"ФИЗИКА"}],"student_phone":"87713234010","parent_phone":"87712951475","contract":"KMZ310826/004","parent_name":"Смагулова Аяна","note":"","green":1}
  ]'::jsonb;
begin
  for v_student in select * from jsonb_array_elements(v_students)
  loop
    begin
      -- ---------- ученик: найти или создать (по нормализованному ФИО) ----------
      select count(*), min(id) into v_match_count, v_existing_id from students
      where archived = false and lower(trim(full_name)) = lower(trim(v_student->>'name'));

      if v_existing_id is not null then
        v_new_id := v_existing_id;
        v_was_new := false;
      else
        insert into students(full_name, school, grade, office, lang, phone, parent_phone, parent_name, contract_no, note, archived)
        values (
          v_student->>'name', nullif(v_student->>'school',''), nullif(v_student->>'grade',''),
          v_student->>'office', nullif(v_student->>'lang',''), nullif(v_student->>'student_phone',''),
          nullif(v_student->>'parent_phone',''), nullif(v_student->>'parent_name',''),
          nullif(v_student->>'contract',''), nullif(v_student->>'note',''), false
        )
        returning id into v_new_id;
        v_was_new := true;
      end if;

      insert into import_report_sept2026(run_at, kind, student_name, office, status, green, student_id, grade, school)
      values (v_run_at, 'student', v_student->>'name', v_student->>'office',
              case when v_was_new then 'created' else 'matched' end,
              (v_student->>'green') = '1', v_new_id, v_student->>'grade', v_student->>'school');

      if v_match_count > 1 then
        insert into import_report_sept2026(run_at, kind, student_name, office, status, detail, green, student_id)
        values (v_run_at, 'student', v_student->>'name', v_student->>'office', 'ambiguous',
                format('В базе уже %s активных учеников с таким же ФИО — группы привязаны к id %s, остальные проверить вручную.', v_match_count, v_existing_id),
                (v_student->>'green') = '1', v_existing_id);
      end if;

      -- ---------- доп. проверка по телефону/договору (п.2 ТЗ) — только на конфликт, без слияния ----------
      for v_conflict in
        select id, full_name from students
        where archived = false
          and id <> v_new_id
          and lower(trim(full_name)) <> lower(trim(v_student->>'name'))
          and (
            (nullif(v_student->>'student_phone','') is not null and phone = v_student->>'student_phone')
            or (nullif(v_student->>'contract','') is not null and contract_no = v_student->>'contract')
          )
      loop
        insert into import_report_sept2026(run_at, kind, student_name, office, status, detail, student_id)
        values (v_run_at, 'student', v_student->>'name', v_student->>'office', 'phone_or_contract_conflict',
                format('Телефон/договор совпадает с другим учеником в базе: "%s" (id %s) — проверить вручную, не один ли это человек под двумя карточками.', v_conflict.full_name, v_conflict.id),
                v_new_id);
      end loop;

      -- ---------- группы этого ученика: найти/создать, привязать ----------
      for v_group in select * from jsonb_array_elements(v_student->'groups')
      loop
        if (v_group->>'code') !~ '^1[01]' then
          insert into import_report_sept2026(run_at, kind, student_name, group_code, office, status)
          values (v_run_at, 'skip_other_center', v_student->>'name', v_group->>'code', v_student->>'office', 'skipped');
          continue;
        end if;

        select id into v_group_id from groups
        where archived = false
          and office = (v_student->>'office')
          and lower(trim(name)) = lower(trim(v_group->>'code'))
        limit 1;

        if v_group_id is not null then
          insert into import_report_sept2026(run_at, kind, group_code, office, status)
          values (v_run_at, 'group', v_group->>'code', v_student->>'office', 'matched');
        else
          v_group_lang := case
            when (v_group->>'code') ~* '^\d{1,2}\s*[КкKk]' then 'каз'
            when (v_group->>'code') ~* '^\d{1,2}\s*[РрRr]' then 'рус'
            else v_student->>'lang'
          end;

          insert into groups(name, office, lang, subject_name, capacity, archived, note)
          values (
            trim(v_group->>'code'), v_student->>'office', v_group_lang, nullif(v_group->>'subject',''), 13, false,
            trim(coalesce(v_group->>'subject','') || ' · ' || (v_student->>'office') || ' · ' || coalesce(v_group_lang,''))
          )
          returning id into v_group_id;

          insert into import_report_sept2026(run_at, kind, group_code, office, status)
          values (v_run_at, 'group', v_group->>'code', v_student->>'office', 'created');
        end if;

        insert into student_groups(student_id, group_id) values (v_new_id, v_group_id)
        on conflict do nothing;
        get diagnostics v_link_rows = row_count;

        insert into import_report_sept2026(run_at, kind, student_name, group_code, office, status)
        values (v_run_at, 'link', v_student->>'name', v_group->>'code', v_student->>'office',
                case when v_link_rows > 0 then 'created' else 'existing' end);
      end loop;
    exception when others then
      insert into import_report_sept2026(run_at, kind, student_name, status, detail)
      values (v_run_at, 'error', v_student->>'name', 'error', sqlerrm);
    end;
  end loop;

  raise notice 'Готово (Камзина). Отчёт — в SELECT-ах ниже (run_at = %).', v_run_at;
end $$;

-- ---------- 1. ОБЩАЯ СВОДКА (последний запуск) ----------
select
  (select count(*) from import_report_sept2026 where kind='student' and status='created' and run_at=(select max(run_at) from import_report_sept2026)) as students_created,
  (select count(*) from import_report_sept2026 where kind='student' and status='matched' and run_at=(select max(run_at) from import_report_sept2026)) as students_matched,
  (select count(*) from import_report_sept2026 where kind='group' and status='created' and run_at=(select max(run_at) from import_report_sept2026)) as groups_created,
  (select count(*) from import_report_sept2026 where kind='group' and status='matched' and run_at=(select max(run_at) from import_report_sept2026)) as groups_matched,
  (select count(*) from import_report_sept2026 where kind='link' and status='created' and run_at=(select max(run_at) from import_report_sept2026)) as links_created,
  (select count(*) from import_report_sept2026 where kind='link' and status='existing' and run_at=(select max(run_at) from import_report_sept2026)) as links_already_existed,
  (select count(*) from import_report_sept2026 where kind='skip_other_center' and run_at=(select max(run_at) from import_report_sept2026)) as skipped_other_center,
  (select count(*) from import_report_sept2026 where kind='error' and run_at=(select max(run_at) from import_report_sept2026)) as errors;

-- ---------- 2. СВЕРКА ПО КАЖДОЙ ГРУППЕ КАМЗИНЫ (Excel vs фактическая БД сейчас) ----------
select
  l.group_code, l.office,
  count(*) filter (where l.status in ('created','existing')) as excel_count,
  (select count(*) from student_groups sg
     join groups g on g.id = sg.group_id and g.archived = false
     where g.office = l.office and lower(trim(g.name)) = lower(trim(l.group_code))) as db_count_now,
  case when count(*) filter (where l.status in ('created','existing'))
        <= (select count(*) from student_groups sg
              join groups g on g.id = sg.group_id and g.archived = false
              where g.office = l.office and lower(trim(g.name)) = lower(trim(l.group_code)))
       then 'PASS' else 'CHECK' end as status
from import_report_sept2026 l
where l.kind = 'link' and l.office = 'Камзина' and l.run_at = (select max(run_at) from import_report_sept2026)
group by l.group_code, l.office
order by status desc, l.group_code;

-- ---------- 3. ВСЕ УЧЕНИКИ КАМЗИНЫ ИЗ ЭТОГО ЗАПУСКА — подробно ----------
select
  s.student_name as "ФИО",
  s.status as "Статус",
  s.school as "Школа",
  s.grade as "Класс",
  s.student_id,
  (select string_agg(l.group_code, ', ' order by l.group_code)
     from import_report_sept2026 l
     where l.kind = 'link' and l.run_at = s.run_at and l.student_name = s.student_name) as "Группы"
from import_report_sept2026 s
where s.kind = 'student' and s.office = 'Камзина' and s.status in ('created','matched') and s.run_at = (select max(run_at) from import_report_sept2026)
order by s.student_name;

-- ---------- 4. НЕОДНОЗНАЧНЫЕ / КОНФЛИКТНЫЕ СОВПАДЕНИЯ — РУЧНАЯ ПРОВЕРКА ----------
select student_name, office, status, student_id, detail
from import_report_sept2026
where kind = 'student' and status in ('ambiguous','phone_or_contract_conflict')
  and run_at = (select max(run_at) from import_report_sept2026);

-- ---------- 5. ОШИБКИ (если есть) ----------
select student_name, detail
from import_report_sept2026
where kind = 'error' and run_at = (select max(run_at) from import_report_sept2026);

-- ---------- 6. ПОТЕНЦИАЛЬНЫЕ ДУБЛИКАТЫ УЧЕНИКОВ ПО ФИО (глобально, не только Камзина) ----------
select lower(trim(full_name)) as normalized_name, count(*) as how_many, array_agg(id) as student_ids, array_agg(full_name) as names_as_written
from students
where archived = false
group by lower(trim(full_name))
having count(*) > 1
order by how_many desc;
