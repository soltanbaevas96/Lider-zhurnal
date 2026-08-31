-- =====================================================================
--  ЛИДЕР+ · Миграция №52: переделка «Оплаты» — тип/период платежа,
--  тарифы, входной взнос + усиление проверки доступа в RPC
--
--  Ничего не удаляет и не теряет: таблица payments та же, старые
--  записи получают payment_type='monthly' и payment_period,
--  вычисленный из их же paid_at (эвристика — раз мы не знаем, за
--  какой месяц был старый платёж, берём месяц самой оплаты; после
--  миграции можно поправить вручную конкретные записи через
--  редактирование платежа, если фактический период отличался).
--
--  Найденная попутно проблема безопасности: add_payment/delete_payment
--  — SECURITY DEFINER, такие функции в Postgres выполняются от имени
--  владельца и НЕ проверяют RLS таблицы автоматически (это не баг
--  именно моей миграции — так было и раньше). Внутри них не было
--  никакой проверки роли/офиса. Формально это значит, что любой
--  залогиненный, вызвав RPC напрямую (не через интерфейс), мог
--  добавить/удалить чужую оплату в обход политик RLS на payments.
--  Добавляю ту же проверку, что уже есть в политике "payments write",
--  прямо в тело функций — теперь она реально работает, а не только
--  выглядит работающей на уровне таблицы.
--
--  Выполнить в Supabase → SQL Editor ЦЕЛИКОМ, ПОСЛЕ 51.
-- =====================================================================

-- ---------- 1. Новые поля ----------
alter table payments add column if not exists payment_type text not null default 'monthly'
  check (payment_type in ('entry_fee', 'monthly'));
alter table payments add column if not exists payment_period text; -- 'YYYY-MM', NULL для входного взноса

update payments set payment_period = to_char(paid_at, 'YYYY-MM')
where payment_period is null and payment_type = 'monthly';

alter table groups add column if not exists monthly_fee numeric;
alter table students add column if not exists custom_monthly_fee numeric;
-- default false: иначе задним числом у ВСЕХ текущих учеников появится
-- фиктивный долг за входной взнос, которого раньше никто не отслеживал.
-- Включать нужно точечно — для новых учеников при зачислении.
alter table students add column if not exists entry_fee_required boolean not null default false;
alter table students add column if not exists entry_fee_amount numeric;

-- ---------- 2. Общая проверка доступа (как в RLS-политике "payments write") ----------
create or replace function can_edit_student_payments(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select is_admin()
    or my_role() = 'senior_office_manager'
    or (my_role() = 'office_manager' and exists (
      select 1 from students s where s.id = p_student_id and s.office = my_office()
    ));
$function$;

-- ---------- 3. add_payment — теперь с типом/периодом + реальной проверкой доступа ----------
drop function if exists add_payment(uuid, numeric, date, text, text);
create function add_payment(
  p_student_id uuid, p_amount numeric, p_paid_at date, p_method text, p_note text,
  p_type text default 'monthly', p_period text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not can_edit_student_payments(p_student_id) then
    raise exception 'access denied';
  end if;
  if p_type not in ('entry_fee', 'monthly') then
    raise exception 'invalid payment_type';
  end if;

  insert into payments (student_id, amount, paid_at, method, note, created_by, payment_type, payment_period)
  values (p_student_id, p_amount, coalesce(p_paid_at, current_date), p_method, p_note, auth.uid(),
          p_type, case when p_type = 'entry_fee' then null else p_period end)
  returning id into v_id;
  return v_id;
end $function$;

-- ---------- 4. update_payment — новая, для редактирования (п.18 ТЗ) ----------
create or replace function update_payment(
  p_id uuid, p_amount numeric, p_paid_at date, p_method text, p_note text,
  p_type text, p_period text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_student_id uuid;
begin
  select student_id into v_student_id from payments where id = p_id;
  if v_student_id is null then raise exception 'payment not found'; end if;
  if not can_edit_student_payments(v_student_id) then raise exception 'access denied'; end if;
  if p_type not in ('entry_fee', 'monthly') then raise exception 'invalid payment_type'; end if;

  update payments set
    amount = p_amount, paid_at = coalesce(p_paid_at, paid_at), method = p_method, note = p_note,
    payment_type = p_type, payment_period = case when p_type = 'entry_fee' then null else p_period end
  where id = p_id;
end $function$;

-- ---------- 5. delete_payment — та же проверка доступа ----------
drop function if exists delete_payment(uuid);
create function delete_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_student_id uuid;
begin
  select student_id into v_student_id from payments where id = p_id;
  if v_student_id is null then return; end if;
  if not can_edit_student_payments(v_student_id) then raise exception 'access denied'; end if;
  delete from payments where id = p_id;
end $function$;

-- ---------- 6. get_student_payments — добавили тип/период ----------
drop function if exists get_student_payments(uuid);
create function get_student_payments(p_student_id uuid)
returns table(id uuid, paid_at date, amount numeric, method text, note text, payment_type text, payment_period text)
language sql
security definer
set search_path to 'public'
as $function$
  select id, paid_at, amount, method, note, payment_type, payment_period
  from payments where student_id = p_student_id
  order by paid_at desc, created_at desc;
$function$;

-- ---------- 7. get_payments_overview — основной запрос для вкладки «Ученики» ----------
-- Офис office_manager'а подставляется сервером принудительно (my_office()),
-- даже если фронт вдруг пришлёт другой — так же, как поступает RLS на students.
create or replace function get_payments_overview(p_office text, p_month text)
returns table(
  id uuid, full_name text, office text, lang text, school text, grade text,
  group_names text, phone text, parent_name text, parent_phone text,
  entry_fee_required boolean, entry_fee_amount numeric, entry_fee_paid numeric,
  monthly_fee numeric, monthly_paid numeric,
  last_payment_date date, last_payment_amount numeric
)
language sql
security definer
set search_path to 'public'
as $function$
  with eff_office as (
    select case when my_role() = 'office_manager' then my_office() else p_office end as v
  ),
  my_group as (
    select distinct on (sg.student_id) sg.student_id, g.monthly_fee
    from student_groups sg
    join groups g on g.id = sg.group_id and g.archived = false
    order by sg.student_id, (g.monthly_fee is null), g.name
  ),
  group_names as (
    select sg.student_id, string_agg(g.name, ', ' order by g.name) as names
    from student_groups sg join groups g on g.id = sg.group_id and g.archived = false
    group by sg.student_id
  ),
  entry_paid as (
    select student_id, coalesce(sum(amount), 0) as paid from payments where payment_type = 'entry_fee' group by student_id
  ),
  month_paid as (
    select student_id, coalesce(sum(amount), 0) as paid from payments
    where payment_type = 'monthly' and payment_period = p_month group by student_id
  ),
  last_pay as (
    select distinct on (student_id) student_id, paid_at, amount
    from payments order by student_id, paid_at desc, created_at desc
  )
  select
    s.id, s.full_name, s.office, s.lang, s.school, s.grade,
    coalesce(gn.names, '—'), s.phone, s.parent_name, s.parent_phone,
    s.entry_fee_required, s.entry_fee_amount, coalesce(ep.paid, 0),
    coalesce(s.custom_monthly_fee, mg.monthly_fee), coalesce(mp.paid, 0),
    lp.paid_at, lp.amount
  from students s
  cross join eff_office
  left join my_group mg on mg.student_id = s.id
  left join group_names gn on gn.student_id = s.id
  left join entry_paid ep on ep.student_id = s.id
  left join month_paid mp on mp.student_id = s.id
  left join last_pay lp on lp.student_id = s.id
  where s.archived = false
    and (eff_office.v is null or s.office = eff_office.v)
$function$;

-- ---------- 8. get_monthly_payment_totals — сколько реально собрано по месяцам ----------
create or replace function get_monthly_payment_totals(p_office text)
returns table(payment_period text, collected numeric, payments_count integer)
language sql
security definer
set search_path to 'public'
as $function$
  with eff_office as (
    select case when my_role() = 'office_manager' then my_office() else p_office end as v
  )
  select p.payment_period, sum(p.amount), count(*)::int
  from payments p
  join students s on s.id = p.student_id
  cross join eff_office
  where p.payment_type = 'monthly' and p.payment_period is not null
    and s.archived = false
    and (eff_office.v is null or s.office = eff_office.v)
  group by p.payment_period
  order by p.payment_period;
$function$;
