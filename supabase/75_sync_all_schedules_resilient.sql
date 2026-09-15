-- =====================================================================
--  75. sync_all_schedules: изоляция ошибок по слоту + видимый счётчик
--  защищённых проведённых занятий (ТЗ «Синхронизация расписания
--  методистами», п.23-24).
--
--  ПРОБЛЕМА (найдена по факту, по телу функции): если sync_schedule_slot
--  падал исключением ХОТЬ НА ОДНОМ слоте, необработанное исключение
--  внутри PL/pgSQL-функции откатывает ВСЮ транзакцию целиком — то есть
--  ни один из остальных, полностью исправных слотов не синхронизировался
--  бы вообще, без единого сообщения о том, какой именно слот виноват.
--  Раньше это не проявлялось только потому, что таких падений ещё не
--  случалось на практике, но защиты от них не было никакой.
--
--  ИСПРАВЛЕНИЕ: каждый слот обрабатывается в собственном BEGIN/EXCEPTION
--  блоке — один сломанный слот пропускается (с RAISE NOTICE, видно в
--  логах Supabase) и учитывается в счётчике "errors", остальные слоты
--  синхронизируются как обычно. Плюс — функция теперь возвращает ещё
--  conducted_protected (сколько проведённых занятий синхронизация не
--  тронула ни на одном из слотов) для более полного отчёта пользователю.
--
--  Логика самой синхронизации (sync_schedule_slot) НЕ меняется —
--  она была верна и раньше (защита проведённых занятий, идемпотентность
--  через uq_lesson_schedule_date). Права доступа (is_admin() or
--  is_methodist()) — без изменений, методист уже мог вызывать эту
--  функцию на backend; недостающим звеном была только кнопка на
--  фронтенде (исправлено отдельно, без миграции).
--
--  Возвращаемые колонки меняются -> обязателен DROP.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 74.
-- =====================================================================

drop function if exists sync_all_schedules();

create function sync_all_schedules()
returns table(
  slots_processed integer, future_deleted integer, future_created integer,
  conducted_protected integer, errors integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  v_total_deleted int := 0;
  v_total_created int := 0;
  v_total_protected int := 0;
  v_count int := 0;
  v_errors int := 0;
  v_d int; v_c int; v_p int;
begin
  if not (is_admin() or is_methodist()) then
    raise exception 'Недостаточно прав для синхронизации расписания';
  end if;

  for s in select id from schedule where archived = false loop
    begin
      select sync_result.future_deleted, sync_result.future_created into v_d, v_c
      from sync_schedule_slot(s.id) as sync_result;
      select count(*) into v_p from lessons where lessons.schedule_id = s.id and status <> 'planned';

      v_total_deleted := v_total_deleted + coalesce(v_d, 0);
      v_total_created := v_total_created + coalesce(v_c, 0);
      v_total_protected := v_total_protected + coalesce(v_p, 0);
      v_count := v_count + 1;
    exception when others then
      -- Один сломанный слот не должен обрывать всю синхронизацию —
      -- без этого необработанное исключение откатило бы весь батч.
      v_errors := v_errors + 1;
      raise notice 'sync_all_schedules: слот % пропущен из-за ошибки: %', s.id, sqlerrm;
    end;
  end loop;

  insert into schedule_sync_log(action, performed_by, future_deleted, future_created, details)
  values (
    'sync_all', auth.uid(), v_total_deleted, v_total_created,
    jsonb_build_object('slots_processed', v_count, 'conducted_protected', v_total_protected, 'errors', v_errors)
  );

  return query select v_count, v_total_deleted, v_total_created, v_total_protected, v_errors;
end;
$function$;

grant execute on function sync_all_schedules() to authenticated;
