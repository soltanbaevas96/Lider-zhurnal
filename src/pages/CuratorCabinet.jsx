import React, { useEffect, useState } from 'react'
import { Plus, Search, X, Check, Trash2, Calendar, BookOpen, Users } from 'lucide-react'
import {
  getMyCuratorId, createCuratorLesson, getCuratorLessons, deleteCuratorLesson, fetchAllStudents,
} from '../lib/api'
import { C, fmtDate, initials, avColorByIndex } from '../lib/utils'

// Кабинет куратора: индивидуальные доп.занятия с отдельными учениками.
export default function CuratorCabinet({ curator }) {
  const [curatorId, setCuratorId] = useState(curator?.id || null)
  const [lessons, setLessons] = useState(null)
  const [modal, setModal] = useState(false)
  const [err, setErr] = useState('')

  async function reload(cid) {
    try {
      const id = cid || curatorId || await getMyCuratorId()
      if (!curatorId) setCuratorId(id)
      if (!id) { setErr('Профиль куратора не найден'); return }
      // текущий месяц
      const now = new Date()
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`
      setLessons(await getCuratorLessons(id, from, to))
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  const totalLessons = (lessons || []).reduce((s, l) => s + (l.lessons_count || 0), 0)

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Мои занятия</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Индивидуальные занятия с учениками · {curator?.subject || 'куратор'}</p>
        </div>
        <button onClick={() => setModal(true)} className="rowflex"
          style={{ gap: 7, padding: '10px 18px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={17} /> Провести занятие
        </button>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div style={{ background: C.brandSoft, border: `1px solid ${C.brand}22`, borderRadius: 14, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: C.brand }}>{totalLessons}</span>
        <span style={{ fontSize: 14, color: C.slate }}>уроков за месяц (для зарплаты)</span>
      </div>

      {lessons === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : lessons.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <BookOpen size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Занятий пока нет</div>
          <div style={{ fontSize: 13, color: C.slate, marginTop: 4 }}>Нажмите «Провести занятие»</div>
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
                <button onClick={async () => { if (confirm('Удалить это занятие?')) { await deleteCuratorLesson(l.id); reload() } }}
                  style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }} title="Удалить"><Trash2 size={14} /></button>
              </div>
              {l.topic && <div style={{ fontSize: 13.5, marginBottom: 3 }}>{l.topic}</div>}
              <div style={{ fontSize: 12.5, color: C.slate }}>{l.student_names || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <LessonModal curatorId={curatorId} onClose={() => setModal(false)}
          onDone={() => { setModal(false); reload() }} />
      )}
    </div>
  )
}

function LessonModal({ curatorId, onClose, onDone }) {
  const [allStudents, setAllStudents] = useState([])
  const [selected, setSelected] = useState([]) // student objects
  const [q, setQ] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lessonsCount, setLessonsCount] = useState('2')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { fetchAllStudents().then(setAllStudents).catch(() => {}) }, [])

  const found = q.trim().length >= 2
    ? allStudents.filter((s) => (s.full_name || '').toLowerCase().includes(q.toLowerCase()) && !selected.find((x) => x.id === s.id)).slice(0, 8)
    : []

  async function save() {
    if (!selected.length) { setErr('Выберите хотя бы одного ученика'); return }
    setBusy(true); setErr('')
    try {
      await createCuratorLesson(curatorId, date, lessonsCount, topic, selected.map((s) => s.id))
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 480, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Провести занятие</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 5 }}>Дата</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
          </div>
          <div style={{ width: 140 }}>
            <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 5 }}>Кол-во уроков</div>
            <select value={lessonsCount} onChange={(e) => setLessonsCount(e.target.value)} style={inp}>
              <option value="1">1 урок</option>
              <option value="2">2 урока (1ч20м)</option>
              <option value="3">3 урока (2ч)</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 5 }}>Тема занятия</div>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="напр. Разбор пробного теста" style={inp} />
        </div>

        {/* выбранные ученики */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 5 }}>Ученики ({selected.length})</div>
          {selected.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {selected.map((s) => (
                <span key={s.id} className="rowflex" style={{ gap: 5, background: C.brandSoft, color: C.brand, borderRadius: 20, padding: '4px 10px', fontSize: 12.5, fontWeight: 600 }}>
                  {s.full_name}
                  <button onClick={() => setSelected((a) => a.filter((x) => x.id !== s.id))} style={{ border: 'none', background: 'none', color: C.brand, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск ученика по имени…" style={{ ...inp, paddingLeft: 38 }} />
          </div>
          {found.length > 0 && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
              {found.map((s) => (
                <div key={s.id} onClick={() => { setSelected((a) => [...a, s]); setQ('') }}
                  className="rowflex" style={{ gap: 10, padding: '9px 12px', cursor: 'pointer', borderTop: `1px solid ${C.line}` }}>
                  <div className="av" style={{ width: 26, height: 26, fontSize: 11, background: avColorByIndex(0) }}>{initials(s.full_name)}</div>
                  <span style={{ fontSize: 13.5 }}>{s.full_name}</span>
                  {s.office && <span style={{ fontSize: 11.5, color: C.faint, marginLeft: 'auto' }}>{s.office}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}

        <button onClick={save} disabled={busy || !selected.length} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: 12, gap: 7, background: selected.length && !busy ? C.brand : C.line, color: selected.length && !busy ? '#fff' : C.slate, borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: selected.length && !busy ? 'pointer' : 'default' }}>
          <Check size={17} /> {busy ? 'Сохранение…' : 'Провести занятие'}
        </button>
      </div>
    </div>
  )
}

const inp = { width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }
