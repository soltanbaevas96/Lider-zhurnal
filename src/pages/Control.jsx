import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Bell, History, CalendarX, AlertTriangle, Cake, FileWarning, RefreshCw, User, FileText, ExternalLink,
  ArrowLeft, GraduationCap, Users, Layers, ListChecks, X, Copy, Download, Check,
} from 'lucide-react'
import {
  fetchNotifications, fetchAuditLog, fetchMissedLessons, fetchLessonPlansOverview, planUrl,
  runControlChecks, fetchControlTasks, updateControlTask,
} from '../lib/api'
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
  const [tab, setTab] = useState('daily')  // daily | alerts | missed | log | plans
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
    { k: 'daily', t: 'Задачи к исправлению', n: null, icon: ListChecks },
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
        {tab !== 'plans' && tab !== 'daily' && (
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

      {tab === 'daily' ? (
        <DailyControl dict={dict} onOpenStudent={onOpenStudent} />
      ) : tab === 'plans' ? (
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

// ---------- ЕЖЕДНЕВНЫЙ КОНТРОЛЬ (control_tasks) ----------
const PRIO = {
  critical: { label: 'Критично', color: '#dc2626', bg: '#fee2e2' },
  important: { label: 'Важно', color: '#d97706', bg: '#fef3c7' },
  info: { label: 'Информация', color: '#0369a1', bg: '#e0f2fe' },
}
const STATUS = {
  new: { label: 'Новая', color: '#0369a1', bg: '#e0f2fe' },
  assigned: { label: 'Назначена', color: '#7c3aed', bg: '#ede9fe' },
  in_progress: { label: 'В работе', color: '#d97706', bg: '#fef3c7' },
  resolved: { label: 'Исправлена', color: '#16a34a', bg: '#dcfce7' },
  verified: { label: 'Проверена', color: '#0f766e', bg: '#ccfbf1' },
  rejected: { label: 'Отклонена', color: '#64748b', bg: '#f1f5f9' },
}
const ROLE_LABEL = { teacher: 'Преподаватель', curator: 'Куратор', office_manager: 'Офис-менеджер', methodist: 'Методист', accountant: 'Бухгалтер' }
const CATEGORY_LABEL = { teacher: 'Преподаватели', curator: 'Кураторы', students: 'Ученики/группы', schedule: 'Расписание' }
const ACTIVE_STATUSES = ['new', 'assigned', 'in_progress']
const selectStyle = { padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, background: '#fff', color: C.slate, cursor: 'pointer' }

function responsibleName(row, dict) {
  if (row.responsible_user_id) {
    const t = (dict.teachers || []).find((x) => x.profile_id === row.responsible_user_id)
    if (t) return t.full_name
    const c = (dict.curators || []).find((x) => x.profile_id === row.responsible_user_id)
    if (c) return c.full_name
  }
  const label = ROLE_LABEL[row.responsible_role] || row.responsible_role || '—'
  return row.office ? `${label} · ${row.office}` : label
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DailyControl({ dict, onOpenStudent }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(null)
  const [flt, setFlt] = useState({ priority: 'all', status: 'active', category: 'all', office: 'all', q: '' })

  async function load() {
    setLoading(true); setErr('')
    try { setTasks(await fetchControlTasks()) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function runCheck() {
    setChecking(true); setErr('')
    try {
      const res = await runControlChecks()
      await load()
      const parts = []
      if (res?.critical_count) parts.push(`критично: ${res.critical_count}`)
      if (res?.important_count) parts.push(`важно: ${res.important_count}`)
      if (res?.info_count) parts.push(`информация: ${res.info_count}`)
      alert(`Проверка завершена. Активных задач: ${res?.total_active ?? '—'}${parts.length ? ' (' + parts.join(', ') + ')' : ''}.${res?.auto_resolved ? ` Автоматически закрыто (проблема исчезла): ${res.auto_resolved}.` : ''}`)
    } catch (e) { setErr(e.message) }
    finally { setChecking(false) }
  }

  async function saveTask(id, patch) {
    try {
      await updateControlTask(id, patch)
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
    } catch (e) { setErr(e.message) }
  }

  const offices = useMemo(() => Array.from(new Set(tasks.map((t) => t.office).filter(Boolean))).sort(), [tasks])

  const filtered = useMemo(() => tasks.filter((t) => {
    if (flt.priority !== 'all' && t.priority !== flt.priority) return false
    if (flt.status === 'active' ? !ACTIVE_STATUSES.includes(t.status) : flt.status !== 'all' && t.status !== flt.status) return false
    if (flt.category !== 'all' && t.category !== flt.category) return false
    if (flt.office !== 'all' && t.office !== flt.office) return false
    if (flt.q) {
      const q = flt.q.toLowerCase()
      if (!(t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false
    }
    return true
  }), [tasks, flt])

  const active = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status))
  const counts = {
    critical: active.filter((t) => t.priority === 'critical').length,
    important: active.filter((t) => t.priority === 'important').length,
    info: active.filter((t) => t.priority === 'info').length,
    overdue: active.filter((t) => t.due_date && t.due_date < todayStr()).length,
  }

  const columns = [
    {
      key: 'priority', label: '', width: 110, sortValue: (r) => ({ critical: 0, important: 1, info: 2 }[r.priority] ?? 3),
      render: (r) => {
        const p = PRIO[r.priority] || PRIO.info
        return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, color: p.color, background: p.bg }}>{p.label}</span>
      },
    },
    {
      key: 'title', label: 'Проблема', render: (r) => (
        <div>
          <b>{r.title}</b>
          {r.due_date && ACTIVE_STATUSES.includes(r.status) && r.due_date < todayStr() && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#dc2626' }}>просрочено</span>
          )}
        </div>
      ),
    },
    { key: 'responsible', label: 'Ответственный', sortValue: (r) => responsibleName(r, dict), render: (r) => responsibleName(r, dict) },
    { key: 'office', label: 'Офис', width: 130, render: (r) => r.office || '—' },
    { key: 'due_date', label: 'Срок', width: 100, render: (r) => r.due_date ? fmtDate(r.due_date) : '—' },
    {
      key: 'status', label: 'Статус', width: 130,
      render: (r) => {
        const s = STATUS[r.status] || STATUS.new
        return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, color: s.color, background: s.bg }}>{s.label}</span>
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={runCheck} disabled={checking} className="rowflex"
          style={{ gap: 7, padding: '10px 16px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: checking ? 'default' : 'pointer' }}>
          <RefreshCw size={15} /> {checking ? 'Проверяем…' : 'Проверить сейчас'}
        </button>
        <button onClick={load} disabled={loading} className="rowflex"
          style={{ gap: 6, padding: '10px 14px', background: C.grey, color: C.slate, borderRadius: 11, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          <RefreshCw size={15} /> Обновить список
        </button>
        <button onClick={() => copyReport(tasks, dict)} disabled={!active.length} className="rowflex"
          style={{ gap: 6, padding: '10px 14px', background: '#fff', color: active.length ? C.slate : C.faint, border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: active.length ? 'pointer' : 'default' }}>
          <Copy size={14} /> Скопировать отчёт (WhatsApp)
        </button>
        <button onClick={() => exportExcel(tasks, dict)} disabled={!tasks.length} className="rowflex"
          style={{ gap: 6, padding: '10px 14px', background: '#fff', color: tasks.length ? C.slate : C.faint, border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: tasks.length ? 'pointer' : 'default' }}>
          <Download size={14} /> Excel
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Counter n={counts.critical} label="критично" color={PRIO.critical.color} bg={PRIO.critical.bg} />
        <Counter n={counts.important} label="важно" color={PRIO.important.color} bg={PRIO.important.bg} />
        <Counter n={counts.info} label="информация" color={PRIO.info.color} bg={PRIO.info.bg} />
        <Counter n={counts.overdue} label="просрочено" color="#dc2626" bg="#fee2e2" />
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div className="fbar" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select className="fchip" value={flt.priority} onChange={(e) => setFlt((f) => ({ ...f, priority: e.target.value }))} style={selectStyle}>
          <option value="all">Все приоритеты</option>
          <option value="critical">Критично</option>
          <option value="important">Важно</option>
          <option value="info">Информация</option>
        </select>
        <select className="fchip" value={flt.status} onChange={(e) => setFlt((f) => ({ ...f, status: e.target.value }))} style={selectStyle}>
          <option value="active">Активные</option>
          <option value="all">Все статусы</option>
          <option value="new">Новая</option>
          <option value="assigned">Назначена</option>
          <option value="in_progress">В работе</option>
          <option value="resolved">Исправлена</option>
          <option value="verified">Проверена</option>
          <option value="rejected">Отклонена</option>
        </select>
        <select className="fchip" value={flt.category} onChange={(e) => setFlt((f) => ({ ...f, category: e.target.value }))} style={selectStyle}>
          <option value="all">Все категории</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="fchip" value={flt.office} onChange={(e) => setFlt((f) => ({ ...f, office: e.target.value }))} style={selectStyle}>
          <option value="all">Все офисы</option>
          {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="search-box" style={{ flex: 1, minWidth: 180 }}>
          <input value={flt.q} onChange={(e) => setFlt((f) => ({ ...f, q: e.target.value }))} placeholder="Поиск по описанию…"
            style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13 }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : !filtered.length ? (
        <Empty icon={ListChecks} title="Проблем не найдено" text="По текущим фильтрам задач нет. Нажмите «Проверить сейчас», чтобы обновить данные." />
      ) : (
        <DataTable columns={columns} rows={filtered} pageSize={25} onRowClick={(r) => setDetail(r)} initialSort={{ key: 'priority', dir: 'asc' }} />
      )}

      {detail && (
        <TaskDetail task={detail} dict={dict} onClose={() => setDetail(null)} onSave={saveTask} onOpenStudent={onOpenStudent} />
      )}
    </div>
  )
}

function TaskDetail({ task, dict, onClose, onSave, onOpenStudent }) {
  const [status, setStatus] = useState(task.status)
  const [due, setDue] = useState(task.due_date || '')
  const [comment, setComment] = useState(task.comment_admin || '')
  const p = PRIO[task.priority] || PRIO.info

  const save = async () => {
    await onSave(task.id, { status, due_date: due || null, comment_admin: comment })
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14, gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, color: p.color, background: p.bg }}>{p.label}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 16.5, fontWeight: 800 }}>{task.title}</h3>
        {task.description && <p style={{ margin: '0 0 14px', fontSize: 13, color: C.slate }}>{task.description}</p>}
        {task.action_required && (
          <div style={{ background: C.brandSoft, color: C.brand, padding: '9px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            {task.action_required}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: 13, color: C.slate }}>
          <div>Ответственный: <b style={{ color: '#1b1f3b' }}>{responsibleName(task, dict)}</b></div>
          {task.office && <div>Офис: <b style={{ color: '#1b1f3b' }}>{task.office}</b></div>}
          {task.detected_at && <div>Обнаружено: <b style={{ color: '#1b1f3b' }}>{fmtDate(task.detected_at.slice(0, 10))}</b></div>}
        </div>

        {task.student_id && onOpenStudent && (
          <button onClick={() => { onClose(); onOpenStudent(task.student_id) }} className="rowflex"
            style={{ gap: 6, padding: '9px 14px', background: '#fff', color: C.brand, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>
            <ExternalLink size={14} /> Открыть карточку ученика
          </button>
        )}

        <Field label="Статус">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Срок исправления">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13 }} />
        </Field>
        <Field label="Комментарий завуча">
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>

        <button onClick={save} className="rowflex" style={{ gap: 7, width: '100%', justifyContent: 'center', padding: '11px 16px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', marginTop: 6 }}>
          <Check size={16} /> Сохранить
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

// ---------- Отчёт для WhatsApp ----------
function copyReport(tasks, dict) {
  const active = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status))
  const text = buildReportText(active, dict)
  navigator.clipboard?.writeText(text).then(
    () => alert('Отчёт скопирован — можно вставить в WhatsApp.'),
    () => alert('Не удалось скопировать. Текст отчёта:\n\n' + text),
  )
}

function buildReportText(active, dict) {
  const dateStr = new Date().toLocaleDateString('ru-RU')
  const lines = [`📋 Контроль «Лидер+» — ${dateStr}`, '']
  lines.push(`Всего задач: ${active.length} (критично: ${active.filter((t) => t.priority === 'critical').length}, важно: ${active.filter((t) => t.priority === 'important').length}, информация: ${active.filter((t) => t.priority === 'info').length})`, '')

  const byResp = {}
  active.forEach((t) => { (byResp[responsibleName(t, dict)] ||= []).push(t) })
  Object.entries(byResp).sort((a, b) => b[1].length - a[1].length).forEach(([name, items]) => {
    lines.push(`👤 ${name} (${items.length}):`)
    items.forEach((t) => {
      const mark = t.priority === 'critical' ? '🔴' : t.priority === 'important' ? '🟡' : '🔵'
      lines.push(`  ${mark} ${t.title}${t.action_required ? ' — ' + t.action_required : ''}`)
    })
    lines.push('')
  })
  return lines.join('\n').trim()
}

// ---------- Excel-экспорт ----------
function exportExcel(tasks, dict) {
  const wb = XLSX.utils.book_new()
  const rowOf = (t) => ({
    Приоритет: (PRIO[t.priority] || {}).label || t.priority,
    Категория: CATEGORY_LABEL[t.category] || t.category,
    Проблема: t.title,
    Описание: t.description || '',
    'Что нужно сделать': t.action_required || '',
    Ответственный: responsibleName(t, dict),
    Офис: t.office || '',
    Срок: t.due_date || '',
    Статус: (STATUS[t.status] || {}).label || t.status,
    Обнаружено: t.detected_at ? t.detected_at.slice(0, 10) : '',
    Исправлено: t.resolved_at ? t.resolved_at.slice(0, 10) : '',
  })

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks.map(rowOf)), 'Все проблемы')

  const byResp = {}
  tasks.forEach((t) => { (byResp[responsibleName(t, dict)] ||= []).push(t) })
  const byRespRows = Object.entries(byResp).flatMap(([name, items]) => items.map((t) => ({ Сотрудник: name, ...rowOf(t) })))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byRespRows), 'По сотрудникам')

  const byRole = {}
  tasks.forEach((t) => { (byRole[ROLE_LABEL[t.responsible_role] || t.responsible_role || '—'] ||= []).push(t) })
  const byRoleRows = Object.entries(byRole).flatMap(([role, items]) => items.map((t) => ({ Роль: role, ...rowOf(t) })))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byRoleRows), 'По ролям')

  const byOffice = {}
  tasks.forEach((t) => { (byOffice[t.office || '—'] ||= []).push(t) })
  const byOfficeRows = Object.entries(byOffice).flatMap(([office, items]) => items.map((t) => ({ Офис: office, ...rowOf(t) })))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byOfficeRows), 'По офисам')

  const fixed = tasks.filter((t) => t.status === 'resolved' || t.status === 'verified')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fixed.map(rowOf)), 'Исправленные')

  XLSX.writeFile(wb, `Контроль_${todayStr()}.xlsx`)
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
  const [rootTab, setRootTab] = useState('teacher') // teacher | curator — подвкладки на корневом уровне

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

      {drill.level === 'root' && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
          <button onClick={() => setRootTab('teacher')} className="rowflex"
            style={{ gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: rootTab === 'teacher' ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
              background: rootTab === 'teacher' ? C.brand : '#fff', color: rootTab === 'teacher' ? '#fff' : C.slate }}>
            <GraduationCap size={15} /> Преподаватели
            <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20,
              background: rootTab === 'teacher' ? 'rgba(255,255,255,.25)' : C.grey, color: rootTab === 'teacher' ? '#fff' : C.slate }}>{teacherStats.length}</span>
          </button>
          <button onClick={() => setRootTab('curator')} className="rowflex"
            style={{ gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: rootTab === 'curator' ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
              background: rootTab === 'curator' ? C.brand : '#fff', color: rootTab === 'curator' ? '#fff' : C.slate }}>
            <Users size={15} /> Кураторы
            <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20,
              background: rootTab === 'curator' ? 'rgba(255,255,255,.25)' : C.grey, color: rootTab === 'curator' ? '#fff' : C.slate }}>{curatorStats.length}</span>
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : drill.level === 'root' ? (
        rootTab === 'teacher' ? (
          !teacherStats.length ? (
            <Empty icon={GraduationCap} title="Занятий нет" text="За этот период ни один преподаватель не провёл занятий." />
          ) : (
            <DataTable columns={personColumns} rows={teacherStats} pageSize={teacherStats.length}
              initialSort={{ key: 'pct', dir: 'asc' }}
              onRowClick={(r) => setDrill({ level: 'person', kind: 'teacher', id: r.id })} />
          )
        ) : (
          !curatorStats.length ? (
            <Empty icon={Users} title="Занятий нет" text="За этот период ни один куратор не провёл занятий." />
          ) : (
            <DataTable columns={personColumns} rows={curatorStats} pageSize={curatorStats.length}
              initialSort={{ key: 'pct', dir: 'asc' }}
              onRowClick={(r) => setDrill({ level: 'person', kind: 'curator', id: r.id })} />
          )
        )
      ) : isGroupList ? (
        !groupStats.length ? (
          <Empty icon={Layers} title="Групп нет" text="За этот период у преподавателя нет проведённых занятий." />
        ) : (
          <DataTable columns={groupColumns} rows={groupStats} pageSize={groupStats.length}
            initialSort={{ key: 'pct', dir: 'asc' }}
            onRowClick={(r) => setDrill({ level: 'group', kind: 'teacher', id: drill.id, groupId: r.id })} />
        )
      ) : isLessonList && !lessonsList.length ? (
        <Empty icon={FileText} title="Занятий нет" text="За этот период здесь нет проведённых занятий." />
      ) : (
        <DataTable columns={lessonColumns} rows={lessonsList} pageSize={lessonsList.length || 1} initialSort={{ key: 'lesson_date', dir: 'desc' }} />
      )}
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
