-- =====================================================================
--  58. ОБЪЕДИНИТЬ ГРУППЫ-ДУБЛИ, РАЗЪЕХАВШИЕСЯ ИЗ-ЗА ПРОБЕЛА
--
--  Пример: "11 РУМГ-4" (с пробелом после номера класса) и "11РУМГ-4"
--  (без пробела) — это ОДНА и та же группа, но для базы это два разных
--  текстовых значения, поэтому создались как две отдельные группы в
--  одном офисе. Судя по «Управлению», такое встречается не только у
--  групп из последнего импорта учеников — есть и более старые пары
--  (например "11 КМБ-3" и "11КМБ-3" в Маргулана).
--
--  Правило (как договорились): исторически коды создавались БЕЗ
--  пробела — значит "старая", каноничная группа — это вариант ИМЕНИ
--  БЕЗ единого пробела внутри. Вариант(ы) с пробелом — дубль(и),
--  которые нужно слить в старую группу и архивировать (мягкое
--  удаление, история не теряется).
--
--  Как ищет дубли: группирует активные группы по (офис, имя без
--  пробелов) — если в такой группе больше одной строки, это дубль-
--  кластер. Автоматически объединяет ТОЛЬКО те кластеры, где ровно
--  ОДИН вариант в кластере не содержит ни одного пробела (это и есть
--  каноничный) — остальные варианты в кластере сливаются в него.
--  Если кластер неоднозначный (нет "чистого" варианта без пробела,
--  либо таких "чистых" вариантов несколько) — ничего не трогает,
--  только показывает в отчёте для ручного решения.
--
--  При слиянии переносятся:
--   - ученики группы (student_groups) — с ON CONFLICT DO NOTHING, если
--     ученик уже почему-то состоит в обеих версиях группы;
--   - слоты расписания (schedule.group_id);
--   - уроки (lessons.group_id).
--  Дубль после переноса не удаляется физически — помечается
--  archived = true и в note дописывается, с какой группой объединён.
--
--  Идемпотентно: повторный запуск не найдёт новых дублей (дубль уже
--  archived = false -> не участвует в выборке) и ничего не сломает.
-- =====================================================================

create table if not exists group_merge_report_sept2026 (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  office text,
  keep_group_id uuid,
  keep_name text,
  dup_group_id uuid,
  dup_name text,
  status text,           -- 'merged' | 'skipped_ambiguous' | 'error'
  detail text
);

do $$
declare
  v_run_at timestamptz := now();
  v_cluster record;
  v_keep_count int;
  v_keep_id uuid;
  v_keep_name text;
  v_dup record;
begin
  for v_cluster in
    select office, regexp_replace(name, '\s+', '', 'g') as norm_name, count(*) as cnt
    from groups
    where archived = false
    group by office, regexp_replace(name, '\s+', '', 'g')
    having count(*) > 1
  loop
    -- сколько в этом кластере вариантов ИМЕНИ БЕЗ единого пробела
    select count(*) into v_keep_count
    from groups
    where archived = false and office = v_cluster.office
      and regexp_replace(name, '\s+', '', 'g') = v_cluster.norm_name
      and name !~ '\s';

    if v_keep_count <> 1 then
      insert into group_merge_report_sept2026(run_at, office, dup_name, status, detail)
      values (
        v_run_at, v_cluster.office, v_cluster.norm_name, 'skipped_ambiguous',
        format('Кластер из %s групп с одинаковым именем без учёта пробелов, но "чистых" вариантов без единого пробела: %s (нужно ровно 1) — решите вручную.', v_cluster.cnt, v_keep_count)
      );
      continue;
    end if;

    select id, name into v_keep_id, v_keep_name
    from groups
    where archived = false and office = v_cluster.office
      and regexp_replace(name, '\s+', '', 'g') = v_cluster.norm_name
      and name !~ '\s'
    limit 1;

    for v_dup in
      select id, name from groups
      where archived = false and office = v_cluster.office
        and regexp_replace(name, '\s+', '', 'g') = v_cluster.norm_name
        and id <> v_keep_id
    loop
      begin
        -- перенести учеников
        insert into student_groups(student_id, group_id)
        select student_id, v_keep_id from student_groups where group_id = v_dup.id
        on conflict do nothing;
        delete from student_groups where group_id = v_dup.id;

        -- перенести расписание и уроки, если такие ссылки есть
        update schedule set group_id = v_keep_id where group_id = v_dup.id;
        update lessons set group_id = v_keep_id where group_id = v_dup.id;

        -- архивировать дубль (мягкое удаление, история не теряется)
        update groups
        set archived = true,
            note = trim(coalesce(note, '') || ' [объединено с "' || v_keep_name || '", id ' || v_keep_id::text || ']')
        where id = v_dup.id;

        insert into group_merge_report_sept2026(run_at, office, keep_group_id, keep_name, dup_group_id, dup_name, status)
        values (v_run_at, v_cluster.office, v_keep_id, v_keep_name, v_dup.id, v_dup.name, 'merged');
      exception when others then
        insert into group_merge_report_sept2026(run_at, office, keep_group_id, keep_name, dup_group_id, dup_name, status, detail)
        values (v_run_at, v_cluster.office, v_keep_id, v_keep_name, v_dup.id, v_dup.name, 'error', sqlerrm);
      end;
    end loop;
  end loop;

  raise notice 'Готово. Отчёт — в SELECT-ах ниже (run_at = %).', v_run_at;
end $$;

-- ---------- 1. СВОДКА ПОСЛЕДНЕГО ЗАПУСКА ----------
select
  count(*) filter (where status = 'merged') as merged,
  count(*) filter (where status = 'skipped_ambiguous') as skipped_ambiguous,
  count(*) filter (where status = 'error') as errors
from group_merge_report_sept2026
where run_at = (select max(run_at) from group_merge_report_sept2026);

-- ---------- 2. ЧТО ИМЕННО ОБЪЕДИНЕНО ----------
select office, keep_name, keep_group_id, dup_name, dup_group_id
from group_merge_report_sept2026
where status = 'merged' and run_at = (select max(run_at) from group_merge_report_sept2026)
order by office, keep_name;

-- ---------- 3. НЕОДНОЗНАЧНЫЕ КЛАСТЕРЫ — РЕШИТЬ ВРУЧНУЮ ----------
select office, dup_name as "имя без пробелов (норм.)", detail
from group_merge_report_sept2026
where status = 'skipped_ambiguous' and run_at = (select max(run_at) from group_merge_report_sept2026);

-- ---------- 4. ОШИБКИ (если есть) ----------
select office, keep_name, dup_name, detail
from group_merge_report_sept2026
where status = 'error' and run_at = (select max(run_at) from group_merge_report_sept2026);

-- ---------- 5. ПРОВЕРКА: остались ли ещё пробельные дубли после запуска ----------
-- в норме тут должны остаться только строки, совпадающие с п.3 (неоднозначные)
select office, regexp_replace(name, '\s+', '', 'g') as norm_name, count(*) as how_many,
       array_agg(name order by name) as names, array_agg(id) as ids
from groups
where archived = false
group by office, regexp_replace(name, '\s+', '', 'g')
having count(*) > 1
order by how_many desc;
