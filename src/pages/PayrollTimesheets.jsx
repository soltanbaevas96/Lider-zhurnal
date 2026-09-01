import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Lock, Unlock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil, X, AlertTriangle,
  Search, Download, RotateCw, ClipboardCheck, TrendingDown,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchPayroll, fetchCuratorPayroll, fetchAssistantPayroll, fetchTimesheetData,
  updateTeacherRate, updateCuratorRate, updateAssistantRate, closePayroll, reopenPayroll,
} from '../lib/api'
import { C, currentMonth, shiftMonthStr, monthRange, lessonCount, nameOf, fmtDate, subjectOf } from '../lib/utils'
import { STATUS_META } from '../lib/perfStatus'
import LessonTable from '../components/LessonTable'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
function fmtDMY(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}` }

const ROLE_META = {
  teachers: { label: 'Преподаватели', kind: 'teachers', singular: 'преподавателя' },
  curators: { label: 'Кураторы', kind: 'curators', singular: 'куратора' },
  assistants: { label: 'Ассистенты', kind: 'assistants', singular: 'ассистента' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown
  return <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{m.dot} {m.label}</span>
}

// =====================================================================
//  «Табель и зарплата» — объединение Timesheets.jsx + Payroll.jsx.
//  Единый месяц (currentMonth/shiftMonthStr — те же безопасные утилиты,
//  что уже используются в PeriodPicker/Аналитике/Дашборде этой сессии,
//  без прохождения через toISOString/UTC).
//
//  Официальные суммы начисления ВСЕГДА берутся из существующих RPC
//  (get_payroll/get_curator_payroll/get_assistant_payroll) — фронт их не
//  пересчитывает, только показывает и сверяет с «сырыми» занятиями из
//  fetchTimesheetData (для табеля/проверки/детализации/расхождений).
// =====================================================================
export default function PayrollTimesheets({ isAdmin, isDirector, isAccountant, dict, onOpenStudent }) {
  const canEditRate = isAdmin || isAccountant
  const canClose = isAdmin // close_payroll/reopen_payroll на сервере и раньше пускали только admin — не ослабляем

  const [month, setMonth] = useState(() => currentMonth())
  const [topTab, setTopTab] = useState('accruals') // accruals | timesheet
  const [roleTab, setRoleTab] = useState('teachers') // teachers | curators | assistants | students(только внутри timesheet)
  const [q, setQ] = useState('')
  const [office, setOffice] = useState('')
  const [statusFilter, setStatusFilter] = useState('') // '' | ok | attention | problem — точный статус (селект)
  const [quickFilter, setQuickFilter] = useState('') // '' | noRate | problem | noPlan | cancelled — быстрые чипы (п.13 ТЗ)
  const [expanded, setExpanded] = useState(null)
  const [editRate, setEditRate] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'close' | 'reopen' | 'force-close'
  const [busy, setBusy] = useState(false)
  const [excelOpen, setExcelOpen] = useState(false)
  const [checkResult, setCheckResult] = useState(null)

  const [teacherRows, setTeacherRows] = useState(null)
  const [curatorRows, setCuratorRows] = useState(null)
  const [assistantRows, setAssistantRows] = useState(null)
  const [ts, setTs] = useState(null) // { lessons, attendance, studentGroups }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const range = useMemo(() => monthRange(month), [month])

  // Результат «Проверить табель» — только для текущего месяца/роли, иначе
  // при смене месяца остался бы виден чужой результат проверки.
  useEffect(() => { setCheckResult(null) }, [month, roleTab])

  // Если ушли из «Табеля» на вкладку «Начисления», а до этого был режим «Ученики» —
  // у начислений такого режима нет, откатываемся на преподавателей.
  useEffect(() => { if (topTab === 'accruals' && roleTab === 'students') setRoleTab('teachers') }, [topTab, roleTab])
  // Раскрытая строка ссылается на id конкретной роли — при смене роли/вкладки
  // сворачиваем, чтобы не остался «раскрытым» несуществующий здесь id.
  useEffect(() => { setExpanded(null) }, [roleTab, topTab])

  const reqId = useRef(0)
  function load() {
    const id = ++reqId.current
    setLoading(true); setErr('')
    Promise.all([
      fetchPayroll(month),
      fetchCuratorPayroll(month).catch(() => []),
      fetchAssistantPayroll(range.from, range.to),
      fetchTimesheetData(range),
    ]).then(([t, c, a, tsd]) => {
      if (id !== reqId.current) return
      setTeacherRows(t); setCuratorRows(c); setAssistantRows(a); setTs(tsd)
    }).catch((e) => {
      if (id !== reqId.current) return
      setErr(e.message || 'Не удалось загрузить данные')
    }).finally(() => { if (id === reqId.current) setLoading(false) })
  }
  useEffect(() => { load() }, [month])

  const shiftMonth = (d) => setMonth(shiftMonthStr(month, d))

  // ---------- вспомогательные справочники ----------
  const groupsById = useMemo(() => Object.fromEntries((dict?.groups || []).map((g) => [g.id, g])), [dict])
  const doneLessons = useMemo(() => (ts?.lessons || []).filter((l) => l.status === 'проведён'), [ts])
  const cancelledLessons = useMemo(() => (ts?.lessons || []).filter((l) => l.status === 'отменён'), [ts])

  // office преподавателя/ассистента определяем по группам, где они вели
  // занятия (своего поля office у teachers/assistants нет — только у групп).
  // У кураторов занятия индивидуальные (group_id = null), поэтому офис для
  // них так не определить — фильтр по офису для кураторов не применяем
  // (честно показываем это в интерфейсе, а не подставляем случайное значение).
  function officeOfGroups(gids) {
    for (const gid of gids) { const o = groupsById[gid]?.office; if (o) return o }
    return null
  }

  // ---------- дубли и проверка данных (п.12 ТЗ) ----------
  const issuesByStaff = useMemo(() => {
    const m = {} // key: `${role}:${id}` -> [{severity, message, date}]
    const seenKey = {}
    doneLessons.forEach((l) => {
      const staffKey = l.curator_id ? `curators:${l.curator_id}` : l.teacher_id ? `teachers:${l.teacher_id}` : null
      if (!staffKey) return
      const push = (severity, message) => (m[staffKey] ||= []).push({ severity, message, date: l.lesson_date })
      if (!l.lessons_count || l.lessons_count < 1 || l.lessons_count > 3) push('problem', `Некорректное число уроков (${l.lessons_count ?? '—'}) — ${fmtDate(l.lesson_date)}`)
      if (l.teacher_id && l.group_id) {
        const dupKey = `${l.teacher_id}|${l.group_id}|${l.lesson_date}`
        if (seenKey[dupKey]) push('attention', `Возможный дубль занятия — ${fmtDate(l.lesson_date)}`)
        else seenKey[dupKey] = true
      }
    })
    return m
  }, [doneLessons])

  // ---------- сборка строки «Сотрудник» для активной роли ----------
  const activeRows = useMemo(() => {
    const role = roleTab
    if (role === 'students') return []
    const payrollRows = role === 'teachers' ? (teacherRows || []) : role === 'curators' ? (curatorRows || []) : (assistantRows || [])
    return payrollRows.map((p) => {
      const id = role === 'teachers' ? p.teacher_id : role === 'curators' ? p.curator_id : p.id
      const name = role === 'teachers' ? p.teacher_name : role === 'curators' ? p.curator_name : p.full_name
      const rate = Number(p.rate) || 0
      const payrollUroki = Number(role === 'assistants' ? p.lessons_sum : p.lesson_units) || 0
      const total = Number(role === 'assistants' ? p.pay : p.total) || 0

      const mine = role === 'teachers' ? doneLessons.filter((l) => l.teacher_id === id)
        : role === 'curators' ? doneLessons.filter((l) => l.curator_id === id)
        : doneLessons.filter((l) => l.assistant_id === id || l.assistant2_id === id)
      const cancelledMine = role === 'teachers' ? cancelledLessons.filter((l) => l.teacher_id === id)
        : role === 'curators' ? cancelledLessons.filter((l) => l.curator_id === id)
        : cancelledLessons.filter((l) => l.assistant_id === id || l.assistant2_id === id)

      const timesheetUroki = mine.reduce((s, l) => s + lessonCount(l), 0)
      const sessions = mine.length
      const noPlan = mine.filter((l) => !l.plan_path).length
      const groupIds = [...new Set(mine.map((l) => l.group_id).filter(Boolean))]
      const groups = groupIds.map((gid) => {
        const g = groupsById[gid]
        const own = mine.filter((l) => l.group_id === gid)
        return { id: gid, name: g?.name || '—', subject: nameOf(dict?.subjects || [], g?.subject_id).split(' / ')[0], uroki: own.reduce((s, l) => s + lessonCount(l), 0), sessions: own.length }
      }).sort((a, b) => b.uroki - a.uroki)
      const office = role === 'curators' ? null : officeOfGroups(groupIds)

      const issues = issuesByStaff[`${role}:${id}`] || []
      const hasCritical = issues.some((i) => i.severity === 'problem')
      const discrepancy = timesheetUroki - payrollUroki

      let status = 'ok'
      if ((!rate && sessions > 0) || hasCritical || discrepancy !== 0) status = 'problem'
      else if (cancelledMine.length > 0 || noPlan > 0 || issues.length > 0) status = 'attention'

      return {
        id, name, role, rate, payrollUroki, timesheetUroki, discrepancy, total, sessions,
        noPlan, cancelled: cancelledMine.length, groups, office, issues, status, mine,
        subject: role === 'curators' ? (p.subject || null) : null,
      }
    })
  }, [roleTab, teacherRows, curatorRows, assistantRows, doneLessons, cancelledLessons, groupsById, issuesByStaff, dict])

  const officeOptions = useMemo(() => {
    if (roleTab === 'curators') return []
    return [...new Set(activeRows.map((r) => r.office).filter(Boolean))].sort()
  }, [activeRows, roleTab])

  const filteredRows = useMemo(() => activeRows.filter((r) => {
    // у кураторов office всегда null (см. officeOfGroups) — фильтр по офису
    // для них не применяем, иначе выбранный на другой роли офис молча
    // скрыл бы вообще всех кураторов
    if (office && roleTab !== 'curators' && r.office !== office) return false
    if (statusFilter && r.status !== statusFilter) return false
    if (quickFilter === 'noRate' && !(!r.rate && r.sessions > 0)) return false
    if (quickFilter === 'problem' && r.status !== 'problem') return false
    if (quickFilter === 'noPlan' && !(r.noPlan > 0)) return false
    if (quickFilter === 'cancelled' && !(r.cancelled > 0)) return false
    const s = q.trim().toLowerCase()
    return !s || r.name.toLowerCase().includes(s)
  }).sort((a, b) => {
    const rank = { problem: 0, attention: 1, ok: 2 }
    return rank[a.status] - rank[b.status] || b.total - a.total
  }), [activeRows, office, roleTab, statusFilter, quickFilter, q])

  // ---------- KPI ----------
  const kpi = useMemo(() => {
    const fund = activeRows.reduce((s, r) => s + r.total, 0)
    const uroki = activeRows.reduce((s, r) => s + r.payrollUroki, 0)
    const sessions = activeRows.reduce((s, r) => s + r.sessions, 0)
    const withSessions = activeRows.filter((r) => r.sessions > 0)
    const noRate = withSessions.filter((r) => !r.rate).length
    const problems = activeRows.filter((r) => r.status === 'problem').length
    return { fund, uroki, sessions, count: withSessions.length, noRate, problems }
  }, [activeRows])

  const isClosed = roleTab === 'teachers' ? !!teacherRows?.[0]?.is_closed
    : roleTab === 'curators' ? !!curatorRows?.[0]?.is_closed
    : false // у ассистентов закрытия периода нет — как и раньше

  function runCheck() {
    const ok = activeRows.filter((r) => r.status === 'ok' && r.sessions > 0).length
    const attention = activeRows.filter((r) => r.status === 'attention').length
    const problem = activeRows.filter((r) => r.status === 'problem').length
    setCheckResult({ ok, attention, problem, at: Date.now() })
  }

  async function saveRate(id, rate) {
    if (roleTab === 'teachers') await updateTeacherRate(id, rate)
    else if (roleTab === 'curators') await updateCuratorRate(id, rate)
    else await updateAssistantRate(id, rate)
    await load()
  }

  async function doClose() {
    setBusy(true)
    try { await closePayroll(month); setConfirm(null); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }
  async function doReopen() {
    setBusy(true)
    try { await reopenPayroll(month); setConfirm(null); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  // ---------- Excel ----------
  function exportSheet(kind) {
    const wb = XLSX.utils.book_new()
    if (kind === 'accruals' || kind === 'full') {
      addSheet(wb, 'Начисления', filteredRows.map((r) => ({
        Сотрудник: r.name, Роль: ROLE_META[r.role].label, Офис: r.office || '', Уроки: r.payrollUroki, Занятий: r.sessions,
        'Ставка, ₸': r.rate, 'Начислено, ₸': r.total, Статус: STATUS_META[r.status].label,
      })))
    }
    if (kind === 'timesheet' || kind === 'full') {
      addSheet(wb, 'Табель', filteredRows.map((r) => ({
        Сотрудник: r.name, Офис: r.office || '', Уроки: r.timesheetUroki, Занятий: r.sessions, Групп: r.groups.length,
        'Без плана': r.noPlan, Отменено: r.cancelled, Расхождение: r.discrepancy,
      })))
    }
    if (kind === 'detail' || kind === 'full') {
      const rowsOut = []
      filteredRows.forEach((r) => r.mine.forEach((l) => rowsOut.push({
        Дата: l.lesson_date, Сотрудник: r.name, Офис: r.office || '', Группа: nameOf(dict.groups, l.group_id),
        Предмет: nameOf(dict.subjects, groupsById[l.group_id]?.subject_id).split(' / ')[0], Уроков: lessonCount(l), Статус: l.status,
      })))
      addSheet(wb, 'Детализация', rowsOut)
    }
    if (kind === 'full') {
      const issueRows = []
      activeRows.forEach((r) => r.issues.forEach((i) => issueRows.push({ Сотрудник: r.name, Важность: i.severity === 'problem' ? 'Ошибка' : 'Требует проверки', Сообщение: i.message })))
      activeRows.filter((r) => !r.rate && r.sessions > 0).forEach((r) => issueRows.push({ Сотрудник: r.name, Важность: 'Ошибка', Сообщение: 'Не задана ставка' }))
      addSheet(wb, 'Ошибки', issueRows)
      addSheet(wb, 'Итоги', [{
        Период: monthLabel(month), 'Фонд, ₸': kpi.fund, Уроков: kpi.uroki, Занятий: kpi.sessions,
        Сотрудников: kpi.count, 'Без ставки': kpi.noRate, Ошибок: kpi.problems,
      }])
    }
    XLSX.writeFile(wb, `Табель_и_зарплата_${ROLE_META[roleTab]?.label || ''}_${monthLabel(month).replace(' ', '_')}.xlsx`)
    setExcelOpen(false)
  }

  return (
    <div>
      {/* ---------- ШАПКА ---------- */}
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Табель и зарплата</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.slate }}>{fmtDMY(range.from)} — {fmtDMY(range.to)}</p>
        </div>
        <div className="rowflex" style={{ gap: 6 }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn} title="Предыдущий месяц"><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</span>
          <button onClick={() => shiftMonth(1)} style={navBtn} title="Следующий месяц"><ChevronRight size={16} /></button>
          {month !== currentMonth() && (
            <button onClick={() => setMonth(currentMonth())} style={{ ...navBtn, width: 'auto', padding: '0 11px', fontSize: 12.5, fontWeight: 600 }}>Текущий месяц</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3, marginBottom: 16, gap: 2 }}>
        {[{ k: 'accruals', t: 'Начисления' }, { k: 'timesheet', t: 'Табель' }].map((o) => {
          const on = topTab === o.k
          return <button key={o.k} onClick={() => setTopTab(o.k)}
            style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, background: on ? C.card : 'transparent', color: on ? C.brand : C.slate, boxShadow: on ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>{o.t}</button>
        })}
      </div>

      {/* Переключатель роли */}
      <div className="rowflex" style={{ gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.entries(ROLE_META).map(([k, v]) => {
          const on = roleTab === k
          return <button key={k} onClick={() => setRoleTab(k)}
            style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>{v.label}</button>
        })}
        {topTab === 'timesheet' && (
          <button onClick={() => setRoleTab('students')}
            style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: roleTab === 'students' ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: roleTab === 'students' ? C.brand : '#fff', color: roleTab === 'students' ? '#fff' : C.slate }}>Ученики</button>
        )}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : err ? (
        <ErrorBlock text={err} onRetry={load} />
      ) : roleTab === 'students' ? (
        <StudentTimesheetMode ts={ts} dict={dict} onOpenStudent={onOpenStudent} monthLabel={monthLabel(month)} />
      ) : (
        <>
          {/* Фильтры */}
          <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
              <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск сотрудника…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
            </div>
            {roleTab !== 'curators' ? (
              <select value={office} onChange={(e) => setOffice(e.target.value)} style={selSty}>
                <option value="">Все офисы</option>
                {officeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 11.5, color: C.faint, alignSelf: 'center' }}>у кураторов индивидуальные занятия — офис не определяется</span>
            )}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selSty}>
              <option value="">Все статусы</option>
              <option value="problem">🔴 Ошибка</option>
              <option value="attention">🟡 Требует проверки</option>
              <option value="ok">🟢 Готово</option>
            </select>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setExcelOpen((v) => !v)} className="rowflex" style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <Download size={15} /> Excel
              </button>
              {excelOpen && (
                <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(20,24,58,.15)', zIndex: 20, minWidth: 200 }}>
                  {[['accruals', 'Начисления'], ['timesheet', 'Табель'], ['detail', 'Детализация занятий'], ['full', 'Полный отчёт (все листы)']].map(([k, t]) => (
                    <div key={k} onClick={() => exportSheet(k)} style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer', borderBottom: k !== 'full' ? `1px solid ${C.line}` : 'none' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = C.grey} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>{t}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Быстрый фильтр «только проблемы» (п.13 ТЗ) — отдельная ось от
              выпадающего «Статус» выше: сужает по конкретной причине */}
          <div className="rowflex" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[['', 'Все'], ['noRate', 'Без ставки'], ['problem', 'Есть ошибки'], ['noPlan', 'Без плана'], ['cancelled', 'Есть отмены']].map(([k, t]) => (
              <QuickChip key={k} active={quickFilter === k} onClick={() => setQuickFilter(k)}>{t}</QuickChip>
            ))}
          </div>

          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label="Фонд оплаты" value={`${money(kpi.fund)} ₸`} main />
            <Kpi label="Уроков" value={kpi.uroki} />
            <Kpi label="Занятий" value={kpi.sessions} />
            <Kpi label="Сотрудников" value={kpi.count} />
            <Kpi label="Без ставки" value={kpi.noRate} tint={kpi.noRate > 0 ? '#d97706' : undefined} onClick={() => setQuickFilter('noRate')} />
            <Kpi label="Ошибки табеля" value={kpi.problems} tint={kpi.problems > 0 ? '#dc2626' : undefined} onClick={() => setQuickFilter('problem')} />
          </div>

          {/* Статус месяца + проверка + закрытие (нет закрытия у ассистентов) */}
          {roleTab !== 'assistants' && (
            <MonthStatusBar isClosed={isClosed} canClose={canClose} kpi={kpi} monthLabel={monthLabel(month)}
              onRunCheck={runCheck} onClose={() => setConfirm('close')} onReopen={() => setConfirm('reopen')} onForceClose={() => setConfirm('force-close')} />
          )}

          {checkResult && (
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 13 }}>
              <b>Проверка завершена</b> ({new Date(checkResult.at).toLocaleTimeString('ru-RU')}):{' '}
              <span style={{ color: '#0f9d58', fontWeight: 700 }}>🟢 {checkResult.ok} без ошибок</span>{' · '}
              <span style={{ color: '#d97706', fontWeight: 700 }}>🟡 {checkResult.attention} требуют проверки</span>{' · '}
              <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 {checkResult.problem} ошибка(и)</span>
            </div>
          )}

          {topTab === 'accruals' ? (
            <AccrualsTable rows={filteredRows} expanded={expanded} setExpanded={setExpanded}
              canEditRate={canEditRate} isClosed={isClosed} onEditRate={setEditRate} />
          ) : (
            <TimesheetTable rows={filteredRows} expanded={expanded} setExpanded={setExpanded} dict={dict} groupsById={groupsById} />
          )}
        </>
      )}

      {editRate && (
        <RateModal row={editRate} onClose={() => setEditRate(null)}
          onSaved={async (val) => { await saveRate(editRate.id, val); setEditRate(null) }} />
      )}

      {confirm && (
        <ConfirmBox
          title={confirm === 'reopen' ? `Открыть ${monthLabel(month)} заново?` : `Закрытие ${monthLabel(month)}`}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm === 'reopen' ? doReopen : doClose}
          confirmText={confirm === 'reopen' ? 'Открыть месяц' : 'Закрыть месяц'}
        >
          {confirm === 'reopen' ? (
            <p style={{ fontSize: 13.5, color: C.slate, lineHeight: 1.5 }}>Зафиксированные начисления будут удалены, месяц снова начнёт пересчитываться по текущим ставкам.</p>
          ) : (
            <>
              <p style={{ fontSize: 13.5, color: C.slate, lineHeight: 1.5, marginBottom: 10 }}>Проверьте данные перед фиксацией.</p>
              <div style={{ background: C.grey, borderRadius: 10, padding: '10px 14px', fontSize: 13, lineHeight: 1.8 }}>
                Сотрудников: <b>{kpi.count}</b><br />Уроков: <b>{kpi.uroki}</b><br />Фонд: <b>{money(kpi.fund)} ₸</b><br />
                Без ставки: <b style={{ color: kpi.noRate ? '#dc2626' : undefined }}>{kpi.noRate}</b><br />
                Ошибок: <b style={{ color: kpi.problems ? '#dc2626' : undefined }}>{kpi.problems}</b>
              </div>
              {confirm === 'force-close' && (
                <p style={{ fontSize: 12.5, color: '#dc2626', marginTop: 10 }}>Есть критические проблемы — закрытие месяца с ошибками не рекомендуется.</p>
              )}
              <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>После закрытия изменение ставки не изменит начисления за этот месяц.</p>
            </>
          )}
        </ConfirmBox>
      )}
    </div>
  )
}

// ================= ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ =================
const navBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center' }
const selSty = { padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5, outline: 'none', background: '#fff' }

function addSheet(wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ ' ': 'нет данных' }])
  if (rows.length) {
    const headers = Object.keys(rows[0])
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)) + 2 }))
    ws['!autofilter'] = { ref: ws['!ref'] }
  }
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}

function QuickChip({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${active ? C.brand : C.line}`, background: active ? C.brand : '#fff', color: active ? '#fff' : C.slate }}>{children}</button>
  )
}

function Kpi({ label, value, main, tint, onClick }) {
  return (
    <div onClick={onClick} style={{ background: main ? C.brandSoft : C.card, border: `1px solid ${main ? '#c7d2fe' : C.line}`, borderRadius: 12, padding: '12px 14px', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: main ? 21 : 19, fontWeight: 800, color: tint || (main ? C.brand : C.ink) }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function ErrorBlock({ text, onRetry }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 14 }}>
      <AlertTriangle size={26} color="#c2360b" style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#c2360b', marginBottom: 4 }}>Не удалось загрузить данные</div>
      {text && <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 14 }}>{text}</div>}
      <button onClick={onRetry} className="rowflex" style={{ gap: 6, margin: '0 auto', padding: '8px 16px', background: '#c2360b', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        <RotateCw size={14} /> Повторить
      </button>
    </div>
  )
}

function SkeletonRows() {
  const bar = (w) => <div style={{ height: 14, width: w, background: C.grey, borderRadius: 6 }} />
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rowflex" style={{ gap: 16, padding: '14px 16px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
          {bar('30%')}{bar('10%')}{bar('10%')}{bar('12%')}{bar('14%')}
        </div>
      ))}
    </div>
  )
}

function Empty({ text }) {
  return <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate, fontSize: 13.5 }}>{text}</div>
}

function MonthStatusBar({ isClosed, canClose, kpi, monthLabel, onRunCheck, onClose, onReopen, onForceClose }) {
  const canCloseNow = kpi.noRate === 0 && kpi.problems === 0
  if (isClosed) {
    return (
      <div className="rowflex" style={{ gap: 9, background: C.okSoft, border: `1px solid ${C.ok}33`, color: '#065f46', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
        <Lock size={15} />
        <span><b>🔒 {monthLabel} — месяц закрыт.</b> Начисления зафиксированы, изменение ставки их не затронет.</span>
        {canClose && (
          <button onClick={onReopen} className="rowflex" style={{ marginLeft: 'auto', gap: 5, padding: '5px 11px', background: '#fff', color: C.slate, borderRadius: 7, fontSize: 12, fontWeight: 700, border: `1px solid ${C.line}`, cursor: 'pointer' }}>
            <Unlock size={12} /> Открыть заново
          </button>
        )}
      </div>
    )
  }
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
      <div className="rowflex" style={{ gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#92400e' }}>🟡 <b>Месяц открыт.</b> Начисления могут измениться до закрытия.</span>
        <div className="rowflex" style={{ marginLeft: 'auto', gap: 8 }}>
          <button onClick={onRunCheck} className="rowflex" style={{ gap: 5, padding: '6px 12px', background: '#fff', color: C.slate, borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: `1px solid ${C.line}`, cursor: 'pointer' }}>
            <ClipboardCheck size={13} /> Проверить табель
          </button>
          {canClose && canCloseNow && (
            <button onClick={onClose} className="rowflex" style={{ gap: 5, padding: '6px 12px', background: C.brand, color: '#fff', borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Lock size={13} /> Закрыть месяц
            </button>
          )}
        </div>
      </div>
      {canClose && !canCloseNow && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #fde68a' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>🔴 Месяц нельзя закрыть — необходимо исправить:</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#92400e' }}>
            {kpi.noRate > 0 && <li>{kpi.noRate} сотрудник(ов) без ставки</li>}
            {kpi.problems > 0 && <li>{kpi.problems} ошибка(и) табеля</li>}
          </ul>
          <button onClick={onForceClose} style={{ marginTop: 8, padding: '5px 11px', background: 'none', color: '#dc2626', borderRadius: 7, fontSize: 11.5, fontWeight: 700, border: '1px solid #fecaca', cursor: 'pointer' }}>
            Всё равно закрыть (не рекомендуется)
          </button>
        </div>
      )}
    </div>
  )
}

// ================= НАЧИСЛЕНИЯ (главная таблица) =================
function AccrualsTable({ rows, expanded, setExpanded, canEditRate, isClosed, onEditRate }) {
  if (rows.length === 0) return <Empty text="Никого не найдено по заданным фильтрам." />
  return (
    <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
      <thead><tr>
        <th style={{ width: 26 }}></th><th>Сотрудник</th><th style={{ width: 100 }}>Офис</th><th style={{ width: 70 }}>Уроки</th>
        <th style={{ width: 75 }}>Занятия</th><th style={{ width: 110 }}>Ставка</th><th style={{ width: 130 }}>Начислено</th><th style={{ width: 130 }}>Статус</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => {
          const isOpen = expanded === r.id
          return (
            <React.Fragment key={r.id}>
              <tr onClick={() => setExpanded(isOpen ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td>{isOpen ? <ChevronUp size={14} color={C.faint} /> : <ChevronDown size={14} color={C.faint} />}</td>
                <td style={{ fontWeight: 600 }}>{r.name}{r.subject ? <span style={{ color: C.faint, fontWeight: 400 }}> · {r.subject}</span> : ''}</td>
                <td>{r.office || '—'}</td>
                <td className="num">{r.payrollUroki}</td>
                <td className="num">{r.sessions}</td>
                <td className="num">
                  <span className="rowflex" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    {r.rate > 0 ? `${money(r.rate)} ₸` : <span style={{ color: '#dc2626', fontWeight: 700 }}>нет</span>}
                    {canEditRate && !isClosed && (
                      <button onClick={(e) => { e.stopPropagation(); onEditRate(r) }} style={{ border: 'none', background: C.grey, color: C.slate, borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}><Pencil size={11} /></button>
                    )}
                  </span>
                </td>
                <td className="num" style={{ color: C.brand, fontWeight: 800 }}>{money(r.total)} ₸</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
              {isOpen && (
                <tr><td colSpan={8} style={{ background: C.grey, padding: '14px 20px' }}>
                  <ExpandedDetail r={r} />
                </td></tr>
              )}
            </React.Fragment>
          )
        })}
      </tbody>
    </table></div></div>
  )
}

function ExpandedDetail({ r }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.2fr) minmax(200px,1fr)', gap: 20 }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', marginBottom: 8 }}>Группы</div>
        {r.groups.length === 0 ? <div style={{ fontSize: 12.5, color: C.faint }}>Нет данных о группах.</div> : r.groups.map((g) => (
          <div key={g.id} className="rowflex" style={{ gap: 8, fontSize: 12.5, padding: '4px 0' }}>
            <span style={{ flex: 1 }}>{g.name} — {g.subject}</span>
            <span style={{ color: C.slate }}><b>{g.uroki}</b> ур. · {g.sessions} зан.</span>
          </div>
        ))}
        <div className="rowflex" style={{ gap: 14, marginTop: 10, fontSize: 12.5, color: C.slate }}>
          <span>Занятий: <b>{r.sessions}</b></span><span>Уроков: <b>{r.payrollUroki}</b></span>
          <span style={{ color: r.noPlan > 0 ? '#d97706' : undefined }}>Без плана: <b>{r.noPlan}</b></span>
          <span style={{ color: r.cancelled > 0 ? '#dc2626' : undefined }}>Отменено: <b>{r.cancelled}</b></span>
        </div>
        {r.issues.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {r.issues.map((i, idx) => (
              <div key={idx} style={{ fontSize: 12, color: i.severity === 'problem' ? '#dc2626' : '#92400e' }}>{i.severity === 'problem' ? '🔴' : '🟡'} {i.message}</div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', marginBottom: 8 }}>Расчёт</div>
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          <div style={{ color: C.slate }}>{r.payrollUroki} уроков × {money(r.rate)} ₸</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.brand, marginTop: 4 }}>= {money(r.total)} ₸</div>
        </div>
        {r.discrepancy !== 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>
            🔴 Расхождение с табелем: табель {r.timesheetUroki} ур. / начисление {r.payrollUroki} ур. (разница {r.discrepancy > 0 ? '+' : ''}{r.discrepancy})
          </div>
        )}
      </div>
    </div>
  )
}

// ================= ТАБЕЛЬ (проверка первичных данных) =================
function TimesheetTable({ rows, expanded, setExpanded, dict, groupsById }) {
  if (rows.length === 0) return <Empty text="Никого не найдено по заданным фильтрам." />
  return (
    <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
      <thead><tr>
        <th style={{ width: 26 }}></th><th>Сотрудник</th><th style={{ width: 100 }}>Офис</th><th style={{ width: 70 }}>Уроки</th>
        <th style={{ width: 75 }}>Занятия</th><th style={{ width: 65 }}>Групп</th><th style={{ width: 85 }}>Без плана</th>
        <th style={{ width: 85 }}>Отменено</th><th style={{ width: 150 }}>К начислению</th><th style={{ width: 130 }}>Расхождение</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => {
          const isOpen = expanded === r.id
          return (
            <React.Fragment key={r.id}>
              <tr onClick={() => setExpanded(isOpen ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td>{isOpen ? <ChevronUp size={14} color={C.faint} /> : <ChevronDown size={14} color={C.faint} />}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>{r.office || '—'}</td>
                <td className="num">{r.timesheetUroki}</td>
                <td className="num">{r.sessions}</td>
                <td className="num">{r.groups.length}</td>
                <td className="num" style={{ color: r.noPlan > 0 ? '#d97706' : undefined }}>{r.noPlan}</td>
                <td className="num" style={{ color: r.cancelled > 0 ? '#dc2626' : undefined }}>{r.cancelled}</td>
                <td className="num" style={{ color: C.brand, fontWeight: 700 }}>{r.rate > 0 ? `${money(r.timesheetUroki * r.rate)} ₸` : '—'}</td>
                <td className="num">{r.discrepancy === 0 ? <span title="Расхождений нет">🟢</span> : <span title={`Разница: ${r.discrepancy} уроков`} style={{ color: '#dc2626', fontWeight: 700 }}>🔴 {r.discrepancy > 0 ? '+' : ''}{r.discrepancy}</span>}</td>
              </tr>
              {isOpen && (
                <tr><td colSpan={10} style={{ background: C.grey, padding: '14px 20px' }}>
                  <LessonTable lessons={r.mine} dict={dict} showTeacher={false} />
                </td></tr>
              )}
            </React.Fragment>
          )
        })}
      </tbody>
    </table></div></div>
  )
}

// ================= УЧЕНИКИ (перенесено из Timesheets.jsx без изменений формулы) =================
function StudentTimesheetMode({ ts, dict, onOpenStudent, monthLabel }) {
  const [open, setOpen] = useState(null)
  const doneLessons = useMemo(() => (ts?.lessons || []).filter((l) => l.status === 'проведён'), [ts])

  const rows = useMemo(() => {
    if (!ts) return []
    const attByLesson = {}
    ts.attendance.forEach((a) => { (attByLesson[a.lesson_id] ||= {})[a.student_id] = a.present })
    const subjectByGroup = {}
    ;(dict.groups || []).forEach((g) => { subjectByGroup[g.id] = subjectOf(g.note) || '—' })
    const groupsByStudent = {}
    ts.studentGroups.forEach((sg) => { (groupsByStudent[sg.student_id] ||= new Set()).add(sg.group_id) })

    const result = []
    ;(dict.students || []).forEach((st) => {
      const myGroups = groupsByStudent[st.id] || new Set()
      if (!myGroups.size) return
      const myLessons = doneLessons.filter((l) => myGroups.has(l.group_id))
      if (!myLessons.length) return
      const bySubject = {}
      myLessons.forEach((l) => {
        const subj = subjectByGroup[l.group_id] || '—'
        const b = (bySubject[subj] ||= { total: 0, present: 0, absent: 0, days: [] })
        b.total++
        const present = attByLesson[l.id]?.[st.id]
        const wasPresent = present !== false
        if (wasPresent) b.present++
        else { b.absent++; b.days.push(fmtDate(l.lesson_date)) }
      })
      const subjects = Object.entries(bySubject).map(([subj, v]) => ({ subject: subj, ...v })).sort((a, b) => a.subject.localeCompare(b.subject))
      const total = subjects.reduce((s, x) => s + x.total, 0)
      const present = subjects.reduce((s, x) => s + x.present, 0)
      const absent = subjects.reduce((s, x) => s + x.absent, 0)
      result.push({ id: st.id, name: st.full_name, total, present, absent, subjects })
    })
    return result.sort((a, b) => b.absent - a.absent)
  }, [ts, dict.groups, dict.students, doneLessons])

  function exportStudents() {
    const general = rows.map((r, i) => ({ '№': i + 1, 'Ученик': r.name, 'Занятий было': r.total, 'Посетил': r.present, 'Пропустил': r.absent, 'Явка %': r.total ? Math.round((r.present / r.total) * 100) : 0 }))
    const detailed = []
    rows.forEach((r) => r.subjects.forEach((s) => detailed.push({ 'Ученик': r.name, 'Предмет': s.subject, 'Занятий было': s.total, 'Посетил': s.present, 'Пропустил': s.absent, 'Явка %': s.total ? Math.round((s.present / s.total) * 100) : 0, 'Дни пропусков': s.days.join(', ') })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(general), 'Общий свод')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailed), 'По предметам')
    XLSX.writeFile(wb, `Сводная_ученики_${monthLabel.replace(' ', '_')}.xlsx`)
  }

  if (!rows.length) return <Empty text="За этот период нет данных по ученикам." />
  const pctColor = (p) => p >= 85 ? C.ok : p >= 65 ? '#d97706' : '#dc2626'
  return (
    <>
      <div className="rowflex" style={{ marginBottom: 14 }}>
        <button onClick={exportStudents} className="rowflex" style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={15} /> Excel
        </button>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const pct = r.total ? Math.round((r.present / r.total) * 100) : 0
          const isOpen = open === r.id
          return (
            <div key={r.id} style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div onClick={() => setOpen(isOpen ? null : r.id)} className="rowflex" style={{ padding: '12px 16px', cursor: 'pointer', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={(e) => { if (onOpenStudent) { e.stopPropagation(); onOpenStudent(r.id) } }} style={{ fontSize: 14, fontWeight: 600, color: onOpenStudent ? C.brand : C.ink, cursor: onOpenStudent ? 'pointer' : 'default' }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>было {r.total} · посетил {r.present} · пропустил {r.absent}</div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: pctColor(pct) }}>{pct}%</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.subjects.map((s, si) => {
                    const sp = s.total ? Math.round((s.present / s.total) * 100) : 0
                    return (
                      <div key={si} style={{ background: C.grey, borderRadius: 10, padding: '10px 12px' }}>
                        <div className="rowflex" style={{ gap: 10 }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{s.subject}</span>
                          <span style={{ fontSize: 12, color: C.slate }}>было {s.total} · посетил {s.present} · пропустил {s.absent}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: pctColor(sp), minWidth: 42, textAlign: 'right' }}>{sp}%</span>
                        </div>
                        {s.days.length > 0 && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 5 }}>Пропуски: {s.days.join(', ')}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>
        <TrendingDown size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Вверху — ученики с наибольшим числом пропусков.
      </p>
    </>
  )
}

// ================= МОДАЛКИ =================
function RateModal({ row, onClose, onSaved }) {
  const [rate, setRate] = useState(String(row.rate || ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { await onSaved(rate) } catch (e) { setErr(e.message); setBusy(false) }
  }
  const preview = (Number(rate) || 0) * row.payrollUroki
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22 }}>
        <div className="rowflex" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ставка за урок</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13.5, marginBottom: 14 }}><b>{row.name}</b></div>
        <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 5 }}>Сколько платим за ОДИН урок, ₸</label>
        <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus placeholder="напр. 2500"
          style={{ width: '100%', padding: '11px 13px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontWeight: 700, outline: 'none' }} />
        <div style={{ background: C.grey, borderRadius: 9, padding: '10px 13px', marginTop: 12, fontSize: 13 }}>
          <div style={{ color: C.slate, marginBottom: 3 }}>{row.payrollUroki} уроков × {money(Number(rate) || 0)} ₸</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.brand }}>= {money(preview)} ₸</div>
        </div>
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmBox({ title, children, confirmText, busy, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 420, padding: 22 }}>
        <h3 style={{ margin: '0 0 9px', fontSize: 17, fontWeight: 800 }}>{title}</h3>
        {children}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}
