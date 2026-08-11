# P0-001 FIX REPORT

## Vulnerability
Любой авторизованный пользователь (teacher, assistant, office_manager, curator и т.д.) мог
через обычный `supabase-js` клиент выполнить:
```js
supabase.from('profiles').update({ role: 'admin' }).eq('id', session.user.id)
```
и назначить себе роль `admin`, получив полный доступ ко всем разделам приложения, включая
«Управление» и финансовые данные. Аналогично можно было сменить `office` и получить доступ
офис-менеджера к чужому офису. Подтверждено в production 2026-08-10 (см. `P0_VERIFY_REPORT.md`).

## Root Cause
RLS-policy `"profiles self update"` на таблице `profiles`:
```sql
using (id = auth.uid())
```
не имела `WITH CHECK`. В Postgres для UPDATE-политики, если `WITH CHECK` не задан явно, для
проверки новой версии строки используется тот же `USING`. Реальное ограничение было только
«это моя строка», но не «какие поля я могу в неё писать» — колонки `role` и `office` были
доступны для самостоятельного изменения наравне с обычными полями вроде `full_name`.

## Fix
Добавлен `BEFORE UPDATE` триггер `trg_protect_profiles_sensitive_fields` на таблицу `profiles`,
который блокирует изменение `role`/`office`, если вызывающий не администратор
(`is_admin()`) и не доверенный серверный контекст (`service_role` — для Edge Function
`invite-teacher` и аналогичных серверных путей). Все остальные поля (`full_name`, `username`
и т.д.) по-прежнему свободно редактируются владельцем строки — обычное редактирование профиля
не затронуто. Policy `"profiles self update"` пересоздана с явным `WITH CHECK (id = auth.uid())`
— смысл не изменился, но убрана неявная зависимость от поведения Postgres по умолчанию.

Существующий административный механизм `admin_set_role(...)` **не изменён** — он уже был
защищён собственной проверкой `is_admin()` внутри (см. `P0_VERIFY_REPORT.md`) и продолжает
работать как раньше; новый триггер лишь добавляет второй, независимый слой защиты на уровне
самой таблицы.

## Migration
[`supabase/38_security_profiles_update.sql`](supabase/38_security_profiles_update.sql) —
применена владельцем вручную в Supabase SQL Editor (следующий номер после ранее выполненных
на проде миграций 01-37, согласно принятому в проекте порядку из `CLAUDE.md`). Ничего не
удаляет и не меняет существующие данные — только заменяет одну policy на эквивалентную по
смыслу и добавляет новый триггер.

## RLS
| Policy | До | После |
|---|---|---|
| `profiles self update` (UPDATE) | `USING (id = auth.uid())`, `WITH CHECK` отсутствует (неявно = USING) | `USING (id = auth.uid())`, `WITH CHECK (id = auth.uid())` — явно |
| `profiles self read` (SELECT) | не менялась | не менялась |

Плюс новый объект: функция-триггер `protect_profiles_sensitive_fields()` + триггер
`trg_protect_profiles_sensitive_fields` (`BEFORE UPDATE FOR EACH ROW`).

## Protected Fields
- `role` — защищено (реально существует, USER-DEFINED `user_role`)
- `office` — защищено (реально существует, `text`)
- `permissions` — **колонка не существует** в `profiles`, защищать нечего
- `is_admin` — **колонка не существует** в `profiles`, защищать нечего (роль админа
  определяется через `role = 'admin'`, не через отдельный boolean)
- `status` — **колонка не существует** в `profiles` (есть `status` у `students`, но это другая
  таблица, вне рамок P0-001)

Существование всех колонок проверено напрямую в production через
`information_schema.columns` перед написанием migration — фиктивных колонок в фикс не
включено.

## Tests
Выполнены на production через `supabase/P0_FIX_STEP3_TESTS.sql` — единый SQL-statement,
имитирующий RLS-сессии разных ролей через `set_config('request.jwt.claims', …)` +
`SET LOCAL ROLE`, с гарантированным откатом всех изменений через безусловный
`RAISE EXCEPTION` в конце блока (необработанное исключение в Postgres откатывает весь
statement целиком, включая любые «успешные» промежуточные `UPDATE`).

| Test | Сценарий | Ожидание | Результат |
|---|---|---|---|
| 1 | teacher: `role = 'admin'` | DENIED | **PASS** |
| 2 | teacher: `permissions = …` | DENIED | **N/A** (колонки нет) |
| 3 | teacher: `is_admin = true` | DENIED | **N/A** (колонки нет) |
| 4 | teacher: `office = чужой офис` | DENIED | **PASS** |
| 5 | teacher: `full_name = …` (обычное поле) | ALLOWED | **PASS** |
| 6 (регресс) | admin → `admin_set_role(target, 'assistant')` | ALLOWED, роль реально меняется | **PASS** |
| 7 (регресс) | service_role напрямую пишет `role` (как `invite-teacher`) | ALLOWED | **PASS** |

Все реальные (не N/A) тесты — PASS. Фактические результаты воспроизведены владельцем в
Supabase SQL Editor на production 2026-08-10.

## Exploit Before
```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', myOwnId))
// → успешно выполнялось, пользователь становился admin
```

## Exploit After
```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', myOwnId))
// → ERROR 42501: Недостаточно прав для изменения role/office. Используйте admin_set_role().
```
Подтверждено TEST 1 напрямую на production (не в тестовой среде).

## Regression
- **Обычное редактирование профиля** (любое поле кроме `role`/`office`, например `full_name`) —
  работает без ограничений (TEST 5).
- **`admin_set_role`** — administraтор по-прежнему может менять роль/офис любого пользователя,
  проверено реальным вызовом с реальной сменой роли внутри отката (TEST 6).
- **Edge Function `invite-teacher`** (использует `service_role` для установки `role` новому
  пользователю) — путь не сломан, `service_role` явно исключён из ограничения триггером
  (TEST 7).
- **Frontend** — не менялся ни один файл (`git status` подтверждает: только новые `.sql`/`.md`),
  так что сборка (`npm run build`) риску не подвергалась. Сам `npm`/`node` недоступен в
  использованном для этой задачи окружении, поэтому команда не была запущена буквально —
  фактического изменения кода фронтенда, которое могло бы что-то сломать, не было. В проекте
  также не настроены скрипты `lint`/`test` (`package.json` содержит только `dev`/`build`/
  `preview`) — их некуда было запускать.
- **Teacher/group/student/lesson scope, расписание, payments, payroll, Storage, UI, API,
  мёртвый код** — не затронуты, как и требовалось.

## Status
FIXED

---

## Итог

```text
P0-001: FIXED
Privilege escalation: BLOCKED
Admin role management: WORKING
Normal profile editing: WORKING
Build: NOT RUN (frontend не менялся — 0 изменённых .js/.jsx файлов, риска нет; node/npm
       недоступны в этом окружении, lint/test скрипты в проекте не настроены)
Tests: PASS (5 реальных сценариев + 2 N/A по отсутствующим колонкам, все на production)
```

Готов остановиться здесь и ждать отдельной команды для перехода к P1.
