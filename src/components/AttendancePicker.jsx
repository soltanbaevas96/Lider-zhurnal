import React, { useEffect, useState } from 'react'
import { Check, X as XIcon, Clock, Wifi, RotateCcw } from 'lucide-react'
import { fetchStudentsOfGroup, fetchAttendance } from '../lib/api'
import { C } from '../lib/utils'

// 5 статусов посещаемости (единые для всей системы)
export const ST = [
  { k: 'present', t: 'Был',       icon: Check,     color: C.ok,      bg: C.okSoft },
  { k: 'absent',  t: 'Не был',    icon: XIcon,     color: '#dc2626', bg: '#fee2e2' },
  { k: 'late',    t: 'Опоздал',   icon: Clock,     color: '#d97706', bg: '#fef3c7' },
  { k: 'online',  t: 'Онлайн',    icon: Wifi,      color: '#0d9488', bg: '#ccfbf1' },
  { k: 'makeup',  t: 'Отработка', icon: RotateCcw, color: '#7c3aed', bg: '#f3e8ff' },
]

// Причины пропуска
export const REASONS = [
  { k: 'illness',   t: 'Болезнь' },
  { k: 'school',    t: 'Школа' },
  { k: 'olympiad',  t: 'Олимпиада' },
  { k: 'vacation',  t: 'Каникулы' },
  { k: 'no_reason', t: 'Без причины' },
  { k: 'other',     t: 'Другое' },
]

export const reasonLabel = (k) => REASONS.find((r) => r.k === k)?.t || k
export const statusLabel = (k) => ST.find((s) => s.k === k)?.t || k

export default function AttendancePicker({ groupId, lessonId, hasTest, onChange }) {
  const [students, setStudents] = useState(null)
  const [marks, setMarks] = useState({})
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!groupId) { setStudents(null); return }
    let cancelled = false
    setErr('')
    ;(async () => {
      try {
        const list = await fetchStudentsOfGroup(groupId)
        if (cancelled) return
        setStudents(list)

        const init = {}
        list.forEach((s) => { init[s.id] = { status: 'present', reason: null, score: '' } })

        if (lessonId) {
          const saved = await fetchAttendance(lessonId).catch(() => [])
          saved.forEach((r) => {
            init[r.student_id] = {
              status: r.status || (r.present ? 'present' : 'absent'),
              reason: r.absence_reason || null,
              score: r.score ?? '',
            }
          })
        }
        if (!cancelled) setMarks(init)
      } catch (e) {
        if (!cancelled) setErr(e.message)
      }
    })()
    return () => { cancelled = true }
  }, [groupId, lessonId])

  useEffect(() => {
    if (!students) return
    onChange(students.map((s) => {
      const m = marks[s.id] || { status: 'present' }
      return {
        student_id: s.id,
        status: m.status,
        present: m.status !== 'absent',
        absence_reason: m.status === 'absent' ? (m.reason || null) : null,
        score: hasTest && m.score !== '' ? Number(m.score) : null,
      }
    }))
  }, [marks, students, hasTest])

  const setStatus = (id, status) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], status, reason: status === 'absent' ? p[id]?.reason : null } }))
  const setReason = (id, reason) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], reason } }))
  const setScore = (id, score) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], score } }))

  if (!groupId) return null
  if (err) return <div style={{ fontSize: 13, color: '#c2360b' }}>{err}</div>
  if (students === null) return <div style={{ fontSize: 13, color: C.slate, padding: 10 }}>Загрузка учеников…</div>
  if (students.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12 }}>
        В этой группе нет учеников. Добавьте их в разделе «Управление».
      </div>
    )
  }

  const counts = ST.map((s) => ({
    ...s, n: Object.values(marks).filter((m) => m.status === s.k).length,
  })).filter((s) => s.n > 0)

  return (
    <div>
      <div className="rowflex" style={{ gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>
          Посещаемость · {students.length} чел.
        </span>
        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {counts.map((c) => (
            <span key={c.k} style={{ fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, padding: '2px 8px', borderRadius: 20 }}>
              {c.t}: {c.n}
            </span>
          ))}
        </div>
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
        {students.map((s, i) => {
          const m = marks[s.id] || { status: 'present' }
          return (
            <div key={s.id} style={{
              borderTop: i ? `1px solid ${C.line}` : 'none',
              padding: '9px 11px',
              background: m.status === 'absent' ? '#fffafa' : '#fff',
            }}>
              <div className="rowflex" style={{ gap: 9, flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 120px', fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{s.full_name}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {ST.map((x) => {
                    const on = m.status === x.k
                    const Icon = x.icon
                    return (
                      <button key={x.k} type="button" onClick={() => setStatus(s.id, x.k)} title={x.t}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 7,
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          border: on ? `1.5px solid ${x.color}` : `1px solid ${C.line}`,
                          background: on ? x.bg : '#fff', color: on ? x.color : C.faint,
                        }}>
                        <Icon size={11} /> <span className="hide-sm">{x.t}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {m.status === 'absent' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                  <span style={{ fontSize: 11, color: C.slate, alignSelf: 'center', marginRight: 2 }}>Причина:</span>
                  {REASONS.map((r) => {
                    const on = m.reason === r.k
                    return (
                      <button key={r.k} type="button" onClick={() => setReason(s.id, on ? null : r.k)}
                        style={{
                          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: on ? '1.5px solid #dc2626' : `1px solid ${C.line}`,
                          background: on ? '#fee2e2' : '#fff', color: on ? '#b91c1c' : C.slate,
                        }}>{r.t}</button>
                    )
                  })}
                </div>
              )}

              {hasTest && (
                <div className="rowflex" style={{ gap: 6, marginTop: 7 }}>
                  <span style={{ fontSize: 11, color: C.slate }}>Балл за тест:</span>
                  <input type="number" value={m.score ?? ''} onChange={(e) => setScore(s.id, e.target.value)}
                    placeholder="—" style={{ width: 64, padding: '4px 8px', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 12.5, outline: 'none' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
