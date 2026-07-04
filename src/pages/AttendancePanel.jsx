import React, { useEffect, useState, useMemo } from 'react'
import { Users, User, TrendingDown } from 'lucide-react'
import { C, nameOf } from '../lib/utils'
import { MiniStat } from '../components/ui'
import { fetchAttendanceReport, fetchStudentsWithGroups } from '../lib/api'

// Цвет по проценту посещаемости
function pctColor(pct) {
  if (pct >= 85) return C.ok
  if (pct >= 65) return C.warn
  return '#dc2626'
}
function pctBg(pct) {
  if (pct >= 85) return C.okSoft
  if (pct >= 65) return C.warnSoft
  return '#fdecec'
}

export default function AttendancePanel({ dict, periodRange, periodLabel }) {
  const [view, setView] = useState('groups') // groups | students
  const [data, setData] = useState(null)
  const [students, setStudents] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true); setErr('')
    Promise.all([fetchAttendanceReport(periodRange), fetchStudentsWithGroups()])
      .then(([rep, studs]) => { setData(rep); setStudents(studs) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [periodRange])

  // Свод по ученикам: сколько отмечено, сколько присутствий
  const byStudent = useMemo(() => {
    if (!data) return []
    const m = {}
    data.rows.forEach((r) => {
      const s = (m[r.student_id] ||= { total: 0, present: 0 })
      s.total++
      if (r.present) s.present++
    })
    return students.map((s) => {
      const st = m[s.id] || { total: 0, present: 0 }
      const pct = st.total ? Math.round((st.present / st.total) * 100) : null
      return { ...s, total: st.total, present: st.present, pct }
    }).filter((s) => s.total > 0)
      .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100)) // худшие сверху
  }, [data, students])

  // Свод по группам
  const byGroup = useMemo(() => {
    if (!data) return []
    const m = {}
    data.rows.forEach((r) => {
      const lesson = data.lessonsById[r.lesson_id]
      if (!lesson) return
      const g = (m[lesson.group_id] ||= { total: 0, present: 0 })
      g.total++
      if (r.present) g.present++
    })
    return (dict.groups || []).map((g) => {
      const st = m[g.id] || { total: 0, present: 0 }
      const pct = st.total ? Math.round((st.present / st.total) * 100) : null
      return { id: g.id, name: g.name, total: st.total, present: st.present, pct }
    }).filter((g) => g.total > 0)
      .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))
  }, [data, dict.groups])

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.slate }}>Загрузка посещаемости…</div>
  if (err) return <div style={{ background: '#fde8e8', color: '#c2360b', padding: 14, borderRadius: 12, fontSize: 14 }}>{err}</div>

  const empty = byGroup.length === 0 && byStudent.length === 0

  return (
    <>
      <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3, marginBottom: 16, width: 'fit-content' }}>
        {[{ k: 'groups', t: 'По группам', icon: Users }, { k: 'students', t: 'По ученикам', icon: User }].map((o) => {
          const a = view === o.k
          const Icon = o.icon
          return <button key={o.k} onClick={() => setView(o.k)} className="rowflex"
            style={{ gap: 6, padding: '8px 15px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: a ? C.card : 'transparent', color: a ? C.brand : C.slate, boxShadow: a ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>
            <Icon size={15} /> {o.t}</button>
        })}
      </div>

      {empty ? (
        <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.slate, fontSize: 14 }}>
          За период «{periodLabel}» посещаемость не отмечалась.
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 8 }}>
            Посещаемость появляется здесь после того, как преподаватели отметят её на проведённых уроках.
          </div>
        </div>
      ) : view === 'groups' ? (
        <div className="tgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {byGroup.map((g) => (
            <div key={g.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
              <div className="rowflex" style={{ marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: C.brandSoft, color: C.brand, display: 'grid', placeItems: 'center' }}><Users size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{g.name}</div>
                  <div style={{ fontSize: 12.5, color: C.slate }}>{g.present} из {g.total} посещений</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: pctColor(g.pct) }}>{g.pct}%</div>
              </div>
              <div style={{ height: 8, background: C.grey, borderRadius: 4 }}>
                <div style={{ width: `${g.pct}%`, height: '100%', background: pctColor(g.pct), borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          {byStudent.map((s, i) => (
            <div key={s.id} className="rowflex" style={{ gap: 14, padding: '13px 16px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.full_name}</div>
                <div style={{ fontSize: 12, color: C.slate }}>{s.present} из {s.total} занятий</div>
              </div>
              <div style={{ width: 90, height: 6, background: C.grey, borderRadius: 3 }}>
                <div style={{ width: `${s.pct}%`, height: '100%', background: pctColor(s.pct), borderRadius: 3 }} />
              </div>
              <span style={{ minWidth: 52, textAlign: 'right', fontWeight: 800, fontSize: 15, color: pctColor(s.pct) }}>{s.pct}%</span>
            </div>
          ))}
        </div>
      )}

      {!empty && view === 'students' && (
        <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
          <TrendingDown size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          Ученики отсортированы — вверху те, кто ходит хуже всего. Зелёный ≥85%, оранжевый 65–85%, красный ниже 65%.
        </p>
      )}
    </>
  )
}
