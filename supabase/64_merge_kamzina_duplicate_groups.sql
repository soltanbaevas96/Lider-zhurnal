-- =====================================================================
--  64. ОБЪЕДИНИТЬ ГРУППЫ-ДУБЛИ КАМЗИНЫ (созданы ошибочно миграцией 59)
--
--  При импорте учеников Камзины (59) три группы были СОЗДАНЫ заново
--  с office='Камзина', хотя по коду они на самом деле совпадают с уже
--  существующими группами Маргуланы (конвенция этого центра: "КМ..."
--  = казахский + Маргулана). То есть эти ученики Камзины физически
--  учатся в уже существующих группах Маргуланы, а не в новых своих.
--
--  Найдено (проверено вручную, не автодетект — офисное объединение
--  специально не делается автоматически, чтобы не задеть легитимные
--  одноимённые группы разных офисов):
--    11 КМИНФ-2 (Камзина, новая)  -> 11КМИНФ-2 (Маргулана, старая)
--    11 КММ-6   (Камзина, новая)  -> 11 КММ-6  (Маргулана, старая)
--    11 КМФ-3   (Камзина, новая)  -> 11КМФ-3   (Маргулана, старая)
--  Плюс попутно найденный обычный пробельный дубль внутри ОДНОГО
--  офиса (Маргулана), который не поймала миграция 58 (видимо, ещё
--  не запускалась, либо появился позже):
--    11 КШИ-1 (с пробелом) -> 11КШИ-1 (без пробела)
--
--  Переносятся: ученики (student_groups), расписание (schedule),
--  уроки (lessons). Дубль не удаляется — архивируется (мягкое
--  удаление), в note дописывается, с чем объединён.
--
--  Дополнительно: у части групп subject_name оказался пустым не из-за
--  NULL note (это чинила 57), а потому что note уже был непустым, но
--  с пустым первым сегментом (предмет не попал при более раннем
--  импорте). Подтягиваем subject_name с другой группы того же кода
--  (регистр/пробелы не важны), если у неё однозначно один вариант
--  предмета — и пересобираем note.
-- =====================================================================

-- ---------- 1. Точечные объединения (dup -> keep) ----------
do $$
declare
  v_pairs uuid[][] := array[
    array['9e446014-4779-4a0d-bb43-b25e2f161491'::uuid, '85129550-b81b-4a76-801b-7e04b2cf5596'::uuid], -- 11 КМИНФ-2: Камзина -> Маргулана
    array['79e82c93-116a-461c-80f8-1b3b822b3ee1'::uuid, '07168bed-dd5c-41a9-9581-cdcb942e26a5'::uuid], -- 11 КММ-6: Камзина -> Маргулана
    array['44a79c50-31e7-4c03-a7a4-421536587935'::uuid, 'e94ee672-11fc-4bf8-bec3-aaf3091e6f22'::uuid], -- 11 КМФ-3: Камзина -> Маргулана
    array['1b0dc19c-a598-40e8-912e-7c03a5a204f8'::uuid, 'd0e856dd-a1e8-4e7e-a3fb-3a6d97697bb6'::uuid]  -- 11 КШИ-1 (пробел) -> 11КШИ-1 (Маргулана)
  ];
  v_pair uuid[];
  v_dup_id uuid;
  v_keep_id uuid;
  v_keep_name text;
  v_dup_name text;
begin
  foreach v_pair slice 1 in array v_pairs
  loop
    v_dup_id := v_pair[1];
    v_keep_id := v_pair[2];

    select name into v_dup_name from groups where id = v_dup_id;
    select name into v_keep_name from groups where id = v_keep_id;

    if v_dup_name is null or v_keep_name is null then
      raise notice 'Пропуск: не нашёл группу dup=% keep=%', v_dup_id, v_keep_id;
      continue;
    end if;

    -- ученики
    insert into student_groups(student_id, group_id)
    select student_id, v_keep_id from student_groups where group_id = v_dup_id
    on conflict do nothing;
    delete from student_groups where group_id = v_dup_id;

    -- расписание и уроки (если уже есть — у только что созданных Камзины их не будет,
    -- но для 11 КШИ-1, существующей давно, могут быть)
    update schedule set group_id = v_keep_id where group_id = v_dup_id;
    update lessons set group_id = v_keep_id where group_id = v_dup_id;

    -- архивировать дубль
    update groups
    set archived = true,
        note = trim(coalesce(note, '') || ' [объединено с "' || v_keep_name || '", id ' || v_keep_id::text || ']')
    where id = v_dup_id;

    raise notice 'Объединено: "% " (id %) -> "%" (id %)', v_dup_name, v_dup_id, v_keep_name, v_keep_id;
  end loop;
end $$;

-- ---------- 2. Подтянуть subject_name там, где пусто, с другой группы того же кода ----------
with candidates as (
  select g.id,
    (select case when count(distinct s2.subject_name) = 1 then min(s2.subject_name) else null end
       from groups s2
       where s2.archived = false
         and s2.subject_name is not null
         and lower(regexp_replace(s2.name, '\s+', '', 'g')) = lower(regexp_replace(g.name, '\s+', '', 'g'))
    ) as borrowed_subject
  from groups g
  where g.archived = false and g.subject_name is null
)
update groups g
set subject_name = c.borrowed_subject,
    note = trim(c.borrowed_subject || ' · ' || coalesce(g.office,'') || ' · ' || coalesce(g.lang,''))
from candidates c
where g.id = c.id and c.borrowed_subject is not null;

-- ---------- Проверка 1: остались ли ещё межофисные дубли по имени ----------
select
  lower(regexp_replace(name, '\s+', '', 'g')) as norm_name,
  array_agg(distinct office) as offices,
  array_agg(id) as ids,
  count(*) as how_many
from groups
where archived = false
group by lower(regexp_replace(name, '\s+', '', 'g'))
having count(*) > 1
order by how_many desc;

-- ---------- Проверка 2: остались ли группы без предмета ----------
select id, name, office, lang, note
from groups
where archived = false and subject_name is null
order by office, name;
