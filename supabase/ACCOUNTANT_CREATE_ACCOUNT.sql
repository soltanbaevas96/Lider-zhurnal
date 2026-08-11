-- =====================================================================
--  Создание учётки бухгалтера — шаг 2 (после того как аккаунт создан
--  в Dashboard, см. инструкцию в чате).
--  Выполнить в Supabase → SQL Editor ПОСЛЕ 39_accountant_role.sql
--  И ПОСЛЕ создания пользователя в Authentication → Users.
-- =====================================================================

update profiles
set role = 'accountant',
    username = 'aibraeva',
    full_name = 'Ибраева Алия Алиевна'
where id = (select id from auth.users where email = 'aibraeva@lider.local');

-- Проверка — должна вернуться 1 строка с role=accountant
select id, full_name, role, username from profiles where username = 'aibraeva';
