import React, { useEffect, useState } from 'react'
import {
  Bell, History, CalendarX, AlertTriangle, Cake, FileWarning, RefreshCw, User,
} from 'lucide-react'
import { fetchNotifications, fetchAuditLog, fetchMissedLessons } from '../lib/api'
import { C, fmtDate } from '../lib/utils'
import DataTable from '../components/DataTable'

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

export default function Control({ onOpenStudent }) {
  const [tab, setTab] = useState('alerts')  // alerts | missed | log
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
        <button onClick={load} disabled={loading} className="rowflex"
          style={{ gap: 6, padding: '8px 14px', background: C.grey, color: C.slate, borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          <RefreshCw size={15} /> Обновить
        </button>
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

      {loading ? (
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
