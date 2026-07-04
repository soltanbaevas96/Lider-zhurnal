// =====================================================================
//  Edge Function: invite-teacher
//  Безопасно создаёт аккаунт преподавателя (или завуча) и привязывает его
//  к карточке в таблице teachers. Использует service_role ключ, который
//  доступен ТОЛЬКО на сервере Supabase (никогда не попадает в браузер).
//
//  Вызывать только от имени авторизованного администратора (проверяется).
//  Деплой:  supabase functions deploy invite-teacher
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 1. Проверяем, что вызывающий — авторизованный администратор
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: uErr } = await asUser.auth.getUser()
    if (uErr || !user) return json({ error: 'Не авторизован' }, 401)

    const { data: prof } = await asUser.from('profiles').select('role').eq('id', user.id).single()
    if (prof?.role !== 'admin') return json({ error: 'Требуются права администратора' }, 403)

    // 2. Читаем входные данные
    const { email, password, teacher_id, full_name, role } = await req.json()
    if (!email || !password) return json({ error: 'Нужны email и пароль' }, 400)

    // 3. Создаём пользователя через service_role (admin API)
    const admin = createClient(url, serviceKey)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
    })
    if (cErr) return json({ error: cErr.message }, 400)

    const newUserId = created.user.id

    // 4. Профиль создаётся триггером с ролью teacher. Если нужен admin — обновим.
    const wantRole = role === 'admin' ? 'admin' : 'teacher'
    await admin.from('profiles').update({ role: wantRole, full_name: full_name ?? '' }).eq('id', newUserId)

    // 5. Привязываем к карточке преподавателя (если передан teacher_id)
    if (teacher_id) {
      const { error: linkErr } = await admin.from('teachers').update({ profile_id: newUserId }).eq('id', teacher_id)
      if (linkErr) return json({ error: 'Аккаунт создан, но не удалось привязать: ' + linkErr.message }, 200)
    }

    return json({ ok: true, user_id: newUserId })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
