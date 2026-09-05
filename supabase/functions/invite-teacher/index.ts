// =====================================================================
//  Edge Function: invite-teacher (вход по логину)
//  Создаёт аккаунт сотрудника (преподаватель/куратор/ассистент/завуч/
//  директор/офис-менеджер/старший офис-менеджер/бухгалтер) с ЛОГИНОМ
//  (не email). Внутри Supabase Auth используется технический email
//  login@lider.local, пользователь видит и вводит только логин.
//
//  Используется из Manage.jsx (кнопка «Профиль» → «Создать вход») для
//  преподавателей/кураторов/ассистентов через adminCreateAccount(kind,
//  card_id, ...), и напрямую через inviteTeacher({teacher_id, ...}) —
//  оба варианта поддержаны для обратной совместимости.
//
//  Деплой:  supabase functions deploy invite-teacher
//  (или Dashboard → Edge Functions → invite-teacher → вставить код → Deploy)
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_DOMAIN = 'lider.local'

const VALID_ROLES = [
  'teacher', 'admin', 'director', 'assistant',
  'office_manager', 'senior_office_manager', 'accountant', 'methodist',
]

// kind (Manage.jsx вкладка) -> таблица-карточка сотрудника
const KIND_TABLE: Record<string, string> = {
  teachers: 'teachers',
  curators: 'curators',
  assistants: 'assistants',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Проверяем, что вызывающий — админ
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: uErr } = await asUser.auth.getUser()
    if (uErr || !user) return json({ error: 'Не авторизован' }, 401)
    const { data: prof } = await asUser.from('profiles').select('role').eq('id', user.id).single()
    if (prof?.role !== 'admin') return json({ error: 'Требуются права администратора' }, 403)

    const body = await req.json()
    const { login, password, full_name, role, office } = body
    // kind/card_id — новый способ (любая карточка); teacher_id — старый способ (только преподаватель)
    const kind = body.kind ?? (body.teacher_id ? 'teachers' : null)
    const cardId = body.card_id ?? body.teacher_id ?? null

    if (!login || !password) return json({ error: 'Нужны логин и пароль' }, 400)
    if (password.length < 4) return json({ error: 'Пароль минимум 4 символа' }, 400)

    const username = String(login).toLowerCase().trim()
    if (!/^[a-z0-9._-]+$/.test(username))
      return json({ error: 'Логин может содержать только латинские буквы, цифры, точку, дефис' }, 400)

    const email = `${username}@${EMAIL_DOMAIN}`
    const admin = createClient(url, serviceKey)

    // Создаём пользователя
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
    })
    if (cErr) {
      const msg = /already/i.test(cErr.message) ? 'Такой логин уже занят' : cErr.message
      return json({ error: msg }, 400)
    }
    const newUserId = created.user.id

    // Профиль (роль + логин + имя + офис для office_manager)
    const wantRole = VALID_ROLES.includes(role) ? role : 'teacher'
    const { error: profErr } = await admin.from('profiles').update({
      role: wantRole,
      full_name: full_name ?? '',
      username,
      office: (wantRole === 'office_manager' || wantRole === 'methodist') ? (office || null) : null,
    }).eq('id', newUserId)
    if (profErr) return json({ error: 'Пользователь создан, но не удалось настроить профиль: ' + profErr.message }, 200)

    // Привязка к карточке сотрудника (преподаватель/куратор/ассистент)
    const table = kind ? KIND_TABLE[kind] : null
    if (table && cardId) {
      const { error: linkErr } = await admin.from(table).update({ profile_id: newUserId }).eq('id', cardId)
      if (linkErr) return json({ error: 'Аккаунт создан, но не удалось привязать: ' + linkErr.message }, 200)
    }

    // Сохраняем "видимый" пароль (bcrypt необратим) — чтобы карточка «Профиль» могла его показать
    await admin.from('_issued_logins').insert({
      profile_id: newUserId, login: username, password, role_kind: wantRole, full_name: full_name ?? '',
    })

    return json({ ok: true, user_id: newUserId, username, login: username })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
