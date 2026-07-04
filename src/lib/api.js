import { supabase } from './supabase'

// ---------- СПРАВОЧНИКИ ----------
export async function fetchDictionaries() {
  const [subjects, groups, teachers, assistants] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    supabase.from('groups').select('*').eq('archived', false).order('name'),
    supabase.from('teachers').select('*').eq('archived', false).order('full_name'),
    supabase.from('assistants').select('*').eq('archived', false).order('full_name'),
  ])
  const err = subjects.error || groups.error || teachers.error || assistants.error
  if (err) throw err
  return {
    subjects: subjects.data,
    groups: groups.data,
    teachers: teachers.data,
    assistants: assistants.data,
  }
}

// ---------- УРОКИ ----------
// period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } или null (все)
export async function fetchLessons(period) {
  let q = supabase.from('lessons').select('*').order('lesson_date', { ascending: false })
  if (period?.from) q = q.gte('lesson_date', period.from)
  if (period?.to) q = q.lte('lesson_date', period.to)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createLesson(payload) {
  const { data, error } = await supabase.from('lessons').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateLesson(id, patch) {
  const { data, error } = await supabase.from('lessons')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteLesson(id) {
  const { error } = await supabase.from('lessons').delete().eq('id', id)
  if (error) throw error
}

// ---------- ФАЙЛЫ ПЛАНОВ (Storage) ----------
export async function uploadPlan(file) {
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('lesson-plans').upload(path, file)
  if (error) throw error
  return path // сохраняется в lessons.plan_path
}

export async function planUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('lesson-plans').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

// ---------- СПРАВОЧНИКИ: управление (только админ, RLS enforced) ----------
export async function addTeacher(payload) {
  const { data, error } = await supabase.from('teachers').insert(payload).select().single()
  if (error) throw error; return data
}
export async function addAssistant(payload) {
  const { data, error } = await supabase.from('assistants').insert(payload).select().single()
  if (error) throw error; return data
}
export async function addGroup(payload) {
  const { data, error } = await supabase.from('groups').insert(payload).select().single()
  if (error) throw error; return data
}
export async function archiveRow(table, id) {
  const { error } = await supabase.from(table).update({ archived: true }).eq('id', id)
  if (error) throw error
}
export async function restoreRow(table, id) {
  const { error } = await supabase.from(table).update({ archived: false }).eq('id', id)
  if (error) throw error
}
export async function updateRow(table, id, patch) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function addSubject(name) {
  const { data, error } = await supabase.from('subjects').insert({ name }).select().single()
  if (error) throw error; return data
}

// Полные справочники, включая архивные — для раздела управления
export async function fetchAllDictionaries() {
  const [subjects, groups, teachers, assistants] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    supabase.from('groups').select('*').order('name'),
    supabase.from('teachers').select('*').order('full_name'),
    supabase.from('assistants').select('*').order('full_name'),
  ])
  const err = subjects.error || groups.error || teachers.error || assistants.error
  if (err) throw err
  return { subjects: subjects.data, groups: groups.data, teachers: teachers.data, assistants: assistants.data }
}

// ---------- ПРИГЛАШЕНИЕ / ПРИВЯЗКА ПРЕПОДАВАТЕЛЕЙ ----------
// Создаёт аккаунт входа и привязывает его к карточке преподавателя.
// Работает через Edge Function invite-teacher (service_role на сервере).
export async function inviteTeacher({ email, password, teacher_id, full_name, role }) {
  const { data, error } = await supabase.functions.invoke('invite-teacher', {
    body: { email, password, teacher_id, full_name, role },
  })
  if (error) {
    // Достаём текст ошибки из тела ответа функции
    let msg = error.message
    try { const ctx = await error.context?.json(); if (ctx?.error) msg = ctx.error } catch {}
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Список преподавателей с флагом «есть ли аккаунт входа»
export async function fetchTeachersWithAccount() {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('archived', false)
    .order('full_name')
  if (error) throw error
  return data // каждая строка содержит profile_id (null = нет аккаунта)
}
