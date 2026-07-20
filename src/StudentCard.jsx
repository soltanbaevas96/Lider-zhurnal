import React, { useEffect, useState } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Check, X, Clock, Wifi, RotateCcw, ArrowLeft, Ban,
} from 'lucide-react'
import { fetchMyLessons, fetchStudentsOfGroup, fetchAttendance, conductLesson, cancelLesson } from '../lib/api'
import { C } from '../lib/utils'

// 5 статусов посещаемости по ТЗ
export const ST = [
  { k: 'present', t: 'Был',      icon: Check,     color: C.ok,      bg: C.okSoft },
  { k: 'absent',  t: 'Не был',   icon: X,         color: '#dc2626', bg: '#fee2e2' },
  { k: 'late',    t: 'Опоздал',  icon: Clock,     color: '#d97706', bg: '#fef3c7' },
  { k: 'online',  t: 'Онлайн',   icon: Wifi,      color: '#0d9488', bg: '#ccfbf1' },
  { k: 'makeup',  t: 'Отработка',icon: RotateCcw, color: '#7c3aed', bg: '#f3e8ff' },
]

// причины пропуска по ТЗ
export const REASONS = [
  { k: 'illness',   t: 'Болезнь' },
  { k: 'school',    t: 'Школа' },
  { k: 'olympiad',  t: 'Олимпиада' },
  { k: 'vacation',  t: 'Каникулы' },
  { k: 'no_reason', t: 'Без причины' },
  { k: 'other',     t: 'Другое' },
]

export default function MyLessons() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)   // занятие, которое проводим
  const [err, setErr] = useState('')

  async function load() {
    setErr('')
    try { setRows(await fetchMyLessons(date)) }
    catch (e) { setErr(e.message); setRows([]) }
  }
  useEffect(() => { load() }, [date])

  const shift = (d) => {
    const t = new Date(date); t.setDate(t.getDate() + d)
    setDate(t.toISOString().slice(0, 10))
  }
  const isToday = date === new Date().toISOString().slice(0, 10)

  if (open) {
    return <ConductCard lesson={open} onBack={() => setOpen(null)}
      onDone={async () => { setOpen(null); await load() }} />
  }

  const planned = (rows || []).filter((r) => r.status === 'planned')

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Мои занятия</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            {isToday ? 'Сегодня' : new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            {planned.length > 0 && ` · ${planned.length} к проведению`}
          </p>
        </div>
        <div className="rowflex" style={{ gap: 6 }}>
          <button onClick={() => shift(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ padding: '7px 10px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, outline: 'none' }} />
          <button onClick={() => shift(1)} style={navBtn}><ChevronRight size={16} /></button>
          {!isToday && (
            <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
              style={{ ...navBtn, width: 'auto', padding: '0 11px', fontSize: 12.5, fontWeight: 600 }}>Сегодня</button>
          )}
        </div>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {rows === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <CalendarDays size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>На этот день занятий нет</div>
          <div style={{ fontSize: 13, color: C.slate }}>Занятия появляются из расписания, которое ведёт завуч.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((l) => {
            const done = l.status === 'проведён'
            const cancelled = l.status === 'отменён'
            return (
              <div key={l.lesson_id}
                style={{
                  background: C.card, border: `1px solid ${done ? C.ok + '44' : cancelled ? C.line : C.line}`,
                  borderRadius: 13, padding: 15, opacity: cancelled ? 0.6 : 1,
                }}>
                <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rowflex" style={{ gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{l.group_name}</span>
                      {l.time_text && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand, background: C.brandSoft, padding: '2px 9px', borderRadius: 20 }}>
                          {l.time_text}
                        </span>
                      )}
                      {done && (
                        <span className="rowflex" style={{ gap: 4, fontSize: 11.5, fontWeight: 700, color: C.ok, background: C.okSoft, padding: '2px 9px', borderRadius: 20 }}>
                          <Check size={11} /> проведено
                        </span>
                      )}
                      {cancelled && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.slate, background: C.grey, padding: '2px 9px', borderRadius: 20 }}>отменено</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: C.slate, marginTop: 3 }}>
                      {(l.subject_name || '').split(' / ')[0]} · {l.students_count} учеников · {l.lessons_count} урока
                    </div>
                    {done && l.topic && (
                      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 3 }}>Тема: {l.topic}</div>
                    )}
                  </div>

                  {!cancelled && (
                    <button onClick={() => setOpen(l)}
                      style={{
                        padding: '10px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: done ? C.grey : C.brand, color: done ? C.slate : '#fff',
                      }}>
                      {done ? 'Изменить' : 'Провести занятие'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- КАРТОЧКА ПРОВЕДЕНИЯ ЗАНЯТИЯ ----------
function ConductCard({ lesson, onBack, onDone }) {
  const [students, setStudents] = useState(null)
  const [marks, setMarks] = useState({})       // { studentId: {status, reason} }
  const [topic, setTopic] = useState(lesson.topic || '')
  const [comment, setComment] = useState('')
  const [count, setCount] = useState(lesson.lessons_count || 2)
  const [busy, setBusy] = useState(false)
  const [cancelMode, setCancelMode] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let stop = false
    Promise.all([
      fetchStudentsOfGroup(lesson.group_id),
      fetchAttendance(lesson.lesson_id).catch(() => []),
    ]).then(([list, saved]) => {
      if (stop) return
      setStudents(list)
      const init = {}
      list.forEach((s) => { init[s.id] = { status: 'present', reason: null } })
      saved.forEach((a) => {
        init[a.student_id] = {
          status: a.status || (a.present ? 'present' : 'absent'),
          reason: a.absence_reason || null,
        }
      })
      setMarks(init)
    }).catch((e) => setErr(e.message))
    return () => { stop = true }
  }, [lesson])

  const setStatus = (id, status) =>
    setMarks((p) => ({ ...p, [id]: { status, reason: status === 'absent' ? p[id]?.reason : null } }))
  const setReason = (id, reason) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], reason } }))

  async function save() {
    // проверка: у отсутствующих должна быть причина
    const noReason = (students || []).filter(
      (s) => marks[s.id]?.status === 'absent' && !marks[s.id]?.reason
    )
    if (noReason.length) {
      setErr(`Укажите причину пропуска: ${noReason.map((s) => s.full_name).join(', ')}`)
      return
    }
    setBusy(true); setErr('')
    try {
      await conductLesson(lesson.lesson_id, {
        topic, comment, lessons_count: count,
        attendance: (students || []).map((s) => ({
          student_id: s.id,
          status: marks[s.id]?.status || 'present',
          absence_reason: marks[s.id]?.reason || null,
        })),
      })
      await onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  async function doCancel() {
    setBusy(true); setErr('')
    try { await cancelLesson(lesson.lesson_id, cancelReason); await onDone() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const counts = ST.map((s) => ({
    ...s, n: Object.values(marks).filter((m) => m.status === s.k).length,
  })).filter((s) => s.n > 0)

  return (
    <div>
      <button onClick={onBack} className="rowflex"
        style={{ gap: 6, marginBottom: 14, background: 'none', border: 'none', color: C.slate, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        <ArrowLeft size={16} /> К списку занятий
      </button>

      {/* Шапка занятия */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 13, padding: 16, marginBottom: 12 }}>
        <div className="rowflex" style={{ gap: 9, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{lesson.group_name}</h1>
          {lesson.time_text && (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandSoft, padding: '2px 10px', borderRadius: 20 }}>
              {lesson.time_text}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: C.slate }}>
          {(lesson.subject_name || '').split(' / ')[0]} · {lesson.office}
          {lesson.assistant_name && ` · ассистент: ${lesson.assistant_name}`}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <Label>Тема урока</Label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Что проходили"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          </div>
          <div>
            <Label>Уроков</Label>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setCount(n)}
                  style={{
                    width: 46, padding: '10px 0', borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: 'pointer',
                    border: count === n ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                    background: count === n ? C.brandSoft : '#fff', color: count === n ? C.brand : C.slate,
                  }}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Сводка статусов */}
      {counts.length > 0 && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
          {counts.map((c) => (
            <span key={c.k} style={{ fontSize: 12, fontWeight: 700, color: c.color, background: c.bg, padding: '5px 11px', borderRadius: 20 }}>
              {c.t}: {c.n}
            </span>
          ))}
        </div>
      )}

      {/* Ученики */}
      {students === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка учеников…</div>
      ) : students.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, color: '#92400e', fontSize: 13.5 }}>
          В этой группе нет учеников. Обратитесь к завучу, чтобы их добавили.
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 13, overflow: 'hidden' }}>
          {students.map((s, i) => {
            const m = marks[s.id] || { status: 'present' }
            const cur = ST.find((x) => x.k === m.status) || ST[0]
            return (
              <div key={s.id} style={{ borderTop: i ? `1px solid ${C.line}` : 'none', padding: '10px 13px', background: m.status === 'absent' ? '#fffafa' : '#fff' }}>
                <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 130px', fontSize: 14, fontWeight: 600, minWidth: 0 }}>{s.full_name}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ST.map((x) => {
                      const on = m.status === x.k
                      const Icon = x.icon
                      return (
                        <button key={x.k} onClick={() => setStatus(s.id, x.k)} title={x.t}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 8,
                            fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                            border: on ? `1.5px solid ${x.color}` : `1px solid ${C.line}`,
                            background: on ? x.bg : '#fff', color: on ? x.color : C.faint,
                          }}>
                          <Icon size={12} /> <span className="hide-sm">{x.t}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {m.status === 'absent' && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingLeft: 2 }}>
                    <span style={{ fontSize: 11.5, color: C.slate, alignSelf: 'center', marginRight: 3 }}>Причина:</span>
                    {REASONS.map((r) => {
                      const on = m.reason === r.k
                      return (
                        <button key={r.k} onClick={() => setReason(s.id, on ? null : r.k)}
                          style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                            border: on ? `1.5px solid #dc2626` : `1px solid ${C.line}`,
                            background: on ? '#fee2e2' : '#fff', color: on ? '#b91c1c' : C.slate,
                          }}>{r.t}</button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Label>Комментарий к занятию (необязательно)</Label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 300))} rows={2}
          placeholder="Что-то важное про это занятие"
          style={{ width: '100%', padding: 10, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy || !students?.length}
          style={{
            flex: '1 1 200px', padding: 13, borderRadius: 11, background: C.brand, color: '#fff',
            fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>
          {busy ? 'Сохраняю…' : 'Провести занятие'}
        </button>
        {!cancelMode && lesson.status === 'planned' && (
          <button onClick={() => setCancelMode(true)} className="rowflex"
            style={{ gap: 6, padding: '13px 16px', borderRadius: 11, background: C.grey, color: C.slate, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Ban size={15} /> Отменить занятие
          </button>
        )}
      </div>

      {cancelMode && (
        <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: 14 }}>
          <Label>Причина отмены</Label>
          <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            placeholder="напр. карантин, праздник, болезнь преподавателя"
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={() => setCancelMode(false)}
              style={{ flex: 1, padding: 10, borderRadius: 9, background: '#fff', color: C.slate, fontSize: 13.5, fontWeight: 700, border: `1px solid ${C.line}`, cursor: 'pointer' }}>Назад</button>
            <button onClick={doCancel} disabled={busy}
              style={{ flex: 1, padding: 10, borderRadius: 9, background: '#dc2626', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? '…' : 'Отменить занятие'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn = {
  width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.line}`,
  background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center',
}

function Label({ children }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6 }}>{children}</div>
}
