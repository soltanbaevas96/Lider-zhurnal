import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Trash2, Zap, X, AlertTriangle, ChevronLeft, ChevronRight,
  Search, Download, Printer, Upload, Check,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchScheduleSlots, saveScheduleSlot, checkScheduleConflicts, deleteSchedule,
  generateLessons, fetchMissedLessons, addGroup,
} from '../lib/api'
import { C, OFFICES, todayStr, addDaysStr, mondayOf, fmtDate } from '../lib/utils'
import GroupSearchSelect from '../components/GroupSearchSelect'

const WD = [
  { n: 1, t: 'Понедельник', s: 'Пн' }, { n: 2, t: 'Вторник', s: 'Вт' }, { n: 3, t: 'Среда', s: 'Ср' },
  { n: 4, t: 'Четверг', s: 'Чт' }, { n: 5, t: 'Пятница', s: 'Пт' }, { n: 6, t: 'Суббота', s: 'Сб' }, { n: 7, t: 'Воскресенье', s: 'Вс' },
]

// Единая цветовая система статуса — статус хранится отдельным полем в БД
// (schedule.status), цвет только сопровождает его, а не заменяет (п.6, 34 ТЗ).
// У «Расписания» до этой переделки статусов/цветов не было вообще — бордовый
// как отдельный «особый подтверждённый» тип это новый статус на будущее,
// наследовать было нечего.
const STATUS_META = {
  confirmed: { label: 'Подтверждено', color: '#1e3a8a', bg: '#e5edff', border: '#93b0f0' },
  confirmed_special: { label: 'Подтверждено (особое)', color: '#7f1d1d', bg: '#fbe7e7', border: '#e3a3a3' },
  reserve: { label: 'Резерв', color: '#166534', bg: '#e2f5ea', border: '#8fd6ac' },
  occupied_other: { label: 'Занято — другой центр', color: '#4b5563', bg: '#eef0f4', border: '#c7cbd3' },
}
const fmtHM = (t) => (t || '').slice(0, 5)

export default function Schedule({ dict, isAdmin }) {
  const [slots, setSlots] = useState(null)
  const [missed, setMissed] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [mode, setMode] = useState('week') // week | groups | teachers
  const [office, setOffice] = useState('')
  const [room, setRoom] = useState('')
  const [q, setQ] = useState('')
  const [refDate, setRefDate] = useState(() => todayStr())

  const [editSlot, setEditSlot] = useState(null)   // объект слота | 'new' | { weekday, office } для нового с предзаполнением
  const [confirmDel, setConfirmDel] = useState(null)
  const [gen, setGen] = useState(false)
  const [excelOpen, setExcelOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const reqId = useRef(0)
  async function load() {
    const id = ++reqId.current
    setLoading(true); setErr('')
    try {
      const [rows, miss] = await Promise.all([fetchScheduleSlots(), fetchMissedLessons(14).catch(() => [])])
      if (id !== reqId.current) return
      setSlots(rows); setMissed(miss)
    } catch (e) {
      if (id !== reqId.current) return
      setErr(e.message || 'Не удалось загрузить расписание')
    } finally { if (id === reqId.current) setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const weekStart = useMemo(() => mondayOf(refDate), [refDate])
  const weekEnd = useMemo(() => addDaysStr(weekStart, 6), [weekStart])

  const roomOptions = useMemo(() => {
    if (!slots) return []
    return [...new Set(slots.filter((s) => !office || s.office === office).map((s) => s.room))].sort()
  }, [slots, office])

  // Слот считается видимым в выбранной неделе, если период его действия
  // (active_from/active_to) пересекается с [weekStart, weekEnd] — половина
  // расписания могла смениться в середине месяца (п.21-22 ТЗ), это и есть
  // способ увидеть «расписание на конкретную неделю», а не только «сейчас».
  const visibleSlots = useMemo(() => {
    if (!slots) return []
    const s = q.trim().toLowerCase()
    return slots.filter((r) => {
      if (office && r.office !== office) return false
      if (room && r.room !== room) return false
      if (r.active_from > weekEnd) return false
      if (r.active_to && r.active_to < weekStart) return false
      if (!s) return true
      return (r.group_name || '').toLowerCase().includes(s) || (r.teacher_name || '').toLowerCase().includes(s) || (r.room || '').toLowerCase().includes(s)
    })
  }, [slots, office, room, q, weekStart, weekEnd])

  const byDay = useMemo(() => {
    const m = {}
    WD.forEach((w) => { m[w.n] = [] })
    visibleSlots.forEach((r) => { (m[r.weekday] ||= []).push(r) })
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.start_time.localeCompare(b.start_time)))
    return m
  }, [visibleSlots])

  async function remove(id) {
    setBusy(true)
    try { await deleteSchedule(id); setConfirmDel(null); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  async function moveToDay(id, newWeekday) {
    const slot = slots.find((s) => s.id === id)
    if (!slot || slot.weekday === newWeekday) return
    setBusy(true); setErr('')
    try {
      await saveScheduleSlot(id, {
        office: slot.office, room: slot.room, groupId: slot.group_id, teacherId: slot.teacher_id,
        assistantId: slot.assistant_id, weekday: newWeekday, startTime: slot.start_time, endTime: slot.end_time,
        lessonsCount: slot.lessons_count, status: slot.status, activeFrom: slot.active_from, activeTo: slot.active_to,
        notes: slot.notes,
      })
      await load()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  function exportXlsx() {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Расписание', visibleSlots.map((r) => ({
      Офис: r.office, Кабинет: r.room, День: WD.find((w) => w.n === r.weekday)?.t || r.weekday,
      Время: `${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`,
      Группа: r.group_name || (r.status === 'reserve' ? 'РЕЗЕРВ' : r.status === 'occupied_other' ? 'ЗАНЯТО — другой центр' : ''),
      Преподаватель: r.teacher_name || '', Статус: STATUS_META[r.status]?.label || r.status,
    })))
    const byGroup = {}
    visibleSlots.filter((r) => r.group_id).forEach((r) => { (byGroup[r.group_id] ||= []).push(r) })
    const groupRows = []
    Object.values(byGroup).forEach((arr) => arr.forEach((r) => groupRows.push({
      Группа: r.group_name, Офис: r.office, Кабинет: r.room, День: WD.find((w) => w.n === r.weekday)?.t,
      Время: `${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`, Преподаватель: r.teacher_name || '',
    })))
    addSheet(wb, 'По группам', groupRows)
    const byTeacher = {}
    visibleSlots.filter((r) => r.teacher_id).forEach((r) => { (byTeacher[r.teacher_id] ||= []).push(r) })
    const teacherRows = []
    Object.values(byTeacher).forEach((arr) => arr.forEach((r) => teacherRows.push({
      Преподаватель: r.teacher_name, Группа: r.group_name, Офис: r.office, Кабинет: r.room,
      День: WD.find((w) => w.n === r.weekday)?.t, Время: `${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`,
    })))
    addSheet(wb, 'По преподавателям', teacherRows)
    XLSX.writeFile(wb, `Расписание_${office || 'все_офисы'}_${weekStart}.xlsx`)
    setExcelOpen(false)
  }

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sched-day { break-inside: avoid; }
        }
      `}</style>

      <div className="rowflex no-print" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Расписание</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.slate }}>{fmtDate(weekStart)} — {fmtDate(weekEnd)}</p>
        </div>
        <div className="rowflex" style={{ gap: 6 }}>
          <button onClick={() => setRefDate(addDaysStr(refDate, -7))} style={navBtn} title="Предыдущая неделя"><ChevronLeft size={16} /></button>
          <button onClick={() => setRefDate(todayStr())} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12.5, fontWeight: 700 }}>Сегодня</button>
          <button onClick={() => setRefDate(addDaysStr(refDate, 7))} style={navBtn} title="Следующая неделя"><ChevronRight size={16} /></button>
        </div>
        {isAdmin && (
          <>
            <button onClick={() => setImportOpen(true)} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Upload size={15} /> Импорт
            </button>
            <button onClick={() => setGen(true)} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: C.teal, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Zap size={15} /> Создать занятия
            </button>
            <button onClick={() => setEditSlot('new')} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Plus size={16} /> Добавить занятие
            </button>
          </>
        )}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setExcelOpen((v) => !v)} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
          {excelOpen && (
            <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(20,24,58,.15)', zIndex: 20, minWidth: 180 }}>
              <div onClick={exportXlsx} style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = C.grey} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                Скачать (3 листа)
              </div>
            </div>
          )}
        </div>
        <button onClick={() => window.print()} className="rowflex" title="Печать текущего расписания"
          style={{ gap: 6, padding: '8px 14px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Printer size={15} /> Печать
        </button>
      </div>

      {err && <div className="no-print" style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}
      {msg && <div className="no-print" style={{ background: C.okSoft, color: '#065f46', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{msg}</div>}

      {missed.length > 0 && (
        <div className="no-print" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: 13, marginBottom: 14 }}>
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

      {/* Режимы + фильтры */}
      <div className="no-print rowflex" style={{ gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['week', 'Календарь'], ['groups', 'По группам'], ['teachers', 'По преподавателям']].map(([k, t]) => {
          const on = mode === k
          return <button key={k} onClick={() => setMode(k)}
            style={{ padding: '8px 15px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>{t}</button>
        })}
      </div>
      <div className="no-print rowflex" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={office} onChange={(e) => { setOffice(e.target.value); setRoom('') }} style={selSty}>
          <option value="">Все офисы</option>
          {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {mode === 'week' && (
          <select value={room} onChange={(e) => setRoom(e.target.value)} style={selSty}>
            <option value="">Все кабинеты</option>
            {roomOptions.map((r) => <option key={r} value={r}>Кабинет {r}</option>)}
          </select>
        )}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск группы / преподавателя / кабинета…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : mode === 'groups' ? (
        <GroupsMode slots={visibleSlots} onOpen={(s) => setEditSlot(s)} />
      ) : mode === 'teachers' ? (
        <TeachersMode slots={visibleSlots} dict={dict} onOpen={(s) => setEditSlot(s)} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(190px, 1fr))', gap: 10, minWidth: 900 }}>
            {WD.map((w) => {
              const items = byDay[w.n] || []
              return (
                <div key={w.n} className="sched-day"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragId) moveToDay(dragId, w.n); setDragId(null) }}
                  style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', minHeight: 120 }}>
                  <div className="rowflex" style={{ background: C.grey, padding: '8px 12px', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: items.length ? C.ink : C.faint }}>{w.t}</span>
                    <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>· {items.length}</span>
                    {isAdmin && (
                      <button onClick={() => setEditSlot({ weekday: w.n, office: office || OFFICES[0] })} title="Добавить в этот день"
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.brand, cursor: 'pointer', display: 'flex' }}>
                        <Plus size={15} />
                      </button>
                    )}
                  </div>
                  <div style={{ padding: items.length ? 6 : 16 }}>
                    {items.length === 0 ? (
                      <div style={{ fontSize: 12, color: C.faint, textAlign: 'center' }}>нет занятий</div>
                    ) : items.map((r) => (
                      <SlotCard key={r.id} r={r} isAdmin={isAdmin} draggable={isAdmin}
                        onDragStart={() => setDragId(r.id)}
                        onClick={() => setEditSlot(r)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {editSlot && (
        <SlotModal slot={editSlot} dict={dict} roomOptions={roomOptions}
          onClose={() => setEditSlot(null)}
          onSaved={async () => { setEditSlot(null); await load() }}
          onDelete={(id) => { setEditSlot(null); setConfirmDel(id) }} />
      )}

      {confirmDel && (
        <ConfirmBox title="Удалить занятие из расписания?" busy={busy}
          onCancel={() => setConfirmDel(null)} onConfirm={() => remove(confirmDel)} confirmText="Удалить" />
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

      {importOpen && (
        <ImportWizard dict={dict} onClose={() => setImportOpen(false)} onDone={async () => { setImportOpen(false); await load() }} />
      )}
    </div>
  )
}

// ================= КАРТОЧКА ЗАНЯТИЯ =================
function SlotCard({ r, isAdmin, draggable, onDragStart, onClick }) {
  const m = STATUS_META[r.status] || STATUS_META.confirmed
  const isReal = r.status === 'confirmed' || r.status === 'confirmed_special'
  return (
    <div draggable={draggable} onDragStart={onDragStart} onClick={onClick}
      style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: 9, padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: m.color }}>{fmtHM(r.start_time)}–{fmtHM(r.end_time)} · каб. {r.room}</div>
      {isReal ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginTop: 2 }}>{r.group_name}</div>
          <div style={{ fontSize: 11.5, color: C.slate }}>{r.teacher_name || '—'}</div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: m.color, marginTop: 2 }}>{m.label}</div>
      )}
    </div>
  )
}

// ================= РЕЖИМ «ПО ГРУППАМ» =================
function GroupsMode({ slots, onOpen }) {
  const [q, setQ] = useState('')
  const byGroup = useMemo(() => {
    const m = {}
    slots.filter((s) => s.group_id).forEach((s) => { (m[s.group_id] ||= { id: s.group_id, name: s.group_name, office: s.office, lang: s.lang, rows: [] }).rows.push(s) })
    return Object.values(m).filter((g) => !q.trim() || g.name.toLowerCase().includes(q.toLowerCase().trim()))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [slots, q])

  if (slots.length === 0) return null
  return (
    <div>
      <div style={{ marginBottom: 12 }}><SearchBox q={q} setQ={setQ} placeholder="Поиск группы…" /></div>
      {byGroup.length === 0 ? <Empty text="Группы не найдены." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr><th>Группа</th><th style={{ width: 110 }}>Офис</th><th>Кабинеты</th><th>Преподаватель</th><th>Дни</th><th>Время</th></tr></thead>
          <tbody>
            {byGroup.map((g) => (
              <React.Fragment key={g.id}>
                {g.rows.sort((a, b) => a.weekday - b.weekday).map((r, i) => (
                  <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                    {i === 0 && <td rowSpan={g.rows.length} style={{ fontWeight: 700, verticalAlign: 'top' }}>{g.name}</td>}
                    {i === 0 && <td rowSpan={g.rows.length} style={{ verticalAlign: 'top' }}>{g.office}</td>}
                    <td>{r.room}</td>
                    <td>{r.teacher_name || '—'}</td>
                    <td>{WD.find((w) => w.n === r.weekday)?.s}</td>
                    <td>{fmtHM(r.start_time)}–{fmtHM(r.end_time)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= РЕЖИМ «ПО ПРЕПОДАВАТЕЛЯМ» =================
function TeachersMode({ slots, dict, onOpen }) {
  const [q, setQ] = useState('')
  const byTeacher = useMemo(() => {
    const m = {}
    slots.filter((s) => s.teacher_id).forEach((s) => { (m[s.teacher_id] ||= { id: s.teacher_id, name: s.teacher_name, rows: [] }).rows.push(s) })
    return Object.values(m).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase().trim()))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [slots, q])

  if (slots.length === 0) return null
  return (
    <div>
      <div style={{ marginBottom: 12 }}><SearchBox q={q} setQ={setQ} placeholder="Поиск преподавателя…" /></div>
      {byTeacher.length === 0 ? <Empty text="Ничего не найдено." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byTeacher.map((t) => (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>{t.name}</div>
              <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
                <thead><tr><th style={{ width: 110 }}>День</th><th style={{ width: 110 }}>Время</th><th>Группа</th><th style={{ width: 100 }}>Офис</th><th style={{ width: 90 }}>Каб.</th></tr></thead>
                <tbody>
                  {t.rows.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((r) => (
                    <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                      <td>{WD.find((w) => w.n === r.weekday)?.t}</td>
                      <td>{fmtHM(r.start_time)}–{fmtHM(r.end_time)}</td>
                      <td style={{ fontWeight: 600 }}>{r.group_name}</td>
                      <td>{r.office}</td>
                      <td>{r.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchBox({ q, setQ, placeholder }) {
  return (
    <div style={{ position: 'relative', maxWidth: 320 }}>
      <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
    </div>
  )
}
function Empty({ text }) {
  return <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate, fontSize: 13.5 }}>{text}</div>
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
const navBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center' }
const selSty = { padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5, outline: 'none', background: '#fff' }

// ================= СОЗДАНИЕ / РЕДАКТИРОВАНИЕ СЛОТА =================
function SlotModal({ slot, dict, roomOptions, onClose, onSaved, onDelete }) {
  const editing = slot !== 'new' && slot?.id
  const [office, setOffice] = useState(slot?.office || OFFICES[0])
  const [room, setRoom] = useState(slot?.room || '')
  const [groupId, setGroupId] = useState(slot?.group_id || '')
  const [teacherId, setTeacherId] = useState(slot?.teacher_id || '')
  const [assistantId, setAssistantId] = useState(slot?.assistant_id || '')
  const [days, setDays] = useState(editing ? [slot.weekday] : slot?.weekday ? [slot.weekday] : [])
  const [startTime, setStartTime] = useState(slot?.start_time?.slice(0, 5) || '')
  const [endTime, setEndTime] = useState(slot?.end_time?.slice(0, 5) || '')
  const [count, setCount] = useState(slot?.lessons_count || 2)
  const [status, setStatus] = useState(slot?.status || 'confirmed')
  const [activeFrom, setActiveFrom] = useState(slot?.active_from || todayStr())
  const [activeTo, setActiveTo] = useState(slot?.active_to || '')
  const [notes, setNotes] = useState(slot?.notes || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [confirmDel, setConfirmDel] = useState(false)

  const isReal = status === 'confirmed' || status === 'confirmed_special'
  const toggleDay = (n) => setDays((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])

  // Живая проверка конфликта — по кабинету/времени/преподавателю, пока
  // форма ещё заполняется (п.17-18 ТЗ), с небольшим дебаунсом.
  useEffect(() => {
    if (!office || !room || !startTime || !endTime || days.length === 0) { setConflicts([]); return }
    const t = setTimeout(() => {
      Promise.all(days.map((d) => checkScheduleConflicts({
        office, room, teacherId: isReal ? (teacherId || null) : null, weekday: d,
        startTime, endTime, activeFrom, activeTo: activeTo || null, excludeId: editing ? slot.id : null,
      }))).then((results) => setConflicts(results.flat())).catch(() => setConflicts([]))
    }, 350)
    return () => clearTimeout(t)
  }, [office, room, teacherId, days, startTime, endTime, activeFrom, activeTo, isReal])

  async function save() {
    setErr('')
    if (!office || !room || !startTime || !endTime || days.length === 0) { setErr('Заполните офис, кабинет, время и хотя бы один день'); return }
    if (isReal && (!groupId || !teacherId)) { setErr('Для подтверждённого занятия обязательны группа и преподаватель'); return }
    if (conflicts.length > 0) { setErr('Есть конфликт расписания — сначала устраните его'); return }
    setBusy(true)
    try {
      if (editing) {
        await saveScheduleSlot(slot.id, {
          office, room, groupId: isReal ? groupId : null, teacherId: isReal ? teacherId : null, assistantId: isReal ? (assistantId || null) : null,
          weekday: days[0], startTime, endTime, lessonsCount: Number(count), status, activeFrom, activeTo: activeTo || null, notes,
        })
      } else {
        for (const d of days) {
          await saveScheduleSlot(null, {
            office, room, groupId: isReal ? groupId : null, teacherId: isReal ? teacherId : null, assistantId: isReal ? (assistantId || null) : null,
            weekday: d, startTime, endTime, lessonsCount: Number(count), status, activeFrom, activeTo: activeTo || null, notes,
          })
        }
      }
      await onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 520, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{editing ? 'Занятие' : 'Добавить занятие'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <Label>Статус *</Label>
        <div className="rowflex" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {Object.entries(STATUS_META).map(([k, m]) => (
            <button key={k} onClick={() => setStatus(k)}
              style={{ padding: '7px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: status === k ? `1.5px solid ${m.color}` : `1px solid ${C.line}`, background: status === k ? m.bg : '#fff', color: status === k ? m.color : C.slate }}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Офис *</Label>
            <select value={office} onChange={(e) => setOffice(e.target.value)} style={inpSty}>
              {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <Label>Кабинет *</Label>
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="напр. 3" list="room-options" style={inpSty} />
            <datalist id="room-options">{roomOptions.map((r) => <option key={r} value={r} />)}</datalist>
          </div>
        </div>

        {isReal && (
          <>
            <Label>Группа *</Label>
            <GroupSearchSelect groups={(dict.groups || []).filter((g) => g.office === office)} value={groupId} onChange={setGroupId} />
            <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>Преподаватель *</Label>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={inpSty}>
                  <option value="">— выбрать —</option>
                  {(dict.teachers || []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <Label>Ассистент</Label>
                <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} style={inpSty}>
                  <option value="">— не назначен —</option>
                  {(dict.assistants || []).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <Label style={{ marginTop: 14 }}>Дни недели *</Label>
        <div className="rowflex" style={{ gap: 5, flexWrap: 'wrap' }}>
          {WD.map((w) => (
            <button key={w.n} disabled={editing} onClick={() => toggleDay(w.n)}
              style={{ padding: '8px 13px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: editing ? 'default' : 'pointer',
                border: days.includes(w.n) ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                background: days.includes(w.n) ? C.brand : '#fff', color: days.includes(w.n) ? '#fff' : C.slate, opacity: editing && !days.includes(w.n) ? 0.4 : 1 }}>{w.s}</button>
          ))}
        </div>
        {!editing && <p style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>Несколько дней — создастся отдельная запись на каждый.</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Начало *</Label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inpSty} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Окончание *</Label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inpSty} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Уроков</Label>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setCount(n)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    border: count === n ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`, background: count === n ? C.brandSoft : '#fff', color: count === n ? C.brand : C.slate }}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Действует с</Label>
            <input type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} style={inpSty} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Действует по (необязательно)</Label>
            <input type="date" value={activeTo} onChange={(e) => setActiveTo(e.target.value)} style={inpSty} />
          </div>
        </div>

        <Label style={{ marginTop: 14 }}>Комментарий</Label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inpSty, resize: 'vertical' }} />

        {conflicts.length > 0 && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 13px', marginTop: 14, fontSize: 12.5, color: '#b91c1c' }}>
            {conflicts.map((c, i) => (
              <div key={i} className="rowflex" style={{ gap: 6 }}>
                <AlertTriangle size={13} />
                {c.kind === 'room'
                  ? <span>Конфликт расписания. Кабинет {c.room} ({c.office}) уже занят {c.group_name ? `«${c.group_name}»` : STATUS_META.reserve.label.toLowerCase()} с {fmtHM(c.start_time)} до {fmtHM(c.end_time)}.</span>
                  : <span>Преподаватель {c.teacher_name} уже занят с {fmtHM(c.start_time)} до {fmtHM(c.end_time)}.</span>}
              </div>
            ))}
          </div>
        )}
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {editing && (
            <button onClick={() => setConfirmDel(true)} title="Удалить"
              style={{ padding: '11px 14px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy || conflicts.length > 0}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: (busy || conflicts.length > 0) ? 0.5 : 1 }}>
            {busy ? 'Сохраняю…' : editing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmBox title="Удалить занятие из расписания?" busy={false}
          onCancel={() => setConfirmDel(false)} onConfirm={() => onDelete(slot.id)} confirmText="Удалить" />
      )}
    </div>
  )
}

// ================= ГЕНЕРАЦИЯ ЗАНЯТИЙ (без изменений формулы) =================
function GenerateModal({ onClose, onDone }) {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(addDaysStr(todayStr(), 30))
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
          Система создаст ожидаемые занятия за выбранный период по подтверждённым слотам
          (резерв и «занято» занятий не создают). Преподаватели увидят их в «Мои занятия».
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Label>С даты</Label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inpSty} /></div>
          <div style={{ flex: 1 }}><Label>По дату</Label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inpSty} /></div>
        </div>
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={run} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.teal, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Создаю…' : 'Создать'}</button>
        </div>
        <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>Повторный запуск не создаст дубли — только недостающие занятия.</p>
      </div>
    </div>
  )
}

// ================= МАСТЕР ИМПОРТА =================
// Вставка структурированных строк (Офис\tКабинет\tДень\tНачало\tКонец\tГруппа\tПреподаватель\t[Статус]),
// а не разбор исходного Excel «в лоб» — исходный файл слишком неровный
// (смещённые заголовки, ФИЗ/МАТ вместо кода группы, опечатки в именах),
// автоматический парсинг рисковал бы тихо создать неверные записи в живой
// базе. Здесь группы/преподаватели ищутся по нормализованному сравнению,
// несовпадения не создаются молча — их нужно разрешить вручную (п.5, 26 ТЗ).
const DAY_ALIASES = { 'пн': 1, 'понедельник': 1, 'вт': 2, 'вторник': 2, 'ср': 3, 'среда': 3, 'чт': 4, 'четверг': 4, 'пт': 5, 'пятница': 5, 'сб': 6, 'суббота': 6, 'вс': 7, 'воскресенье': 7 }
function normName(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ').replace(/[-–—]/g, '-')
}
function guessLang(groupName) {
  const m = /^\d{1,2}\s*([а-яё])/i.exec(groupName || '')
  if (!m) return null
  const c = m[1].toLowerCase()
  if (c === 'к') return 'каз'
  if (c === 'р') return 'рус'
  return null
}

// Расписание почти всегда пишет преподавателя как «Имя И.» (имя + первая
// буква фамилии/отчества), а в базе — полное ФИО, поэтому точное сравнение
// строк почти никогда не совпадает. Ищем по имени + начальной букве второго
// слова, независимо от порядка «Имя Фамилия» / «Фамилия Имя» в базе.
// Автоматически подставляем совпадение, ТОЛЬКО если оно единственное —
// при неоднозначности (два тёзки с одинаковой буквой) оставляем на ручной
// выбор, чтобы не назначить занятие не тому человеку (п.5 ТЗ).
function matchTeacherFuzzy(scheduleName, teachers) {
  const exactWanted = normName(scheduleName)
  const exact = teachers.find((t) => normName(t.full_name) === exactWanted)
  if (exact) return exact

  const m = /^([a-zа-яёіңғүұқөhәA-Z]+)\s+([a-zа-яёA-Z])\.?\s*$/u.exec((scheduleName || '').trim())
  if (!m) return null
  const firstName = m[1].toLowerCase()
  const initial = m[2].toLowerCase()

  const candidates = teachers.filter((t) => {
    const words = normName(t.full_name).split(' ').filter(Boolean)
    const hasFirst = words.includes(firstName)
    const hasInitialWord = words.some((w) => w !== firstName && w[0] === initial)
    return hasFirst && hasInitialWord
  })
  return candidates.length === 1 ? candidates[0] : null
}

function ImportWizard({ dict, onClose, onDone }) {
  const [office, setOffice] = useState(OFFICES[0])
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState(null) // после разбора/сопоставления
  const [teacherOverrides, setTeacherOverrides] = useState({}) // rowIndex -> teacher_id
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')

  // Статус берётся из 8-го столбца текстом — обычно это цвет ячейки в
  // исходном Excel: бирюзовый/«тёмно-синий» → подтверждено, розовый/
  // «бордовый» → особое (в реальном файле это оказалось строго 10 класс
  // против 11-го — закономерность, не единичные случаи), зелёный →
  // резерв, белый (без заливки) → занято другим центром.
  function classifyStatus(statusRaw) {
    const s = normName(statusRaw)
    if (/резерв/.test(s)) return 'reserve'
    if (/особ/.test(s)) return 'confirmed_special'
    if (/занят/.test(s)) return 'occupied_other'
    return 'confirmed'
  }

  function parse() {
    setErr('')
    const groupsByOffice = (dict.groups || []).filter((g) => g.office === office)
    const groupIndex = {}
    groupsByOffice.forEach((g) => { groupIndex[normName(g.name)] = g })
    const teachers = dict.teachers || []

    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const parsed = lines.map((line, i) => {
      const cols = line.split('\t').map((c) => c.trim())
      const [office_, room, dayRaw, start, end, groupName, teacherName, statusRaw, notes] = cols
      const day = DAY_ALIASES[normName(dayRaw)] || Number(dayRaw) || null
      const status = classifyStatus(statusRaw)
      const needsGroupTeacher = status === 'confirmed' || status === 'confirmed_special'
      let matchedGroup = null, willCreateGroup = false
      if (needsGroupTeacher && groupName) {
        matchedGroup = groupIndex[normName(groupName)] || null
        willCreateGroup = !matchedGroup && /^1[01]/.test(groupName.trim())
      }
      const matchedTeacher = needsGroupTeacher && teacherName ? matchTeacherFuzzy(teacherName, teachers) : null
      return {
        i, office: office_ || office, room, day, start, end, groupName, teacherName, status, notes: notes || '',
        needsGroupTeacher, matchedGroup, willCreateGroup, matchedTeacher,
        ok: needsGroupTeacher ? !!(day && start && end && room && (matchedGroup || willCreateGroup) && matchedTeacher) : !!(day && start && end && room),
      }
    })
    setRows(parsed)
    setTeacherOverrides({})
  }

  async function run() {
    setRunning(true); setErr('')
    const stats = { total: rows.length, groupsFound: 0, groupsCreated: 0, teachersFound: 0, teachersNotFound: 0, confirmed: 0, special: 0, reserve: 0, occupied: 0, skipped: 0, errors: [] }
    // Одна и та же новая группа встречается в расписании много раз (разные
    // дни недели) — создаём её только один раз за весь импорт, дальше
    // переиспользуем id из этого кеша, а не зовём addGroup() повторно
    // (иначе вторая же строка с той же группой падала на unique-constraint).
    const createdGroups = {}
    try {
      for (const r of rows) {
        try {
          const teacherId = teacherOverrides[r.i] || r.matchedTeacher?.id || null
          if (r.needsGroupTeacher && !teacherId) { stats.teachersNotFound++; stats.skipped++; continue }
          if (!r.day || !r.start || !r.end || !r.room) { stats.skipped++; continue }

          let groupId = r.matchedGroup?.id || null
          if (r.needsGroupTeacher) {
            const key = normName(r.groupName)
            if (groupId) stats.groupsFound++
            else if (createdGroups[key]) { groupId = createdGroups[key] }
            else if (r.willCreateGroup) {
              const created = await addGroup({ name: r.groupName.trim(), office: r.office, lang: guessLang(r.groupName), archived: false })
              groupId = created.id
              createdGroups[key] = groupId
              stats.groupsCreated++
            } else { stats.skipped++; continue }
            stats.teachersFound++
          }

          await saveScheduleSlot(null, {
            office: r.office, room: r.room, groupId: r.needsGroupTeacher ? groupId : null, teacherId: r.needsGroupTeacher ? teacherId : null,
            assistantId: null, weekday: r.day, startTime: r.start, endTime: r.end, lessonsCount: 2,
            status: r.status, activeFrom: todayStr(), activeTo: null, notes: r.notes || null,
          })
          if (r.status === 'confirmed') stats.confirmed++
          else if (r.status === 'confirmed_special') stats.special++
          else if (r.status === 'reserve') stats.reserve++
          else stats.occupied++
        } catch (e) {
          // Ошибка на ОДНОЙ строке (например неожиданный конфликт расписания
          // или дубль имени группы) не должна обрывать весь импорт — остальные
          // строки продолжают обрабатываться, а эта попадает в отчёт.
          stats.errors.push(`${r.groupName || STATUS_META[r.status].label} (каб. ${r.room}, ${WD.find((w) => w.n === r.day)?.t || r.day}, ${r.start}–${r.end}): ${e.message}`)
        }
      }
      setReport(stats)
      await onDone()
    } catch (e) { setErr(e.message) } finally { setRunning(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 780, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Импорт расписания</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {report ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Импорт завершён</div>
            <div style={{ background: C.grey, borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.9 }}>
              Строк обработано: <b>{report.total}</b><br />
              Групп найдено в базе: <b>{report.groupsFound}</b> · Создано новых: <b>{report.groupsCreated}</b><br />
              Преподавателей сопоставлено: <b>{report.teachersFound}</b> · Не сопоставлено: <b style={{ color: report.teachersNotFound ? '#dc2626' : undefined }}>{report.teachersNotFound}</b><br />
              Подтверждённых слотов создано: <b>{report.confirmed}</b><br />
              Подтверждённых (особых) создано: <b>{report.special}</b><br />
              Резервов создано: <b>{report.reserve}</b><br />
              «Занято — другой центр» создано: <b>{report.occupied}</b><br />
              Пропущено (не хватило данных): <b>{report.skipped}</b><br />
              Ошибок при сохранении: <b style={{ color: report.errors.length ? '#dc2626' : undefined }}>{report.errors.length}</b>
            </div>
            {report.errors.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#dc2626' }}>{report.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>
            )}
            <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Готово</button>
          </div>
        ) : rows ? (
          <div>
            <p style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Проверьте сопоставление перед импортом. Строки с ⚠️ не будут импортированы, пока преподаватель не выбран вручную.</p>
            <div className="dt-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><div className="dt-scroll"><table className="dt">
              <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 60 }}>Каб.</th><th style={{ width: 60 }}>День</th><th style={{ width: 100 }}>Время</th><th style={{ width: 110 }}>Тип</th><th>Группа</th><th>Преподаватель</th><th style={{ width: 50 }}>OK</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i}>
                    <td>{r.i + 1}</td><td>{r.room || '—'}</td><td>{r.day ? WD.find((w) => w.n === r.day)?.s : <span style={{ color: '#dc2626' }}>?</span>}</td>
                    <td>{r.start && r.end ? `${r.start}–${r.end}` : <span style={{ color: '#dc2626' }}>?</span>}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, color: STATUS_META[r.status].color }}>{STATUS_META[r.status].label}</span></td>
                    <td>{!r.needsGroupTeacher ? <i style={{ color: C.faint }}>{r.notes || '—'}</i> : r.matchedGroup ? r.groupName : r.willCreateGroup ? <span style={{ color: '#d97706' }}>🆕 {r.groupName}</span> : <span style={{ color: '#dc2626' }}>⚠️ {r.groupName || '—'}</span>}</td>
                    <td>{!r.needsGroupTeacher ? '—' : r.matchedTeacher ? r.teacherName : (
                      <select value={teacherOverrides[r.i] || ''} onChange={(e) => setTeacherOverrides((p) => ({ ...p, [r.i]: e.target.value }))} style={{ ...selSty, padding: '4px 8px' }}>
                        <option value="">⚠️ {r.teacherName || 'выбрать…'}</option>
                        {(dict.teachers || []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                    )}</td>
                    <td>{r.ok || teacherOverrides[r.i] ? <Check size={14} color="#0f9d58" /> : <AlertTriangle size={14} color="#dc2626" />}</td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
            {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setRows(null)} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Назад</button>
              <button onClick={run} disabled={running} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: running ? 0.6 : 1 }}>{running ? 'Импортирую…' : 'Импортировать'}</button>
            </div>
          </div>
        ) : (
          <div>
            <Label>Офис по умолчанию (если не указан в столбце)</Label>
            <select value={office} onChange={(e) => setOffice(e.target.value)} style={inpSty}>
              {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <Label style={{ marginTop: 14 }}>Вставьте строки (по одной на занятие, столбцы через Tab — как при копировании из Excel)</Label>
            <p style={{ fontSize: 11.5, color: C.faint, marginBottom: 6, lineHeight: 1.5 }}>
              Офис · Кабинет · День (Пн/Вт/…) · Начало (ЧЧ:ММ) · Конец · Группа · Преподаватель · Статус (пусто = подтверждено, «особое», «резерв», «занято») · [Заметка]
            </p>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={10}
              placeholder={'Торайгырова\t7\tПн\t14:00\t16:00\t11 КТФ-2\tГульжихан К.\n...'}
              style={{ ...inpSty, fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
              <button onClick={parse} disabled={!raw.trim()} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: raw.trim() ? 1 : 0.5 }}>Проверить сопоставление</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfirmBox({ title, busy, onCancel, onConfirm, confirmText }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 90 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}

function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6, ...style }}>{children}</div>
}
const inpSty = { width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }
