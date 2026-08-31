import React, { useEffect, useMemo, useState } from 'react'
import {
  Clock, CheckCircle2, FileText, AlertTriangle, Users, Search, ChevronRight,
  Download, ArrowLeft, Calendar, Trash2,
  CheckCircle, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { C, lessonCount, nameOf, initials, periodRange, fmtDate, OFFICES, shiftRange } from '../lib/utils'
import PeriodPicker from '../components/PeriodPicker'
import LessonTable from '../components/LessonTable'
import LessonForm from '../components/LessonForm'
import AttendancePanel from './AttendancePanel'
import { getCuratorLessons, deleteCuratorLesson, fetchLessons, fetchAttendanceReport, fetchStudentGroupLinks } from '../lib/api'

// =====================================================================
//  Пороги статусов — в одном месте, не размазаны по компонентам (п.24 ТЗ)
// =====================================================================
const THRESHOLDS = {
  teacherPlanNorm: 90, teacherPlanWarn: 75,
  teacherAttNorm: 85, teacherAttWarn: 75,
  groupAttNorm: 85, groupAttWarn: 75,
  studentAttWarn: 75, studentAttCritical: 60,
}
const STATUS_META = {
  ok:        { label: 'Норма',        color: '#0f9d58', bg: '#e2f5ea' },
  attention: { label: 'Внимание',     color: '#d97706', bg: '#fef3c7' },
  problem:   { label: 'Проблема',     color: '#dc2626', bg: '#fee2e2' },
  unknown:   { label: 'Нет данных',   color: '#9aa0c0', bg: '#f0f1f7' },
}
function teacherStatus(planPct, attPct) {
  if (planPct == null && attPct == null) return 'unknown'
  const p = planPct ?? 100, a = attPct ?? 100
  if (p < THRESHOLDS.teacherPlanWarn || a < THRESHOLDS.teacherAttWarn) return 'problem'
  if (p < THRESHOLDS.teacherPlanNorm || a < THRESHOLDS.teacherAttNorm) return 'attention'
  return 'ok'
}
function groupStatus(attPct) {
  if (attPct == null) return 'unknown'
  if (attPct < THRESHOLDS.groupAttWarn) return 'problem'
  if (attPct < THRESHOLDS.groupAttNorm) return 'attention'
  return 'ok'
}
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown
  return <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{m.label}</span>
}

// ---------- расчёт KPI-набора из массива занятий + строк посещаемости ----------
function computeKpis(lessonsArr, attRows) {
  const done = lessonsArr.filter((l) => l.status === 'проведён')
  const cancelled = lessonsArr.filter((l) => l.status === 'отменён')
  const units = done.reduce((s, l) => s + lessonCount(l), 0)
  const noPlan = done.filter((l) => !l.plan_path).length
  const attTotal = attRows.length
  const attPresent = attRows.filter((r) => r.present).length
  const attPct = attTotal ? Math.round((attPresent / attTotal) * 100) : null
  const planPct = lessonsArr.length ? Math.round((done.length / lessonsArr.length) * 100) : null
  return { sessions: done.length, units, cancelled: cancelled.length, noPlan, attPct, planPct, scheduled: lessonsArr.length }
}
function calcDelta(cur, prev, invert) {
  if (prev == null || cur == null) return null
  const d = cur - prev
  if (d === 0) return { value: 0, good: true, flat: true }
  return { value: d, good: invert ? d < 0 : d > 0 }
}
function DeltaTag({ d, unit }) {
  if (!d) return null
  const Icon = d.flat ? Minus : d.value > 0 ? TrendingUp : TrendingDown
  return (
    <span className="rowflex" style={{ gap: 3, fontSize: 11.5, fontWeight: 700, color: d.good ? '#0f9d58' : '#dc2626' }}>
      <Icon size={11} /> {d.value > 0 ? '+' : ''}{d.value}{unit || ''} к пред. периоду
    </span>
  )
}
function assistantNames(l, dict) {
  const names = [l.assistant_id, l.assistant2_id].filter(Boolean).map((id) => nameOf(dict.assistants, id))
  return names.length ? names.join(', ') : '—'
}

export default function AdminCabinet({ dict, lessons, period, setPeriod, periodLabel, onLessonChanged, onLessonDeleted, onOpenStudent }) {
  const [mode, setMode] = useState('overview') // overview | teachers | groups | curators | assistants | attendance
  const [office, setOffice] = useState('')
  const [prevLessons, setPrevLessons] = useState(null)
  const [attendance, setAttendance] = useState(null)      // { rows, lessonsById } — текущий период
  const [prevAttendance, setPrevAttendance] = useState(null) // тот же формат — предыдущий период
  const [groupLinks, setGroupLinks] = useState([])
  const [drill, setDrill] = useState(null)   // { kind, title } — детализация KPI/проблемы поверх Обзора
  const [openTeacher, setOpenTeacher] = useState(null)
  const [openGroupId, setOpenGroupId] = useState(null)
  const [openCurator, setOpenCurator] = useState(null)

  useEffect(() => { fetchStudentGroupLinks().then(setGroupLinks).catch(() => setGroupLinks([])) }, [])

  useEffect(() => {
    const range = periodRange(period)
    const prevRange = shiftRange(range)
    if (!prevRange) { setPrevLessons(null); setPrevAttendance(null); return }
    fetchLessons(prevRange).then(setPrevLessons).catch(() => setPrevLessons(null))
    fetchAttendanceReport(prevRange).then(setPrevAttendance).catch(() => setPrevAttendance(null))
  }, [period])

  useEffect(() => {
    fetchAttendanceReport(periodRange(period)).then(setAttendance).catch(() => setAttendance(null))
  }, [period])

  // ---------- офис-фильтрация ----------
  const groupsById = useMemo(() => Object.fromEntries(dict.groups.map((g) => [g.id, g])), [dict.groups])
  const lessonOffice = (l) => l.group_id ? (groupsById[l.group_id]?.office || null) : null

  const officeLessons = useMemo(() => office ? lessons.filter((l) => lessonOffice(l) === office) : lessons, [lessons, office, groupsById])
  const officePrevLessons = useMemo(() => {
    if (!prevLessons) return []
    return office ? prevLessons.filter((l) => lessonOffice(l) === office) : prevLessons
  }, [prevLessons, office, groupsById])

  const officeLessonIds = useMemo(() => new Set(officeLessons.map((l) => l.id)), [officeLessons])
  const officeAttRows = useMemo(() => attendance ? attendance.rows.filter((r) => officeLessonIds.has(r.lesson_id)) : [], [attendance, officeLessonIds])
  const officePrevLessonIds = useMemo(() => new Set(officePrevLessons.map((l) => l.id)), [officePrevLessons])
  const officePrevAttRows = useMemo(() => prevAttendance ? prevAttendance.rows.filter((r) => officePrevLessonIds.has(r.lesson_id)) : [], [prevAttendance, officePrevLessonIds])

  const groupLinksByGroup = useMemo(() => {
    const m = {}
    groupLinks.forEach((l) => { (m[l.group_id] ||= []).push(l.student_id) })
    return m
  }, [groupLinks])
  const studentsById = useMemo(() => Object.fromEntries((dict.students || []).map((s) => [s.id, s])), [dict.students])

  // ---------- KPI текущего/предыдущего периода ----------
  const kpi = useMemo(() => computeKpis(officeLessons, officeAttRows), [officeLessons, officeAttRows])
  const kpiPrev = useMemo(() => prevLessons ? computeKpis(officePrevLessons, officePrevAttRows) : null, [prevLessons, officePrevLessons, officePrevAttRows])

  // ---------- статистика по преподавателям ----------
  const teacherStats = useMemo(() => dict.teachers.map((t, i) => {
    const own = officeLessons.filter((l) => l.teacher_id === t.id)
    const done = own.filter((l) => l.status === 'проведён')
    const cancelled = own.filter((l) => l.status === 'отменён')
    const noPlan = done.filter((l) => !l.plan_path).length
    const ownIds = new Set(own.map((l) => l.id))
    const attR = officeAttRows.filter((r) => ownIds.has(r.lesson_id))
    const attPct = attR.length ? Math.round((attR.filter((r) => r.present).length / attR.length) * 100) : null
    const planPct = own.length ? Math.round((done.length / own.length) * 100) : null
    const groupIdsSet = new Set(done.map((l) => l.group_id).filter(Boolean))
    const subjIds = dict.subjectsByTeacher?.[t.id] || []
    const subjectsText = subjIds.map((sid) => nameOf(dict.subjects, sid)).filter(Boolean).map((n) => n.split(' / ')[0]).join(', ')
    const lastDate = done.reduce((m, l) => (!m || l.lesson_date > m) ? l.lesson_date : m, null)
    const teacherOffice = [...groupIdsSet].map((gid) => groupsById[gid]?.office).find(Boolean) || null
    return {
      ...t, idx: i, subjectsText, sessions: done.length, units: done.reduce((s, l) => s + lessonCount(l), 0),
      cancelled: cancelled.length, noPlan, attPct, planPct, groupsCount: groupIdsSet.size, groupIds: [...groupIdsSet],
      lastDate, office: teacherOffice, status: teacherStatus(planPct, attPct),
    }
  }), [dict.teachers, dict.subjectsByTeacher, dict.subjects, officeLessons, officeAttRows, groupsById])

  // ---------- статистика по группам ----------
  const groupStats = useMemo(() => dict.groups.filter((g) => !office || g.office === office).map((g) => {
    const own = officeLessons.filter((l) => l.group_id === g.id)
    const done = own.filter((l) => l.status === 'проведён')
    const cancelled = own.filter((l) => l.status === 'отменён')
    const noPlan = done.filter((l) => !l.plan_path).length
    const ownIds = new Set(own.map((l) => l.id))
    const attR = officeAttRows.filter((r) => ownIds.has(r.lesson_id))
    const attPct = attR.length ? Math.round((attR.filter((r) => r.present).length / attR.length) * 100) : null
    const planPct = own.length ? Math.round((done.length / own.length) * 100) : null
    const teacherIds = new Set(done.map((l) => l.teacher_id).filter(Boolean))
    return {
      ...g, sessions: done.length, units: done.reduce((s, l) => s + lessonCount(l), 0), cancelled: cancelled.length,
      noPlan, attPct, planPct, studentsCount: (groupLinksByGroup[g.id] || []).length,
      teachersText: [...teacherIds].map((tid) => nameOf(dict.teachers, tid)).join(', '),
      status: groupStatus(attPct),
    }
  }), [dict.groups, office, officeLessons, officeAttRows, groupLinksByGroup, dict.teachers])

  // ---------- статистика по кураторам (не привязаны к офису — индивидуальные занятия) ----------
  const curatorStats = useMemo(() => (dict.curators || []).map((c) => {
    const done = lessons.filter((l) => l.curator_id === c.id && l.status === 'проведён')
    return { ...c, sessions: done.length, units: done.reduce((s, l) => s + lessonCount(l), 0),
      lastDate: done.reduce((m, l) => (!m || l.lesson_date > m) ? l.lesson_date : m, null) }
  }).sort((x, y) => y.units - x.units), [dict.curators, lessons])

  // ---------- статистика по ассистентам ----------
  const assistantStats = useMemo(() => dict.assistants.map((a) => {
    const done = officeLessons.filter((l) => (l.assistant_id === a.id || l.assistant2_id === a.id) && l.status === 'проведён')
    const withT = {}
    done.forEach((l) => {
      withT[l.teacher_id] = withT[l.teacher_id] || { count: 0, units: 0 }
      withT[l.teacher_id].count++; withT[l.teacher_id].units += lessonCount(l)
    })
    return {
      ...a, sessions: done.length, units: done.reduce((s, l) => s + lessonCount(l), 0),
      teachers: Object.entries(withT).map(([tid, v]) => ({ name: nameOf(dict.teachers, tid), ...v })).sort((x, y) => y.units - x.units),
    }
  }).sort((x, y) => y.units - x.units), [dict.assistants, officeLessons, dict.teachers])

  // ---------- проблемные ученики (посещаемость) ----------
  const studentIssues = useMemo(() => {
    const m = {}
    officeAttRows.forEach((r) => {
      const s = (m[r.student_id] ||= { total: 0, present: 0, groupIds: new Set() })
      s.total++; if (r.present) s.present++
      const lesson = attendance?.lessonsById?.[r.lesson_id]
      if (lesson?.group_id) s.groupIds.add(lesson.group_id)
    })
    return Object.entries(m).map(([sid, v]) => {
      const pct = v.total ? Math.round((v.present / v.total) * 100) : null
      const student = studentsById[sid]
      return {
        id: sid, full_name: student?.full_name || '—', office: student?.office || null,
        pct, total: v.total, absent: v.total - v.present,
        groupNames: [...v.groupIds].map((gid) => groupsById[gid]?.name).filter(Boolean).join(', '),
      }
    }).filter((s) => s.pct != null).sort((a, b) => a.pct - b.pct)
  }, [officeAttRows, attendance, studentsById, groupsById])

  const lowAttGroups = useMemo(() => groupStats.filter((g) => g.status === 'problem' || g.status === 'attention').sort((a, b) => (a.attPct ?? 100) - (b.attPct ?? 100)), [groupStats])
  const criticalStudents = useMemo(() => studentIssues.filter((s) => s.pct < THRESHOLDS.studentAttCritical), [studentIssues])
  const lowStudents = useMemo(() => studentIssues.filter((s) => s.pct < THRESHOLDS.studentAttWarn), [studentIssues])
  const problemTeachers = useMemo(() => teacherStats.filter((t) => t.status === 'problem'), [teacherStats])
  const noPlanLessons = useMemo(() => officeLessons.filter((l) => l.status === 'проведён' && !l.plan_path), [officeLessons])
  const cancelledLessons = useMemo(() => officeLessons.filter((l) => l.status === 'отменён'), [officeLessons])

  // ---------- сравнение по офисам (всегда по всем офисам, для таблицы) ----------
  const officeRows = useMemo(() => OFFICES.map((o) => {
    const ls = lessons.filter((l) => lessonOffice(l) === o)
    const ids = new Set(ls.map((l) => l.id))
    const attR = attendance ? attendance.rows.filter((r) => ids.has(r.lesson_id)) : []
    return { office: o, ...computeKpis(ls, attR) }
  }), [lessons, attendance, groupsById])

  function exportSummaryExcel() {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Обзор', [{
      Период: periodLabel, Офис: office || 'Все офисы',
      'Проведено занятий': kpi.sessions, 'Проведено уроков': kpi.units,
      'Выполнение плана, %': kpi.planPct ?? '', 'Посещаемость, %': kpi.attPct ?? '',
      'Без плана': kpi.noPlan, Отменено: kpi.cancelled,
    }])
    addSheet(wb, 'Преподаватели', teacherStats.map((t) => ({
      Преподаватель: t.full_name, Предметы: t.subjectsText, Офис: t.office || '', Групп: t.groupsCount,
      Занятий: t.sessions, Уроков: t.units, 'Выполнение плана, %': t.planPct ?? '', 'Посещаемость, %': t.attPct ?? '',
      'Без плана': t.noPlan, Отменено: t.cancelled, 'Последнее занятие': t.lastDate || '', Статус: STATUS_META[t.status].label,
    })))
    addSheet(wb, 'Группы', groupStats.map((g) => ({
      Группа: g.name, Офис: g.office || '', Учеников: g.studentsCount, Занятий: g.sessions, Уроков: g.units,
      'Посещаемость, %': g.attPct ?? '', 'Выполнение плана, %': g.planPct ?? '', 'Без плана': g.noPlan, Отменено: g.cancelled,
      Статус: STATUS_META[g.status].label,
    })))
    addSheet(wb, 'Посещаемость', studentIssues.map((s) => ({
      Ученик: s.full_name, Офис: s.office || '', Группы: s.groupNames, 'Посещаемость, %': s.pct, Пропусков: s.absent, Отметок: s.total,
    })))
    addSheet(wb, 'Занятия', officeLessons.map((l) => ({
      Дата: l.lesson_date, Тип: l.curator_id ? 'Индивидуальное (куратор)' : 'Групповое',
      Уроков: lessonCount(l), Преподаватель: l.curator_id ? '—' : nameOf(dict.teachers, l.teacher_id),
      Куратор: l.curator_id ? nameOf(dict.curators, l.curator_id) : '—', Группа: nameOf(dict.groups, l.group_id),
      Ассистент: assistantNames(l, dict), Тема: l.topic, Статус: l.status, 'План урока': l.plan_path ? 'есть' : 'нет',
    })))
    const problems = []
    lowAttGroups.forEach((g) => problems.push({ Тип: 'Группа: низкая посещаемость', Объект: g.name, Значение: `${g.attPct}%` }))
    noPlanLessons.forEach((l) => problems.push({ Тип: 'Занятие без плана', Объект: `${fmtDate(l.lesson_date)} · ${nameOf(dict.groups, l.group_id)}`, Значение: '—' }))
    cancelledLessons.forEach((l) => problems.push({ Тип: 'Отменённое занятие', Объект: `${fmtDate(l.lesson_date)} · ${nameOf(dict.groups, l.group_id)}`, Значение: '—' }))
    lowStudents.forEach((s) => problems.push({ Тип: 'Ученик: низкая посещаемость', Объект: s.full_name, Значение: `${s.pct}%` }))
    problemTeachers.forEach((t) => problems.push({ Тип: 'Преподаватель: требует внимания', Объект: t.full_name, Значение: `план ${t.planPct ?? '—'}% · посещ. ${t.attPct ?? '—'}%` }))
    addSheet(wb, 'Риски', problems)
    addSheet(wb, 'Кураторы', curatorStats.map((c) => ({ Куратор: c.full_name, Предмет: c.subject || '', Занятий: c.sessions, Уроков: c.units, 'Последнее занятие': c.lastDate || '' })))
    const asstRows = []
    assistantStats.forEach((a) => {
      if (!a.teachers.length) { asstRows.push({ Ассистент: a.full_name, Преподаватель: '—', Занятий: 0, Уроков: 0 }); return }
      a.teachers.forEach((t) => asstRows.push({ Ассистент: a.full_name, Преподаватель: t.name, Занятий: t.count, Уроков: t.units }))
    })
    addSheet(wb, 'Ассистенты', asstRows)
    XLSX.writeFile(wb, `Сводка_${periodLabel.replace(/\s+/g, '_')}${office ? '_' + office : ''}.xlsx`)
  }

  // ---------- открытые детальные экраны ----------
  if (openTeacher) {
    const t = teacherStats.find((x) => x.id === openTeacher)
    return <TeacherProfile t={t} dict={dict} lessons={lessons} officeAttRows={officeAttRows} attendance={attendance} periodLabel={periodLabel}
      onBack={() => setOpenTeacher(null)} onLessonChanged={onLessonChanged} onLessonDeleted={onLessonDeleted} onOpenGroup={(gid) => { setOpenTeacher(null); setOpenGroupId(gid) }} />
  }
  if (openGroupId) {
    const g = groupStats.find((x) => x.id === openGroupId)
    return <GroupDetail g={g} dict={dict} lessons={lessons} attendance={attendance} groupLinksByGroup={groupLinksByGroup} studentsById={studentsById}
      onBack={() => setOpenGroupId(null)} onOpenStudent={onOpenStudent} />
  }
  if (openCurator) {
    const c = curatorStats.find((x) => x.id === openCurator)
    return <CuratorProfile c={c} period={period} periodLabel={periodLabel} onBack={() => setOpenCurator(null)} />
  }

  const MODES = [
    { k: 'overview', t: 'Обзор' },
    { k: 'teachers', t: 'Преподаватели' },
    { k: 'groups', t: 'Группы' },
    { k: 'curators', t: 'Кураторы' },
    { k: 'assistants', t: 'Ассистенты' },
    { k: 'attendance', t: 'Посещаемость' },
  ]

  return (
    <>
      <div className="rowflex" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Сводка</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Контроль работы образовательного центра</p>
        </div>
        <div className="rowflex" style={{ marginLeft: 'auto', gap: 10, flexWrap: 'wrap' }}>
          <select value={office} onChange={(e) => setOffice(e.target.value)}
            style={{ padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, fontWeight: 600, outline: 'none', background: '#fff' }}>
            <option value="">Все офисы</option>
            {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <PeriodPicker period={period} setPeriod={setPeriod} />
          <button onClick={exportSummaryExcel} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: C.teal, color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={16} /> <span className="hide-sm">Excel</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3, marginBottom: 20, flexWrap: 'wrap', gap: 2 }}>
        {MODES.map((o) => {
          const a = mode === o.k
          return <button key={o.k} onClick={() => { setMode(o.k); setDrill(null) }}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: a ? C.card : 'transparent', color: a ? C.brand : C.slate, boxShadow: a ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>{o.t}</button>
        })}
      </div>

      {mode === 'overview' ? (
        drill ? (
          <LessonsDrill drill={drill} onBack={() => setDrill(null)} dict={dict} onLessonChanged={onLessonChanged} onLessonDeleted={onLessonDeleted} />
        ) : (
          <OverviewMode kpi={kpi} kpiPrev={kpiPrev} lowAttGroups={lowAttGroups} criticalStudents={criticalStudents} lowStudents={lowStudents}
            problemTeachers={problemTeachers} noPlanLessons={noPlanLessons} cancelledLessons={cancelledLessons}
            officeLessons={officeLessons} officeAttRows={officeAttRows} attendance={attendance} office={office} officeRows={officeRows}
            onDrill={setDrill} onGoMode={setMode} onOpenGroup={setOpenGroupId} onOpenStudent={onOpenStudent} onSetOffice={setOffice} />
        )
      ) : mode === 'teachers' ? (
        <TeachersMode rows={teacherStats} onOpen={setOpenTeacher} />
      ) : mode === 'groups' ? (
        <GroupsMode rows={groupStats} onOpen={setOpenGroupId} />
      ) : mode === 'curators' ? (
        <CuratorsMode rows={curatorStats} onOpen={setOpenCurator} />
      ) : mode === 'assistants' ? (
        <AssistantsMode rows={assistantStats} />
      ) : (
        <AttendancePanel dict={dict} periodRange={periodRange(period)} periodLabel={periodLabel} />
      )}
    </>
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

// ================= ОБЗОР =================
function OverviewMode({ kpi, kpiPrev, lowAttGroups, criticalStudents, lowStudents, problemTeachers, noPlanLessons, cancelledLessons,
  officeLessons, officeAttRows, attendance, office, officeRows, onDrill, onGoMode, onOpenGroup, onOpenStudent, onSetOffice }) {
  const [trendMetric, setTrendMetric] = useState('lessons')

  const problems = []
  if (lowAttGroups.length) problems.push({ sev: lowAttGroups.some((g) => g.status === 'problem') ? 'danger' : 'warn',
    text: `Групп с низкой посещаемостью: ${lowAttGroups.length}`, onClick: () => onGoMode('groups') })
  else problems.push({ sev: 'ok', text: 'Все группы в норме по посещаемости' })

  if (kpi.noPlan > 0) problems.push({ sev: 'warn', text: `Занятий проведено без плана: ${kpi.noPlan}`, onClick: () => onDrill({ kind: 'no_plan', title: 'Занятия без плана' }) })
  else problems.push({ sev: 'ok', text: 'Все занятия имеют план' })

  if (criticalStudents.length) problems.push({ sev: 'danger', text: `Учеников с посещаемостью ниже ${THRESHOLDS.studentAttCritical}%: ${criticalStudents.length}`, onClick: () => onGoMode('attendance') })
  if (lowStudents.length - criticalStudents.length > 0) problems.push({ sev: 'warn', text: `Учеников с посещаемостью ${THRESHOLDS.studentAttCritical}–${THRESHOLDS.studentAttWarn - 1}%: ${lowStudents.length - criticalStudents.length}`, onClick: () => onGoMode('attendance') })
  if (!lowStudents.length) problems.push({ sev: 'ok', text: 'Учеников с критично низкой посещаемостью нет' })

  if (cancelledLessons.length > 0) problems.push({ sev: 'warn', text: `Отменено занятий: ${cancelledLessons.length}`, onClick: () => onDrill({ kind: 'cancelled', title: 'Отменённые занятия' }) })
  else problems.push({ sev: 'ok', text: 'Отменённых занятий нет' })

  if (problemTeachers.length) problems.push({ sev: 'danger', text: `Преподавателей, требующих внимания: ${problemTeachers.length}`, onClick: () => onGoMode('teachers') })
  else problems.push({ sev: 'ok', text: 'У всех преподавателей показатели в норме' })

  // ---------- динамика (по дням, если период до ~31 дня, иначе по неделям) ----------
  const dates = officeLessons.map((l) => l.lesson_date).sort()
  const spanDays = dates.length ? (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000 : 0
  const byWeek = spanDays > 40
  const bucketKey = (d) => {
    if (!byWeek) return d
    const dt = new Date(d + 'T00:00:00')
    const day = (dt.getDay() + 6) % 7
    const mon = new Date(dt); mon.setDate(dt.getDate() - day)
    return mon.toISOString().slice(0, 10)
  }
  const trend = useMemo(() => {
    const m = {}
    officeLessons.forEach((l) => {
      const k = bucketKey(l.lesson_date)
      const b = (m[k] ||= { key: k, scheduled: 0, done: 0, cancelled: 0, noPlan: 0, attTotal: 0, attPresent: 0 })
      b.scheduled++
      if (l.status === 'проведён') { b.done++; if (!l.plan_path) b.noPlan++ }
      if (l.status === 'отменён') b.cancelled++
    })
    officeAttRows.forEach((r) => {
      const lesson = attendance?.lessonsById?.[r.lesson_id]
      if (!lesson) return
      const k = bucketKey(lesson.lesson_date)
      const b = m[k]
      if (!b) return
      b.attTotal++; if (r.present) b.attPresent++
    })
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map((b) => ({
      name: byWeek ? `нед. ${fmtDate(b.key)}` : fmtDate(b.key),
      Запланировано: b.scheduled, Проведено: b.done, Отменено: b.cancelled, 'Без плана': b.noPlan,
      Посещаемость: b.attTotal ? Math.round((b.attPresent / b.attTotal) * 100) : null,
    }))
  }, [officeLessons, officeAttRows, attendance, byWeek])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        <KpiCard icon={CheckCircle2} label="Проведено занятий" value={kpi.sessions} delta={calcDelta(kpi.sessions, kpiPrev?.sessions)} />
        <KpiCard icon={Clock} label="Проведено уроков" value={kpi.units} delta={calcDelta(kpi.units, kpiPrev?.units)} />
        <KpiCard icon={Users} label="Посещаемость" value={kpi.attPct != null ? `${kpi.attPct}%` : '—'} delta={calcDelta(kpi.attPct, kpiPrev?.attPct)} unit="%" />
        <KpiCard icon={CheckCircle} label="Выполнение плана" value={kpi.planPct != null ? `${kpi.planPct}%` : '—'} delta={calcDelta(kpi.planPct, kpiPrev?.planPct)} unit="%" />
        <KpiCard icon={FileText} label="Без плана" value={kpi.noPlan} sub={kpi.sessions ? `${Math.round((kpi.noPlan / kpi.sessions) * 1000) / 10}% от проведённых` : null}
          onClick={kpi.noPlan > 0 ? () => onDrill({ kind: 'no_plan', title: 'Занятия без плана' }) : undefined} warn={kpi.noPlan > 0} />
        <KpiCard icon={AlertTriangle} label="Отменено" value={kpi.cancelled} delta={calcDelta(kpi.cancelled, kpiPrev?.cancelled, true)}
          onClick={kpi.cancelled > 0 ? () => onDrill({ kind: 'cancelled', title: 'Отменённые занятия' }) : undefined} warn={kpi.cancelled > 0} />
      </div>

      <SectionLabel>Требует внимания</SectionLabel>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 22 }}>
        {problems.map((p, i) => (
          <div key={i} onClick={p.onClick} className="rowflex"
            style={{ gap: 10, padding: '12px 16px', borderTop: i ? `1px solid ${C.line}` : 'none', cursor: p.onClick ? 'pointer' : 'default' }}>
            <span style={{ fontSize: 14 }}>{p.sev === 'danger' ? '🔴' : p.sev === 'warn' ? '🟠' : '✓'}</span>
            <span style={{ fontSize: 13.5, color: p.sev === 'ok' ? C.slate : C.ink, fontWeight: p.sev === 'ok' ? 500 : 600, flex: 1 }}>{p.text}</span>
            {p.onClick && <ChevronRight size={16} color={C.faint} />}
          </div>
        ))}
      </div>

      <SectionLabel>Динамика работы центра</SectionLabel>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 22 }}>
        <div className="rowflex" style={{ gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {[['lessons', 'Занятия'], ['attendance', 'Посещаемость'], ['noplan', 'Без плана'], ['cancel', 'Отмены']].map(([k, t]) => {
            const on = trendMetric === k
            return <button key={k} onClick={() => setTrendMetric(k)}
              style={{ padding: '6px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>{t}</button>
          })}
        </div>
        {trend.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: C.faint, fontSize: 13 }}>Нет занятий за период</div> : (
          <ResponsiveContainer width="100%" height={220}>
            {trendMetric === 'lessons' ? (
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Запланировано" fill={C.line} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Проведено" fill={C.brand} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Отменено" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : trendMetric === 'attendance' ? (
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="Посещаемость" stroke={C.brand} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              </LineChart>
            ) : trendMetric === 'noplan' ? (
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Без плана" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Отменено" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {!office && (
        <>
          <SectionLabel>По офисам</SectionLabel>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <div className="rowflex" style={{ gap: 10, padding: '9px 16px', background: C.grey, fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase' }}>
              <span style={{ flex: 1 }}>Офис</span>
              <span style={{ width: 90, textAlign: 'right' }}>Занятия</span>
              <span style={{ width: 90, textAlign: 'right' }}>Уроки</span>
              <span style={{ width: 110, textAlign: 'right' }}>Посещаемость</span>
              <span style={{ width: 90, textAlign: 'right' }}>Без плана</span>
              <span style={{ width: 90, textAlign: 'right' }}>Отмены</span>
            </div>
            {officeRows.map((r, i) => (
              <div key={r.office} onClick={() => onSetOffice(r.office)} className="rowflex"
                style={{ gap: 10, padding: '11px 16px', borderTop: i ? `1px solid ${C.line}` : 'none', cursor: 'pointer' }}>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{r.office}</span>
                <span style={{ width: 90, textAlign: 'right', fontSize: 13 }}>{r.sessions}</span>
                <span style={{ width: 90, textAlign: 'right', fontSize: 13 }}>{r.units}</span>
                <span style={{ width: 110, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{r.attPct != null ? `${r.attPct}%` : '—'}</span>
                <span style={{ width: 90, textAlign: 'right', fontSize: 13, color: r.noPlan > 0 ? '#d97706' : C.slate }}>{r.noPlan}</span>
                <span style={{ width: 90, textAlign: 'right', fontSize: 13, color: r.cancelled > 0 ? '#dc2626' : C.slate }}>{r.cancelled}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
function KpiCard({ icon: Icon, label, value, delta, unit, sub, onClick, warn }) {
  return (
    <div onClick={onClick} style={{ background: C.card, border: `1px solid ${warn ? '#fde68a' : C.line}`, borderRadius: 13, padding: '14px 15px', cursor: onClick ? 'pointer' : 'default' }}>
      <div className="rowflex" style={{ gap: 8, marginBottom: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: warn ? '#fef3c7' : C.brandSoft, color: warn ? '#d97706' : C.brand, display: 'grid', placeItems: 'center' }}><Icon size={14} /></div>
        {onClick && <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto' }} />}
      </div>
      <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>{label}</div>
      {delta && <div style={{ marginTop: 5 }}><DeltaTag d={delta} unit={unit} /></div>}
      {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ---------- drill-down: список занятий (без плана / отменено) ----------
function LessonsDrill({ drill, onBack, dict, onLessonChanged, onLessonDeleted }) {
  const [editing, setEditing] = useState(null)
  return (
    <div>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        <ArrowLeft size={15} /> Обзор
      </button>
      <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800 }}>{drill.title}</h2>
      <LessonTable lessons={drill.lessons || []} dict={dict} showTeacher onEdit={(l) => setEditing(l)} />
      {editing && (
        <LessonForm teacherId={editing.teacher_id} lesson={editing} dict={dict}
          onClose={() => setEditing(null)}
          onSaved={(l) => { setEditing(null); onLessonChanged(l) }}
          onDeleted={(id) => { setEditing(null); onLessonDeleted(id) }} />
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>{children}</div>
}
function SearchBox({ q, setQ, placeholder }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
      <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
    </div>
  )
}
function SelectF({ value, onChange, placeholder, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5, outline: 'none', background: '#fff' }}>
      <option value="">{placeholder}</option>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  )
}
function Empty({ text }) {
  return <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate, fontSize: 13.5 }}>{text}</div>
}
function statusRank(s) { return { problem: 0, attention: 1, unknown: 2, ok: 3 }[s] ?? 2 }

// ================= ПРЕПОДАВАТЕЛИ (таблица) =================
function TeachersMode({ rows, onOpen }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sortKey, setSortKey] = useState('status')
  const [sortDir, setSortDir] = useState('asc')

  const filtered = rows.filter((t) => {
    if (status && t.status !== status) return false
    const s = q.toLowerCase().trim()
    return !s || t.full_name.toLowerCase().includes(s) || (t.subjectsText || '').toLowerCase().includes(s)
  })
  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    if (sortKey === 'status') { va = statusRank(a.status); vb = statusRank(b.status) }
    else { va = a[sortKey]; vb = b[sortKey] }
    // null/undefined (нет данных) — всегда в конец, независимо от направления сортировки
    const na = va == null, nb = vb == null
    if (na && nb) return 0
    if (na) return 1
    if (nb) return -1
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru')
    return sortDir === 'asc' ? va - vb : vb - va
  })
  const toggleSort = (k) => { if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') } }
  const Th = ({ k, children, w }) => (
    <th onClick={() => toggleSort(k)} style={{ width: w, cursor: 'pointer', whiteSpace: 'nowrap' }}>{children} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
  )

  return (
    <div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchBox q={q} setQ={setQ} placeholder="Поиск преподавателя, предмета…" />
        <SelectF value={status} onChange={setStatus} placeholder="Любой статус" options={[['ok', 'Норма'], ['attention', 'Внимание'], ['problem', 'Проблема']]} />
      </div>
      {sorted.length === 0 ? <Empty text="Преподаватели не найдены." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr>
            <Th k="full_name">Преподаватель</Th><th>Предметы</th>
            <Th k="groupsCount" w={70}>Группы</Th><Th k="sessions" w={80}>Занятий</Th><Th k="units" w={70}>Уроков</Th>
            <Th k="planPct" w={100}>Выполнение</Th><Th k="attPct" w={110}>Посещаемость</Th>
            <Th k="noPlan" w={90}>Без плана</Th><Th k="cancelled" w={90}>Отмены</Th>
            <Th k="lastDate" w={110}>Последнее</Th><Th k="status" w={110}>Статус</Th>
          </tr></thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} onClick={() => onOpen(t.id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{t.full_name}</td>
                <td style={{ color: C.slate }}>{t.subjectsText || '—'}</td>
                <td className="num">{t.groupsCount}</td>
                <td className="num">{t.sessions}</td>
                <td className="num">{t.units}</td>
                <td className="num">{t.planPct != null ? `${t.planPct}%` : '—'}</td>
                <td className="num">{t.attPct != null ? `${t.attPct}%` : '—'}</td>
                <td className="num" style={{ color: t.noPlan > 0 ? '#d97706' : undefined }}>{t.noPlan}</td>
                <td className="num" style={{ color: t.cancelled > 0 ? '#dc2626' : undefined }}>{t.cancelled}</td>
                <td>{t.lastDate ? fmtDate(t.lastDate) : '—'}</td>
                <td><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= ГРУППЫ (таблица) =================
function GroupsMode({ rows, onOpen }) {
  const [q, setQ] = useState('')
  const [office, setOffice] = useState('')
  const [status, setStatus] = useState('')
  const filtered = rows.filter((g) => {
    if (office && g.office !== office) return false
    if (status && g.status !== status) return false
    const s = q.toLowerCase().trim()
    return !s || g.name.toLowerCase().includes(s)
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.attPct ?? 100) - (b.attPct ?? 100))

  return (
    <div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchBox q={q} setQ={setQ} placeholder="Поиск группы…" />
        <SelectF value={office} onChange={setOffice} placeholder="Все офисы" options={OFFICES.map((o) => [o, o])} />
        <SelectF value={status} onChange={setStatus} placeholder="Любой статус" options={[['ok', 'Норма'], ['attention', 'Внимание'], ['problem', 'Проблема']]} />
      </div>
      {filtered.length === 0 ? <Empty text="Группы не найдены." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr>
            <th>Группа</th><th style={{ width: 110 }}>Офис</th><th style={{ width: 90 }}>Учеников</th>
            <th style={{ width: 90 }}>Занятий</th><th style={{ width: 110 }}>Посещаемость</th>
            <th style={{ width: 100 }}>Выполнение</th><th style={{ width: 90 }}>Без плана</th><th style={{ width: 90 }}>Отмены</th><th style={{ width: 110 }}>Статус</th>
          </tr></thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} onClick={() => onOpen(g.id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>{g.office || '—'}</td>
                <td className="num">{g.studentsCount}</td>
                <td className="num">{g.sessions}</td>
                <td className="num">{g.attPct != null ? `${g.attPct}%` : '—'}</td>
                <td className="num">{g.planPct != null ? `${g.planPct}%` : '—'}</td>
                <td className="num" style={{ color: g.noPlan > 0 ? '#d97706' : undefined }}>{g.noPlan}</td>
                <td className="num" style={{ color: g.cancelled > 0 ? '#dc2626' : undefined }}>{g.cancelled}</td>
                <td><StatusBadge status={g.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= КУРАТОРЫ (таблица) =================
// Кураторы посещаемость не отмечают (индивидуальные занятия без такой отметки —
// см. бизнес-логику проекта), поэтому колонки "посещаемость"/"проблемные ученики"
// сюда не добавлены — данных для них физически нет.
function CuratorsMode({ rows, onOpen }) {
  const [q, setQ] = useState('')
  const filtered = rows.filter((c) => !q.trim() || c.full_name.toLowerCase().includes(q.toLowerCase().trim()))
  return (
    <div>
      <div style={{ marginBottom: 14 }}><SearchBox q={q} setQ={setQ} placeholder="Поиск куратора…" /></div>
      {filtered.length === 0 ? <Empty text="Кураторов нет." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr><th>Куратор</th><th>Предмет</th><th style={{ width: 100 }}>Занятий</th><th style={{ width: 90 }}>Уроков</th><th style={{ width: 120 }}>Последнее</th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => onOpen(c.id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{c.full_name}</td>
                <td style={{ color: C.slate }}>{c.subject || '—'}</td>
                <td className="num">{c.sessions}</td>
                <td className="num">{c.units}</td>
                <td>{c.lastDate ? fmtDate(c.lastDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= АССИСТЕНТЫ (таблица) =================
function AssistantsMode({ rows }) {
  const [open, setOpen] = useState(null)
  return (
    <div>
      <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
        <thead><tr><th>Ассистент</th><th style={{ width: 110 }}>Преподавателей</th><th style={{ width: 90 }}>Занятий</th><th style={{ width: 90 }}>Уроков</th></tr></thead>
        <tbody>
          {rows.map((a) => (
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
    </div>
  )
}

// ================= ПРОФИЛЬ ПРЕПОДАВАТЕЛЯ =================
function TeacherProfile({ t, dict, lessons, officeAttRows, attendance, periodLabel, onBack, onLessonChanged, onLessonDeleted, onOpenGroup }) {
  const [editing, setEditing] = useState(null)
  const own = lessons.filter((l) => l.teacher_id === t?.id)
  const done = own.filter((l) => l.status === 'проведён')

  const byGroup = useMemo(() => {
    const m = {}
    done.forEach((l) => {
      m[l.group_id] = m[l.group_id] || { units: 0, count: 0 }
      m[l.group_id].units += lessonCount(l); m[l.group_id].count++
    })
    return Object.entries(m).map(([gid, v]) => ({ gid, name: nameOf(dict.groups, gid), ...v })).sort((a, b) => b.units - a.units)
  }, [done, dict.groups])

  const ownIds = new Set(own.map((l) => l.id))
  const ownAtt = officeAttRows.filter((r) => ownIds.has(r.lesson_id))

  const trend = useMemo(() => {
    const m = {}
    own.forEach((l) => {
      const b = (m[l.lesson_date] ||= { date: l.lesson_date, done: 0, attTotal: 0, attPresent: 0 })
      if (l.status === 'проведён') b.done++
    })
    ownAtt.forEach((r) => {
      const lesson = attendance?.lessonsById?.[r.lesson_id]
      if (!lesson) return
      const b = m[lesson.lesson_date]
      if (!b) return
      b.attTotal++; if (r.present) b.attPresent++
    })
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({
      name: fmtDate(b.date), Занятий: b.done, Посещаемость: b.attTotal ? Math.round((b.attPresent / b.attTotal) * 100) : null,
    }))
  }, [own, ownAtt, attendance])

  if (!t) return null

  function exportOne() {
    const rows = own.map((l) => ({
      Дата: l.lesson_date, Уроков: lessonCount(l), Группа: nameOf(dict.groups, l.group_id),
      Ассистент: assistantNames(l, dict), Тема: l.topic, Учеников: l.students, Статус: l.status, План: l.plan_path ? 'есть' : 'нет',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Уроки')
    XLSX.writeFile(wb, `${t.full_name.replace(' ', '_')}_${periodLabel.replace(' ', '_')}.xlsx`)
  }

  return (
    <>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, marginBottom: 16, border: 'none', background: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} /> Все преподаватели
      </button>

      <div style={{ background: `linear-gradient(135deg,${C.brand},${C.brand2})`, borderRadius: 18, padding: 22, color: '#fff', marginBottom: 16 }}>
        <div className="rowflex" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>{initials(t.full_name)}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>{t.full_name}</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>{t.subjectsText}{t.office ? ` · ${t.office}` : ''}{t.phone ? ` · ${t.phone}` : ''}</div>
          </div>
          <button onClick={() => setEditing('new')} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: '#fff', color: C.brand, borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Создать урок</button>
          <button onClick={exportOne} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: 'rgba(255,255,255,.2)', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={16} /> Excel
          </button>
        </div>
        <div className="rowflex" style={{ gap: 22, marginTop: 20, flexWrap: 'wrap' }}>
          <BigNum value={t.sessions} label="занятий" />
          <BigNum value={t.units} label="уроков" />
          <BigNum value={t.planPct != null ? `${t.planPct}%` : '—'} label="выполнение плана" />
          <BigNum value={t.attPct != null ? `${t.attPct}%` : '—'} label="посещаемость" />
          <BigNum value={t.noPlan} label="без плана" warn={t.noPlan > 0} />
          <BigNum value={t.cancelled} label="отменено" warn={t.cancelled > 0} />
        </div>
      </div>

      {trend.length > 1 && (
        <>
          <SectionLabel>Динамика</SectionLabel>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line yAxisId="l" type="monotone" dataKey="Занятий" stroke={C.brand} strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="r" type="monotone" dataKey="Посещаемость" stroke={C.teal} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {byGroup.length > 0 && (
        <>
          <SectionLabel>Группы преподавателя</SectionLabel>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
            {byGroup.map((g, i) => (
              <div key={g.gid} onClick={() => onOpenGroup(g.gid)} className="rowflex"
                style={{ justifyContent: 'space-between', padding: '12px 16px', borderTop: i ? `1px solid ${C.line}` : 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}><Users size={13} style={{ verticalAlign: -2, marginRight: 5, color: C.slate }} />{g.name}</span>
                <span style={{ fontSize: 13, color: C.slate }}><b style={{ color: C.brand }}>{g.units}</b> ур. · {g.count} зан.</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Все занятия</SectionLabel>
      <LessonTable lessons={own} dict={dict} onEdit={(l) => setEditing(l)} />

      {editing && (
        <LessonForm teacherId={t.id} lesson={editing === 'new' ? null : editing} dict={dict}
          onClose={() => setEditing(null)} onSaved={(l) => { setEditing(null); onLessonChanged(l) }} onDeleted={(id) => { setEditing(null); onLessonDeleted(id) }} />
      )}
    </>
  )
}

// ================= ДЕТАЛИ ГРУППЫ =================
function GroupDetail({ g, dict, lessons, attendance, groupLinksByGroup, studentsById, onBack, onOpenStudent }) {
  if (!g) return null
  const own = lessons.filter((l) => l.group_id === g.id)
  const ownIds = new Set(own.map((l) => l.id))

  const roster = useMemo(() => {
    const studentIds = groupLinksByGroup[g.id] || []
    const attByStudent = {}
    ;(attendance?.rows || []).forEach((r) => {
      if (!ownIds.has(r.lesson_id)) return
      const s = (attByStudent[r.student_id] ||= { total: 0, present: 0, lastDate: null })
      s.total++; if (r.present) s.present++
      const lesson = attendance.lessonsById[r.lesson_id]
      if (lesson && (!s.lastDate || lesson.lesson_date > s.lastDate) && r.present) s.lastDate = lesson.lesson_date
    })
    return studentIds.map((sid) => {
      const student = studentsById[sid]
      const a = attByStudent[sid]
      const pct = a && a.total ? Math.round((a.present / a.total) * 100) : null
      return { id: sid, full_name: student?.full_name || '—', total: a?.total || 0, absent: a ? a.total - a.present : 0, pct, lastDate: a?.lastDate || null, status: groupStatus(pct) }
    }).sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))
  }, [g.id, groupLinksByGroup, attendance, studentsById, ownIds])

  return (
    <div>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={15} /> Все группы
      </button>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800 }}>{g.name}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: C.slate }}>{g.office || '—'}{g.teachersText ? ` · ${g.teachersText}` : ''}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 22 }}>
        <Kpi label="Учеников" value={g.studentsCount} />
        <Kpi label="Занятий" value={g.sessions} />
        <Kpi label="Посещаемость" value={g.attPct != null ? `${g.attPct}%` : '—'} />
        <Kpi label="Выполнение плана" value={g.planPct != null ? `${g.planPct}%` : '—'} />
        <Kpi label="Без плана" value={g.noPlan} tint={g.noPlan > 0 ? '#d97706' : undefined} />
        <Kpi label="Отменено" value={g.cancelled} tint={g.cancelled > 0 ? '#dc2626' : undefined} />
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

// ================= ПРОФИЛЬ КУРАТОРА =================
// Занятия куратора индивидуальные (без групп, со списком учеников на каждом).
// Посещаемость по ним не отмечается — это существующая бизнес-логика, не меняем.
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
  const noTopicCount = (lessons || []).filter((l) => !l.topic).length
  const uniqueStudents = new Set((lessons || []).flatMap((l) => (l.student_names || '').split(',').map((s) => s.trim()).filter(Boolean))).size

  async function remove(id) {
    if (!confirm('Удалить это занятие?')) return
    try { await deleteCuratorLesson(id); await reload() } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, marginBottom: 16, border: 'none', background: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} /> Все кураторы
      </button>

      <div style={{ background: `linear-gradient(135deg,${C.brand},${C.brand2})`, borderRadius: 18, padding: 22, color: '#fff', marginBottom: 16 }}>
        <div className="rowflex" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>{initials(c.full_name)}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>{c.full_name}</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>куратор{c.subject ? ` · ${c.subject}` : ''}{c.phone ? ` · ${c.phone}` : ''}</div>
          </div>
        </div>
        <div className="rowflex" style={{ gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
          <BigNum value={units} label="уроков всего" />
          <BigNum value={(lessons || []).length} label="занятий" />
          <BigNum value={uniqueStudents} label="учеников" />
          <BigNum value={noTopicCount} label="без темы" warn={noTopicCount > 0} />
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

function BigNum({ value, label, warn }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: warn ? '#ffd7b0' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 5 }}>{label}</div>
    </div>
  )
}
