import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Plus, Trash2, Zap, X, AlertTriangle, Check } from 'lucide-react'
import {
  fetchScheduleGrid, addSchedule, deleteSchedule, generateLessons, fetchMissedLessons,
} from '../lib/api'
import { C, OFFICES } from '../lib/utils'
import GroupSearchSelect from '../components/GroupSearchSelect'

const WD = [
  { n: 1, t: 'Понедельник', s: 'Пн' },
  { n: 2, t: 'Вторник', s: 'Вт' },
  { n: 3, t: 'Среда', s: 'Ср' },
  { n: 4, t: 'Четверг', s: 'Чт' },
  { n: 5, t: 'Пятница', s: 'Пт' },
  { n: 6, t: 'Суббота', s: 'Сб' },
  { n: 7, t: 'Воскресенье', s: 'Вс' },
]

export default function Schedule({ dict, isAdmin }) {
  const [rows, setRows] = useState(null)
  const [office, setOffice] = useState('')
  const [add, setAdd] = useState(false)
  const [gen, setGen] = useState(false)
  const [missed, setMissed] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    try {
      const [grid, miss] = await Promise.all([
        fetchScheduleGrid(),
        fetchMissedLessons(14).catch(() => []),
      ])
      setRows(grid); setMissed(miss)
    } catch (e) { setErr(e.message); setRows([]) }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    return office ? rows.filter((r) => r.office === office) : rows
  }, [rows, office])

  const byDay = useMemo(() => {
    const m = {}
    WD.forEach((w) => { m[w.n] = [] })
    filtered.forEach((r) => { (m[r.weekday] ||= []).push(r) })
    return m
  }, [filtered])

  async function remove(id) {
    setBusy(true)
    try { await deleteSchedule(id); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Расписание</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            Постоянное расписание групп. Из него создаются ожидаемые занятия.
          </p>
        </div>
        {isAdmin && (
          <>
            <button onClick={() => setGen(true)} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: C.teal, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Zap size={15} /> Создать занятия
            </button>
            <button onClick={() => setAdd(true)} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Plus size={16} /> Добавить
            </button>
          </>
        )}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}
      {msg && <div style={{ background: C.okSoft, color: '#065f46', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{msg}</div>}

      {/* Непроведённые занятия */}
      {missed.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: 13, marginBottom: 14 }}>
          <div className="rowflex" style={{ gap: 8, color: '#92400e', fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
            <AlertTriangle size={15} /> Занятия, которые не провели ({missed.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {missed.slice(0, 6).map((m) => (
              <div key={m.lesson_id} className="rowflex" style={{ gap: 10, fontSize: 12.5, color: '#78350f' }}>
                <span style={{ minWidth: 70 }}>{m.lesson_date?.slice(8, 10)}.{m.lesson_date?.slice(5, 7)}</span>
                <span style={{ fontWeight: 700 }}>{m.group_name}</span>
                <span style={{ color: '#92400e' }}>{m.teacher_name}</span>
                <span style={{ marginLeft: 'auto', color: '#a16207' }}>{m.days_ago} дн. назад</span>
              </div>
            ))}
            {missed.length > 6 && <div style={{ fontSize: 12, color: '#a16207' }}>…ещё {missed.length - 6}</div>}
          </div>
        </div>
      )}

      {/* Фильтр офисов */}
      <div className="fbar">
        <button className={`fchip ${!office ? 'on' : ''}`} onClick={() => setOffice('')}>Все офисы</button>
        {OFFICES.map((o) => (
          <button key={o} className={`fchip ${office === o ? 'on' : ''}`} onClick={() => setOffice(o)}>{o}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.faint }}>
          {filtered.length} занятий в неделю
        </span>
      </div>

      {rows === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <CalendarDays size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Расписание пустое</div>
          <div style={{ fontSize: 13, color: C.slate }}>
            Добавьте, когда занимается каждая группа — система будет сама создавать занятия.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 11 }}>
          {WD.map((w) => {
            const items = byDay[w.n] || []
            return (
              <div key={w.n} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: C.grey, padding: '8px 12px', fontSize: 12.5, fontWeight: 800, color: items.length ? C.ink : C.faint }}>
                  {w.t} <span style={{ color: C.faint, fontWeight: 600 }}>· {items.length}</span>
                </div>
                <div style={{ padding: items.length ? 0 : 16 }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.faint, textAlign: 'center' }}>нет занятий</div>
                  ) : items.map((r, i) => (
                    <div key={r.schedule_id} style={{ padding: '9px 12px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                      <div className="rowflex" style={{ gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{r.group_name}</span>
                        {r.time_text && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.brand, background: C.brandSoft, padding: '1px 7px', borderRadius: 20 }}>
                            {r.time_text}
                          </span>
                        )}
                        {isAdmin && (
                          <button onClick={() => remove(r.schedule_id)} disabled={busy} title="Удалить из расписания"
                            style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.faint, cursor: 'pointer', display: 'flex', padding: 2 }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2 }}>
                        {(r.subject_name || '').split(' / ')[0]} · {r.lessons_count} ур.
                      </div>
                      <div style={{ fontSize: 11.5, color: r.teacher_name ? C.slate : '#dc2626' }}>
                        {r.teacher_name || 'преподаватель не назначен'}
                      </div>
                      <div style={{ fontSize: 11, color: C.faint }}>
                        {r.office} · {r.students_count} уч.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {add && (
        <AddModal dict={dict} onClose={() => setAdd(false)}
          onSaved={async () => { setAdd(false); await load() }} />
      )}
      {gen && (
        <GenerateModal onClose={() => setGen(false)}
          onDone={async (n) => {
            setGen(false)
            setMsg(`Создано занятий: ${n}. Преподаватели увидят их в разделе «Мои занятия».`)
            await load()
            setTimeout(() => setMsg(''), 8000)
          }} />
      )}
    </div>
  )
}

// ---------- ДОБАВИТЬ В РАСПИСАНИЕ ----------
function AddModal({ dict, onClose, onSaved }) {
  const [groupId, setGroupId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [days, setDays] = useState([])         // массив weekday
  const [time, setTime] = useState('')
  const [count, setCount] = useState(2)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggleDay = (n) => setDays((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])

  async function save() {
    if (!groupId || !days.length) { setErr('Выберите группу и хотя бы один день'); return }
    setBusy(true); setErr('')
    try {
      for (const d of days) {
        await addSchedule({
          group_id: groupId,
          teacher_id: teacherId || null,
          weekday: d,
          time_text: time || null,
          lessons_count: Number(count),
        })
      }
      await onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 460, padding: 22, maxHeight: '88vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Добавить в расписание</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <Label>Группа</Label>
        <GroupSearchSelect groups={dict.groups || []} value={groupId} onChange={setGroupId} />

        <Label style={{ marginTop: 14 }}>Преподаватель</Label>
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff' }}>
          <option value="">— не назначен —</option>
          {(dict.teachers || []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>

        <Label style={{ marginTop: 14 }}>Дни недели</Label>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {WD.map((w) => {
            const on = days.includes(w.n)
            return (
              <button key={w.n} onClick={() => toggleDay(w.n)}
                style={{
                  padding: '8px 13px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate,
                }}>{w.s}</button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Время (необязательно)</Label>
            <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="18:00"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Уроков за занятие</Label>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setCount(n)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    border: count === n ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                    background: count === n ? C.brandSoft : '#fff', color: count === n ? C.brand : C.slate,
                  }}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Сохраняю…' : 'Добавить'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>
          Если выбрать несколько дней, создастся отдельная запись на каждый.
        </p>
      </div>
    </div>
  )
}

// ---------- ГЕНЕРАЦИЯ ЗАНЯТИЙ ----------
function GenerateModal({ onClose, onDone }) {
  const today = new Date().toISOString().slice(0, 10)
  const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(plus30)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    setBusy(true); setErr('')
    try { const n = await generateLessons(from, to); await onDone(n) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 400, padding: 22 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800 }}>Создать занятия из расписания</h3>
        <p style={{ fontSize: 13, color: C.slate, margin: '0 0 16px', lineHeight: 1.5 }}>
          Система создаст ожидаемые занятия за выбранный период. Преподаватели увидят их
          в разделе «Мои занятия» и смогут провести в один клик.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>С даты</Label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>По дату</Label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          </div>
        </div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={run} disabled={busy}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.teal, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Создаю…' : 'Создать'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>
          Повторный запуск не создаст дубли — только недостающие занятия.
        </p>
      </div>
    </div>
  )
}

function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6, ...style }}>{children}</div>
}
