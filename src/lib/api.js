import { supabase } from './supabase'

// ---------- СПРАВОЧНИКИ ----------
export async function fetchDictionaries() {
  const [subjects, groups, teachers, assistants, tSubjects, students] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    supabase.from('groups').select('*').eq('archived', false).order('name'),
    supabase.from('teachers').select('*').eq('archived', false).order('full_name'),
    supabase.from('assistants').select('*').eq('archived', false).order('full_name'),
    supabase.from('teacher_subjects').select('teacher_id, subject_id'),
    supabase.from('students').select('id, full_name, contact').eq('archived', false).order('full_name'),
  ])
  const err = subjects.error || groups.error || teachers.error || assistants.error || tSubjects.error || students.error
  if (err) throw err
  // карта: teacher_id -> [subject_id, ...]
  const subjectsByTeacher = {}
  ;(tSubjects.data || []).forEach((r) => {
    (subjectsByTeacher[r.teacher_id] ||= []).push(r.subject_id)
  })
  return {
    subjects: subjects.data,
    groups: groups.data,
    teachers: teachers.data,
    assistants: assistants.data,
    students: students.data,
    subjectsByTeacher,
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
    .select('student_id, present, absence_reason')
    .eq('lesson_id', lessonId)
  if (error) throw error
  return data
}

// Сохранить посещаемость урока целиком (перезапись)
export async function saveAttendance(lessonId, records) {
  await supabase.from('attendance').delete().eq('lesson_id', lessonId)
  if (records.length) {
    const rows = records.map((r) => ({
      lesson_id: lessonId,
      student_id: r.student_id,
      present: r.present,
      absence_reason: r.present ? null : (r.absence_reason || null),
    }))
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

// Добавить/убрать ученика в группе (по одной связи)
export async function addStudentToGroup(studentId, groupId) {
  const { error } = await supabase.from('student_groups')
    .insert({ student_id: studentId, group_id: groupId })
  if (error && !/duplicate/i.test(error.message)) throw error
}
export async function removeStudentFromGroup(studentId, groupId) {
  const { error } = await supabase.from('student_groups')
    .delete().eq('student_id', studentId).eq('group_id', groupId)
  if (error) throw error
}
// Все ученики (для поиска при добавлении в группу)
export async function fetchAllStudents() {
  const { data, error } = await supabase.from('students')
    .select('id, full_name, contact').eq('archived', false).order('full_name')
  if (error) throw error
  return data
}

// ---------- ТАБЕЛИ (преподаватели + ученики) ----------
// Единый сбор данных за период для расчёта табелей.
export async function fetchTimesheetData(period) {
  // Уроки за период (только проведённые важны для табеля, но тянем все — отменённые отфильтруем)
  let lq = supabase.from('lessons')
    .select('id, group_id, teacher_id, assistant_id, lesson_date, status, lessons_count, topic')
  if (period?.from) lq = lq.gte('lesson_date', period.from)
  if (period?.to) lq = lq.lte('lesson_date', period.to)
  const { data: lessons, error: le } = await lq
  if (le) throw le

  const lessonIds = lessons.map((l) => l.id)
  let attendance = []
  if (lessonIds.length) {
    const { data: att, error: ae } = await supabase
      .from('attendance').select('lesson_id, student_id, present, absence_reason')
      .in('lesson_id', lessonIds)
    if (ae) throw ae
    attendance = att
  }

  // Связки ученик-группа (чтобы знать состав групп)
  const { data: links, error: lke } = await supabase
    .from('student_groups').select('student_id, group_id')
  if (lke) throw lke

  return { lessons, attendance, studentGroups: links }
}

// ---------- АНАЛИТИКА: КАРТОЧКА УЧЕНИКА ----------
// Календарь ученика за месяц ('YYYY-MM') — все занятия его групп с отметкой присутствия
export async function fetchStudentCalendar(studentId, month) {
  const { data, error } = await supabase.rpc('get_student_calendar', {
    p_student_id: studentId, p_month: month,
  })
  if (error) throw error
  return data || []
}

// Сводка ученика за период
export async function fetchStudentSummary(studentId, from, to) {
  const { data, error } = await supabase.rpc('get_student_summary', {
    p_student_id: studentId, p_from: from || null, p_to: to || null,
  })
  if (error) throw error
  return data?.[0] || { total: 0, present: 0, absent: 0, pct: 0, max_streak: 0, last_lesson_date: null }
}

// Группы ученика с метриками за период
export async function fetchStudentGroupsStats(studentId, from, to) {
  const { data, error } = await supabase.rpc('get_student_groups', {
    p_student_id: studentId, p_from: from || null, p_to: to || null,
  })
  if (error) throw error
  return data || []
}

// Один ученик со всеми полями
export async function fetchStudent(studentId) {
  const { data, error } = await supabase.from('students').select('*').eq('id', studentId).single()
  if (error) throw error
  return data
}

// ---------- РИСКИ ----------
// Ученики с флагами риска (status = attention | risk)
export async function fetchRiskStudents() {
  const { data, error } = await supabase.from('students')
    .select('*')
    .in('status', ['attention', 'risk'])
    .eq('archived', false)
    .order('status', { ascending: false })
  if (error) throw error
  return data || []
}

// Пересчитать флаги риска (RPC)
export async function recalcRiskFlags() {
  const { data, error } = await supabase.rpc('recalc_risk_flags')
  if (error) throw error
  return data
}

// Зафиксировать контакт с родителем
export async function saveContact(studentId, note) {
  const { error } = await supabase.from('students')
    .update({ last_contact_at: new Date().toISOString(), last_contact_note: note })
    .eq('id', studentId)
  if (error) throw error
  // событие в ленту
  await supabase.from('student_events').insert({
    student_id: studentId, event_type: 'contact', payload: { note },
  })
}

// Лента событий ученика
export async function fetchStudentEvents(studentId) {
  const { data, error } = await supabase.from('student_events')
    .select('*').eq('student_id', studentId)
    .order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data || []
}

// ---------- ДАШБОРД ----------
// Сырые данные за период для расчёта KPI и графиков на клиенте.
export async function fetchDashboardData(period) {
  let lq = supabase.from('lessons')
    .select('id, group_id, teacher_id, lesson_date, status, lessons_count, plan_path')
  if (period?.from) lq = lq.gte('lesson_date', period.from)
  if (period?.to) lq = lq.lte('lesson_date', period.to)
  const { data: lessons, error: le } = await lq
  if (le) throw le

  const ids = lessons.map((l) => l.id)
  let attendance = []
  if (ids.length) {
    const { data: att, error: ae } = await supabase
      .from('attendance').select('lesson_id, student_id, present, absence_reason')
      .in('lesson_id', ids)
    if (ae) throw ae
    attendance = att
  }

  const [{ data: groups }, { data: students }, { data: links }] = await Promise.all([
    supabase.from('groups').select('id, name, office, lang, subject_name, capacity').eq('archived', false),
    supabase.from('students').select('id, full_name, status, office, lang').eq('archived', false),
    supabase.from('student_groups').select('student_id, group_id'),
  ])

  return { lessons, attendance, groups: groups || [], students: students || [], studentGroups: links || [] }
}

// ---------- АНАЛИТИКА: ГРУППЫ / ПРЕПОДАВАТЕЛИ / ПРЕДМЕТЫ ----------
export async function fetchGroupsAnalytics(from, to) {
  const { data, error } = await supabase.rpc('get_groups_analytics', { p_from: from || null, p_to: to || null })
  if (error) throw error
  return data || []
}
export async function fetchTeachersAnalytics(from, to) {
  const { data, error } = await supabase.rpc('get_teachers_analytics', { p_from: from || null, p_to: to || null })
  if (error) throw error
  return data || []
}
export async function fetchSubjectsAnalytics(from, to) {
  const { data, error } = await supabase.rpc('get_subjects_analytics', { p_from: from || null, p_to: to || null })
  if (error) throw error
  return data || []
}

// ---------- ПОИСК ----------
export async function globalSearch(query) {
  if (!query || query.trim().length < 2) return []
  const { data, error } = await supabase.rpc('global_search', { p_query: query.trim() })
  if (error) throw error
  return data || []
}

// ---------- УВЕДОМЛЕНИЯ ----------
export async function fetchNotifications() {
  const { data, error } = await supabase.rpc('get_notifications')
  if (error) throw error
  return data || []
}

// ---------- ЖУРНАЛ ОБЩЕНИЯ ----------
export async function fetchCommunications(studentId) {
  const { data, error } = await supabase.from('communications')
    .select('*').eq('student_id', studentId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function addCommunication(studentId, kind, note, result, authorName) {
  const { error } = await supabase.from('communications').insert({
    student_id: studentId, kind, note, result, author_name: authorName || null,
  })
  if (error) throw error
}

// ---------- ЛОГИ ----------
export async function fetchAuditLog(limit = 100) {
  const { data, error } = await supabase.from('audit_log')
    .select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

// ---------- ОБНОВЛЕНИЕ УЧЕНИКА (статусы, заморозка, уход) ----------
export async function updateStudentStatus(id, patch) {
  const { error } = await supabase.from('students').update(patch).eq('id', id)
  if (error) throw error
}
