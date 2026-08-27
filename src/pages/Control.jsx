import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell, History, CalendarX, AlertTriangle, Cake, FileWarning, RefreshCw, User, FileText, ExternalLink,
  ArrowLeft, GraduationCap, Users, Layers,
} from 'lucide-react'
import { fetchNotifications, fetchAuditLog, fetchMissedLessons, fetchLessonPlansOverview, planUrl } from '../lib/api'
import { C, fmtDate, nameOf, periodRange, currentMonth } from '../lib/utils'
import DataTable from '../components/DataTable'
import PeriodPicker from '../components/PeriodPicker'

const SEV = {
  danger: { color: '#dc2626', bg: '#fee2e2', icon: AlertTriangle },
  warn:   { color: '#d97706', bg: '#fef3c7', icon: FileWarning },
  info:   { color: '#0369a1', bg: '#e0f2fe', icon: Cake },
}

const ACTIONS = { insert: 'создал', update: 'изменил', delete: 'удалил' }
const TABLES = {
  lessons: 'занятие', students: 'ученика', groups: 'группу',
  teachers: 'преподавателя', curators: 'куратора',
}

export default function Control({ dict, onOpenStudent }) {
  const [tab, setTab] = useState('alerts')  // alerts | missed | log | plans
  const [alerts, setAlerts] = useState(null)
  const [missed, setMissed] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true); setErr('')
    try {
      const [a, m, l] = await Promise.all([
        fetchNotifications().catch(() => []),
        fetchMissedLessons(30).catch(() => []),
        fetchAuditLog(150).catch(() => []),
      ])
      setAlerts(a); setMissed(m); setLog(l)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const tabs = [
    { k: 'alerts', t: 'Уведомления', n: alerts?.length || 0, icon: Bell },
    { k: 'missed', t: 'Не проведено', n: missed.length, icon: CalendarX },
    { k: 'plans', t: 'Планы уроков', n: null, icon: FileText },
    { k: 'log', t: 'Журнал изменений', n: null, icon: History },
  ]

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Контроль</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            Что требует внимания и кто что менял в системе
          </p>
        </div>
        {tab !== 'plans' && (
          <button onClick={load} disabled={loading} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.grey, color: C.slate, borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <RefreshCw size={15} /> Обновить
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map((o) => {
          const on = tab === o.k
          const Icon = o.icon
          return (
            <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
              style={{
                gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate,
              }}>
              <Icon size={15} /> {o.t}
              {o.n > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20,
                  background: on ? 'rgba(255,255,255,.25)' : C.grey, color: on ? '#fff' : C.slate,
                }}>{o.n}</span>
              )}
            </button>
          )
        })}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {tab === 'plans' ? (
        <PlansCheck dict={dict} />
      ) : loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : tab === 'alerts' ? (
        <Alerts rows={alerts} onOpenStudent={onOpenStudent} />
      ) : tab === 'missed' ? (
        <Missed rows={missed} />
      ) : (
        <AuditLog rows={log} />
      )}
    </div>
  )
}

// ---------- ПЛАНЫ УРОКОВ ----------
// Разбор преподаватель/куратор → группа → занятия. На каждом уровне
// видно проведено/без плана/%, а на занятиях — реальный размер файла
// (маленький или отсутствующий файл — явный признак «для галочки»).
const SMALL_PLAN_BYTES = 3000 // меньше 3 КБ — почти наверняка «для галочки»

function PlansCheck({ dict }) {
  const [period, setPeriod] = useState({ mode: 'month', month: currentMonth() })
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // { level: 'root' } | { level: 'person', kind: 'teacher'|'curator', id } | { level: 'group', kind: 'teacher', id, groupId }
  const [drill, setDrill] = useState({ level: 'root' })

  const range = useMemo(() => periodRange(period), [period])

  async function load() {
    setLoading(true); setErr('')
    try { setRows(await fetchLessonPlansOverview(range)) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load(); setDrill({ level: 'root' }) }, [range])

  const openPlan = async (path) => {
    const url = await planUrl(path)
    if (url) window.open(url, '_blank')
    else setErr('Не удалось открыть файл — возможно, он был удалён из хранилища')
  }

  const all = rows || []
  const smallCount = all.filter((r) => r.file_size != null && r.file_size < SMALL_PLAN_BYTES).length
  const missingCount = all.filter((r) => r.file_missing).length
  const sizesUnavailable = all.length > 0 && all[0].file_info_available === false

  // ---------- уровень 1: преподаватели и кураторы ----------
  const withPct = (list) => list.map((p) => ({ ...p, pct: p.total ? Math.round((p.total - p.noPlan) / p.total * 100) : 0 }))
  const teacherStats = useMemo(() => withPct(dict.teachers.map((t) => {
    const mine = all.filter((r) => r.teacher_id === t.id)
    return { id: t.id, name: t.full_name, total: mine.length, noPlan: mine.filter((r) => !r.plan_path).length }
  }).filter((t) => t.total > 0)), [dict.teachers, all])

  const curatorStats = useMemo(() => withPct((dict.curators || []).map((c) => {
    const mine = all.filter((r) => r.curator_id === c.id)
    return { id: c.id, name: c.full_name, total: mine.length, noPlan: mine.filter((r) => !r.plan_path).length }
  }).filter((c) => c.total > 0)), [dict.curators, all])

  // ---------- уровень 2: группы выбранного преподавателя ----------
  const groupStats = useMemo(() => {
    if (drill.level !== 'person' || drill.kind !== 'teacher') return []
    const m = {}
    all.filter((r) => r.teacher_id === drill.id).forEach((r) => {
      const g = (m[r.group_id] ||= { id: r.group_id, name: nameOf(dict.groups, r.group_id) || '—', total: 0, noPlan: 0 })
      g.total++
      if (!r.plan_path) g.noPlan++
    })
    return withPct(Object.values(m))
  }, [drill, all, dict.groups])

  // ---------- уровень 3: список занятий (группа преподавателя ИЛИ все занятия куратора — у него нет групп) ----------
  const lessonsList = useMemo(() => {
    if (drill.level === 'group') return all.filter((r) => r.teacher_id === drill.id && r.group_id === drill.groupId)
    if (drill.level === 'person' && drill.kind === 'curator') return all.filter((r) => r.curator_id === drill.id)
    return []
  }, [drill, all])

  const isGroupList = drill.level === 'person' && drill.kind === 'teacher'
  const isLessonList = drill.level === 'group' || (drill.level === 'person' && drill.kind === 'curator')
  const personName = drill.level !== 'root' ? nameOf(drill.kind === 'teacher' ? dict.teachers : dict.curators, drill.id) : ''

  const personColumns = [
    { key: 'name', label: 'Имя', render: (r) => <b style={{ color: C.brand }}>{r.name}</b> },
    { key: 'total', label: 'Проведено', num: true, width: 110 },
    { key: 'noPlan', label: 'Без плана', num: true, width: 110, render: (r) => <span style={{ color: r.noPlan > 0 ? C.warn : C.slate, fontWeight: 700 }}>{r.noPlan}</span> },
    { key: 'pct', label: '% с планом', num: true, width: 120, render: (r) => <b style={{ color: r.pct >= 85 ? C.ok : r.pct >= 60 ? C.warn : '#dc2626' }}>{r.pct}%</b> },
  ]
  const groupColumns = [
    { key: 'name', label: 'Группа', render: (r) => <b>{r.name}</b> },
    { key: 'total', label: 'Занятий', num: true, width: 100 },
    { key: 'noPlan', label: 'Без плана', num: true, width: 110, render: (r) => <span style={{ color: r.noPlan > 0 ? C.warn : C.slate, fontWeight: 700 }}>{r.noPlan}</span> },
    { key: 'pct', label: '% с планом', num: true, width: 120, render: (r) => <b style={{ color: r.pct >= 85 ? C.ok : r.pct >= 60 ? C.warn : '#dc2626' }}>{r.pct}%</b> },
  ]
  const lessonColumns = [
    { key: 'lesson_date', label: 'Дата', width: 100, render: (r) => fmtDate(r.lesson_date) },
    { key: 'topic', label: 'Тема', render: (r) => r.topic || <span style={{ color: C.faint }}>—</span> },
    {
      key: 'file_size', label: 'План', width: 160,
      sortValue: (r) => r.file_missing ? -2 : (r.plan_path ? (r.file_size ?? -1) : -3),
      render: (r) => !r.plan_path
        ? <span style={{ color: C.warn, background: C.warnSoft, fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>нет плана</span>
        : r.file_missing
          ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12 }}>файл не найден</span>
          : r.file_size == null
            ? <span style={{ color: C.faint }}>—</span>
            : (
              <span style={{ fontWeight: 700, fontSize: 12.5, color: r.file_size < SMALL_PLAN_BYTES ? '#d97706' : C.slate }}>
                {fmtBytes(r.file_size)}{r.file_size < SMALL_PLAN_BYTES && ' ⚠'}
              </span>
            ),
    },
    {
      key: 'open', label: '', width: 110, sortable: false, render: (r) => r.plan_path ? (
        <button onClick={(e) => { e.stopPropagation(); openPlan(r.plan_path) }} className="rowflex"
          style={{ gap: 5, padding: '5px 10px', background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <ExternalLink size={13} /> Открыть
        </button>
      ) : null,
    },
  ]

  return (
    <div>
      <div className="rowflex" style={{ gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          {drill.level !== 'root' && (
            <button onClick={() => setDrill(drill.level === 'group' ? { level: 'person', kind: drill.kind, id: drill.id } : { level: 'root' })}
              className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 4, padding: 0 }}>
              <ArrowLeft size={15} /> {drill.level === 'group' ? personName : 'Все преподаватели и кураторы'}
            </button>
          )}
          <p style={{ margin: 0, fontSize: 13, color: C.slate }}>
            {drill.level === 'root'
              ? 'Кто сколько провёл занятий и у кого нет плана — нажмите на имя, чтобы посмотреть по группам.'
              : isGroupList
                ? `${personName} — по группам. Нажмите на группу, чтобы увидеть все занятия.`
                : drill.level === 'group'
                  ? `${personName} · ${nameOf(dict.groups, drill.groupId) || ''} — все занятия, можно открыть план.`
                  : `${personName} — индивидуальные занятия (у куратора нет групп), можно открыть план.`}
          </p>
        </div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
      </div>

      {drill.level === 'root' && (smallCount > 0 || missingCount > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {smallCount > 0 && <Counter n={smallCount} label="подозрительно маленьких (< 3 КБ)" color="#d97706" bg="#fef3c7" />}
          {missingCount > 0 && <Counter n={missingCount} label="файл не найден в хранилище" color="#dc2626" bg="#fee2e2" />}
        </div>
      )}

      {sizesUnavailable && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 12.5 }}>
          Не удалось получить размер файлов из хранилища. Открыть и проверить вручную по-прежнему можно.
        </div>
      )}

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : drill.level === 'root' ? (
        !teacherStats.length && !curatorStats.length ? (
          <Empty icon={FileText} title="Занятий нет" text="За этот период ещё не было проведённых занятий." />
        ) : (
          <>
            {teacherStats.length > 0 && (
              <>
                <SectionTitle icon={GraduationCap}>Преподаватели</SectionTitle>
                <DataTable columns={personColumns} rows={teacherStats} pageSize={30}
                  initialSort={{ key: 'pct', dir: 'asc' }}
                  onRowClick={(r) => setDrill({ level: 'person', kind: 'teacher', id: r.id })} />
              </>
            )}
            {curatorStats.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <SectionTitle icon={Users}>Кураторы</SectionTitle>
                <DataTable columns={personColumns} rows={curatorStats} pageSize={30}
                  initialSort={{ key: 'pct', dir: 'asc' }}
                  onRowClick={(r) => setDrill({ level: 'person', kind: 'curator', id: r.id })} />
              </div>
            )}
          </>
        )
      ) : isGroupList ? (
        !groupStats.length ? (
          <Empty icon={Layers} title="Групп нет" text="За этот период у преподавателя нет проведённых занятий." />
        ) : (
          <DataTable columns={groupColumns} rows={groupStats} pageSize={30}
            initialSort={{ key: 'pct', dir: 'asc' }}
            onRowClick={(r) => setDrill({ level: 'group', kind: 'teacher', id: drill.id, groupId: r.id })} />
        )
      ) : isLessonList && !lessonsList.length ? (
        <Empty icon={FileText} title="Занятий нет" text="За этот период здесь нет проведённых занятий." />
      ) : (
        <DataTable columns={lessonColumns} rows={lessonsList} pageSize={30} initialSort={{ key: 'lesson_date', dir: 'desc' }} />
      )}
    </div>
  )
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="rowflex" style={{ gap: 7, marginBottom: 9 }}>
      <Icon size={15} color={C.slate} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '.03em' }}>{children}</span>
    </div>
  )
}

function fmtBytes(n) {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

function Counter({ n, label, color, bg }) {
  return (
    <div className="rowflex" style={{ gap: 8, background: bg, borderRadius: 10, padding: '9px 14px' }}>
      <span style={{ fontSize: 20, fontWeight: 800, color }}>{n}</span>
      <span style={{ fontSize: 12.5, color, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

// ---------- УВЕДОМЛЕНИЯ ----------
function Alerts({ rows, onOpenStudent }) {
  if (!rows?.length) return <Empty icon={Bell} title="Всё спокойно" text="Нет событий, требующих внимания." />

  // группируем по типу
  const byKind = {}
  rows.forEach((r) => { (byKind[r.kind] ||= []).push(r) })
  const KIND_TITLES = {
    risk: 'Ученики в зоне риска',
    no_plan: 'Занятия без плана',
    birthday: 'Дни рождения на этой неделе',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(byKind).map(([kind, items]) => {
        const s = SEV[items[0].severity] || SEV.info
        const Icon = s.icon
        return (
          <div key={kind} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 13, overflow: 'hidden' }}>
            <div className="rowflex" style={{ gap: 9, padding: '11px 14px', background: s.bg, color: s.color }}>
              <Icon size={16} />
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>{KIND_TITLES[kind] || kind}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700 }}>{items.length}</span>
            </div>
            <div>
              {items.slice(0, 12).map((r, i) => (
                <div key={i}
                  onClick={() => kind === 'risk' && onOpenStudent?.(r.ref_id)}
                  className="rowflex"
                  style={{
                    gap: 10, padding: '9px 14px', borderTop: i ? `1px solid ${C.line}` : 'none',
                    cursor: kind === 'risk' && onOpenStudent ? 'pointer' : 'default',
                  }}>
                  <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>{r.title}</span>
                  {r.detail && <span style={{ fontSize: 11.5, color: C.faint }}>{r.detail}</span>}
                </div>
              ))}
              {items.length > 12 && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: C.faint, borderTop: `1px solid ${C.line}` }}>
                  …ещё {items.length - 12}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- НЕПРОВЕДЁННЫЕ ЗАНЯТИЯ ----------
function Missed({ rows }) {
  if (!rows?.length) return <Empty icon={CalendarX} title="Все занятия проведены" text="Нет занятий, которые прошли по дате и остались неотмеченными." />
  return (
    <>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 12.5 }}>
        Эти занятия были запланированы, дата прошла, но преподаватель их не отметил.
      </div>
      <DataTable
        columns={[
          { key: 'lesson_date', label: 'Дата', width: 100, render: (r) => fmtDate(r.lesson_date) },
          { key: 'group_name', label: 'Группа', render: (r) => <b>{r.group_name}</b> },
          { key: 'subject_name', label: 'Предмет', render: (r) => (r.subject_name || '—').split(' / ')[0] },
          { key: 'teacher_name', label: 'Преподаватель' },
          {
            key: 'days_ago', label: 'Дней назад', num: true, width: 110,
            render: (r) => <span style={{ color: r.days_ago > 7 ? '#dc2626' : C.slate, fontWeight: 700 }}>{r.days_ago}</span>,
          },
        ]}
        rows={rows.map((r) => ({ ...r, id: r.lesson_id }))}
        pageSize={25}
        initialSort={{ key: 'days_ago', dir: 'desc' }}
      />
    </>
  )
}

// ---------- ЖУРНАЛ ИЗМЕНЕНИЙ ----------
function AuditLog({ rows }) {
  if (!rows?.length) return <Empty icon={History} title="Журнал пуст" text="Изменения появятся, когда начнётся работа в системе." />
  return (
    <DataTable
      columns={[
        {
          key: 'created_at', label: 'Когда', width: 150,
          render: (r) => {
            const d = new Date(r.created_at)
            return (
              <span style={{ fontSize: 12 }}>
                {d.toLocaleDateString('ru-RU')} <span style={{ color: C.faint }}>{d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
            )
          },
        },
        {
          key: 'actor_name', label: 'Кто', render: (r) => (
            <span className="rowflex" style={{ gap: 6 }}>
              <User size={13} color={C.faint} />
              {r.actor_name || <span style={{ color: C.faint }}>система</span>}
            </span>
          ),
        },
        {
          key: 'action', label: 'Что сделал', width: 190,
          render: (r) => {
            const col = r.action === 'delete' ? '#dc2626' : r.action === 'insert' ? C.ok : C.slate
            return (
              <span style={{ fontSize: 12.5 }}>
                <b style={{ color: col }}>{ACTIONS[r.action] || r.action}</b>
                {' '}{TABLES[r.table_name] || r.table_name}
              </span>
            )
          },
        },
        {
          key: 'detail', label: 'Подробности', sortable: false,
          render: (r) => {
            const d = r.new_data || r.old_data || {}
            const name = d.full_name || d.name || d.topic || ''
            return <span style={{ fontSize: 12, color: C.slate }}>{name || '—'}</span>
          },
        },
      ]}
      rows={rows}
      pageSize={30}
    />
  )
}

function Empty({ icon: Icon, title, text }) {
  return (
    <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <Icon size={30} color={C.faint} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.slate }}>{text}</div>
    </div>
  )
}
