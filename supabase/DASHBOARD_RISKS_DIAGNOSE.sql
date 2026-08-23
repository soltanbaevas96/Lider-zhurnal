-- =====================================================================
--  ДИАГНОСТИКА: дашборд (посещаемость >100%) и пустой список рисков
--
--  Это ТОЛЬКО ЧТЕНИЕ, ничего не меняет и не ломает.
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ одним запуском,
--  скопировать результат (весь текст из колонки definition/значения)
--  и прислать обратно.
-- =====================================================================

-- 1. Код всех функций дашборда и функции пересчёта рисков — как они
--    реально считают проценты и флаги сейчас в проде.
select p.proname as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'get_dashboard_kpi', 'get_dashboard_by_office', 'get_dashboard_by_subject',
    'get_dashboard_weeks', 'get_dashboard_worst_teachers', 'get_dashboard_weak_groups',
    'get_dashboard_reasons', 'recalc_risk_flags'
  )
order by p.proname;
