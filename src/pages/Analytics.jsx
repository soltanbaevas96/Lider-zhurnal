import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Layers, GraduationCap, BookOpen, Users, Download, AlertTriangle, Search,
  ArrowLeft, ChevronRight, RotateCw, TrendingUp, TrendingDown, Trash2, Calendar,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchGroupsAnalytics, fetchTeachersAnalytics, fetchSubjectsAnalytics, fetchDashboard,
  fetchAttendanceReport, fetchStudentGroupLinks, fetchLessons,
  getCuratorLessons, deleteCuratorLesson,
} from '../lib/api'
import {
  C, periodRange, periodLabelOf, shiftRange, currentMonth, lessonCount, nameOf, initials, fmtDate, OFFICES,
} from '../lib/utils'
import { STATUS_META, teacherStatus, groupStatus, studentAttStatus, statusRank } from '../lib/perfStatus'
import PeriodPicker from '../components/PeriodPicker'
import LessonTable from '../components/LessonTable'
import LessonForm from '../components/LessonForm'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown
  return <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{m.label}</span>
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>{children}</div>
}
function Empty({ text }) {
  return <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate, fontSize: 13.5 }}>{text}</div>
}
function ErrorBlock({ text, onRetry }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 14 }}>
      <AlertTriangle size={26} color="#c2360b" style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#c2360b', marginBottom: 4 }}>Не удалось загрузить данные</div>
      {text && <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 14 }}>{text}</div>}
      <button onClick={onRetry} className="rowflex" style={{ gap: 6, margin: '0 auto', padding: '8px 16px', background: '#c2360b', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        <RotateCw size={14} /> Повторить
      </button>
    </div>
  )
}
function DeltaTag({ cur, prev, unit, invert }) {
  if (prev == null || cur == null) return null
  const d = Math.round((cur - prev) * 10) / 10
  if (d === 0) return <span style={{ fontSize: 11.5, color: C.faint }}>без изменений</span>
  const good = invert ? d < 0 : d > 0
  const Icon = d > 0 ? TrendingUp : TrendingDown
  return (
    <span className="rowflex" style={{ gap: 3, fontSize: 11.5, fontWeight: 700, color: good ? '#0f9d58' : '#dc2626' }}>
      <Icon size={11} /> {d > 0 ? '+' : ''}{d}{unit || ''}
    </span>
  )
}
function addSheet(wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ ' ': 'нет данных' }])
  if (rows.length) {
    const headers = Object.keys(rows[0])
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)) + 2 }))
    ws['!autofilter'] = { ref: ws['!ref'] }
  }
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}
function assistantNames(l, dict) {
  const names = [l.assistant_id, l.assistant2_id].filter(Boolean).map((id) => nameOf(dict.assistants, id))
  return names.length ? names.join(', ') : '—'
}

const MODES = [
  { k: 'overview', t: 'Обзор', icon: TrendingUp },
  { k: 'groups', t: 'Группы', icon: Layers },
  { k: 'personnel', t: 'Персонал', icon: GraduationCap },
  { k: 'subjects', t: 'Предметы', icon: BookOpen },
  { k: 'students', t: 'Ученики', icon: Users },
]

// initialFilter: необязательный объект от Дашборда для перехода «в один клик»
// с уже применённым фильтром — { mode, office, subject, openGroupId, openTeacherId }.
// onFilterConsumed вызывается один раз сразу после применения, чтобы повторный
// рендер/возврат назад не переоткрывал тот же фильтр снова (п.44 ТЗ).
export default function Analytics({ dict, onOpenStudent, initialFilter, onFilterConsumed }) {
  // Ленивые инициализаторы — чтобы при переходе с Дашборда нужный режим/
  // фильтр/профиль открывались сразу при первом рендере, без «мигания»
  // Обзора на один тик (компонент создаётся заново при каждом переходе
  // на вкладку «Аналитика» — App.jsx его размонтирует, когда уходишь).
  const [mode, setMode] = useState(() => initialFilter?.mode || 'overview')
  const [personnelTab, setPersonnelTab] = useState('teachers')
  const [period, setPeriod] = useState(() => ({ mode: 'month', month: currentMonth() }))
  const [office, setOffice] = useState(() => initialFilter?.office || '')
  const [lang, setLang] = useState('')
  const [subjectFilter, setSubjectFilter] = useState(() => initialFilter?.subject || '')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [q, setQ] = useState('')

  const [openGroupId, setOpenGroupId] = useState(() => initialFilter?.openGroupId || null)
  const [openTeacherName, setOpenTeacherName] = useState(() => initialFilter?.openTeacherName || null)
  const [openCuratorId, setOpenCuratorId] = useState(null)

  const [groupsRows, setGroupsRows] = useState(null)
  const [teachersRows, setTeachersRows] = useState(null)
  const [subjectsRows, setSubjectsRows] = useState(null)
  const [dashKpi, setDashKpi] = useState(null)
  const [dashKpiPrev, setDashKpiPrev] = useState(null)
  const [attendance, setAttendance] = useState(null) // { rows, lessonsById }
  const [groupLinks, setGroupLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [personnelLessons, setPersonnelLessons] = useState(null) // сырые занятия — для Персонала/профиля преподавателя
  const [personnelLoading, setPersonnelLoading] = useState(false)
  const [personnelErr, setPersonnelErr] = useState('')

  const range = useMemo(() => periodRange(period), [period])
  const prevRange = useMemo(() => shiftRange(range), [range])
  const label = periodLabelOf(period)

  // ---------- применение перехода с Дашборда ----------
  useEffect(() => {
    if (!initialFilter) return
    if (initialFilter.mode) setMode(initialFilter.mode)
    if (initialFilter.office) setOffice(initialFilter.office)
    if (initialFilter.subject) setSubjectFilter(initialFilter.subject)
    if (initialFilter.openGroupId) { setMode('groups'); setOpenGroupId(initialFilter.openGroupId) }
    if (initialFilter.openTeacherName) { setMode('personnel'); setPersonnelTab('teachers'); setOpenTeacherName(initialFilter.openTeacherName) }
    onFilterConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter])

  // ---------- основная загрузка: пересчитывается только при смене периода ----------
  const reqId = useRef(0)
  function load() {
    const id = ++reqId.current
    setLoading(true); setErr('')
    Promise.all([
      fetchGroupsAnalytics(range?.from, range?.to),
      fetchTeachersAnalytics(range?.from, range?.to),
      fetchSubjectsAnalytics(range?.from, range?.to),
      fetchDashboard(range?.from, range?.to),
      prevRange ? fetchDashboard(prevRange.from, prevRange.to).catch(() => null) : Promise.resolve(null),
      fetchAttendanceReport(range),
    ]).then(([g, t, s, kpi, kpiPrev, att]) => {
      if (id !== reqId.current) return
      setGroupsRows(g); setTeachersRows(t); setSubjectsRows(s)
      setDashKpi(kpi?.kpi || null); setDashKpiPrev(kpiPrev?.kpi || null)
      setAttendance(att)
    }).catch((e) => {
      if (id !== reqId.current) return
      setErr(e.message || 'Не удалось загрузить данные')
    }).finally(() => { if (id === reqId.current) setLoading(false) })
  }
  useEffect(() => { load() }, [range?.from, range?.to])
  useEffect(() => { fetchStudentGroupLinks().then(setGroupLinks).catch(() => setGroupLinks([])) }, [])

  // ---------- ленивая загрузка сырых занятий (нужны только для Персонала и профиля преподавателя) ----------
  const personnelReqId = useRef(0)
  function loadPersonnelLessons() {
    const id = ++personnelReqId.current
    setPersonnelLoading(true); setPersonnelErr('')
    fetchLessons(range).then((data) => {
      if (id !== personnelReqId.current) return
      setPersonnelLessons(data)
    }).catch((e) => {
      if (id !== personnelReqId.current) return
      setPersonnelErr(e.message || 'Не удалось загрузить данные')
    }).finally(() => { if (id === personnelReqId.current) setPersonnelLoading(false) })
  }
  useEffect(() => {
    setPersonnelLessons(null) // период сменился — старые занятия больше не актуальны
    if (mode === 'personnel' || openTeacherName) loadPersonnelLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from, range?.to])
  useEffect(() => {
    if ((mode === 'personnel' || openTeacherName) && personnelLessons === null && !personnelLoading) loadPersonnelLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, openTeacherName])

  // ---------- каскадные фильтры (п.27 ТЗ) — через сопоставление по имени,
  // т.к. группы/предметы/преподаватели приходят из трёх разных RPC и общих
  // id между ними на фронте нет; office/lang у групп — точные поля ----------
  const officeLangGroups = useMemo(() => (groupsRows || []).filter((g) =>
    (!office || g.office === office) && (!lang || g.lang === lang)), [groupsRows, office, lang])

  const teacherNamesInScope = useMemo(() => new Set(officeLangGroups.map((g) => g.teacher_name).filter(Boolean)), [officeLangGroups])
  const subjectNamesInScope = useMemo(() => new Set(officeLangGroups.map((g) => (g.subject_name || '').split(' / ')[0]).filter(Boolean)), [officeLangGroups])

  const scopedGroups = useMemo(() => officeLangGroups.filter((g) =>
    (!subjectFilter || (g.subject_name || '').split(' / ')[0] === subjectFilter) &&
    (!teacherFilter || g.teacher_name === teacherFilter)
  ), [officeLangGroups, subjectFilter, teacherFilter])

  const scopedTeachers = useMemo(() => (teachersRows || []).filter((t) =>
    (!office && !lang ? true : teacherNamesInScope.has(t.teacher_name)) &&
    (!teacherFilter || t.teacher_name === teacherFilter)
  ), [teachersRows, office, lang, teacherNamesInScope, teacherFilter])

  const scopedSubjects = useMemo(() => (subjectsRows || []).filter((s) => {
    const name = (s.subject_name || '').split(' / ')[0]
    return (!office && !lang ? true : subjectNamesInScope.has(name)) && (!subjectFilter || name === subjectFilter)
  }), [subjectsRows, office, lang, subjectNamesInScope, subjectFilter])

  const groupOptions = useMemo(() => (groupsRows || [])
    .filter((g) => (!office || g.office === office))
    .map((g) => ({ id: g.group_id, name: g.group_name })), [groupsRows, office])

  // ---------- Ученики: собираем построчно из посещаемости + справочников ----------
  const groupsById = useMemo(() => Object.fromEntries((dict?.groups || []).map((g) => [g.id, g])), [dict])
  const groupLinksByGroup = useMemo(() => {
    const m = {}
    groupLinks.forEach((l) => { (m[l.group_id] ||= []).push(l.student_id) })
    return m
  }, [groupLinks])
  const studentsById = useMemo(() => Object.fromEntries((dict?.students || []).map((s) => [s.id, s])), [dict])

  const studentRows = useMemo(() => {
    if (!attendance) return []
    const m = {}
    attendance.rows.forEach((r) => {
      const lesson = attendance.lessonsById[r.lesson_id]
      const s = (m[r.student_id] ||= { total: 0, present: 0, groupIds: new Set(), teacherIds: new Set() })
      s.total++; if (r.present) s.present++
      if (lesson?.group_id) s.groupIds.add(lesson.group_id)
      if (lesson?.teacher_id) s.teacherIds.add(lesson.teacher_id)
    })
    return Object.entries(m).map(([sid, v]) => {
      const student = studentsById[sid]
      const pct = v.total ? Math.round((v.present / v.total) * 100) : null
      const groupNames = [...v.groupIds].map((gid) => groupsById[gid]?.name).filter(Boolean)
      const teacherNames = [...v.teacherIds].map((tid) => nameOf(dict?.teachers || [], tid)).filter(Boolean)
      // Предмет группы хранится прямо как groups.subject_name (текст,
      // не FK) — отдельного справочника subject_id у групп нет.
      const subjNames = [...v.groupIds].map((gid) => (groupsById[gid]?.subject_name || '').split(' / ')[0]).filter(Boolean)
      return {
        id: sid, full_name: student?.full_name || '—', office: student?.office || null, lang: student?.lang || null,
        groupIds: [...v.groupIds], groupNames, teacherNames, subjNames,
        pct, total: v.total, absent: v.total - v.present, status: studentAttStatus(pct),
      }
    })
  }, [attendance, studentsById, groupsById, dict])

  const scopedStudents = useMemo(() => studentRows.filter((s) => {
    if (office && s.office !== office) return false
    if (lang && s.lang !== lang) return false
    if (groupFilter && !s.groupIds.includes(groupFilter)) return false
    if (subjectFilter && !s.subjNames.includes(subjectFilter)) return false
    if (teacherFilter && !s.teacherNames.includes(teacherFilter)) return false
    const s2 = q.trim().toLowerCase()
    return !s2 || s.full_name.toLowerCase().includes(s2)
  }), [studentRows, office, lang, groupFilter, subjectFilter, teacherFilter, q])

  // ---------- Персонал: кураторы/ассистенты — из сырых занятий (как раньше в Сводке) ----------
  const curatorStats = useMemo(() => {
    if (!personnelLessons) return []
    return (dict?.curators || []).map((c) => {
      const done = personnelLessons.filter((l) => l.curator_id === c.id && l.status === 'проведён')
      return { ...c, sessions: done.length, units: done.reduce((s, l) => s + lessonCount(l), 0),
        lastDate: done.reduce((m, l) => (!m || l.lesson_date > m) ? l.lesson_date : m, null) }
    }).sort((a, b) => b.units - a.units)
  }, [personnelLessons, dict])

  const assistantStats = useMemo(() => {
    if (!personnelLessons) return []
    return (dict?.assistants || []).map((a) => {
      const done = personnelLessons.filter((l) => (l.assistant_id === a.id || l.assistant2_id === a.id) && l.status === 'проведён')
      const withT = {}
      done.forEach((l) => {
        withT[l.teacher_id] = withT[l.teacher_id] || { count: 0, units: 0 }
        withT[l.teacher_id].count++; withT[l.teacher_id].units += lessonCount(l)
      })
      return {
        ...a, sessions: done.length, units: done.reduce((s, l) => s + lessonCount(l), 0),
        teachers: Object.entries(withT).map(([tid, v]) => ({ name: nameOf(dict?.teachers || [], tid), ...v })).sort((x, y) => y.units - x.units),
      }
    }).sort((a, b) => b.units - a.units)
  }, [personnelLessons, dict])

  // ---------- статусы для таблиц ----------
  const groupsWithStatus = useMemo(() => scopedGroups.map((g) => ({ ...g, status: groupStatus(g.lessons_done ? g.attendance_pct : null) })), [scopedGroups])
  // planPct — доля проведённых занятий, к которым прикреплён план (не путать
  // с "выполнением расписания" — тут именно план урока, как и раньше в Сводке).
  const teachersWithStatus = useMemo(() => scopedTeachers.map((t) => {
    const planPct = t.lessons_done ? Math.round(((t.lessons_done - (t.no_plan || 0)) / t.lessons_done) * 100) : null
    return { ...t, status: teacherStatus(planPct, t.lessons_done ? t.attendance_pct : null) }
  }), [scopedTeachers])

  // Экспорт принимает уже отфильтрованный (в т.ч. поиском) массив от
  // конкретного режима — «что видно на экране, то и в Excel» (п.42 ТЗ).
  function exportGroups(rows = groupsWithStatus) {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Группы', rows.map((g) => ({
      Группа: g.group_name, Офис: g.office, Язык: g.lang, Предмет: (g.subject_name || '').split(' / ')[0],
      Преподаватель: g.teacher_name, Учеников: g.students_count, Ёмкость: g.capacity, 'Заполняемость %': g.fill_pct,
      Занятий: g.lessons_done, Отменено: g.lessons_cancelled, 'Посещаемость %': g.attendance_pct, 'В риске': g.risk_students,
      Статус: STATUS_META[g.status].label,
    })))
    XLSX.writeFile(wb, `Аналитика_группы_${label.replace(/\s/g, '_')}.xlsx`)
  }
  function exportTeachers(rows = teachersWithStatus) {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Преподаватели', rows.map((t) => ({
      Преподаватель: t.teacher_name, Групп: t.groups_count, Учеников: t.students_count, Занятий: t.lessons_done,
      Уроков: t.lesson_units, Отменено: t.lessons_cancelled, 'Без плана': t.no_plan, 'Посещаемость %': t.attendance_pct,
      'В риске': t.risk_students, Статус: STATUS_META[t.status].label,
    })))
    XLSX.writeFile(wb, `Аналитика_преподаватели_${label.replace(/\s/g, '_')}.xlsx`)
  }
  function exportSubjects() {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Предметы', scopedSubjects.map((s) => ({
      Предмет: (s.subject_name || '').split(' / ')[0], Групп: s.groups_count, Учеников: s.students_count,
      Преподавателей: s.teachers_count, Занятий: s.lessons_done, 'Посещаемость %': s.attendance_pct,
    })))
    XLSX.writeFile(wb, `Аналитика_предметы_${label.replace(/\s/g, '_')}.xlsx`)
  }
  function exportStudents(rows = scopedStudents) {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Ученики', rows.map((s) => ({
      Ученик: s.full_name, Офис: s.office || '', Язык: s.lang || '', Группы: s.groupNames.join(', '),
      Преподаватель: s.teacherNames.join(', '), 'Посещаемость %': s.pct ?? '', Пропусков: s.absent, Отметок: s.total,
      Статус: STATUS_META[s.status].label,
    })))
    XLSX.writeFile(wb, `Аналитика_ученики_${label.replace(/\s/g, '_')}.xlsx`)
  }

  // ---------- открытые детальные экраны ----------
  if (openGroupId) {
    const g = groupsWithStatus.find((x) => x.group_id === openGroupId) || (groupsRows || []).find((x) => x.group_id === openGroupId)
    return <GroupDetail g={g} attendance={attendance} groupLinksByGroup={groupLinksByGroup} studentsById={studentsById}
      onBack={() => setOpenGroupId(null)} onOpenStudent={onOpenStudent} />
  }
  if (openTeacherName) {
    const t = teachersWithStatus.find((x) => x.teacher_name === openTeacherName) || (teachersRows || []).find((x) => x.teacher_name === openTeacherName)
    return <TeacherProfile t={t} dict={dict} lessons={personnelLessons} loading={personnelLoading} err={personnelErr}
      onRetry={loadPersonnelLessons} onLessonSaved={loadPersonnelLessons} attendance={attendance} periodLabel={label}
      onBack={() => setOpenTeacherName(null)} />
  }
  if (openCuratorId) {
    const c = curatorStats.find((x) => x.id === openCuratorId)
    return <CuratorProfile c={c} period={period} periodLabel={label} onBack={() => setOpenCuratorId(null)} />
  }

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Аналитика</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>{label} · где именно проседает центр и почему</p>
        </div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
      </div>

      <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3, marginBottom: 16, flexWrap: 'wrap', gap: 2 }}>
        {MODES.map((o) => {
          const on = mode === o.k
          const Icon = o.icon
          return (
            <button key={o.k} onClick={() => setMode(o.k)} className="rowflex"
              style={{ gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: on ? C.card : 'transparent', color: on ? C.brand : C.slate, boxShadow: on ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>
              <Icon size={14} /> {o.t}
            </button>
          )
        })}
      </div>

      {/* Единый блок фильтров (п.26 ТЗ) */}
      <div className="fbar" style={{ marginBottom: 14 }}>
        <button className={`fchip ${!office ? 'on' : ''}`} onClick={() => setOffice('')}>Все офисы</button>
        {OFFICES.map((o) => <button key={o} className={`fchip ${office === o ? 'on' : ''}`} onClick={() => setOffice(o)}>{o}</button>)}
        <span style={{ width: 10 }} />
        <button className={`fchip ${!lang ? 'on' : ''}`} onClick={() => setLang('')}>Все языки</button>
        <button className={`fchip ${lang === 'каз' ? 'on' : ''}`} onClick={() => setLang('каз')}>Каз</button>
        <button className={`fchip ${lang === 'рус' ? 'on' : ''}`} onClick={() => setLang('рус')}>Рус</button>
        {(office || lang || subjectFilter || teacherFilter || groupFilter) && (
          <button className="fchip" onClick={() => { setOffice(''); setLang(''); setSubjectFilter(''); setTeacherFilter(''); setGroupFilter('') }}
            style={{ marginLeft: 'auto', color: '#dc2626', fontWeight: 700 }}>Сбросить фильтры</button>
        )}
      </div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={selSty}>
          <option value="">Все предметы</option>
          {[...subjectNamesInScope].sort().map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} style={selSty}>
          <option value="">Все преподаватели</option>
          {[...teacherNamesInScope].sort().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {mode === 'students' && (
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={selSty}>
            <option value="">Все группы</option>
            {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : err ? (
        <ErrorBlock text={err} onRetry={load} />
      ) : mode === 'overview' ? (
        <OverviewMode kpi={dashKpi} kpiPrev={dashKpiPrev} groups={groupsWithStatus} teachers={teachersWithStatus}
          onGoMode={setMode} />
      ) : mode === 'groups' ? (
        <GroupsMode rows={groupsWithStatus} q={q} setQ={setQ} onOpen={setOpenGroupId} onExport={exportGroups} />
      ) : mode === 'personnel' ? (
        <PersonnelMode personnelTab={personnelTab} setPersonnelTab={setPersonnelTab}
          teachers={teachersWithStatus} q={q} setQ={setQ} onOpenTeacher={setOpenTeacherName} onExportTeachers={exportTeachers}
          curators={curatorStats} assistants={assistantStats} loading={personnelLoading} err={personnelErr} onRetry={loadPersonnelLessons}
          onOpenCurator={setOpenCuratorId} />
      ) : mode === 'subjects' ? (
        <SubjectsMode rows={scopedSubjects} onExport={exportSubjects} />
      ) : (
        <StudentsMode rows={scopedStudents} q={q} setQ={setQ} onOpenStudent={onOpenStudent} onExport={exportStudents} />
      )}
    </div>
  )
}

const selSty = { padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5, outline: 'none', background: '#fff' }

function SearchBox({ q, setQ, placeholder }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
      <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
    </div>
  )
}

// ================= ОБЗОР =================
function OverviewMode({ kpi, kpiPrev, groups, teachers, onGoMode }) {
  if (!kpi) return <Empty text="Нет данных за период." />
  const rows = [
    { label: 'Посещаемость', cur: kpi.attendance_pct, prev: kpiPrev?.attendance_pct, unit: ' п.п.' },
    { label: 'Проведено занятий', cur: kpi.lessons_done, prev: kpiPrev?.lessons_done },
    { label: 'Проведено уроков', cur: kpi.lesson_units, prev: kpiPrev?.lesson_units },
    { label: 'Активных учеников', cur: kpi.students_active, prev: kpiPrev?.students_active },
    { label: 'Фонд оплаты, ₸', cur: kpi.payroll_sum, prev: kpiPrev?.payroll_sum, fmt: money },
    { label: 'Учеников в зоне риска', cur: kpi.students_risk, prev: kpiPrev?.students_risk, invert: true },
    { label: 'Занятий без плана', cur: kpi.no_plan, prev: kpiPrev?.no_plan, invert: true },
    { label: 'Отменено занятий', cur: kpi.lessons_cancel, prev: kpiPrev?.lessons_cancel, invert: true },
    { label: 'Заполняемость групп, %', cur: kpi.fill_pct, prev: kpiPrev?.fill_pct },
  ]
  const problemGroups = groups.filter((g) => g.status === 'problem' || g.status === 'attention').length
  const problemTeachers = teachers.filter((t) => t.status === 'problem' || t.status === 'attention').length
  return (
    <div>
      <SectionLabel>Показатели центра — сейчас vs прошлый период</SectionLabel>
      <div className="dt-wrap" style={{ marginBottom: 20 }}><div className="dt-scroll"><table className="dt">
        <thead><tr><th>Показатель</th><th style={{ width: 130, textAlign: 'right' }}>Значение</th><th style={{ width: 150, textAlign: 'right' }}>Пред. период</th><th style={{ width: 150, textAlign: 'right' }}>Изменение</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num" style={{ fontWeight: 800 }}>{r.fmt ? r.fmt(r.cur) : r.cur ?? '—'}</td>
              <td className="num" style={{ color: C.faint }}>{r.prev != null ? (r.fmt ? r.fmt(r.prev) : r.prev) : '—'}</td>
              <td className="num"><DeltaTag cur={r.cur} prev={r.prev} unit={r.unit} invert={r.invert} /></td>
            </tr>
          ))}
        </tbody>
      </table></div></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div onClick={() => onGoMode('groups')} style={{ cursor: 'pointer', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          <div className="rowflex"><Layers size={16} color={C.brand} /><span style={{ marginLeft: 8, fontSize: 13.5, fontWeight: 700 }}>Группы, требующие внимания</span><ChevronRight size={15} color={C.faint} style={{ marginLeft: 'auto' }} /></div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: problemGroups ? '#dc2626' : '#0f9d58' }}>{problemGroups}</div>
        </div>
        <div onClick={() => onGoMode('personnel')} style={{ cursor: 'pointer', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          <div className="rowflex"><GraduationCap size={16} color={C.brand} /><span style={{ marginLeft: 8, fontSize: 13.5, fontWeight: 700 }}>Преподаватели, требующие внимания</span><ChevronRight size={15} color={C.faint} style={{ marginLeft: 'auto' }} /></div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: problemTeachers ? '#dc2626' : '#0f9d58' }}>{problemTeachers}</div>
        </div>
      </div>
    </div>
  )
}

// ================= ГРУППЫ =================
function GroupsMode({ rows, q, setQ, onOpen, onExport }) {
  const filtered = rows.filter((g) => !q.trim() || g.group_name.toLowerCase().includes(q.toLowerCase().trim()))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.attendance_pct ?? 100) - (b.attendance_pct ?? 100))
  return (
    <div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchBox q={q} setQ={setQ} placeholder="Поиск группы…" />
        {rows.length > 0 && (
          <button onClick={() => onExport(filtered)} className="rowflex" style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>
      {filtered.length === 0 ? <Empty text="Группы не найдены." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr>
            <th>Группа</th><th style={{ width: 100 }}>Офис</th><th style={{ width: 70 }}>Язык</th><th>Предмет</th><th>Преподаватель</th>
            <th style={{ width: 90 }}>Учеников</th><th style={{ width: 80 }}>Заполн.</th><th style={{ width: 80 }}>Занятий</th>
            <th style={{ width: 90 }}>Посещ.</th><th style={{ width: 60 }}>Риск</th><th style={{ width: 110 }}>Статус</th>
          </tr></thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.group_id} onClick={() => onOpen(g.group_id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{g.group_name}</td>
                <td>{g.office}</td>
                <td>{g.lang}</td>
                <td style={{ color: C.slate }}>{(g.subject_name || '—').split(' / ')[0]}</td>
                <td style={{ color: C.slate }}>{g.teacher_name}</td>
                <td className="num">{g.students_count}<span style={{ color: C.faint }}>/{g.capacity}</span></td>
                <td className="num" style={{ color: g.fill_pct < 50 ? '#dc2626' : undefined }}>{g.fill_pct}%</td>
                <td className="num">{g.lessons_done}</td>
                <td className="num" style={{ fontWeight: 700 }}>{g.lessons_done ? `${g.attendance_pct}%` : '—'}</td>
                <td className="num" style={{ color: g.risk_students > 0 ? '#dc2626' : C.faint }}>{g.risk_students || 0}</td>
                <td><StatusBadge status={g.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= ПЕРСОНАЛ (Преподаватели/Кураторы/Ассистенты) =================
function PersonnelMode({ personnelTab, setPersonnelTab, teachers, q, setQ, onOpenTeacher, onExportTeachers,
  curators, assistants, loading, err, onRetry, onOpenCurator }) {
  const [open, setOpen] = useState(null)
  const tabs = [{ k: 'teachers', t: 'Преподаватели' }, { k: 'curators', t: 'Кураторы' }, { k: 'assistants', t: 'Ассистенты' }]

  const filteredTeachers = teachers.filter((t) => !q.trim() || t.teacher_name.toLowerCase().includes(q.toLowerCase().trim()))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
  const filteredCurators = curators.filter((c) => !q.trim() || c.full_name.toLowerCase().includes(q.toLowerCase().trim()))
  const filteredAssistants = assistants.filter((a) => !q.trim() || a.full_name.toLowerCase().includes(q.toLowerCase().trim()))

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
        {tabs.map((o) => {
          const on = personnelTab === o.k
          return <button key={o.k} onClick={() => setPersonnelTab(o.k)}
            style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>{o.t}</button>
        })}
      </div>

      {personnelTab === 'teachers' ? (
        <>
          <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <SearchBox q={q} setQ={setQ} placeholder="Поиск преподавателя…" />
            {teachers.length > 0 && (
              <button onClick={() => onExportTeachers(filteredTeachers)} className="rowflex" style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <Download size={15} /> Excel
              </button>
            )}
          </div>
          {filteredTeachers.length === 0 ? <Empty text="Преподаватели не найдены." /> : (
            <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
              <thead><tr>
                <th>Преподаватель</th><th style={{ width: 70 }}>Групп</th><th style={{ width: 85 }}>Учеников</th>
                <th style={{ width: 80 }}>Занятий</th><th style={{ width: 75 }}>Уроков</th><th style={{ width: 65 }}>Отмен</th>
                <th style={{ width: 85 }}>Без плана</th><th style={{ width: 90 }}>Посещ.</th><th style={{ width: 60 }}>Риск</th><th style={{ width: 110 }}>Статус</th>
              </tr></thead>
              <tbody>
                {filteredTeachers.map((t) => (
                  <tr key={t.teacher_name} onClick={() => onOpenTeacher(t.teacher_name)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{t.teacher_name}</td>
                    <td className="num">{t.groups_count}</td>
                    <td className="num">{t.students_count}</td>
                    <td className="num">{t.lessons_done}</td>
                    <td className="num" style={{ color: C.brand, fontWeight: 700 }}>{t.lesson_units}</td>
                    <td className="num">{t.lessons_cancelled}</td>
                    <td className="num" style={{ color: t.no_plan > 3 ? '#dc2626' : undefined }}>{t.no_plan}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{t.lessons_done ? `${t.attendance_pct}%` : '—'}</td>
                    <td className="num" style={{ color: t.risk_students > 0 ? '#dc2626' : C.faint }}>{t.risk_students || 0}</td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
          )}
        </>
      ) : personnelTab === 'curators' ? (
        loading ? <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        : err ? <ErrorBlock text={err} onRetry={onRetry} />
        : filteredCurators.length === 0 ? <Empty text="Кураторов нет." /> : (
          <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
            <thead><tr><th>Куратор</th><th>Предмет</th><th style={{ width: 100 }}>Занятий</th><th style={{ width: 90 }}>Уроков</th><th style={{ width: 120 }}>Последнее</th></tr></thead>
            <tbody>
              {filteredCurators.map((c) => (
                <tr key={c.id} onClick={() => onOpenCurator(c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{c.full_name}</td>
                  <td style={{ color: C.slate }}>{c.subject || '—'}</td>
                  <td className="num">{c.sessions}</td>
                  <td className="num">{c.units}</td>
                  <td>{c.lastDate ? fmtDate(c.lastDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        )
      ) : (
        loading ? <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        : err ? <ErrorBlock text={err} onRetry={onRetry} />
        : (
          <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
            <thead><tr><th>Ассистент</th><th style={{ width: 110 }}>Преподавателей</th><th style={{ width: 90 }}>Занятий</th><th style={{ width: 90 }}>Уроков</th></tr></thead>
            <tbody>
              {filteredAssistants.map((a) => (
                <React.Fragment key={a.id}>
                  <tr onClick={() => setOpen(open === a.id ? null : a.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{a.full_name}</td>
                    <td className="num">{a.teachers.length}</td>
                    <td className="num">{a.sessions}</td>
                    <td className="num">{a.units}</td>
                  </tr>
                  {open === a.id && (
                    <tr><td colSpan={4} style={{ background: C.grey, padding: '10px 20px' }}>
                      {a.teachers.length === 0 ? <span style={{ color: C.faint, fontSize: 12.5 }}>Нет занятий за период</span> : a.teachers.map((t) => (
                        <div key={t.name} className="rowflex" style={{ gap: 8, fontSize: 12.5, padding: '3px 0' }}>
                          <span style={{ flex: 1 }}>{t.name}</span><span style={{ color: C.slate }}><b style={{ color: C.teal }}>{t.units}</b> ур. · {t.count} зан.</span>
                        </div>
                      ))}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table></div></div>
        )
      )}
    </div>
  )
}

// ================= ПРЕДМЕТЫ =================
function SubjectsMode({ rows, onExport }) {
  const sorted = [...rows].sort((a, b) => (a.attendance_pct ?? 100) - (b.attendance_pct ?? 100))
  return (
    <div>
      {rows.length > 0 && (
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <button onClick={onExport} className="rowflex" style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        </div>
      )}
      {sorted.length === 0 ? <Empty text="Предметы не найдены." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr><th>Предмет</th><th style={{ width: 80 }}>Групп</th><th style={{ width: 95 }}>Учеников</th><th style={{ width: 90 }}>Препод.</th><th style={{ width: 85 }}>Занятий</th><th style={{ width: 90 }}>Посещ.</th></tr></thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.subject_name}>
                <td style={{ fontWeight: 600 }}>{(s.subject_name || '').split(' / ')[0]}</td>
                <td className="num">{s.groups_count}</td>
                <td className="num" style={{ color: C.brand, fontWeight: 700 }}>{s.students_count}</td>
                <td className="num">{s.teachers_count}</td>
                <td className="num">{s.lessons_done}</td>
                <td className="num" style={{ fontWeight: 700 }}>{s.lessons_done ? `${s.attendance_pct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= УЧЕНИКИ =================
function StudentsMode({ rows, q, setQ, onOpenStudent, onExport }) {
  const filtered = rows.filter((s) => !q.trim() || s.full_name.toLowerCase().includes(q.toLowerCase().trim()))
    .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))
  return (
    <div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchBox q={q} setQ={setQ} placeholder="Поиск ученика…" />
        {rows.length > 0 && (
          <button onClick={() => onExport(filtered)} className="rowflex" style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>
      {filtered.length === 0 ? <Empty text="Ученики не найдены (или у них нет отметок посещаемости за период)." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr><th>Ученик</th><th style={{ width: 100 }}>Офис</th><th style={{ width: 60 }}>Язык</th><th>Группы</th><th style={{ width: 100 }}>Посещ.</th><th style={{ width: 90 }}>Пропуски</th><th style={{ width: 110 }}>Статус</th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} onClick={() => onOpenStudent?.(s.id)} style={{ cursor: onOpenStudent ? 'pointer' : 'default' }}>
                <td style={{ fontWeight: 600, color: C.brand }}>{s.full_name}</td>
                <td>{s.office || '—'}</td>
                <td>{s.lang || '—'}</td>
                <td style={{ color: C.slate, fontSize: 12.5 }}>{s.groupNames.join(', ') || '—'}</td>
                <td className="num" style={{ fontWeight: 700 }}>{s.pct != null ? `${s.pct}%` : '—'}</td>
                <td className="num">{s.absent}</td>
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= ДЕТАЛИ ГРУППЫ =================
function GroupDetail({ g, attendance, groupLinksByGroup, studentsById, onBack, onOpenStudent }) {
  if (!g) return null
  const roster = useMemo(() => {
    const studentIds = groupLinksByGroup[g.group_id] || []
    const attByStudent = {}
    ;(attendance?.rows || []).forEach((r) => {
      const lesson = attendance.lessonsById[r.lesson_id]
      if (!lesson || lesson.group_id !== g.group_id) return
      const s = (attByStudent[r.student_id] ||= { total: 0, present: 0, lastDate: null })
      s.total++; if (r.present) s.present++
      if ((!s.lastDate || lesson.lesson_date > s.lastDate) && r.present) s.lastDate = lesson.lesson_date
    })
    return studentIds.map((sid) => {
      const student = studentsById[sid]
      const a = attByStudent[sid]
      const pct = a && a.total ? Math.round((a.present / a.total) * 100) : null
      return { id: sid, full_name: student?.full_name || '—', total: a?.total || 0, absent: a ? a.total - a.present : 0, pct, lastDate: a?.lastDate || null, status: groupStatus(pct) }
    }).sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))
  }, [g.group_id, groupLinksByGroup, attendance, studentsById])

  return (
    <div>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={15} /> Все группы
      </button>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800 }}>{g.group_name}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: C.slate }}>{g.office} · {g.lang} · {(g.subject_name || '').split(' / ')[0]} · {g.teacher_name}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 22 }}>
        <Kpi label="Учеников" value={`${g.students_count}/${g.capacity}`} />
        <Kpi label="Занятий" value={g.lessons_done} />
        <Kpi label="Посещаемость" value={g.lessons_done ? `${g.attendance_pct}%` : '—'} />
        <Kpi label="Заполняемость" value={`${g.fill_pct}%`} tint={g.fill_pct < 50 ? '#dc2626' : undefined} />
        <Kpi label="Отменено" value={g.lessons_cancelled} tint={g.lessons_cancelled > 0 ? '#dc2626' : undefined} />
        <Kpi label="В риске" value={g.risk_students || 0} tint={g.risk_students > 0 ? '#dc2626' : undefined} />
      </div>

      <SectionLabel>Ученики группы</SectionLabel>
      {roster.length === 0 ? <Empty text="Нет данных по составу группы." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr><th>Ученик</th><th style={{ width: 110 }}>Посещаемость</th><th style={{ width: 90 }}>Пропуски</th><th style={{ width: 130 }}>Последнее посещение</th><th style={{ width: 110 }}>Статус</th></tr></thead>
          <tbody>
            {roster.map((s) => (
              <tr key={s.id} onClick={() => onOpenStudent?.(s.id)} style={{ cursor: onOpenStudent ? 'pointer' : 'default' }}>
                <td style={{ fontWeight: 600, color: C.brand }}>{s.full_name}</td>
                <td className="num">{s.pct != null ? `${s.pct}%` : '—'}</td>
                <td className="num">{s.absent}</td>
                <td>{s.lastDate ? fmtDate(s.lastDate) : '—'}</td>
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}
function Kpi({ label, value, tint }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: tint || C.ink }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{label}</div>
    </div>
  )
}

// ================= ПРОФИЛЬ ПРЕПОДАВАТЕЛЯ =================
// dict нужен для nameOf(groups)/LessonTable/LessonForm — переиспользуем те же
// компоненты, что и раньше в Сводке, ничего не копируем заново (п.32, 67 ТЗ).
function TeacherProfile({ t, dict, lessons, loading, err, onRetry, onLessonSaved, attendance, periodLabel, onBack }) {
  const [editing, setEditing] = useState(null)
  if (!t) return null

  if (loading || lessons === null) {
    return (
      <div>
        <BackBtn onBack={onBack} text="Все преподаватели" />
        <div style={{ padding: 60, textAlign: 'center', color: C.slate }}>Загрузка занятий…</div>
      </div>
    )
  }
  if (err) {
    return (
      <div>
        <BackBtn onBack={onBack} text="Все преподаватели" />
        <ErrorBlock text={err} onRetry={onRetry} />
      </div>
    )
  }

  const teacherId = dict?.teachers?.find((x) => x.full_name === t.teacher_name)?.id
  const own = lessons.filter((l) => l.teacher_id === teacherId)
  const done = own.filter((l) => l.status === 'проведён')
  const ownIds = new Set(own.map((l) => l.id))
  const ownAtt = (attendance?.rows || []).filter((r) => ownIds.has(r.lesson_id))

  const byGroup = {}
  done.forEach((l) => {
    byGroup[l.group_id] = byGroup[l.group_id] || { units: 0, count: 0 }
    byGroup[l.group_id].units += lessonCount(l); byGroup[l.group_id].count++
  })
  const groupList = Object.entries(byGroup).map(([gid, v]) => ({ gid, name: nameOf(dict.groups, gid), ...v })).sort((a, b) => b.units - a.units)

  function exportOne() {
    const rows = own.map((l) => ({
      Дата: l.lesson_date, Уроков: lessonCount(l), Группа: nameOf(dict.groups, l.group_id),
      Ассистент: assistantNames(l, dict), Тема: l.topic, Учеников: l.students, Статус: l.status, План: l.plan_path ? 'есть' : 'нет',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Уроки')
    XLSX.writeFile(wb, `${t.teacher_name.replace(' ', '_')}_${periodLabel.replace(' ', '_')}.xlsx`)
  }

  return (
    <>
      <BackBtn onBack={onBack} text="Все преподаватели" />
      <div style={{ background: `linear-gradient(135deg,${C.brand},${C.brand2})`, borderRadius: 18, padding: 22, color: '#fff', marginBottom: 16 }}>
        <div className="rowflex" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>{initials(t.teacher_name)}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>{t.teacher_name}</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>{t.groups_count} групп · {t.students_count} учеников</div>
          </div>
          <button onClick={exportOne} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: 'rgba(255,255,255,.2)', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={16} /> Excel
          </button>
        </div>
        <div className="rowflex" style={{ gap: 22, marginTop: 20, flexWrap: 'wrap' }}>
          <BigNum value={t.lessons_done} label="занятий" />
          <BigNum value={t.lesson_units} label="уроков" />
          <BigNum value={t.lessons_done ? `${t.attendance_pct}%` : '—'} label="посещаемость" />
          <BigNum value={t.no_plan} label="без плана" warn={t.no_plan > 0} />
          <BigNum value={t.lessons_cancelled} label="отменено" warn={t.lessons_cancelled > 0} />
        </div>
      </div>

      {groupList.length > 0 && (
        <>
          <SectionLabel>Группы преподавателя</SectionLabel>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
            {groupList.map((g, i) => (
              <div key={g.gid} className="rowflex" style={{ justifyContent: 'space-between', padding: '12px 16px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}><Users size={13} style={{ verticalAlign: -2, marginRight: 5, color: C.slate }} />{g.name}</span>
                <span style={{ fontSize: 13, color: C.slate }}><b style={{ color: C.brand }}>{g.units}</b> ур. · {g.count} зан.</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Все занятия</SectionLabel>
      <LessonTable lessons={own} dict={dict} onEdit={(l) => setEditing(l)} />

      {editing && dict && (
        <LessonForm teacherId={teacherId} lesson={editing} dict={dict}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onLessonSaved?.() }}
          onDeleted={() => { setEditing(null); onLessonSaved?.() }} />
      )}
    </>
  )
}
function BackBtn({ onBack, text }) {
  return (
    <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, marginBottom: 16, border: 'none', background: 'none', cursor: 'pointer' }}>
      <ArrowLeft size={16} /> {text}
    </button>
  )
}
function BigNum({ value, label, warn }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: warn ? '#ffd7b0' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 5 }}>{label}</div>
    </div>
  )
}

// ================= ПРОФИЛЬ КУРАТОРА =================
function CuratorProfile({ c, period, periodLabel, onBack }) {
  const [lessons, setLessons] = useState(null)
  const [err, setErr] = useState('')

  async function reload() {
    if (!c) return
    try {
      const { from, to } = periodRange(period) || {}
      setLessons(await getCuratorLessons(c.id, from, to))
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [c?.id, period])
  if (!c) return null

  const units = (lessons || []).reduce((s, l) => s + (l.lessons_count || 0), 0)
  const uniqueStudents = new Set((lessons || []).flatMap((l) => (l.student_names || '').split(',').map((s) => s.trim()).filter(Boolean))).size

  async function remove(id) {
    if (!confirm('Удалить это занятие?')) return
    try { await deleteCuratorLesson(id); await reload() } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <BackBtn onBack={onBack} text="Все кураторы" />
      <div style={{ background: `linear-gradient(135deg,${C.brand},${C.brand2})`, borderRadius: 18, padding: 22, color: '#fff', marginBottom: 16 }}>
        <div className="rowflex" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>{initials(c.full_name)}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>{c.full_name}</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>куратор{c.subject ? ` · ${c.subject}` : ''}</div>
          </div>
        </div>
        <div className="rowflex" style={{ gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
          <BigNum value={units} label="уроков всего" />
          <BigNum value={(lessons || []).length} label="занятий" />
          <BigNum value={uniqueStudents} label="учеников" />
        </div>
      </div>
      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}
      {lessons === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : lessons.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate }}>
          Занятий за «{periodLabel}» нет.
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          {lessons.map((l, i) => (
            <div key={l.id} style={{ padding: '14px 18px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div className="rowflex" style={{ gap: 10, marginBottom: 6 }}>
                <Calendar size={15} color={C.slate} />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{fmtDate(l.lesson_date)}</span>
                <span style={{ fontSize: 12.5, color: C.brand, background: C.brandSoft, padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>{l.lessons_count} урок(а)</span>
                <span style={{ fontSize: 12.5, color: C.slate }}><Users size={12} style={{ verticalAlign: 'middle' }} /> {l.student_count}</span>
                <button onClick={() => remove(l.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }} title="Удалить"><Trash2 size={14} /></button>
              </div>
              {l.topic && <div style={{ fontSize: 13.5, marginBottom: 3 }}>{l.topic}</div>}
              <div style={{ fontSize: 12.5, color: C.slate }}>{l.student_names || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
