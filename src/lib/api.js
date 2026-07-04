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
// Создаёт аккаунт входа (по логину) и привязывает к карточке преподавателя.
export async function inviteTeacher({ login, password, teacher_id, full_name, role }) {
  const { data, error } = await supabase.functions.invoke('invite-teacher', {
    body: { login, password, teacher_id, full_name, role },
  })
  if (error) {
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

// ---------- ПРИВЯЗКИ ПРЕПОДАВАТЕЛЯ (группы и предметы) ----------
export async function fetchTeacherLinks(teacherId) {
  const [g, s] = await Promise.all([
    supabase.from('teacher_groups').select('group_id').eq('teacher_id', teacherId),
    supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', teacherId),
  ])
  if (g.error) throw g.error
  if (s.error) throw s.error
  return {
    groupIds: g.data.map((r) => r.group_id),
    subjectIds: s.data.map((r) => r.subject_id),
  }
}

// Полностью перезаписывает привязки преподавателя выбранными наборами
export async function saveTeacherLinks(teacherId, groupIds, subjectIds) {
  await supabase.from('teacher_groups').delete().eq('teacher_id', teacherId)
  await supabase.from('teacher_subjects').delete().eq('teacher_id', teacherId)
  if (groupIds.length) {
    const { error } = await supabase.from('teacher_groups')
      .insert(groupIds.map((group_id) => ({ teacher_id: teacherId, group_id })))
    if (error) throw error
  }
  if (subjectIds.length) {
    const { error } = await supabase.from('teacher_subjects')
      .insert(subjectIds.map((subject_id) => ({ teacher_id: teacherId, subject_id })))
    if (error) throw error
  }
}

// Группы и предметы, закреплённые за преподавателем (для формы урока)
export async function fetchMyGroupsAndSubjects(teacherId) {
  const [g, s] = await Promise.all([
    supabase.from('teacher_groups').select('groups(id,name)').eq('teacher_id', teacherId),
    supabase.from('teacher_subjects').select('subjects(id,name)').eq('teacher_id', teacherId),
  ])
  if (g.error) throw g.error
  if (s.error) throw s.error
  return {
    groups: g.data.map((r) => r.groups).filter(Boolean),
    subjects: s.data.map((r) => r.subjects).filter(Boolean),
  }
}

// ---------- УЧЕНИКИ И ПОСЕЩАЕМОСТЬ ----------
// Ученики конкретной группы (активные)
export async function fetchStudentsOfGroup(groupId) {
  const { data, error } = await supabase
    .from('student_groups')
    .select('students(id, full_name, archived)')
    .eq('group_id', groupId)
  if (error) throw error
  return data.map((r) => r.students).filter((s) => s && !s.archived)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}

// Текущая посещаемость урока: массив { student_id, present }
export async function fetchAttendance(lessonId) {
  const { data, error } = await supabase
    .from('attendance')
    .select('student_id, present')
    .eq('lesson_id', lessonId)
  if (error) throw error
  return data
}

// Сохранить посещаемость урока целиком (перезапись)
export async function saveAttendance(lessonId, records) {
  await supabase.from('attendance').delete().eq('lesson_id', lessonId)
  if (records.length) {
    const rows = records.map((r) => ({ lesson_id: lessonId, student_id: r.student_id, present: r.present }))
    const { error } = await supabase.from('attendance').insert(rows)
    if (error) throw error
  }
}

// Вся посещаемость за период (для контроля у завуча).
// Возвращает массив { lesson_id, student_id, present, group_id, lesson_date, teacher_id }
export async function fetchAttendanceReport(period) {
  let lq = supabase.from('lessons').select('id, group_id, teacher_id, lesson_date, status')
  if (period?.from) lq = lq.gte('lesson_date', period.from)
  if (period?.to) lq = lq.lte('lesson_date', period.to)
  const { data: lessons, error: le } = await lq
  if (le) throw le
  const lessonIds = lessons.map((l) => l.id)
  if (!lessonIds.length) return { rows: [], lessonsById: {} }

  const { data: att, error: ae } = await supabase
    .from('attendance')
    .select('lesson_id, student_id, present')
    .in('lesson_id', lessonIds)
  if (ae) throw ae

  const lessonsById = {}
  lessons.forEach((l) => { lessonsById[l.id] = l })
  return { rows: att, lessonsById }
}

// Справочник учеников с их группами (для раздела «Ученики» у завуча)
export async function fetchStudentsWithGroups() {
  const { data: students, error: se } = await supabase
    .from('students').select('*').order('full_name')
  if (se) throw se
  const { data: links, error: le } = await supabase
    .from('student_groups').select('student_id, group_id')
  if (le) throw le
  const byStudent = {}
  links.forEach((l) => { (byStudent[l.student_id] ||= []).push(l.group_id) })
  return students.map((s) => ({ ...s, groupIds: byStudent[s.id] || [] }))
}

export async function addStudent(full_name, contact, groupIds) {
  const { data, error } = await supabase.from('students')
    .insert({ full_name, contact: contact || null }).select().single()
  if (error) throw error
  if (groupIds?.length) {
    await supabase.from('student_groups')
      .insert(groupIds.map((group_id) => ({ student_id: data.id, group_id })))
  }
  return data
}

export async function updateStudent(id, full_name, contact, groupIds) {
  await supabase.from('students').update({ full_name, contact: contact || null }).eq('id', id)
  await supabase.from('student_groups').delete().eq('student_id', id)
  if (groupIds?.length) {
    await supabase.from('student_groups')
      .insert(groupIds.map((group_id) => ({ student_id: id, group_id })))
  }
}
