// =====================================================================
//  Edge Function: invite-teacher (вход по логину)
//  Создаёт аккаунт преподавателя/завуча с ЛОГИНОМ (не email).
//  Внутри Supabase Auth используется технический email login@lider.local,
//  пользователь видит и вводит только логин.
//  Деплой:  supabase functions deploy invite-teacher
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_DOMAIN = 'lider.local'

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

    const { login, password, teacher_id, full_name, role } = await req.json()
    if (!login || !password) return json({ error: 'Нужны логин и пароль' }, 400)

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

    // Профиль (роль + логин + имя)
    const wantRole = role === 'admin' ? 'admin' : 'teacher'
    await admin.from('profiles').update({ role: wantRole, full_name: full_name ?? '', username }).eq('id', newUserId)

    // Привязка к карточке преподавателя
    if (teacher_id) {
      const { error: linkErr } = await admin.from('teachers').update({ profile_id: newUserId }).eq('id', teacher_id)
      if (linkErr) return json({ error: 'Аккаунт создан, но не удалось привязать: ' + linkErr.message }, 200)
    }

    return json({ ok: true, user_id: newUserId, username, login: username })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
