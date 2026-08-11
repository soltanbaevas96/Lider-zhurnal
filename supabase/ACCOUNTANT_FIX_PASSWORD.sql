-- =====================================================================
--  Исправление входа бухгалтера: принудительно ставим пароль и
--  подтверждаем email напрямую (та же логика, что внутри admin_set_password,
--  только без проверки is_admin() — здесь она не нужна, мы уже
--  выполняем это от имени postgres в SQL Editor).
-- =====================================================================

update auth.users
set encrypted_password = extensions.crypt('T7kQmXr9Fz', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'aibraeva@lider.local';

-- Синхронизируем "видимый" пароль в _issued_logins (то, что покажет карточка сотрудника)
update _issued_logins set password = 'T7kQmXr9Fz'
where profile_id = (select id from profiles where username = 'aibraeva');

insert into _issued_logins (profile_id, login, password, role_kind, full_name)
select p.id, p.username, 'T7kQmXr9Fz', p.role::text, p.full_name
from profiles p
where p.username = 'aibraeva'
  and not exists (select 1 from _issued_logins il where il.profile_id = p.id);

-- Проверка: email должен быть подтверждён (email_confirmed_at не NULL)
select id, email, email_confirmed_at is not null as confirmed
from auth.users where email = 'aibraeva@lider.local';
