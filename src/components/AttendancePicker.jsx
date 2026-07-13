import React, { useEffect, useState } from 'react'
import { Check, X as XIcon, Users } from 'lucide-react'
import { C } from '../lib/utils'
import { fetchStudentsOfGroup, fetchAttendance } from '../lib/api'

// Показывает список учеников группы с отметкой был/не был.
// По умолчанию все «были». Значение отдаётся наружу через onChange:
//   массив { student_id, present }
// Если передан lessonId — подгружает уже сохранённую посещаемость.
export default function AttendancePicker({ groupId, lessonId, onChange }) {
  const [students, setStudents] = useState(null)
  const [present, setPresent] = useState({}) // { studentId: true/false }
  const [reasons, setReasons] = useState({}) // { studentId: 'illness' | ... }
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!groupId) { setStudents([]); return }
    let cancelled = false
    setStudents(null)
    ;(async () => {
      try {
        const list = await fetchStudentsOfGroup(groupId)
        let init = {}
        list.forEach((s) => { init[s.id] = true }) // по умолчанию все были
        if (lessonId) {
          const saved = await fetchAttendance(lessonId)
          if (saved.length) {
            init = {}
            list.forEach((s) => { init[s.id] = true })
            const rs = {}
            saved.forEach((r) => {
              init[r.student_id] = r.present
              if (r.absence_reason) rs[r.student_id] = r.absence_reason
            })
            if (!cancelled) setReasons(rs)
          }
        }
        if (!cancelled) { setStudents(list); setPresent(init) }
      } catch (e) {
        if (!cancelled) setErr(e.message)
      }
    })()
    return () => { cancelled = true }
  }, [groupId, lessonId])

  // отдаём наружу при каждом изменении
  useEffect(() => {
    if (!students) return
    onChange(students.map((s) => ({
      student_id: s.id,
      present: present[s.id] !== false,
      absence_reason: present[s.id] === false ? (reasons[s.id] || null) : null,
    })))
  }, [present, students, reasons])

  const toggle = (id) => setPresent((p) => ({ ...p, [id]: p[id] === false ? true : false }))
  const setAll = (val) => {
    const next = {}
    students.forEach((s) => { next[s.id] = val })
    setPresent(next)
  }

  if (err) return <div style={{ fontSize: 13, color: C.warn }}>{err}</div>
  if (students === null) return <div style={{ fontSize: 13, color: C.slate, padding: '6px 0' }}>Загрузка учеников…</div>
  if (students.length === 0)
    return (
      <div style={{ fontSize: 13, color: C.faint, padding: '10px 12px', background: C.grey, borderRadius: 10 }}>
        В этой группе пока нет учеников. Добавьте их в разделе «Управление» → «Ученики».
      </div>
    )

  const presentCount = students.filter((s) => present[s.id] !== false).length

  return (
    <div>
      <div className="rowflex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: C.slate }}>
          <Users size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          Присутствуют {presentCount} из {students.length}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setAll(true)} style={{ fontSize: 11.5, fontWeight: 600, color: C.ok, background: C.okSoft, border: 'none', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>Все были</button>
          <button type="button" onClick={() => setAll(false)} style={{ fontSize: 11.5, fontWeight: 600, color: C.warn, background: C.warnSoft, border: 'none', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>Никто</button>
        </div>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
        {students.map((s, i) => {
          const here = present[s.id] !== false
          return (
            <div key={s.id} style={{ borderTop: i ? `1px solid ${C.line}` : 'none', background: here ? '#fff' : '#fdf6f2' }}>
              <button type="button" onClick={() => toggle(s.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: here ? C.okSoft : C.warnSoft, color: here ? C.ok : C.warn, flexShrink: 0 }}>
                  {here ? <Check size={14} /> : <XIcon size={14} />}
                </span>
                <span style={{ flex: 1, fontSize: 14, color: here ? C.ink : C.slate, textDecoration: here ? 'none' : 'line-through' }}>{s.full_name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: here ? C.ok : C.warn }}>{here ? 'был' : 'не был'}</span>
              </button>

              {/* Причина пропуска — только для отсутствующих */}
              {!here && (
                <div style={{ padding: '0 12px 10px 44px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {REASONS.map((r) => {
                    const on = reasons[s.id] === r.k
                    return (
                      <button key={r.k} type="button"
                        onClick={() => setReasons((p) => ({ ...p, [s.id]: on ? null : r.k }))}
                        style={{
                          padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                          border: on ? `1.5px solid ${r.color}` : `1px solid ${C.line}`,
                          background: on ? r.bg : '#fff',
                          color: on ? r.color : C.slate,
                        }}>
                        {r.t}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Справочник причин пропуска
export const REASONS = [
  { k: 'illness',           t: 'Болезнь',        color: '#0369a1', bg: '#e0f2fe' },
  { k: 'excused',           t: 'Уважительная',   color: '#0d9488', bg: '#ccfbf1' },
  { k: 'no_reason',         t: 'Без причины',    color: '#dc2626', bg: '#fee2e2' },
  { k: 'no_notice',         t: 'Не предупредил', color: '#c2410c', bg: '#ffedd5' },
  { k: 'schedule_conflict', t: 'Расписание',     color: '#7c3aed', bg: '#f3e8ff' },
]

export const reasonLabel = (k) => REASONS.find((r) => r.k === k)?.t || k
