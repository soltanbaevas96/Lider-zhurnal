import React, { useEffect, useState } from 'react'
import { Clock, CheckCircle2, FileText, Plus } from 'lucide-react'
import { C, hoursBetween } from '../lib/utils'
import { Stat } from '../components/ui'
import PeriodPicker from '../components/PeriodPicker'
import LessonTable from '../components/LessonTable'
import LessonForm from '../components/LessonForm'
import { fetchMyGroupsAndSubjects } from '../lib/api'

export default function TeacherCabinet({ teacher, dict, lessons, period, setPeriod, onLessonAdded, onLessonChanged, onLessonDeleted }) {
  const [editing, setEditing] = useState(null) // 'new' | lesson | null
  const [myLinks, setMyLinks] = useState(null) // { groups, subjects } — закреплённые за преподавателем

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
  const myHours = done.reduce((s, l) => s + hoursBetween(l.start_time, l.end_time), 0)

  return (
    <>
      <div className="rowflex" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{teacher.full_name}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Мой журнал уроков</p>
        </div>
        <div className="rowflex" style={{ marginLeft: 'auto', gap: 10 }}>
          <PeriodPicker period={period} setPeriod={setPeriod} />
          <button onClick={() => setEditing('new')} className="rowflex" style={{ gap: 7, padding: '10px 17px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Plus size={17} /> Добавить урок
          </button>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 28 }}>
        <Stat icon={Clock} label="Мои часы" value={myHours} tint={C.brand} bg={C.brandSoft} />
        <Stat icon={CheckCircle2} label="Проведено" value={done.length} tint={C.ok} bg={C.okSoft} />
        <Stat icon={FileText} label="Без плана" value={done.filter((l) => !l.plan_path).length} tint={C.warn} bg={C.warnSoft} />
      </div>

      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Мои уроки</h2>
      <LessonTable lessons={own} dict={dict} onEdit={(l) => setEditing(l)} />

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
