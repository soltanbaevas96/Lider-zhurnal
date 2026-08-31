import { supabase } from './supabase'

// Supabase может резать выдачу одного запроса (Project Settings → API →
// Max rows) — клиентский .limit() выше этого потолка не всегда помогает.
// Для потенциально больших таблиц (ученики, группы, уроки, посещаемость)
// читаем постранично, пока не придёт неполная страница — так число строк
// не упирается ни в какой скрытый потолок.
async function fetchAllPages(queryFactory, pageSize = 1000) {
  let all = []
  let from = 0
  for (;;) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) return all
    from += pageSize
  }
}

// Когда список id для .in(...) сам по себе большой (тысячи уроков за
// месяц) — URL запроса может стать слишком длинным. Бьём id на пачки,
// а внутри каждой пачки всё равно читаем постранично (см. выше).
async function fetchByIdChunks(ids, queryFactory, chunkSize = 200) {
  let all = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const rows = await fetchAllPages(() => queryFactory(chunk))
    all = all.concat(rows)
  }
  return all
}

// ---------- СПРАВОЧНИКИ ----------
export async function fetchDictionaries() {
  const [subjects, groupsRows, teachers, assistants, curators, tSubjects, studentsRows] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    fetchAllPages(() => supabase.from('groups').select('*').eq('archived', false).order('name').order('id')),
    supabase.from('teachers').select('*').eq('archived', false).order('full_name'),
    supabase.from('assistants').select('*').eq('archived', false).order('full_name'),
    supabase.from('curators').select('*').eq('archived', false).order('full_name'),
    supabase.from('teacher_subjects').select('teacher_id, subject_id'),
    fetchAllPages(() => supabase.from('students').select('id, full_name, contact, office, lang').eq('archived', false).order('full_name').order('id')),
  ])
  const err = subjects.error || teachers.error || assistants.error || curators.error || tSubjects.error
  if (err) throw err
  // карта: teacher_id -> [subject_id, ...]
  const subjectsByTeacher = {}
  ;(tSubjects.data || []).forEach((r) => {
    (subjectsByTeacher[r.teacher_id] ||= []).push(r.subject_id)
  })
  return {
    subjects: subjects.data,
    groups: groupsRows,
    teachers: teachers.data,
    assistants: assistants.data,
    curators: curators.data || [],
    students: studentsRows,
    subjectsByTeacher,
  }
}

// ---------- УРОКИ ----------
// period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } или null (все)
export async function fetchLessons(period) {
  return fetchAllPages(() => {
    // order по id вторым ключом — иначе при одинаковой дате порядок между
    // страницами не гарантирован и постраничная выгрузка может задвоить
    // или пропустить строки
    let q = supabase.from('lessons').select('*')
      .order('lesson_date', { ascending: false }).order('id', { ascending: true })
    if (period?.from) q = q.gte('lesson_date', period.from)
    if (period?.to) q = q.lte('lesson_date', period.to)
    return q
  })
}

// Было ли тестирование на уроке и с каким максимумом (для повторного открытия «Провести занятие»)
export async function fetchLessonTestInfo(lessonId) {
  const { data, error } = await supabase.from('lessons').select('has_test, test_max_score').eq('id', lessonId).maybeSingle()
  if (error) throw error
  return data || { has_test: false, test_max_score: null }
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
  const [subjects, groupsRows, teachers, assistants, curators] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    fetchAllPages(() => supabase.from('groups').select('*').order('name').order('id')),
    supabase.from('teachers').select('*').order('full_name'),
    supabase.from('assistants').select('*').order('full_name'),
    supabase.from('curators').select('*').order('full_name'),
  ])
  const err = subjects.error || teachers.error || assistants.error || curators.error
  if (err) throw err
  return { subjects: subjects.data, groups: groupsRows, teachers: teachers.data, assistants: assistants.data, curators: curators.data || [] }
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
    .select('student_id, present, absence_reason, score')
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
      status: r.status || (r.present ? 'present' : 'absent'),
      present: r.present,
      absence_reason: r.present ? null : (r.absence_reason || null),
      score: r.score ?? null,
    }))
    const { error } = await supabase.from('attendance').insert(rows)
    if (error) throw error
  }
}

// ---------- РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ ----------
export async function fetchStudentTestScores(studentId) {
  const { data, error } = await supabase.rpc('get_student_test_scores', { p_student_id: studentId })
  if (error) throw error
  return data || []
}
export async function fetchGroupTestScores(groupId) {
  const { data, error } = await supabase.rpc('get_group_test_scores', { p_group_id: groupId })
  if (error) throw error
  return data || []
}

// Вся посещаемость за период (для контроля у завуча).
// Возвращает массив { lesson_id, student_id, present, group_id, lesson_date, teacher_id }
export async function fetchAttendanceReport(period) {
  const lessons = await fetchAllPages(() => {
    let lq = supabase.from('lessons').select('id, group_id, teacher_id, lesson_date, status').order('id')
    if (period?.from) lq = lq.gte('lesson_date', period.from)
    if (period?.to) lq = lq.lte('lesson_date', period.to)
    return lq
  })
  const lessonIds = lessons.map((l) => l.id)
  if (!lessonIds.length) return { rows: [], lessonsById: {} }

  const att = await fetchByIdChunks(lessonIds, (chunk) => supabase
    .from('attendance')
    .select('lesson_id, student_id, present')
    .in('lesson_id', chunk)
    .order('lesson_id').order('student_id'))

  const lessonsById = {}
  lessons.forEach((l) => { lessonsById[l.id] = l })
  return { rows: att, lessonsById }
}

// Справочник учеников с их группами (для раздела «Ученики» у завуча)
export async function fetchStudentsWithGroups() {
  // через серверную RPC — так же, как работает карточка ученика
  const { data, error } = await supabase.rpc('get_students_list')
  if (error) throw error
  return (data || []).map((s) => ({
    ...s,
    groupIds: s.group_ids || [],
    groupsData: (s.group_names || []).map((name, i) => ({ id: (s.group_ids || [])[i], name })),
    _subjects: s.subjects || [],
  }))
}

export async function addStudent(fields, groupIds) {
  // fields: { full_name, contact, school, grade, office, lang, phone, parent_phone, parent_name, contract_no, note, enrolled_at }
  const { data, error } = await supabase.from('students')
    .insert({ ...fields, full_name: fields.full_name, contact: fields.contact || null }).select().single()
  if (error) throw error
  const ids = [...new Set(groupIds || [])]
  if (ids.length) {
    await supabase.from('student_groups')
      .insert(ids.map((group_id) => ({ student_id: data.id, group_id })))
  }
  return data
}

// Активные ученики с точно таким же именем (регистр не важен) — для
// предупреждения о возможном дубле при создании новой карточки.
export async function findStudentsByName(fullName, excludeId) {
  const name = fullName.trim()
  if (!name) return []
  let q = supabase.from('students')
    .select('id, office, lang, contract_no')
    .eq('archived', false)
    .ilike('full_name', name)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function updateStudent(id, fields, groupIds) {
  await supabase.from('students').update({ ...fields, contact: fields.contact || null }).eq('id', id)
  await supabase.from('student_groups').delete().eq('student_id', id)
  const ids = [...new Set(groupIds || [])]
  if (ids.length) {
    await supabase.from('student_groups')
      .insert(ids.map((group_id) => ({ student_id: id, group_id })))
  }
}

// Удалить ученика: архивировать карточку + убрать из всех групп.
// Мягкое удаление — история посещаемости/оплат сохраняется, ученик
// просто исчезает из активных списков и группы.
export async function deleteStudent(id) {
  await supabase.from('student_groups').delete().eq('student_id', id)
  const { error } = await supabase.from('students').update({ archived: true }).eq('id', id)
  if (error) throw error
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
  return fetchAllPages(() => supabase.from('students')
    .select('id, full_name, contact, office, lang').eq('archived', false).order('full_name').order('id'))
}

// ---------- ТАБЕЛИ (преподаватели + ученики) ----------
// Единый сбор данных за период для расчёта табелей.
export async function fetchTimesheetData(period) {
  // Уроки за период (только проведённые важны для табеля, но тянем все — отменённые отфильтруем)
  const lessons = await fetchAllPages(() => {
    let lq = supabase.from('lessons')
      .select('id, group_id, teacher_id, assistant_id, assistant2_id, curator_id, lesson_date, status, lessons_count, topic')
      .order('id')
    if (period?.from) lq = lq.gte('lesson_date', period.from)
    if (period?.to) lq = lq.lte('lesson_date', period.to)
    return lq
  })

  const lessonIds = lessons.map((l) => l.id)
  const attendance = await fetchByIdChunks(lessonIds, (chunk) => supabase
    .from('attendance').select('lesson_id, student_id, present, absence_reason')
    .in('lesson_id', chunk).order('lesson_id').order('student_id'))

  // Связки ученик-группа (чтобы знать состав групп)
  const links = await fetchAllPages(() => supabase.from('student_groups').select('student_id, group_id').order('student_id').order('group_id'))

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

// Зафиксировать контакт с родителем.
// meta: { risk_reason, status } — снимок на момент контакта, чтобы в
// ленте «Отработано» была видна причина, даже если позже пересчёт снял флаг.
export async function saveContact(studentId, note, meta) {
  const { error } = await supabase.from('students')
    .update({ last_contact_at: new Date().toISOString(), last_contact_note: note })
    .eq('id', studentId)
  if (error) throw error
  // событие в ленту
  await supabase.from('student_events').insert({
    student_id: studentId, event_type: 'contact',
    payload: { note, risk_reason: meta?.risk_reason || null, status: meta?.status || null },
  })
}

// История контактов по риску (для вкладки «Отработано») — последние 300
export async function fetchContactedStudents() {
  const { data: events, error } = await supabase.from('student_events')
    .select('id, student_id, payload, created_at')
    .eq('event_type', 'contact')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw error
  if (!events?.length) return []

  const ids = [...new Set(events.map((e) => e.student_id))]
  const { data: students, error: se } = await supabase.from('students')
    .select('id, full_name, office, lang, parent_name, parent_phone')
    .in('id', ids)
  if (se) throw se
  const byId = Object.fromEntries((students || []).map((s) => [s.id, s]))

  return events.map((e) => {
    const s = byId[e.student_id]
    if (!s) return null
    return {
      id: e.id,
      student_id: e.student_id,
      full_name: s.full_name,
      office: s.office,
      lang: s.lang,
      parent_name: s.parent_name,
      parent_phone: s.parent_phone,
      risk_reason: e.payload?.risk_reason || null,
      status_at_contact: e.payload?.status || null,
      note: e.payload?.note || '',
      contacted_at: e.created_at,
    }
  }).filter(Boolean)
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
  const lessons = await fetchAllPages(() => {
    let lq = supabase.from('lessons')
      .select('id, group_id, teacher_id, lesson_date, status, lessons_count, plan_path')
      .order('id')
    if (period?.from) lq = lq.gte('lesson_date', period.from)
    if (period?.to) lq = lq.lte('lesson_date', period.to)
    return lq
  })

  const ids = lessons.map((l) => l.id)
  const attendance = await fetchByIdChunks(ids, (chunk) => supabase
    .from('attendance').select('lesson_id, student_id, present, absence_reason')
    .in('lesson_id', chunk).order('lesson_id').order('student_id'))

  const [groups, students, links] = await Promise.all([
    fetchAllPages(() => supabase.from('groups').select('id, name, office, lang, subject_name, capacity').eq('archived', false).order('id')),
    fetchAllPages(() => supabase.from('students').select('id, full_name, status, office, lang').eq('archived', false).order('id')),
    fetchAllPages(() => supabase.from('student_groups').select('student_id, group_id').order('student_id').order('group_id')),
  ])

  return { lessons, attendance, groups, students, studentGroups: links }
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

// ---------- ЗАРПЛАТА ----------
// Расчёт за месяц ('YYYY-MM'). Если месяц закрыт — вернутся зафиксированные суммы.
export async function fetchPayroll(month) {
  const { data, error } = await supabase.rpc('get_payroll', { p_month: month })
  if (error) throw error
  return data || []
}

// Закрыть месяц (зафиксировать табель)
export async function closePayroll(month) {
  const { data, error } = await supabase.rpc('close_payroll', { p_month: month })
  if (error) throw error
  return data
}

// Открыть месяц обратно
export async function reopenPayroll(month) {
  const { error } = await supabase.rpc('reopen_payroll', { p_month: month })
  if (error) throw error
}

// Список закрытых периодов
export async function fetchPayrollPeriods() {
  const { data, error } = await supabase.rpc('get_payroll_periods')
  if (error) throw error
  return data || []
}

// Обновить ставку преподавателя (доступно admin и accountant — см. accountant_set_rate)
export async function updateTeacherRate(teacherId, rate) {
  const { error } = await supabase.rpc('accountant_set_rate', {
    p_kind: 'teachers', p_id: teacherId, p_rate: Number(rate) || 0,
  })
  if (error) throw error
}

// ---------- РАСПИСАНИЕ ----------
export async function fetchScheduleGrid() {
  const { data, error } = await supabase.rpc('get_schedule_grid')
  if (error) throw error
  return data || []
}

export async function addSchedule(row) {
  const { error } = await supabase.from('schedule').insert(row)
  if (error) throw error
}

export async function updateSchedule(id, patch) {
  const { error } = await supabase.from('schedule').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSchedule(id) {
  const { error } = await supabase.from('schedule').update({ archived: true }).eq('id', id)
  if (error) throw error
}

// Сгенерировать ожидаемые занятия за период
export async function generateLessons(from, to) {
  const { data, error } = await supabase.rpc('generate_lessons', { p_from: from, p_to: to })
  if (error) throw error
  return data
}

// Занятия преподавателя на дату
export async function fetchMyLessons(date) {
  const { data, error } = await supabase.rpc('get_my_lessons', { p_date: date })
  if (error) throw error
  return data || []
}

// Непроведённые занятия (контроль)
export async function fetchMissedLessons(days = 14) {
  const { data, error } = await supabase.rpc('get_missed_lessons', { p_days: days })
  if (error) throw error
  return data || []
}

// ---------- ПРОВЕРКА ПЛАНОВ УРОКОВ (для завуча) ----------
// Все ПРОВЕДЁННЫЕ занятия за период (с планом и без) — для разбора
// преподаватель/куратор → группа → занятия. У занятий с планом ещё и
// реальный размер файла из Storage (таблица lessons размер не хранит,
// только путь) — маленький/отсутствующий файл виден без открытия.
export async function fetchLessonPlansOverview(period) {
  const lessons = await fetchAllPages(() => {
    let lq = supabase.from('lessons')
      .select('id, group_id, teacher_id, curator_id, lesson_date, status, topic, plan_path')
      .eq('status', 'проведён')
      .order('lesson_date', { ascending: false }).order('id')
    if (period?.from) lq = lq.gte('lesson_date', period.from)
    if (period?.to) lq = lq.lte('lesson_date', period.to)
    return lq
  })
  if (!lessons.length) return []

  // Метаданные файлов бакета — только если хоть у кого-то есть план
  // (их может быть тысячи, читаем постранично)
  const files = {}
  let filesOk = true
  if (lessons.some((l) => l.plan_path)) {
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage.from('lesson-plans')
        .list('', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) { filesOk = false; break }
      ;(data || []).forEach((f) => { files[f.name] = f })
      if (!data || data.length < 1000) break
      offset += 1000
    }
  }

  return lessons.map((l) => {
    const f = l.plan_path ? files[l.plan_path] : null
    return {
      ...l,
      file_size: f?.metadata?.size ?? null,
      file_missing: !!l.plan_path && filesOk && !f,
      file_info_available: filesOk,
    }
  })
}

// Провести занятие: тема + посещаемость + статус (+ баллы за тест, если был)
export async function conductLesson(lessonId, { topic, comment, lessons_count, attendance, has_test, test_max_score }) {
  const { error: le } = await supabase.from('lessons').update({
    topic: topic || '',
    comment: comment || null,
    lessons_count: Number(lessons_count) || 2,
    status: 'проведён',
    conducted_at: new Date().toISOString(),
    has_test: !!has_test,
    test_max_score: has_test ? (Number(test_max_score) || null) : null,
  }).eq('id', lessonId)
  if (le) throw le

  await supabase.from('attendance').delete().eq('lesson_id', lessonId)
  if (attendance?.length) {
    const rows = attendance.map((a) => ({
      lesson_id: lessonId,
      student_id: a.student_id,
      status: a.status || 'present',
      present: a.status !== 'absent',           // совместимость со старой логикой
      absence_reason: a.status === 'absent' ? (a.absence_reason || null) : null,
      score: has_test && a.score !== '' && a.score != null ? Number(a.score) : null,
    }))
    const { error } = await supabase.from('attendance').insert(rows)
    if (error) throw error
  }
}

// Отменить занятие
export async function cancelLesson(lessonId, reason) {
  const { error } = await supabase.from('lessons')
    .update({ status: 'отменён', cancel_reason: reason || null })
    .eq('id', lessonId)
  if (error) throw error
}

// ---------- ДАШБОРД (серверный расчёт) ----------
// Все метрики считаются в Postgres. Фронт получает готовые числа —
// это критично при 1500 учениках, иначе браузер грузит десятки тысяч записей.
export async function fetchDashboard(from, to) {
  const p = { p_from: from || null, p_to: to || null }
  const [kpi, offices, subjects, weeks, worstTeachers, weakGroups, reasons] = await Promise.all([
    supabase.rpc('get_dashboard_kpi', p),
    supabase.rpc('get_dashboard_by_office', p),
    supabase.rpc('get_dashboard_by_subject', p),
    supabase.rpc('get_dashboard_weeks', { p_weeks: 12 }),
    supabase.rpc('get_dashboard_worst_teachers', { ...p, p_limit: 5 }),
    supabase.rpc('get_dashboard_weak_groups', { p_limit: 6 }),
    supabase.rpc('get_dashboard_reasons', p),
  ])
  const err = kpi.error || offices.error || subjects.error || weeks.error
    || worstTeachers.error || weakGroups.error || reasons.error
  if (err) throw err
  return {
    kpi: kpi.data?.[0] || null,
    offices: offices.data || [],
    subjects: subjects.data || [],
    weeks: weeks.data || [],
    worstTeachers: worstTeachers.data || [],
    weakGroups: weakGroups.data || [],
    reasons: reasons.data || [],
  }
}

// ---------- КУРАТОРЫ ----------
export async function fetchCurators() {
  const { data, error } = await supabase.from('curators')
    .select('*').eq('archived', false).order('full_name')
  if (error) throw error
  return data || []
}
export async function updateCuratorRate(id, rate) {
  const { error } = await supabase.rpc('accountant_set_rate', {
    p_kind: 'curators', p_id: id, p_rate: Number(rate) || 0,
  })
  if (error) throw error
}
export async function addCurator(full_name, subject, rate) {
  const { error } = await supabase.from('curators').insert({ full_name, subject, rate: Number(rate) || 0 })
  if (error) throw error
}
export async function archiveCurator(id) {
  const { error } = await supabase.from('curators').update({ archived: true }).eq('id', id)
  if (error) throw error
}

// Зарплата кураторов за месяц
export async function fetchCuratorPayroll(month) {
  const { data, error } = await supabase.rpc('get_curator_payroll', { p_month: month })
  if (error) throw error
  return data || []
}

// Дополнительные занятия кураторов
export async function fetchExtraLessons(from, to) {
  const { data, error } = await supabase.rpc('get_extra_lessons', {
    p_from: from || null, p_to: to || null,
  })
  if (error) throw error
  return data || []
}

// ---------- ОПЛАТЫ ----------
// Основной срез для вкладки «Ученики»: по каждому ученику — входной
// взнос, оплата за выбранный месяц, тариф, долг — всё посчитано в БД.
// Офис office-менеджера сервер подставляет сам (RPC), что бы ни пришло с фронта.
export async function fetchPaymentsOverview(office, month) {
  const { data, error } = await supabase.rpc('get_payments_overview', { p_office: office || null, p_month: month || null })
  if (error) throw error
  return data || []
}
// Сколько реально собрано по каждому месяцу (для вкладки «По месяцам»)
export async function fetchMonthlyPaymentTotals(office) {
  const { data, error } = await supabase.rpc('get_monthly_payment_totals', { p_office: office || null })
  if (error) throw error
  return data || []
}
export async function fetchStudentsPayments(office) {
  const { data, error } = await supabase.rpc('get_students_payments', { p_office: office || null })
  if (error) throw error
  return data || []
}
export async function fetchStudentPayments(studentId) {
  const { data, error } = await supabase.rpc('get_student_payments', { p_student_id: studentId })
  if (error) throw error
  return data || []
}
// type: 'entry_fee' | 'monthly'; period: 'YYYY-MM' или null (для entry_fee не нужен)
export async function addPayment(studentId, amount, paidAt, method, note, type = 'monthly', period = null) {
  const { error } = await supabase.rpc('add_payment', {
    p_student_id: studentId, p_amount: Number(amount) || 0,
    p_paid_at: paidAt || null, p_method: method || null, p_note: note || null,
    p_type: type, p_period: period || null,
  })
  if (error) throw error
}
export async function updatePayment(id, { amount, paidAt, method, note, type, period }) {
  const { error } = await supabase.rpc('update_payment', {
    p_id: id, p_amount: Number(amount) || 0, p_paid_at: paidAt || null,
    p_method: method || null, p_note: note || null, p_type: type, p_period: period || null,
  })
  if (error) throw error
}
export async function deletePayment(id) {
  const { error } = await supabase.rpc('delete_payment', { p_id: id })
  if (error) throw error
}

// Группы (с тарифом) + связи ученик-группа — для фильтра/аналитики по группам во вкладке «Оплаты»
export async function fetchPaymentsGroupsData() {
  const [groups, links] = await Promise.all([
    fetchAllPages(() => supabase.from('groups').select('id, name, office, monthly_fee').eq('archived', false).order('name')),
    fetchAllPages(() => supabase.from('student_groups').select('student_id, group_id').order('student_id').order('group_id')),
  ])
  return { groups, links }
}

// Тариф группы (₸/месяц) — редактирует тот, кто уже может редактировать группу
export async function setGroupMonthlyFee(groupId, fee) {
  const { error } = await supabase.from('groups').update({ monthly_fee: fee === '' || fee == null ? null : Number(fee) }).eq('id', groupId)
  if (error) throw error
}
// Индивидуальные финансовые настройки ученика: свой тариф, входной взнос
export async function updateStudentPaymentSettings(studentId, { custom_monthly_fee, entry_fee_required, entry_fee_amount }) {
  const { error } = await supabase.from('students').update({
    custom_monthly_fee: custom_monthly_fee === '' || custom_monthly_fee == null ? null : Number(custom_monthly_fee),
    entry_fee_required: !!entry_fee_required,
    entry_fee_amount: entry_fee_amount === '' || entry_fee_amount == null ? null : Number(entry_fee_amount),
  }).eq('id', studentId)
  if (error) throw error
}

// ---------- ГРУППЫ (создание/редактирование) ----------
export async function fetchAllGroups() {
  return fetchAllPages(() => supabase.from('groups').select('*').eq('archived', false).order('name').order('id'))
}
// Связи ученик-группа целиком (для полного ростера группы в Сводке —
// не только тех, у кого есть отметки посещаемости за период)
export async function fetchStudentGroupLinks() {
  return fetchAllPages(() => supabase.from('student_groups').select('student_id, group_id').order('student_id').order('group_id'))
}
export async function createGroup(fields) {
  const { error } = await supabase.from('groups').insert(fields)
  if (error) throw error
}
export async function updateGroup(id, fields) {
  const { error } = await supabase.from('groups').update(fields).eq('id', id)
  if (error) throw error
}

// ---------- ЗАРПЛАТА АССИСТЕНТОВ ----------
export async function fetchAssistantPayroll(from, to) {
  const { data, error } = await supabase.rpc('get_assistant_payroll', { p_from: from || null, p_to: to || null })
  if (error) throw error
  return data || []
}

export async function updateAssistantRate(id, rate) {
  const { error } = await supabase.rpc('accountant_set_rate', {
    p_kind: 'assistants', p_id: id, p_rate: Number(rate) || 0,
  })
  if (error) throw error
}

// ---------- АДМИН-ФУНКЦИИ ЗАВУЧА ----------
export async function getAccountInfo(profileId) {
  const { data, error } = await supabase.rpc('get_account_info', { p_profile_id: profileId })
  if (error) throw error
  return data?.[0] || null
}
export async function adminSetPassword(profileId, password) {
  const { error } = await supabase.rpc('admin_set_password', { p_profile_id: profileId, p_password: password })
  if (error) throw error
}
export async function adminSetRole(profileId, role, office) {
  const { error } = await supabase.rpc('admin_set_role', { p_profile_id: profileId, p_role: role, p_office: office || null })
  if (error) throw error
}
export async function adminSoftDelete(kind, id) {
  const { error } = await supabase.rpc('admin_soft_delete', { p_kind: kind, p_id: id })
  if (error) throw error
}
export async function adminUpdateProfileName(profileId, fullName) {
  const { error } = await supabase.rpc('admin_update_profile_name', { p_profile_id: profileId, p_full_name: fullName })
  if (error) throw error
}

// Профили без отдельной карточки (office_manager/senior_office_manager/accountant) —
// список читается напрямую: RLS уже разрешает admin читать все profiles.
export async function fetchProfilesByRole(roles) {
  const { data, error } = await supabase.from('profiles').select('*').in('role', roles).order('full_name')
  if (error) throw error
  return data || []
}

// Создание учётки (преподаватель/куратор/ассистент/любая роль) — через
// Edge Function invite-teacher (не RPC: правильное создание пользователя
// Supabase Auth требует Admin API, а не голого INSERT в auth.users).
export async function adminCreateAccount(kind, cardId, login, password, role, fullName, office) {
  const { data, error } = await supabase.functions.invoke('invite-teacher', {
    body: { login, password, role, kind, card_id: cardId, full_name: fullName, office },
  })
  if (error) {
    let msg = error.message
    try { const ctx = await error.context?.json(); if (ctx?.error) msg = ctx.error } catch {}
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// ---------- ЗАНЯТИЯ КУРАТОРА ----------
export async function getMyCuratorId() {
  const { data, error } = await supabase.rpc('my_curator_id')
  if (error) throw error
  return data || null
}
export async function createCuratorLesson(curatorId, date, lessonsCount, topic, studentIds) {
  const { data, error } = await supabase.rpc('create_curator_lesson', {
    p_curator_id: curatorId, p_date: date || null, p_lessons_count: Number(lessonsCount) || 1,
    p_topic: topic || '', p_student_ids: studentIds || [],
  })
  if (error) throw error
  return data
}
export async function getCuratorLessons(curatorId, from, to) {
  const { data, error } = await supabase.rpc('get_curator_lessons', {
    p_curator_id: curatorId, p_from: from || null, p_to: to || null,
  })
  if (error) throw error
  return data || []
}
export async function deleteCuratorLesson(id) {
  const { error } = await supabase.rpc('delete_curator_lesson', { p_lesson_id: id })
  if (error) throw error
}

// ---------- БАЗА УЧЕНИКОВ / ЕНТ ----------
// Единый набор данных для всего модуля ЕНТ: ученики (с профилем),
// их группы и все попытки — читаем один раз, дальше вкладки/аналитика/
// экспорт считаются на фронте из этого набора (95 учеников и даже
// 500-1000 с историей попыток — это тысячи строк, не миллионы,
// клиенту это по силам; агрегаций-RPC не заводим, чтобы не плодить
// сущности сверх необходимого).
export async function fetchEntDataset() {
  const [students, links, groups, attempts] = await Promise.all([
    fetchAllPages(() => supabase.from('students')
      .select('id, full_name, office, lang, school, grade, profile_subject_1_id, profile_subject_2_id')
      .eq('archived', false).order('full_name').order('id')),
    fetchAllPages(() => supabase.from('student_groups').select('student_id, group_id').order('student_id').order('group_id')),
    fetchAllPages(() => supabase.from('groups').select('id, name, office').eq('archived', false).order('name')),
    fetchAllPages(() => supabase.from('ent_attempts').select('*').order('student_id').order('attempt_date').order('created_at')),
  ])
  return { students, links, groups, attempts }
}

// Уникальные школы, которые уже есть в базе — для подсказки при вводе
// (чтобы не плодить «Школа №10» / «10 школа» / «СОШ 10»)
export async function fetchKnownSchools() {
  const rows = await fetchAllPages(() => supabase.from('students')
    .select('school').eq('archived', false).order('school'))
  return [...new Set(rows.map((r) => (r.school || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
}

// Школа + профильные предметы ученика (редактирует только завуч — RLS)
export async function updateStudentEntProfile(studentId, { school, profile_subject_1_id, profile_subject_2_id }) {
  const { error } = await supabase.from('students').update({
    school: school?.trim() || null,
    profile_subject_1_id: profile_subject_1_id || null,
    profile_subject_2_id: profile_subject_2_id || null,
  }).eq('id', studentId)
  if (error) throw error
}

// Попытки пробного ЕНТ одного ученика, от старой к новой
export async function fetchEntAttempts(studentId) {
  const { data, error } = await supabase.from('ent_attempts')
    .select('*').eq('student_id', studentId).order('attempt_date').order('created_at')
  if (error) throw error
  return data || []
}

export async function addEntAttempt(studentId, fields) {
  const { error } = await supabase.from('ent_attempts').insert({ student_id: studentId, ...entAttemptRow(fields) })
  if (error) throw error
}

export async function updateEntAttempt(id, fields) {
  const { error } = await supabase.from('ent_attempts')
    .update({ ...entAttemptRow(fields), updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteEntAttempt(id) {
  const { error } = await supabase.from('ent_attempts').delete().eq('id', id)
  if (error) throw error
}

// Массовый ввод результатов по группе — одной попытки сразу на всех
// заполненных учеников (одна вставка вместо N запросов).
export async function addEntAttemptsBulk(rows) {
  const payload = rows.map((r) => ({ student_id: r.studentId, ...entAttemptRow(r) }))
  const { error } = await supabase.from('ent_attempts').insert(payload)
  if (error) throw error
}

// Общие поля попытки — total_score НЕ передаём, он считается в БД (generated column)
function entAttemptRow(f) {
  return {
    attempt_date: f.attempt_date,
    history_kz_score: Number(f.history_kz_score) || 0,
    reading_score: Number(f.reading_score) || 0,
    math_literacy_score: Number(f.math_literacy_score) || 0,
    subject1_id: f.subject1_id || null,
    subject1_name: f.subject1_name,
    subject1_score: Number(f.subject1_score) || 0,
    subject2_id: f.subject2_id || null,
    subject2_name: f.subject2_name,
    subject2_score: Number(f.subject2_score) || 0,
    comment: f.comment?.trim() || null,
  }
}
