import React, { useEffect, useState } from 'react'
import { Clock, CheckCircle2, FileText, Plus, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { C, lessonCount, nameOf } from '../lib/utils'
import { Stat } from '../components/ui'
import PeriodPicker from '../components/PeriodPicker'
import LessonTable from '../components/LessonTable'
import LessonForm from '../components/LessonForm'
import { fetchMyGroupsAndSubjects, fetchAttendanceForLessons } from '../lib/api'

export default function TeacherCabinet({ teacher, dict, lessons, period, setPeriod, onLessonAdded, onLessonChanged, onLessonDeleted }) {
  const [editing, setEditing] = useState(null) // 'new' | lesson | null
  const [myLinks, setMyLinks] = useState(null) // { groups, subjects } — закреплённые за преподавателем
  const [attendance, setAttendance] = useState([]) // [{ lesson_id, present }] по своим проведённым урокам за период

  useEffect(() => {
    fetchMyGroupsAndSubjects(teacher.id)
      .then(setMyLinks)
      .catch(() => setMyLinks({ groups: [], subjects: [] }))
  }, [teacher.id])

  // Для формы урока: если у преподавателя есть закреплённые группы — показываем только их,
  // иначе (пока не настроено) — все группы, чтобы не блокировать работу.
  const formDict = {
    ...dict,
    groups: myLinks?.groups?.length ? myLinks.groups : dict.groups,
    subjects: myLinks?.subjects?.length ? myLinks.subjects : dict.subjects,
  }

  const own = lessons.filter((l) => l.teacher_id === teacher.id)
  const done = own.filter((l) => l.status === 'проведён')
  const myHours = done.reduce((s, l) => s + lessonCount(l), 0)

  // «Журнал» — это история и ручное редактирование уже состоявшихся
  // занятий (статус 'проведён'/'отменён'). Занятия из расписания со
  // статусом 'planned' ЕЩЁ НЕ проведены — их открывают и заполняют
  // (тема/посещаемость) через «Мои занятия», а не здесь: форма
  // редактирования Журнала вообще не поддерживает статус 'planned'
  // (её выбор статуса — только «Проведён»/«Отменён»), поэтому для
  // такого занятия блок посещаемости просто не показывался — это и
  // был баг «нет списка учеников» (не путать с настоящей пустой
  // группой или ошибкой RLS, которые тоже были исправлены отдельно).
  const journalLessons = own.filter((l) => l.status !== 'planned')

  // Посещаемость по группам за текущий период (п.65 ТЗ) — считаем из
  // тех же attendance-записей, что уже видны преподавателю по RLS
  // (свои уроки), без отдельной новой RPC.
  const doneIds = done.map((l) => l.id).sort().join(',')
  useEffect(() => {
    if (!done.length) { setAttendance([]); return }
    let stop = false
    fetchAttendanceForLessons(done.map((l) => l.id)).then((a) => { if (!stop) setAttendance(a) }).catch(() => {})
    return () => { stop = true }
  }, [doneIds])

  const attendanceByGroup = (() => {
    const byLesson = {}
    attendance.forEach((a) => { (byLesson[a.lesson_id] ||= []).push(a) })
    const byGroup = {}
    done.forEach((l) => {
      const recs = byLesson[l.id] || []
      if (!recs.length) return
      const g = (byGroup[l.group_id] ||= { total: 0, present: 0 })
      g.total += recs.length
      g.present += recs.filter((r) => r.present).length
    })
    return Object.entries(byGroup).map(([groupId, v]) => ({
      groupId, name: (dict.groups || []).find((g) => g.id === groupId)?.name || '—',
      pct: v.total ? Math.round((v.present / v.total) * 100) : null,
    })).filter((g) => g.pct != null).sort((a, b) => b.pct - a.pct)
  })()

  function exportXlsx() {
    const groupOf = (id) => (dict.groups || []).find((g) => g.id === id)
    const rows = [...journalLessons].sort((a, b) => b.lesson_date.localeCompare(a.lesson_date)).map((l) => {
      const g = groupOf(l.group_id)
      return {
        Дата: l.lesson_date, Группа: g?.name || '', Предмет: (g?.subject_name || '').split(' / ')[0],
        Учеников: l.students, Уроков: lessonCount(l),
        Ассистент: l.assistant_id ? nameOf(dict.assistants, l.assistant_id) : '',
        Статус: l.status, План: l.plan_path ? 'есть' : 'нет', Тема: l.topic || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Журнал')
    XLSX.writeFile(wb, `Журнал_${teacher.full_name}.xlsx`)
  }

  return (
    <>
      <div className="rowflex" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{teacher.full_name}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Мой журнал уроков</p>
        </div>
        <div className="rowflex" style={{ marginLeft: 'auto', gap: 10 }}>
          <PeriodPicker period={period} setPeriod={setPeriod} />
          <button onClick={exportXlsx} disabled={!journalLessons.length} className="rowflex"
            style={{ gap: 6, padding: '10px 14px', background: '#fff', color: journalLessons.length ? C.slate : C.faint, border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: journalLessons.length ? 'pointer' : 'default' }}>
            <Download size={15} /> Excel
          </button>
          <button onClick={() => setEditing('new')} className="rowflex" style={{ gap: 7, padding: '10px 17px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Plus size={17} /> Добавить урок
          </button>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 28 }}>
        <Stat icon={Clock} label="Мои уроки" value={myHours} tint={C.brand} bg={C.brandSoft} />
        <Stat icon={CheckCircle2} label="Проведено" value={done.length} tint={C.ok} bg={C.okSoft} />
        <Stat icon={FileText} label="Без плана" value={done.filter((l) => !l.plan_path).length} tint={C.warn} bg={C.warnSoft} />
      </div>

      {attendanceByGroup.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Посещаемость по группам</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attendanceByGroup.map((g) => (
              <div key={g.groupId} className="rowflex" style={{ gap: 10 }}>
                <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>{g.name}</span>
                <div style={{ width: 120, height: 6, background: C.grey, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${g.pct}%`, height: '100%', background: g.pct >= 85 ? C.ok : g.pct >= 70 ? C.warn : '#dc2626' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, width: 42, textAlign: 'right' }}>{g.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Мои уроки</h2>
      {own.length > journalLessons.length && (
        <p style={{ margin: '-8px 0 12px', fontSize: 12.5, color: C.slate }}>
          Ещё не проведённые занятия из расписания здесь не показываются — их нужно провести во вкладке «Мои занятия».
        </p>
      )}
      <LessonTable lessons={journalLessons} dict={dict} onEdit={(l) => setEditing(l)} />

      {editing && (
        <LessonForm
          teacherId={teacher.id}
          lesson={editing === 'new' ? null : editing}
          dict={formDict}
          onClose={() => setEditing(null)}
          onSaved={(l) => { setEditing(null); editing === 'new' ? onLessonAdded(l) : onLessonChanged(l) }}
          onDeleted={(id) => { setEditing(null); onLessonDeleted(id) }}
        />
      )}
    </>
  )
}
