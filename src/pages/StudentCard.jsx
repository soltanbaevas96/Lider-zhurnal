import React, { useEffect, useState, useMemo } from 'react'
import {
  ArrowLeft, Phone, User, CalendarDays, List, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, AlertTriangle, Download, School, MessageCircle, Plus,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  fetchStudent, fetchStudentCalendar, fetchStudentSummary, fetchStudentGroupsStats, fetchStudentEvents,
  fetchCommunications, addCommunication,
} from '../lib/api'
import { C, fmtDate } from '../lib/utils'
import DataTable from '../components/DataTable'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const STATUS = {
  active:    { label: 'Активен',      color: C.ok,     bg: C.okSoft },
  attention: { label: 'Внимание',     color: '#d97706', bg: '#fef3c7' },
  risk:      { label: 'Риск оттока',  color: '#dc2626', bg: '#fee2e2' },
  churned:   { label: 'Ушёл',         color: C.slate,  bg: C.grey },
  archived:  { label: 'Архив',        color: C.slate,  bg: C.grey },
}

export default function StudentCard({ studentId, onBack }) {
  const [student, setStudent] = useState(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [calendar, setCalendar] = useState([])
  const [summary, setSummary] = useState(null)
  const [groups, setGroups] = useState([])
  const [events, setEvents] = useState([])
  const [comms, setComms] = useState([])
  const [addComm, setAddComm] = useState(false)
  const [view, setView] = useState('calendar') // calendar | list
  const [loading, setLoading] = useState(true)

  // период = выбранный месяц
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const from = `${month}-01`
    const last = new Date(y, m, 0).getDate()
    return { from, to: `${month}-${String(last).padStart(2, '0')}` }
  }, [month])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchStudent(studentId),
      fetchStudentCalendar(studentId, month),
      fetchStudentSummary(studentId, range.from, range.to),
      fetchStudentGroupsStats(studentId, range.from, range.to),
      fetchStudentEvents(studentId).catch(() => []),
      fetchCommunications(studentId).catch(() => []),
    ])
      .then(([st, cal, sum, grp, ev, cm]) => {
        setStudent(st); setCalendar(cal); setSummary(sum); setGroups(grp); setEvents(ev); setComms(cm)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId, month, range.from, range.to])

  const shiftMonth = (d) => {
    const [y, m] = month.split('-').map(Number)
    const dt = new Date(y, m - 1 + d, 1)
    setMonth(dt.toISOString().slice(0, 7))
  }

  function exportList() {
    const rows = calendar.map((l) => ({
      'Дата': l.lesson_date,
      'Предмет': l.subject_name || '',
      'Группа': l.group_name || '',
      'Преподаватель': l.teacher_name || '',
      'Статус': l.present ? 'был' : 'пропуск',
      'Причина': l.absence_reason || '',
      'Комментарий': l.comment || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Посещаемость')
    XLSX.writeFile(wb, `${(student?.full_name || 'ученик').replace(/\s/g, '_')}_${month}.xlsx`)
  }

  if (loading && !student) return <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
  if (!student) return (
    <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Ученик не найден</div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 16 }}>
        Возможно, он был удалён или архивирован.
      </div>
      <button onClick={onBack}
        style={{ padding: '10px 20px', borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        Вернуться
      </button>
    </div>
  )

  const st = STATUS[student.status] || STATUS.active

  return (
    <div>
      <button onClick={onBack} className="rowflex"
        style={{ gap: 6, marginBottom: 14, background: 'none', border: 'none', color: C.slate, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        <ArrowLeft size={16} /> Назад
      </button>

      {/* ---------- ШАПКА ---------- */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div className="rowflex" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="rowflex" style={{ gap: 9 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>{student.full_name}</h1>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>
                {st.label}
              </span>
            </div>
            <div style={{ fontSize: 13, color: C.slate, marginTop: 5 }}>
              {[student.office, student.lang, student.school && `школа №${student.school}`, student.enrolled_at && `с ${fmtDate(student.enrolled_at)}`]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {student.phone && <Contact icon={Phone} label="Ученик" value={student.phone} />}
            {student.parent_phone && <Contact icon={User} label={student.parent_name || 'Родитель'} value={student.parent_phone} />}
          </div>
        </div>

        {student.risk_reason && (
          <div className="rowflex" style={{ gap: 8, background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            <AlertTriangle size={15} /> {student.risk_reason}
          </div>
        )}

        {/* Метрики */}
        <div className="stats">
          <Metric value={summary?.pct ?? 0} suffix="%" label="посещаемость" tint={pctColor(summary?.pct ?? 0)} />
          <Metric value={summary?.total ?? 0} label="занятий было" />
          <Metric value={summary?.present ?? 0} label="посетил" tint={C.ok} />
          <Metric value={summary?.absent ?? 0} label="пропустил" tint={summary?.absent > 0 ? '#dc2626' : C.ink} />
        </div>
      </div>

      {/* ---------- КАЛЕНДАРЬ / СПИСОК ---------- */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div className="rowflex" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div className="fseg">
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>
              <CalendarDays size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Календарь
            </button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              <List size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Список
            </button>
          </div>

          <div className="rowflex" style={{ gap: 6, marginLeft: 'auto' }}>
            <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>
              {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
            </span>
            <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
            <button onClick={() => setMonth(new Date().toISOString().slice(0, 7))}
              style={{ ...navBtn, width: 'auto', padding: '0 11px', fontSize: 12.5, fontWeight: 600 }}>Текущий</button>
            {view === 'list' && calendar.length > 0 && (
              <button onClick={exportList} className="rowflex"
                style={{ gap: 5, padding: '7px 12px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <Download size={14} /> Excel
              </button>
            )}
          </div>
        </div>

        {view === 'calendar'
          ? <Calendar month={month} lessons={calendar} />
          : <LessonList lessons={calendar} />}
      </div>

      {/* ---------- ГРУППЫ ---------- */}
      {groups.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>Группы ученика</h2>
          <DataTable
            columns={[
              { key: 'group_name', label: 'Группа', render: (g) => <b>{g.group_name}</b> },
              { key: 'subject_name', label: 'Предмет' },
              { key: 'teacher_name', label: 'Преподаватель', render: (g) => g.teacher_name || '—' },
              { key: 'total', label: 'Занятий', num: true },
              { key: 'present', label: 'Посетил', num: true },
              { key: 'absent', label: 'Пропустил', num: true, render: (g) => <span style={{ color: g.absent > 0 ? '#dc2626' : C.ink }}>{g.absent}</span> },
              { key: 'pct', label: '%', num: true, render: (g) => <span style={{ color: pctColor(g.pct), fontWeight: 800 }}>{g.pct}%</span> },
            ]}
            rows={groups.map((g) => ({ ...g, id: g.group_id }))}
            pageSize={15}
          />
        </div>
      )}

      {/* ---------- ДИНАМИКА ---------- */}
      {calendar.length > 0 && <Dynamics lessons={calendar} />}

      {/* ---------- ЖУРНАЛ ОБЩЕНИЯ ---------- */}
      <div style={{ marginTop: 14 }}>
        <div className="rowflex" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Журнал общения</h2>
          <button onClick={() => setAddComm(true)} className="rowflex"
            style={{ marginLeft: 'auto', gap: 5, padding: '6px 12px', background: C.brandSoft, color: C.brand, borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Plus size={14} /> Добавить
          </button>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: comms.length ? 0 : 20 }}>
          {comms.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.faint, fontSize: 13 }}>
              Пока нет записей. Фиксируйте звонки, сообщения и встречи с родителями.
            </div>
          ) : comms.map((c, i) => (
            <div key={c.id} style={{ padding: '11px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div className="rowflex" style={{ gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: COMM_KIND[c.kind]?.color || C.slate, background: COMM_KIND[c.kind]?.bg || C.grey, padding: '2px 8px', borderRadius: 20 }}>
                  {COMM_KIND[c.kind]?.t || c.kind}
                </span>
                {c.result && <span style={{ fontSize: 11.5, color: C.slate }}>{c.result}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.faint }}>
                  {fmtDate(c.created_at?.slice(0, 10))}
                </span>
              </div>
              {c.note && <div style={{ fontSize: 13.5 }}>{c.note}</div>}
              {c.author_name && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{c.author_name}</div>}
            </div>
          ))}
        </div>
      </div>

      {addComm && (
        <CommModal studentId={studentId} onClose={() => setAddComm(false)}
          onSaved={async () => {
            setAddComm(false)
            setComms(await fetchCommunications(studentId).catch(() => []))
          }} />
      )}

      {/* ---------- ИСТОРИЯ ---------- */}
      {events.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>История</h2>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
            {events.map((e, i) => (
              <div key={e.id} className="rowflex" style={{ gap: 10, padding: '7px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                <span style={{ fontSize: 12, color: C.faint, minWidth: 90 }}>{fmtDate(e.created_at?.slice(0, 10))}</span>
                <span style={{ fontSize: 13 }}>{eventLabel(e)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- КАЛЕНДАРЬ ----------
function Calendar({ month, lessons }) {
  const [hover, setHover] = useState(null)
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const startWd = (first.getDay() + 6) % 7 // пн = 0

  // занятия по дням
  const byDay = {}
  lessons.forEach((l) => {
    const d = Number(l.lesson_date.slice(8, 10))
    ;(byDay[d] ||= []).push(l)
  })

  const cells = []
  for (let i = 0; i < startWd; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
        {WD.map((w) => (
          <div key={w} style={{ fontSize: 11, fontWeight: 700, color: C.faint, textAlign: 'center', padding: '4px 0' }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const dayLessons = byDay[d] || []
          const dateStr = `${month}-${String(d).padStart(2, '0')}`
          const isToday = dateStr === todayStr
          const hasAbsent = dayLessons.some((l) => !l.present)
          return (
            <div key={d}
              onMouseEnter={() => dayLessons.length && setHover({ d, lessons: dayLessons })}
              onMouseLeave={() => setHover(null)}
              onClick={() => dayLessons.length && setHover(hover?.d === d ? null : { d, lessons: dayLessons })}
              style={{
                position: 'relative', minHeight: 58, borderRadius: 9, padding: '5px 6px',
                border: isToday ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                background: dayLessons.length ? (hasAbsent ? '#fff5f5' : '#f6fdf9') : '#fff',
                cursor: dayLessons.length ? 'pointer' : 'default',
              }}>
              <div style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 600, color: isToday ? C.brand : C.slate }}>{d}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                {dayLessons.map((l, li) => (
                  <span key={li} title={`${l.subject_name || ''} — ${l.present ? 'был' : 'пропуск'}`}
                    style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: l.present ? C.ok : '#dc2626',
                    }} />
                ))}
              </div>

              {hover?.d === d && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 4,
                  background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(20,24,58,.16)', padding: 10, minWidth: 210,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{d} {MONTHS[m - 1]}</div>
                  {dayLessons.map((l, li) => (
                    <div key={li} style={{ fontSize: 12, paddingTop: li ? 6 : 0, borderTop: li ? `1px solid ${C.grey}` : 'none', marginTop: li ? 6 : 0 }}>
                      <div style={{ fontWeight: 700 }}>{l.subject_name || l.group_name}</div>
                      <div style={{ color: C.slate }}>{l.group_name} · {l.teacher_name || '—'}</div>
                      {l.topic && <div style={{ color: C.faint, fontSize: 11.5 }}>{l.topic}</div>}
                      <div style={{ fontWeight: 700, color: l.present ? C.ok : '#dc2626', marginTop: 2 }}>
                        {l.present ? '✓ был' : '✕ пропуск'}
                        {l.absence_reason ? ` · ${l.absence_reason}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rowflex" style={{ gap: 16, marginTop: 12, fontSize: 12, color: C.slate, flexWrap: 'wrap' }}>
        <Legend2 color={C.ok} text="был" />
        <Legend2 color="#dc2626" text="пропуск" />
        <Legend2 color={C.line} text="занятия не было" />
      </div>
      {lessons.length === 0 && (
        <p style={{ fontSize: 13, color: C.faint, textAlign: 'center', marginTop: 14 }}>
          В этом месяце занятий не было.
        </p>
      )}
    </>
  )
}

function LessonList({ lessons }) {
  if (!lessons.length) return <p style={{ fontSize: 13, color: C.faint, textAlign: 'center', padding: 24 }}>В этом месяце занятий не было.</p>
  return (
    <DataTable
      columns={[
        { key: 'lesson_date', label: 'Дата', render: (l) => fmtDate(l.lesson_date), width: 90 },
        { key: 'subject_name', label: 'Предмет' },
        { key: 'group_name', label: 'Группа' },
        { key: 'teacher_name', label: 'Преподаватель', render: (l) => l.teacher_name || '—' },
        {
          key: 'present', label: 'Статус', width: 100,
          render: (l) => (
            <span style={{ fontSize: 12, fontWeight: 700, color: l.present ? C.ok : '#dc2626', background: l.present ? C.okSoft : '#fee2e2', padding: '3px 9px', borderRadius: 20 }}>
              {l.present ? 'был' : 'пропуск'}
            </span>
          ),
        },
        { key: 'absence_reason', label: 'Причина', render: (l) => l.absence_reason || '—' },
      ]}
      rows={lessons.map((l, i) => ({ ...l, id: l.lesson_id || i }))}
      pageSize={20}
      initialSort={{ key: 'lesson_date', dir: 'desc' }}
    />
  )
}

// ---------- ДИНАМИКА ПО НЕДЕЛЯМ ----------
function Dynamics({ lessons }) {
  const data = useMemo(() => {
    const byWeek = {}
    lessons.forEach((l) => {
      const d = new Date(l.lesson_date)
      const wk = weekKey(d)
      const w = (byWeek[wk] ||= { week: wk, total: 0, present: 0 })
      w.total++
      if (l.present) w.present++
    })
    return Object.values(byWeek)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({
        week: w.week.slice(5),
        pct: w.total ? Math.round((w.present / w.total) * 100) : 0,
      }))
  }, [lessons])

  if (data.length < 2) return null

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Динамика посещаемости по неделям</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={(v) => [`${v}%`, 'посещаемость']} />
          <Line type="monotone" dataKey="pct" stroke={C.brand} strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- МЕЛОЧИ ----------
const navBtn = {
  width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`,
  background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center',
}

function Contact({ icon: Icon, label, value }) {
  return (
    <div className="rowflex" style={{ gap: 7 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: C.grey, color: C.slate, display: 'grid', placeItems: 'center' }}>
        <Icon size={14} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: C.faint }}>{label}</div>
        <a href={`tel:${value}`} style={{ fontSize: 13, fontWeight: 700, color: C.ink, textDecoration: 'none' }}>{value}</a>
      </div>
    </div>
  )
}

function Metric({ value, suffix = '', label, tint }) {
  return (
    <div style={{ background: C.grey, borderRadius: 11, padding: '11px 13px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: tint || C.ink, lineHeight: 1 }}>{value}{suffix}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Legend2({ color, text }) {
  return (
    <span className="rowflex" style={{ gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} /> {text}
    </span>
  )
}

const pctColor = (p) => p >= 85 ? C.ok : p >= 65 ? '#d97706' : '#dc2626'

function weekKey(d) {
  const t = new Date(d)
  const day = (t.getDay() + 6) % 7
  t.setDate(t.getDate() - day)
  return t.toISOString().slice(0, 10)
}

function eventLabel(e) {
  const map = {
    contact: 'Контакт с родителем',
    enrolled: 'Зачислен в группу',
    transferred: 'Переведён',
    absent_streak: 'Пропуски подряд',
    archived: 'Архивирован',
  }
  const base = map[e.event_type] || e.event_type
  const note = e.payload?.note
  return note ? `${base}: ${note}` : base
}

// ---------- ЖУРНАЛ ОБЩЕНИЯ ----------
const COMM_KIND = {
  call:    { t: 'Звонок',     color: '#0369a1', bg: '#e0f2fe' },
  message: { t: 'Сообщение',  color: '#0d9488', bg: '#ccfbf1' },
  meeting: { t: 'Встреча',    color: '#7c3aed', bg: '#f3e8ff' },
  note:    { t: 'Заметка',    color: '#6b7194', bg: '#eef0f6' },
}

const COMM_RESULTS = ['дозвонились', 'не ответил', 'перезвонить', '—']

function CommModal({ studentId, onClose, onSaved }) {
  const [kind, setKind] = useState('call')
  const [result, setResult] = useState('дозвонились')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    try {
      await addCommunication(studentId, kind, note.trim(), kind === 'call' ? result : null, null)
      await onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 420, padding: 22 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800 }}>Запись в журнал общения</h3>

        <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6 }}>Тип</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {Object.entries(COMM_KIND).map(([k, v]) => (
            <button key={k} onClick={() => setKind(k)}
              style={{
                padding: '6px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: kind === k ? `1.5px solid ${v.color}` : `1px solid ${C.line}`,
                background: kind === k ? v.bg : '#fff', color: kind === k ? v.color : C.slate,
              }}>{v.t}</button>
          ))}
        </div>

        {kind === 'call' && (
          <>
            <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6 }}>Результат</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {COMM_RESULTS.map((r) => (
                <button key={r} onClick={() => setResult(r)}
                  style={{
                    padding: '6px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    border: result === r ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                    background: result === r ? C.brandSoft : '#fff', color: result === r ? C.brand : C.slate,
                  }}>{r}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6 }}>Комментарий</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={3}
          placeholder="Что обсудили"
          style={{ width: '100%', padding: 10, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
