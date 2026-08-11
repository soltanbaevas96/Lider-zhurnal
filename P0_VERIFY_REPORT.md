# P0_VERIFY_REPORT.md
Проверка двух P0-находок из [AUDIT_BEFORE_FIX.md](AUDIT_BEFORE_FIX.md) напрямую на production
Supabase (`Lider-plus`, ref `aljtumkzzatacbhonbja`). Проверка — только чтение (`pg_policies`,
`pg_proc`), правки в БД/код/RLS/frontend **не вносились**.

Источники доказательств: результаты SQL-запросов из `supabase/P0_VERIFY_CORE.sql` и
`supabase/P0_VERIFY_FIND_CREATE_ACCOUNT.sql`, выполненных владельцем в Supabase SQL Editor
2026-08-10.

---

## P0-001

**Severity:** CRITICAL
**Production status: CONFIRMED VULNERABILITY**

**Affected object:**
`public.profiles`, RLS policy `"profiles self update"` (command `UPDATE`).

**Problem:**
Фактическая политика на проде:

| policy_name | command | using_expression | with_check_expression |
|---|---|---|---|
| profiles self update | UPDATE | `(id = auth.uid())` | **NULL** |

`WITH CHECK` не задан. По документации Postgres, если для `UPDATE`-политики `WITH CHECK` не
указан явно, для проверки новой версии строки используется то же выражение, что и в `USING`.
Значит реальное ограничение — только «строка принадлежит мне» (`id = auth.uid()`), а какие
именно колонки и какие значения туда пишутся — не проверяется вообще. Ограничения на уровне
GRANT (по колонкам) также не обнаружено.

**Attack scenario:**
Любой авторизованный пользователь (teacher, assistant, office_manager, curator и т.д.),
открыв консоль браузера на живом сайте с активной сессией, может выполнить:

```js
await supabase.from('profiles')
  .update({ role: 'admin' })
  .eq('id', (await supabase.auth.getUser()).data.user.id)
```

RLS пропустит операцию (`id = auth.uid()` истинно для собственной строки), после чего
пользователь получает роль `admin` и полный доступ ко всем разделам приложения, включая
«Управление» и все финансовые данные. Аналогично можно изменить `office` (получить доступ
office_manager к чужому офису).

**Risk:**
Полная эскалация привилегий любого сотрудника до завуча (admin) без участия администратора.
Один клиентский запрос, не требует эксплойта, багов фронтенда или обхода auth — используется
штатный `supabase-js` клиент с обычной анонимной сессией пользователя.

**Важное уточнение:** серверные admin-функции (`admin_set_role` и др., см. P0-002) сами по себе
защищены правильно — проблема именно в том, что RLS **отдельно** разрешает прямой `update` по
таблице `profiles` в обход этих функций.

**Recommended fix (не выполнялось, только рекомендация для отдельной задачи):**
Добавить `WITH CHECK`, запрещающий пользователю менять `role`/`office`/любые «административные»
поля самостоятельно — например, сверяя новое значение со старым в подзапросе, либо ограничить
`UPDATE`-грант на таблицу конкретными «безопасными» колонками (`full_name`, `username` и т.п.)
и убрать возможность менять `role`/`office` вне функций `admin_set_role`/`admin_create_account`
(которые работают как `SECURITY DEFINER` и не зависят от этой политики). Требует отдельной
migration и тестирования — не делать в рамках этой проверки.

---

## P0-002

**Severity:** CRITICAL (по потенциалу, если бы подтвердилось)
**Production status: NOT VULNERABLE** (для 3 из 4 функций; 4-я функция не существует)

**Affected objects:**
`public.admin_set_password`, `public.admin_set_role`, `public.admin_soft_delete`,
`public.admin_create_account`.

**Evidence — общее для всех трёх найденных функций:**
`prosecdef = true` (SECURITY DEFINER), `search_path` явно закреплён через `SET search_path TO
'public', ...` (защита от search_path hijacking), и **первая исполняемая строка тела каждой
функции**:

```sql
if not is_admin() then raise exception 'Недостаточно прав'; end if;
```

`is_admin()` (проверена отдельно, запрос 6) реализована как:
```sql
select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
```
— то есть корректно сверяет `profiles.role` вызывающего.

### Подробности по функциям

**`admin_set_password(p_profile_id uuid, p_password text)`**
- `SECURITY DEFINER`, `search_path = public, auth, extensions`.
- Проверка `is_admin()` — есть, в начале тела.
- Меняет: `auth.users.encrypted_password`, `auth.users.email_confirmed_at`,
  `_issued_logins.password` (upsert-логика через update+insert).
- Может ли обычный пользователь вызвать: технически да (RPC доступен), но выполнение
  прерывается исключением на первой строке, если вызывающий не admin. **Обойти проверку роли
  нельзя** — она использует `auth.uid()` из JWT сессии, подделать на клиенте невозможно.
- Privilege escalation: невозможен.

**`admin_set_role(p_profile_id uuid, p_role text, p_office text default ...)`**
- `SECURITY DEFINER`, `search_path = public`.
- Проверка `is_admin()` — есть, в начале тела.
- Меняет: `profiles.role`, `profiles.office` для **любого** `p_profile_id`.
- Сценарий «teacher → admin_set_role(...) → role=admin» **невозможен**: вызов от имени
  teacher немедленно завершится исключением `'Недостаточно прав'` до какого-либо `update`.
- Privilege escalation: невозможен через эту функцию (но возможен другим путём — см. P0-001).

**`admin_soft_delete(p_kind text, p_id uuid)`**
- `SECURITY DEFINER`, `search_path = public, auth`.
- Проверка `is_admin()` — есть, в начале тела.
- Мягко архивирует `teachers`/`curators`/`assistants` (`archived = true`), затем каскадно
  удаляет `auth.users` и `_issued_logins` для привязанного профиля. Логика соответствует
  описанному в `CLAUDE.md` принципу мягкого удаления.
- Может ли обычный пользователь вызвать результативно: нет, та же защита `is_admin()`.

**`admin_create_account(...)`**
- **Функция отсутствует в схеме `public`** (проверено `ilike '%create_account%'` по
  `pg_proc` — 0 строк). Не найдена ни под этим, ни под похожим именем в `public`.
- Вызывается из `src/lib/api.js:741-746` (`adminCreateAccount`) и используется в
  `src/pages/Manage.jsx:796`. **Это не уязвимость (нечего эксплуатировать), а сломанная
  функциональность**: любая попытка создать учётку через этот путь на проде завершится
  ошибкой Supabase «could not find function `admin_create_account`». Требует отдельного
  разбора вне рамок P0-security (либо функция была удалена/переименована, либо никогда не
  была задеплоена, а фронтенд обновили раньше бэкенда).

**Risk:** для 3 существующих функций — отсутствует, реализованы корректно. Для 4-й — риска
безопасности нет, но есть риск для функциональности (сломанный UI-сценарий).

**Recommended fix:** для 3 функций — исправлений не требуется, паттерн `is_admin()`-проверки
в начале `SECURITY DEFINER`-функции корректен и может использоваться как эталон для будущих
admin-RPC. Для `admin_create_account` — отдельная задача: либо создать отсутствующую функцию
по аналогии с тремя другими (с обязательной проверкой `is_admin()` по такому же паттерну),
либо найти её фактическое имя на проде и поправить вызов в `api.js`.

---

## Итоговая таблица

| ID | Problem | Status | Criticality |
|---|---|---|---|
| P0-001 | profiles role escalation (прямой `update` через RLS) | **CONFIRMED** | CRITICAL |
| P0-002 | admin RPC authorization (`admin_set_role` и др.) | **NOT VULNERABLE** | CRITICAL (по потенциалу; на практике защищены) |

**Дополнительно обнаружено в ходе проверки (не было в исходном аудите):**
`admin_create_account` вызывается фронтендом, но не существует в БД — сломанная функция
создания учёток (не security-проблема, отдельная задача на исправление).

---

## Что дальше

Код, RLS, миграции и frontend в рамках этой проверки **не менялись**. Единственная
подтверждённая критическая уязвимость — **P0-001**. Рекомендую в первую очередь закрыть именно
её (это открытый путь к получению роли `admin` любым сотрудником прямо сейчас), затем отдельной
задачей разобраться с отсутствующей `admin_create_account`. Жду решения, в каком порядке
переходить к исправлениям.
