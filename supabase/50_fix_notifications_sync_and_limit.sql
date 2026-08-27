-- =====================================================================
--  ЛИДЕР+ · Миграция №50: get_notifications — синхронизация с «Риски» +
--  исправление общего LIMIT 50 на все три типа уведомлений разом
--
--  Было:
--  1) Раздел «риск» учитывал только status = 'risk', без 'attention',
--     и не исключал тех, с кем связались за последние 7 дней —
--     третье, ещё по-другому считающее место (после дашборда и
--     вкладки «Риски», которые миграцией №49 уже приведены к одному).
--  2) Один LIMIT 50 стоял на весь UNION ALL сразу (без плана + дни
--     рождения + риски) — если «без плана» одних наберётся 50+, риски
--     и дни рождения могут вообще не попасть в список.
--
--  Стало: у каждого типа уведомлений свой LIMIT, и раздел «риск»
--  считает так же, как дашборд и вкладка «Риски».
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 49.
-- =====================================================================

create or replace function get_notifications()
returns table(kind text, severity text, title text, detail text, ref_id uuid)
language sql
security definer
set search_path to 'public'
as $function$
  (
    -- уроки без плана за последние 30 дней
    select 'no_plan', 'warn',
           'Урок без плана: ' || coalesce(g.name, '—'),
           to_char(l.lesson_date, 'DD.MM') || ' · ' || coalesce(t.full_name, '—'),
           l.id
    from lessons l
    left join groups g on g.id = l.group_id
    left join teachers t on t.id = l.teacher_id
    where l.status = 'проведён' and l.plan_path is null
      and l.lesson_date >= current_date - interval '30 days'
    order by l.lesson_date desc
    limit 30
  )
  union all
  (
    -- дни рождения на этой неделе
    select 'birthday', 'info',
           'День рождения: ' || s.full_name,
           to_char(s.birth_date, 'DD.MM'),
           s.id
    from students s
    where s.archived = false and s.birth_date is not null
      and to_char(s.birth_date, 'MM-DD') between to_char(current_date, 'MM-DD')
                                              and to_char(current_date + 7, 'MM-DD')
    limit 30
  )
  union all
  (
    -- ученики в риске: то же определение, что на дашборде и вкладке
    -- «Риски» — risk + attention, кроме тех, с кем связались за 7 дней
    select 'risk',
           case when s.status = 'risk' then 'danger' else 'warn' end,
           (case when s.status = 'risk' then 'Риск оттока: ' else 'Внимание: ' end) || s.full_name,
           coalesce(s.risk_reason, ''),
           s.id
    from students s
    where s.archived = false and s.status in ('risk','attention')
      and (s.last_contact_at is null or s.last_contact_at < now() - interval '7 days')
    limit 50
  )
$function$;
