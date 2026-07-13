import React, { useEffect, useMemo, useState } from 'react'
import { Users, GraduationCap, Download, CalendarDays, TrendingDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchTimesheetData } from '../lib/api'
import { C, nameOf, lessonCount, subjectOf, fmtDate, periodRange, periodLabelOf } from '../lib/utils'
import PeriodPicker from '../components/PeriodPicker'

export default function Timesheets({ dict, onOpenStudent }) {
  const [tab, setTab] = useState('teachers') // teachers | students
  const [period, setPeriod] = useState({ mode: 'month', month: new Date().toISOString().slice(0, 7) })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => periodRange(period), [period])
  const label = periodLabelOf(period)

  useEffect(() => {
    setLoading(true)
    fetchTimesheetData(range)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [range])

  // Только проведённые занятия
  const doneLessons = useMemo(
    () => (data?.lessons || []).filter((l) => l.status === 'проведён'),
    [data]
  )

  // ---------- ТАБЕЛЬ ПРЕПОДАВАТЕЛЕЙ ----------
  const teacherRows = useMemo(() => {
    return dict.teachers.map((t) => {
      const mine = doneLessons.filter((l) => l.teacher_id === t.id)
      const lessonsSum = mine.reduce((s, l) => s + lessonCount(l), 0) // уроки с учётом 2/3
      const sessions = mine.length // занятий
      const groups = new Set(mine.map((l) => l.group_id)).size
      const noPlan = mine.filter((l) => !l.plan_path).length
      return { id: t.id, name: t.full_name, lessonsSum, sessions, groups, noPlan }
    }).filter((r) => r.sessions > 0)
      .sort((a, b) => b.lessonsSum - a.lessonsSum)
  }, [dict.teachers, doneLessons])

  const teacherTotal = teacherRows.reduce((s, r) => s + r.lessonsSum, 0)

  // ---------- СВОДНАЯ ПО УЧЕНИКАМ ----------
  // По каждому ученику и предмету: занятий было / посетил / пропустил + дни
  const studentRows = useMemo(() => {
    if (!data) return []
    const attByLesson = {}
    data.attendance.forEach((a) => {
      (attByLesson[a.lesson_id] ||= {})[a.student_id] = a.present
    })
    // группа -> предмет
    const subjectByGroup = {}
    dict.groups.forEach((g) => { subjectByGroup[g.id] = subjectOf(g.note) || '—' })
    // ученик -> его группы
    const groupsByStudent = {}
    data.studentGroups.forEach((sg) => { (groupsByStudent[sg.student_id] ||= new Set()).add(sg.group_id) })

    const nameById = {}
    dict.students?.forEach?.((s) => { nameById[s.id] = s.full_name })

    // для каждого ученика собираем по предметам
    const result = []
    ;(dict.students || []).forEach((st) => {
      const myGroups = groupsByStudent[st.id] || new Set()
      if (!myGroups.size) return
      // занятия его групп
      const myLessons = doneLessons.filter((l) => myGroups.has(l.group_id))
      if (!myLessons.length) return

      // группируем по предмету
      const bySubject = {}
      myLessons.forEach((l) => {
        const subj = subjectByGroup[l.group_id] || '—'
        const b = (bySubject[subj] ||= { total: 0, present: 0, absent: 0, days: [] })
        b.total++
        const present = attByLesson[l.id]?.[st.id]
        // present === undefined -> отметки не было, считаем присутствовал (по умолчанию все présents)
        const wasPresent = present !== false
        if (wasPresent) b.present++
        else { b.absent++; b.days.push(fmtDate(l.lesson_date)) }
      })

      const subjects = Object.entries(bySubject).map(([subj, v]) => ({ subject: subj, ...v }))
        .sort((a, b) => a.subject.localeCompare(b.subject))
      const total = subjects.reduce((s, x) => s + x.total, 0)
      const present = subjects.reduce((s, x) => s + x.present, 0)
      const absent = subjects.reduce((s, x) => s + x.absent, 0)

      result.push({ id: st.id, name: st.full_name, total, present, absent, subjects })
    })
    return result.sort((a, b) => b.absent - a.absent) // больше пропусков — выше
  }, [data, dict.groups, dict.students, doneLessons])

  // ---------- ЭКСПОРТ ----------
  function exportTeachers() {
    const rows = teacherRows.map((r, i) => ({
      '№': i + 1,
      'Преподаватель': r.name,
      'Уроков (для оплаты)': r.lessonsSum,
      'Занятий': r.sessions,
      'Групп': r.groups,
      'Без плана': r.noPlan,
    }))
    rows.push({ '№': '', 'Преподаватель': 'ИТОГО', 'Уроков (для оплаты)': teacherTotal, 'Занятий': teacherRows.reduce((s, r) => s + r.sessions, 0), 'Групп': '', 'Без плана': '' })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Табель преподавателей')
    XLSX.writeFile(wb, `Табель_преподавателей_${label.replace(/\s/g, '_')}.xlsx`)
  }

  function exportStudents() {
    // Общий лист
    const general = studentRows.map((r, i) => ({
      '№': i + 1, 'Ученик': r.name,
      'Занятий было': r.total, 'Посетил': r.present, 'Пропустил': r.absent,
      'Явка %': r.total ? Math.round((r.present / r.total) * 100) : 0,
    }))
    // Детальный лист по предметам
    const detailed = []
    studentRows.forEach((r) => {
      r.subjects.forEach((s) => {
        detailed.push({
          'Ученик': r.name, 'Предмет': s.subject,
          'Занятий было': s.total, 'Посетил': s.present, 'Пропустил': s.absent,
          'Явка %': s.total ? Math.round((s.present / s.total) * 100) : 0,
          'Дни пропусков': s.days.join(', '),
        })
      })
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(general), 'Общий свод')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailed), 'По предметам')
    XLSX.writeFile(wb, `Сводная_ученики_${label.replace(/\s/g, '_')}.xlsx`)
  }

  return (
    <div>
      {/* Шапка с периодом */}
      <div className="rowflex" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Табели</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.slate }}>{label} · для зарплаты и аналитики посещаемости</p>
        </div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <button onClick={tab === 'teachers' ? exportTeachers : exportStudents} className="rowflex"
          style={{ gap: 7, padding: '9px 15px', background: C.ok, color: '#fff', borderRadius: 11, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={16} /> Excel
        </button>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[{ k: 'teachers', t: 'Преподаватели', icon: GraduationCap }, { k: 'students', t: 'Ученики', icon: Users }].map((x) => {
          const a = tab === x.k
          const Icon = x.icon
          return (
            <button key={x.k} onClick={() => setTab(x.k)} className="rowflex"
              style={{ gap: 7, padding: '10px 18px', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                border: a ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                background: a ? C.brand : '#fff', color: a ? '#fff' : C.slate }}>
              <Icon size={16} /> {x.t}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : tab === 'teachers' ? (
        <TeacherTimesheet rows={teacherRows} total={teacherTotal} />
      ) : (
        <StudentTimesheet rows={studentRows} onOpenStudent={onOpenStudent} />
      )}
    </div>
  )
}

// ---------- ТАБЕЛЬ ПРЕПОДАВАТЕЛЕЙ ----------
function TeacherTimesheet({ rows, total }) {
  if (!rows.length) return <Empty text="За этот период нет проведённых занятий." />
  return (
    <>
      <div style={{ background: C.brandSoft, border: `1px solid ${C.brand}22`, borderRadius: 14, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: C.brand }}>{total}</span>
        <span style={{ fontSize: 14, color: C.slate }}>уроков всего за период (для начисления зарплаты)</span>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div className="rowflex" style={{ padding: '10px 16px', background: C.grey, fontSize: 12, fontWeight: 700, color: C.slate }}>
          <span style={{ flex: 1 }}>Преподаватель</span>
          <span style={{ width: 70, textAlign: 'right' }}>Уроков</span>
          <span style={{ width: 70, textAlign: 'right' }}>Занятий</span>
          <span style={{ width: 60, textAlign: 'right' }}>Групп</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className="rowflex" style={{ padding: '12px 16px', borderTop: `1px solid ${C.line}` }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.name}</span>
            <span style={{ width: 70, textAlign: 'right', fontSize: 15, fontWeight: 800, color: C.brand }}>{r.lessonsSum}</span>
            <span style={{ width: 70, textAlign: 'right', fontSize: 14, color: C.slate }}>{r.sessions}</span>
            <span style={{ width: 60, textAlign: 'right', fontSize: 14, color: C.slate }}>{r.groups}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
        «Уроков» — сумма с учётом того, что одно занятие = 2 или 3 урока. Именно это число идёт в расчёт зарплаты. «Занятий» — количество проведённых занятий.
      </p>
    </>
  )
}

// ---------- СВОДНАЯ ПО УЧЕНИКАМ ----------
function StudentTimesheet({ rows, onOpenStudent }) {
  const [open, setOpen] = useState(null)
  if (!rows.length) return <Empty text="За этот период нет данных по ученикам." />
  const pctColor = (p) => p >= 85 ? C.ok : p >= 65 ? '#d97706' : '#dc2626'
  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const pct = r.total ? Math.round((r.present / r.total) * 100) : 0
          const isOpen = open === r.id
          return (
            <div key={r.id} style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div onClick={() => setOpen(isOpen ? null : r.id)} className="rowflex"
                style={{ padding: '12px 16px', cursor: 'pointer', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={(e) => { if (onOpenStudent) { e.stopPropagation(); onOpenStudent(r.id) } }} style={{ fontSize: 14, fontWeight: 600, color: onOpenStudent ? C.brand : C.ink, cursor: onOpenStudent ? "pointer" : "default" }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>
                    было {r.total} · посетил {r.present} · пропустил {r.absent}
                  </div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: pctColor(pct) }}>{pct}%</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.subjects.map((s, si) => {
                    const sp = s.total ? Math.round((s.present / s.total) * 100) : 0
                    return (
                      <div key={si} style={{ background: C.grey, borderRadius: 10, padding: '10px 12px' }}>
                        <div className="rowflex" style={{ gap: 10 }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{s.subject}</span>
                          <span style={{ fontSize: 12, color: C.slate }}>было {s.total} · посетил {s.present} · пропустил {s.absent}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: pctColor(sp), minWidth: 42, textAlign: 'right' }}>{sp}%</span>
                        </div>
                        {s.days.length > 0 && (
                          <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 5 }}>
                            Пропуски: {s.days.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
        <TrendingDown size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
        Вверху — ученики с наибольшим числом пропусков. Нажмите на ученика, чтобы увидеть разбивку по предметам и дни пропусков.
      </p>
    </>
  )
}

function Empty({ text }) {
  return (
    <div style={{ padding: 50, textAlign: 'center', color: C.faint, fontSize: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <CalendarDays size={30} style={{ marginBottom: 10, opacity: 0.5 }} /><br />{text}
    </div>
  )
}
