import React, { useEffect, useMemo, useState } from 'react'
import {
  Search, X, Plus, Pencil, Trash2, Check, Download, Building2, Users, Wallet,
  BarChart3, ArrowLeft, CalendarClock, School as SchoolIcon,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchPaymentsOverview, fetchMonthlyPaymentTotals, fetchPaymentsGroupsData,
  fetchStudentPayments, addPayment, updatePayment, deletePayment,
  setGroupMonthlyFee, updateStudentPaymentSettings,
} from '../lib/api'
import { C, OFFICES, initials, avColorByIndex, fmtDate, currentMonth, monthOptions } from '../lib/utils'
import { inp, Field } from '../components/ui'
import DataTable from '../components/DataTable'

const LANGS = [{ k: 'каз', t: 'Казахский' }, { k: 'рус', t: 'Русский' }]
const PAYMENT_DUE_DAY = 5 // настраиваемо: до какого числа месяца ждём ежемесячную оплату
const money = (n) => Number(n || 0).toLocaleString('ru-RU')

// ---------- статус одного вида оплаты (входной взнос ИЛИ месяц) ----------
// required: null -> тариф не задан; 0/false -> не требуется
function paymentStatus(required, paid) {
  if (required == null) return 'unset'
  if (required <= 0) return 'not_required'
  if (paid >= required) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}
const STATUS_LABEL = { paid: 'ОПЛАЧЕНО', partial: 'ЧАСТИЧНО', unpaid: 'НЕ ОПЛАЧЕНО', overdue: 'ПРОСРОЧЕНО', not_required: 'НЕ ТРЕБУЕТСЯ', unset: 'ТАРИФ НЕ ЗАДАН' }
const STATUS_COLOR = { paid: '#0f9d58', partial: '#d97706', unpaid: '#dc2626', overdue: '#dc2626', not_required: C.faint, unset: C.faint }
const STATUS_BG = { paid: '#e2f5ea', partial: '#fef3c7', unpaid: '#fee2e2', overdue: '#fee2e2', not_required: C.grey, unset: C.grey }
const STATUS_ICON = { paid: '✓', partial: '~', unpaid: '!', overdue: '!', not_required: '—', unset: '?' }
function StatusChip({ status }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: STATUS_COLOR[status], background: STATUS_BG[status], padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {STATUS_ICON[status]} {STATUS_LABEL[status]}
    </span>
  )
}

// для сортировки «сначала должники»: просрочено -> не оплачено -> частично -> остальное
const STATUS_RANK = { overdue: 0, unpaid: 1, partial: 2, unset: 3, not_required: 4, paid: 5 }
function statusRank(status) { return STATUS_RANK[status] ?? 9 }

export default function PaymentsBase({ fixedOffice }) {
  const [office, setOffice] = useState(fixedOffice || '')
  const [month, setMonth] = useState(currentMonth())
  const [tab, setTab] = useState('overview')
  const [rows, setRows] = useState(null)
  const [groupsData, setGroupsData] = useState({ groups: [], links: [] })
  const [monthlyTotals, setMonthlyTotals] = useState([])
  const [err, setErr] = useState('')
  const [activeStudentId, setActiveStudentId] = useState(null)
  const [quickAdd, setQuickAdd] = useState(null) // { student, type, period, amount }

  const effOffice = fixedOffice || office || null

  async function loadOverview() {
    try { setRows(await fetchPaymentsOverview(effOffice, month)) } catch (e) { setErr(e.message) }
  }
  async function loadGroups() {
    try { setGroupsData(await fetchPaymentsGroupsData()) } catch (e) { setErr(e.message) }
  }
  async function loadMonthly() {
    try { setMonthlyTotals(await fetchMonthlyPaymentTotals(effOffice)) } catch (e) { setErr(e.message) }
  }
  async function reloadAll() {
    await Promise.all([loadOverview(), loadGroups(), loadMonthly()])
  }
  useEffect(() => { loadGroups() }, [])
  useEffect(() => { loadOverview() }, [effOffice, month])
  useEffect(() => { loadMonthly() }, [effOffice])

  const groupsById = useMemo(() => Object.fromEntries(groupsData.groups.map((g) => [g.id, g])), [groupsData])
  const groupsByStudent = useMemo(() => {
    const m = {}
    groupsData.links.forEach((l) => { (m[l.student_id] ||= []).push(l.group_id) })
    return m
  }, [groupsData])

  const today = new Date().toISOString().slice(0, 10)
  const isCurrentOrPastMonth = month <= currentMonth()

  const enriched = useMemo(() => (rows || []).map((s) => {
    const groupIds = groupsByStudent[s.id] || []
    const entryStatus = paymentStatus(s.entry_fee_required ? s.entry_fee_amount : 0, s.entry_fee_paid)
    let monthlyStatusRaw = paymentStatus(s.monthly_fee, s.monthly_paid)
    let monthlyStatus = monthlyStatusRaw
    let daysOverdue = 0
    if (isCurrentOrPastMonth && (monthlyStatusRaw === 'unpaid' || monthlyStatusRaw === 'partial')) {
      const due = new Date(`${month}-${String(PAYMENT_DUE_DAY).padStart(2, '0')}T00:00:00`)
      const diff = Math.floor((new Date(today) - due) / 86400000)
      if (diff > 0) { monthlyStatus = 'overdue'; daysOverdue = diff }
    }
    const debt = Math.max(0, (s.monthly_fee || 0) - (s.monthly_paid || 0)) + Math.max(0, (s.entry_fee_required ? (s.entry_fee_amount || 0) : 0) - (s.entry_fee_paid || 0))
    // общий статус строки — берём худший из двух
    const overallStatus = statusRank(monthlyStatus) <= statusRank(entryStatus) ? monthlyStatus : entryStatus
    return { ...s, groupIds, entryStatus, monthlyStatus, overallStatus, debt, daysOverdue }
  }), [rows, groupsByStudent, month, isCurrentOrPastMonth, today])

  const enrichedById = useMemo(() => Object.fromEntries(enriched.map((s) => [s.id, s])), [enriched])

  const kpi = useMemo(() => {
    const total = enriched.length
    const paid = enriched.filter((s) => s.monthlyStatus === 'paid').length
    const partial = enriched.filter((s) => s.monthlyStatus === 'partial').length
    const unpaid = enriched.filter((s) => s.monthlyStatus === 'unpaid' || s.monthlyStatus === 'overdue').length
    const collected = enriched.reduce((n, s) => n + Number(s.monthly_paid || 0) + Number(s.entry_fee_paid || 0), 0)
    const expected = enriched.reduce((n, s) => n + Number(s.monthly_fee || 0) + (s.entry_fee_required ? Number(s.entry_fee_amount || 0) : 0), 0)
    const debtTotal = enriched.reduce((n, s) => n + s.debt, 0)
    const pct = expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null
    return { total, paid, partial, unpaid, collected, expected, debtTotal, pct }
  }, [enriched])

  function openQuickPay(student, type) {
    const period = type === 'monthly' ? month : null
    const amount = type === 'monthly' ? Math.max(0, (student.monthly_fee || 0) - (student.monthly_paid || 0))
      : Math.max(0, (student.entry_fee_amount || 0) - (student.entry_fee_paid || 0))
    setQuickAdd({ student, type, period, amount: amount || '' })
  }

  const TABS = [
    { k: 'overview', t: 'Обзор', icon: Wallet },
    { k: 'students', t: 'Ученики', icon: Users },
    { k: 'months', t: 'По месяцам', icon: CalendarClock },
    { k: 'groups', t: 'По группам', icon: SchoolIcon },
    { k: 'analytics', t: 'Аналитика', icon: BarChart3 },
  ]

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Оплаты</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Кто оплатил, кто должен и сколько — по всему центру.</p>
        </div>
        <MonthPicker month={month} setMonth={setMonth} />
        <button onClick={() => setQuickAdd({ student: null, type: 'monthly', period: month, amount: '' })} className="rowflex"
          style={{ gap: 6, padding: '9px 16px', background: C.brandSoft, color: C.brand, borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={15} /> Добавить оплату
        </button>
        <button onClick={() => exportPaymentsExcel(enriched, month)} className="rowflex"
          style={{ gap: 6, padding: '9px 16px', background: C.ok, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={15} /> Excel
        </button>
      </div>

      {!fixedOffice && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {[['', 'Все офисы'], ...OFFICES.map((o) => [o, o])].map(([v, t]) => {
            const on = office === v
            return (
              <button key={v || 'all'} onClick={() => setOffice(v)} className="rowflex"
                style={{ gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
                <Building2 size={14} /> {t}
              </button>
            )
          })}
        </div>
      )}

      <div className="rowflex" style={{ gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((o) => {
          const on = tab === o.k
          const Icon = o.icon
          return (
            <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
              style={{ gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
              <Icon size={14} /> {o.t}
            </button>
          )
        })}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {rows === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : tab === 'overview' ? (
        <OverviewTab kpi={kpi} students={enriched} month={month} onOpenStudent={setActiveStudentId} onQuickPay={openQuickPay} />
      ) : tab === 'students' ? (
        <StudentsTab students={enriched} groupsById={groupsById} month={month}
          onOpenStudent={setActiveStudentId} onQuickPay={openQuickPay} />
      ) : tab === 'months' ? (
        <MonthsTab totals={monthlyTotals} currentExpected={kpi.expected} />
      ) : tab === 'groups' ? (
        <GroupsTab students={enriched} groups={groupsData.groups} onOpenStudent={setActiveStudentId} onSaved={loadGroups} />
      ) : (
        <AnalyticsTab students={enriched} groups={groupsData.groups} monthlyTotals={monthlyTotals} />
      )}

      {activeStudentId && enrichedById[activeStudentId] && (
        <StudentPaymentsModal student={enrichedById[activeStudentId]} month={month}
          onClose={() => setActiveStudentId(null)} onChanged={reloadAll} />
      )}

      {quickAdd && (
        <PaymentForm student={quickAdd.student} students={enriched} defaultType={quickAdd.type} defaultPeriod={quickAdd.period} defaultAmount={quickAdd.amount}
          onClose={() => setQuickAdd(null)} onSaved={async () => { setQuickAdd(null); await reloadAll() }} />
      )}
    </div>
  )
}

// ================= ОБЗОР =================
function OverviewTab({ kpi, students, month, onOpenStudent, onQuickPay }) {
  const [quick, setQuick] = useState('all')
  const filtered = students.filter((s) => {
    if (quick === 'paid') return s.monthlyStatus === 'paid'
    if (quick === 'partial') return s.monthlyStatus === 'partial'
    if (quick === 'debt') return s.debt > 0
    return true
  })
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Kpi label="Всего учеников" value={kpi.total} />
        <Kpi label="Оплатили" value={kpi.paid} tint={C.ok} />
        <Kpi label="Частично" value={kpi.partial} tint="#d97706" />
        <Kpi label="Не оплатили" value={kpi.unpaid} tint="#dc2626" />
        <Kpi label="Собрано" value={`${money(kpi.collected)} ₸`} />
        <Kpi label="Ожидается" value={`${money(kpi.expected)} ₸`} />
        <Kpi label="Долг" value={`${money(kpi.debtTotal)} ₸`} tint={kpi.debtTotal > 0 ? '#dc2626' : C.ok} />
        <Kpi label="% оплаты" value={kpi.pct != null ? `${kpi.pct}%` : '—'} tint={kpi.pct != null && kpi.pct >= 90 ? C.ok : '#d97706'} />
      </div>

      <div className="rowflex" style={{ gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['all', 'Все'], ['paid', 'Оплачено'], ['partial', 'Частично'], ['debt', 'Должники']].map(([k, t]) => {
          const on = quick === k
          return (
            <button key={k} onClick={() => setQuick(k)}
              style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
              {t}
            </button>
          )
        })}
      </div>

      <StudentsTable rows={filtered} month={month} onOpenStudent={onOpenStudent} onQuickPay={onQuickPay} />
    </div>
  )
}

// ================= УЧЕНИКИ =================
function StudentsTab({ students, groupsById, month, onOpenStudent, onQuickPay }) {
  const [group, setGroup] = useState('')
  const [school, setSchool] = useState('')
  const [lang, setLang] = useState('')
  const [status, setStatus] = useState('')
  const [debtMin, setDebtMin] = useState(''); const [debtMax, setDebtMax] = useState('')
  const [q, setQ] = useState('')

  const groups = useMemo(() => Object.values(groupsById).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [groupsById])
  const schools = useMemo(() => [...new Set(students.map((s) => s.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [students])

  const filtered = students.filter((s) => {
    if (group && !s.groupIds.includes(group)) return false
    if (school && s.school !== school) return false
    if (lang && s.lang !== lang) return false
    if (status && s.overallStatus !== status) return false
    if (debtMin !== '' && s.debt < Number(debtMin)) return false
    if (debtMax !== '' && s.debt > Number(debtMax)) return false
    const t = q.toLowerCase().trim()
    return !t || s.full_name.toLowerCase().includes(t) || (s.phone || '').includes(t) || (s.group_names || '').toLowerCase().includes(t) || (s.school || '').toLowerCase().includes(t)
  })

  return (
    <div>
      <div className="rowflex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <SelectF value={group} onChange={setGroup} placeholder="Все группы" options={groups.map((g) => [g.id, g.name])} />
        <SelectF value={school} onChange={setSchool} placeholder="Все школы" options={schools.map((s) => [s, s])} />
        <SelectF value={lang} onChange={setLang} placeholder="Все языки" options={LANGS.map((l) => [l.k, l.t])} />
        <SelectF value={status} onChange={setStatus} placeholder="Любой статус"
          options={[['paid', 'Оплачено'], ['partial', 'Частично'], ['unpaid', 'Не оплачено'], ['overdue', 'Просрочено'], ['unset', 'Тариф не задан']]} />
        <RangeF label="Долг" min={debtMin} max={debtMax} setMin={setDebtMin} setMax={setDebtMax} />
        <SearchF q={q} setQ={setQ} />
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Учеников: <b>{filtered.length}</b></div>
      <StudentsTable rows={filtered} month={month} onOpenStudent={onOpenStudent} onQuickPay={onQuickPay} />
    </div>
  )
}

// ---------- общая таблица учеников (используется в Обзоре и Учениках) ----------
function StudentsTable({ rows, month, onOpenStudent, onQuickPay }) {
  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => (
      <div className="rowflex" style={{ gap: 9 }}>
        <div className="av" style={{ width: 26, height: 26, fontSize: 10.5, background: avColorByIndex(s._i || 0) }}>{initials(s.full_name)}</div>
        <b style={{ color: C.brand }}>{s.full_name}</b>
      </div>
    )},
    { key: 'group_names', label: 'Группа' },
    { key: 'school', label: 'Школа', render: (s) => s.school || <span style={{ color: C.faint }}>—</span> },
    { key: 'entryStatus', label: 'Входной взнос', width: 130, sortable: false, render: (s) => <StatusChip status={s.entryStatus} /> },
    { key: 'monthlyStatus', label: 'Текущий месяц', width: 130, sortValue: (s) => statusRank(s.overallStatus), render: (s) => <StatusChip status={s.monthlyStatus} /> },
    { key: 'debt', label: 'Задолженность', num: true, width: 130, render: (s) => s.debt > 0 ? <b style={{ color: '#dc2626' }}>{money(s.debt)} ₸</b> : <span style={{ color: C.ok, fontWeight: 700 }}>0 ₸</span> },
    { key: 'last_payment_date', label: 'Последняя оплата', width: 130, sortValue: (s) => s.last_payment_date || '', render: (s) => s.last_payment_date ? fmtDate(s.last_payment_date) : <span style={{ color: C.faint }}>—</span> },
    { key: 'act', label: '', width: 100, sortable: false, render: (s) => (
      <button onClick={(e) => { e.stopPropagation(); onQuickPay(s, s.debt > 0 && s.monthlyStatus !== 'paid' ? 'monthly' : 'entry_fee') }} className="rowflex"
        style={{ gap: 5, padding: '5px 10px', background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        <Plus size={12} /> Оплата
      </button>
    )},
  ]
  return rows.length === 0 ? <Empty icon={Users} text="Учеников не найдено" /> : (
    <DataTable columns={columns.map((c) => ({ ...c }))} rows={rows.map((s, i) => ({ ...s, _i: i }))} pageSize={rows.length}
      onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'monthlyStatus', dir: 'asc' }} />
  )
}

// ================= ПО МЕСЯЦАМ =================
function MonthsTab({ totals, currentExpected }) {
  const rows = totals.map((t) => ({
    ...t, id: t.payment_period,
    expected: currentExpected,
    debt: Math.max(0, currentExpected - t.collected),
    pct: currentExpected > 0 ? Math.round((t.collected / currentExpected) * 1000) / 10 : null,
  }))
  const columns = [
    { key: 'payment_period', label: 'Месяц', render: (r) => <b>{monthLabel(r.payment_period)}</b> },
    { key: 'expected', label: 'Ожидается', num: true, render: (r) => `${money(r.expected)} ₸` },
    { key: 'collected', label: 'Собрано', num: true, render: (r) => <b style={{ color: C.ok }}>{money(r.collected)} ₸</b> },
    { key: 'debt', label: 'Долг', num: true, render: (r) => r.debt > 0 ? <b style={{ color: '#dc2626' }}>{money(r.debt)} ₸</b> : '0 ₸' },
    { key: 'pct', label: '% оплаты', num: true, render: (r) => r.pct != null ? `${r.pct}%` : '—' },
    { key: 'payments_count', label: 'Платежей', num: true, width: 100 },
  ]
  return (
    <div>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 12.5 }}>
        «Ожидается» и «Долг» считаются по текущим тарифам и текущему составу учеников — для прошлых месяцев это не точная историческая сумма (тарифы тогда могли отличаться), а ориентир при сегодняшних ставках.
      </div>
      {rows.length === 0 ? <Empty icon={CalendarClock} text="Пока нет ни одного платежа" /> : (
        <DataTable columns={columns} rows={rows} pageSize={rows.length} initialSort={{ key: 'payment_period', dir: 'desc' }} />
      )}
    </div>
  )
}
function monthLabel(m) {
  if (!m) return '—'
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(y, mm - 1, 1)
  const s = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ================= ПО ГРУППАМ =================
function GroupsTab({ students, groups, onOpenStudent, onSaved }) {
  const [openGroup, setOpenGroup] = useState(null)
  const rows = groups.map((g) => {
    const list = students.filter((s) => s.groupIds.includes(g.id))
    const expected = list.reduce((n, s) => n + Number(s.monthly_fee || 0), 0)
    const collected = list.reduce((n, s) => n + Number(s.monthly_paid || 0), 0)
    const debt = list.reduce((n, s) => n + Math.max(0, (s.monthly_fee || 0) - (s.monthly_paid || 0)), 0)
    return { ...g, count: list.length, expected, collected, debt, pct: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null, students: list }
  }).filter((g) => g.count > 0)

  if (openGroup) {
    const g = rows.find((r) => r.id === openGroup)
    if (!g) { setOpenGroup(null); return null }
    return <GroupDetail group={g} onBack={() => setOpenGroup(null)} onOpenStudent={onOpenStudent} onSaved={onSaved} />
  }

  const columns = [
    { key: 'name', label: 'Группа', render: (g) => <b style={{ color: C.brand }}>{g.name}</b> },
    { key: 'office', label: 'Офис', width: 110 },
    { key: 'monthly_fee', label: 'Тариф/мес', num: true, width: 100, render: (g) => g.monthly_fee != null ? `${money(g.monthly_fee)} ₸` : <span style={{ color: C.faint }}>не задан</span> },
    { key: 'count', label: 'Учеников', num: true, width: 90 },
    { key: 'expected', label: 'Ожидается', num: true, render: (g) => `${money(g.expected)} ₸` },
    { key: 'collected', label: 'Собрано', num: true, render: (g) => `${money(g.collected)} ₸` },
    { key: 'debt', label: 'Долг', num: true, render: (g) => g.debt > 0 ? <b style={{ color: '#dc2626' }}>{money(g.debt)} ₸</b> : '0 ₸' },
    { key: 'pct', label: '% оплаты', num: true, width: 100, render: (g) => g.pct != null ? `${g.pct}%` : '—' },
  ]
  return rows.length === 0 ? <Empty icon={SchoolIcon} text="Нет групп с учениками" /> : (
    <DataTable columns={columns} rows={rows} pageSize={rows.length} onRowClick={(g) => setOpenGroup(g.id)} initialSort={{ key: 'debt', dir: 'desc' }} />
  )
}

function GroupDetail({ group, onBack, onOpenStudent, onSaved }) {
  const [fee, setFee] = useState(group.monthly_fee ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr(''); setMsg('')
    try { await setGroupMonthlyFee(group.id, fee); setMsg('Сохранено'); await onSaved() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b> },
    { key: 'school', label: 'Школа', render: (s) => s.school || '—' },
    { key: 'monthlyStatus', label: 'Статус', width: 130, sortValue: (s) => statusRank(s.overallStatus), render: (s) => <StatusChip status={s.monthlyStatus} /> },
    { key: 'debt', label: 'Долг', num: true, width: 110, render: (s) => s.debt > 0 ? <b style={{ color: '#dc2626' }}>{money(s.debt)} ₸</b> : '0 ₸' },
  ]

  return (
    <div>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        <ArrowLeft size={15} /> Все группы
      </button>
      <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{group.name}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi label="Учеников" value={group.count} />
        <Kpi label="Ожидается" value={`${money(group.expected)} ₸`} />
        <Kpi label="Собрано" value={`${money(group.collected)} ₸`} />
        <Kpi label="Долг" value={`${money(group.debt)} ₸`} tint={group.debt > 0 ? '#dc2626' : C.ok} />
        <Kpi label="% оплаты" value={group.pct != null ? `${group.pct}%` : '—'} />
      </div>

      <div className="rowflex" style={{ gap: 10, marginBottom: 18, background: C.grey, borderRadius: 10, padding: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Тариф группы, ₸/мес:</span>
        <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="не задан" style={{ ...inp, width: 140, padding: '6px 10px' }} />
        <button onClick={save} disabled={saving} className="rowflex"
          style={{ gap: 5, padding: '7px 14px', background: C.brand, color: '#fff', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          <Check size={13} /> Сохранить
        </button>
        {msg && <span style={{ fontSize: 12, color: C.ok, fontWeight: 600 }}>{msg}</span>}
        {err && <span style={{ fontSize: 12, color: '#c2360b' }}>{err}</span>}
      </div>

      <DataTable columns={columns} rows={group.students} pageSize={group.students.length} onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'monthlyStatus', dir: 'asc' }} />
    </div>
  )
}

// ================= АНАЛИТИКА =================
function AnalyticsTab({ students, groups, monthlyTotals }) {
  function agg(list) {
    const expected = list.reduce((n, s) => n + Number(s.monthly_fee || 0) + (s.entry_fee_required ? Number(s.entry_fee_amount || 0) : 0), 0)
    const collected = list.reduce((n, s) => n + Number(s.monthly_paid || 0) + Number(s.entry_fee_paid || 0), 0)
    const debt = Math.max(0, expected - collected)
    return { count: list.length, expected, collected, debt, pct: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null }
  }

  const officeRows = OFFICES.map((o) => ({ office: o, ...agg(students.filter((s) => s.office === o)) }))
  const schoolMap = {}
  students.forEach((s) => { if (s.school) (schoolMap[s.school] ||= []).push(s) })
  const schoolRows = Object.entries(schoolMap).map(([school, list]) => ({ school, ...agg(list) })).sort((a, b) => b.debt - a.debt)

  const entryList = students.filter((s) => s.entry_fee_required)
  const entryPaid = entryList.filter((s) => s.entryStatus === 'paid').length
  const entryUnpaid = entryList.filter((s) => s.entryStatus !== 'paid').length
  const entryCollected = entryList.reduce((n, s) => n + Number(s.entry_fee_paid || 0), 0)
  const entryExpected = entryList.reduce((n, s) => n + Number(s.entry_fee_amount || 0), 0)

  const monthlyList = students.filter((s) => s.monthly_fee != null)
  const monthlyCollected = monthlyList.reduce((n, s) => n + Number(s.monthly_paid || 0), 0)
  const monthlyExpected = monthlyList.reduce((n, s) => n + Number(s.monthly_fee || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionLabel>По офисам</SectionLabel>
        <SimpleTable rows={officeRows} labelKey="office" labelTitle="Офис" />
      </div>
      <div>
        <SectionLabel>По школам</SectionLabel>
        {schoolRows.length === 0 ? <Empty icon={SchoolIcon} text="Нет данных" /> : <SimpleTable rows={schoolRows} labelKey="school" labelTitle="Школа" />}
      </div>
      <div>
        <SectionLabel>По типам оплат (выбранный месяц)</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <Panel title="Входной взнос">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Kpi label="Требуется" value={entryList.length} />
              <Kpi label="Оплатили" value={entryPaid} tint={C.ok} />
              <Kpi label="Не оплатили" value={entryUnpaid} tint="#dc2626" />
              <Kpi label="Собрано" value={`${money(entryCollected)} ₸`} />
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Ожидается: {money(entryExpected)} ₸ · Долг: {money(Math.max(0, entryExpected - entryCollected))} ₸</div>
          </Panel>
          <Panel title="Ежемесячная оплата">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Kpi label="С заданным тарифом" value={monthlyList.length} />
              <Kpi label="Собрано" value={`${money(monthlyCollected)} ₸`} />
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Ожидается: {money(monthlyExpected)} ₸ · Долг: {money(Math.max(0, monthlyExpected - monthlyCollected))} ₸</div>
          </Panel>
        </div>
      </div>
      <div>
        <SectionLabel>Динамика сбора по месяцам</SectionLabel>
        {monthlyTotals.length === 0 ? <Empty icon={CalendarClock} text="Нет данных" /> : (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
            {monthlyTotals.map((t, i) => (
              <div key={t.payment_period} className="rowflex" style={{ gap: 10, padding: '9px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{monthLabel(t.payment_period)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{money(t.collected)} ₸</span>
                <span style={{ fontSize: 11.5, color: C.faint, width: 90, textAlign: 'right' }}>{t.payments_count} платежей</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
function SimpleTable({ rows, labelKey, labelTitle }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
      <div className="rowflex" style={{ gap: 10, padding: '8px 14px', background: C.grey, fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase' }}>
        <span style={{ flex: 1 }}>{labelTitle}</span>
        <span style={{ width: 80, textAlign: 'right' }}>Учеников</span>
        <span style={{ width: 120, textAlign: 'right' }}>Ожидается</span>
        <span style={{ width: 120, textAlign: 'right' }}>Собрано</span>
        <span style={{ width: 110, textAlign: 'right' }}>Долг</span>
        <span style={{ width: 80, textAlign: 'right' }}>%</span>
      </div>
      {rows.map((r, i) => (
        <div key={r[labelKey]} className="rowflex" style={{ gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{r[labelKey]}</span>
          <span style={{ width: 80, textAlign: 'right', fontSize: 12.5 }}>{r.count}</span>
          <span style={{ width: 120, textAlign: 'right', fontSize: 12.5 }}>{money(r.expected)} ₸</span>
          <span style={{ width: 120, textAlign: 'right', fontSize: 12.5, color: C.ok, fontWeight: 700 }}>{money(r.collected)} ₸</span>
          <span style={{ width: 110, textAlign: 'right', fontSize: 12.5, color: r.debt > 0 ? '#dc2626' : C.slate, fontWeight: 700 }}>{money(r.debt)} ₸</span>
          <span style={{ width: 80, textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>{r.pct != null ? `${r.pct}%` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ================= МЕЛКИЕ UI-ПОМОЩНИКИ =================
function MonthPicker({ month, setMonth }) {
  const opts = monthOptions(11, 2).filter((o) => o.v !== 'all')
  return (
    <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inp, width: 'auto', padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )
}
function SelectF({ value, onChange, placeholder, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, width: 'auto', padding: '7px 10px', fontSize: 12.5 }}>
      <option value="">{placeholder}</option>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  )
}
function RangeF({ label, min, max, setMin, setMax }) {
  return (
    <div className="rowflex" style={{ gap: 4 }}>
      <span style={{ fontSize: 11.5, color: C.faint }}>{label}:</span>
      <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="от" style={{ ...inp, width: 62, padding: '7px 6px', fontSize: 12.5 }} />
      <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="до" style={{ ...inp, width: 62, padding: '7px 6px', fontSize: 12.5 }} />
    </div>
  )
}
function SearchF({ q, setQ }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
      <Search size={14} color={C.faint} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: ФИО, телефон, группа, школа…" style={{ ...inp, padding: '7px 10px 7px 30px', fontSize: 12.5 }} />
    </div>
  )
}
function Kpi({ label, value, tint }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 14px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: tint || C.ink, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{label}</div>
    </div>
  )
}
function Panel({ title, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 9 }}>{children}</div>
}
function Empty({ icon: Icon, text }) {
  return (
    <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <Icon size={28} color={C.faint} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 700 }}>{text}</div>
    </div>
  )
}

// ================= КАРТОЧКА УЧЕНИКА (финансы) =================
function StudentPaymentsModal({ student, month, onClose, onChanged }) {
  const [history, setHistory] = useState(null)
  const [editing, setEditing] = useState(null) // 'new' | платёж | null
  const [confirmDel, setConfirmDel] = useState(null)
  const [entryReq, setEntryReq] = useState(!!student.entry_fee_required)
  const [entryAmt, setEntryAmt] = useState(student.entry_fee_amount ?? '')
  const [customFee, setCustomFee] = useState(student.custom_monthly_fee ?? '')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [err, setErr] = useState('')

  async function loadHistory() {
    try { setHistory(await fetchStudentPayments(student.id)) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { loadHistory() }, [student.id])

  async function saveSettings() {
    setSavingSettings(true); setErr(''); setSettingsMsg('')
    try {
      await updateStudentPaymentSettings(student.id, { custom_monthly_fee: customFee, entry_fee_required: entryReq, entry_fee_amount: entryAmt })
      setSettingsMsg('Сохранено'); await onChanged()
    } catch (e) { setErr(e.message) } finally { setSavingSettings(false) }
  }

  async function remove(id) {
    try { await deletePayment(id); await loadHistory(); await onChanged() } catch (e) { setErr(e.message) }
  }

  const columns = [
    { key: 'paid_at', label: 'Дата', width: 90, render: (p) => fmtDate(p.paid_at) },
    { key: 'payment_type', label: 'Тип', width: 130, render: (p) => p.payment_type === 'entry_fee' ? 'Входной взнос' : 'Ежемесячная' },
    { key: 'payment_period', label: 'Период', width: 110, render: (p) => p.payment_period ? monthLabel(p.payment_period) : '—' },
    { key: 'amount', label: 'Сумма', num: true, width: 100, render: (p) => <b>{money(p.amount)} ₸</b> },
    { key: 'method', label: 'Способ', width: 100, render: (p) => p.method || '—' },
    { key: 'note', label: 'Комментарий', render: (p) => p.note || <span style={{ color: C.faint }}>—</span> },
    { key: 'act', label: '', width: 80, sortable: false, render: (p) => (
      <div className="rowflex" style={{ gap: 4, justifyContent: 'flex-end' }}>
        <button onClick={(e) => { e.stopPropagation(); setEditing(p) }} title="Редактировать" style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }}><Pencil size={14} /></button>
        <button onClick={(e) => { e.stopPropagation(); setConfirmDel(p) }} title="Удалить" style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
      </div>
    )},
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 820, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{student.full_name}</h3>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3 }}>{student.group_names} · {student.office}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
          <FinCard label="Входной взнос" required={entryReq ? Number(entryAmt) || 0 : 0} paid={student.entry_fee_paid} status={student.entryStatus} />
          <FinCard label={monthLabel(month)} required={student.monthly_fee} paid={student.monthly_paid} status={student.monthlyStatus} />
          <Kpi label="Общая задолженность" value={`${money(student.debt)} ₸`} tint={student.debt > 0 ? '#dc2626' : C.ok} />
        </div>

        <div style={{ background: C.grey, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Тариф и входной взнос ученика</div>
          <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap' }}>
            <Field label="Свой тариф, ₸/мес (пусто — тариф группы)">
              <input type="number" value={customFee} onChange={(e) => setCustomFee(e.target.value)} placeholder="как в группе" style={inp} />
            </Field>
            <Field label="Входной взнос">
              <select value={entryReq ? '1' : '0'} onChange={(e) => setEntryReq(e.target.value === '1')} style={inp}>
                <option value="0">Не требуется</option>
                <option value="1">Требуется</option>
              </select>
            </Field>
            {entryReq && (
              <Field label="Сумма входного взноса, ₸">
                <input type="number" value={entryAmt} onChange={(e) => setEntryAmt(e.target.value)} style={inp} />
              </Field>
            )}
          </div>
          <div className="rowflex" style={{ gap: 10 }}>
            <button onClick={saveSettings} disabled={savingSettings} className="rowflex"
              style={{ gap: 6, padding: '8px 16px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: savingSettings ? 0.6 : 1 }}>
              <Check size={14} /> {savingSettings ? 'Сохраняю…' : 'Сохранить'}
            </button>
            {settingsMsg && <span style={{ fontSize: 12.5, color: C.ok, fontWeight: 600 }}>{settingsMsg}</span>}
          </div>
        </div>

        <div className="rowflex" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>История платежей</div>
          <button onClick={() => setEditing('new')} className="rowflex"
            style={{ marginLeft: 'auto', gap: 6, padding: '7px 14px', background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} /> Добавить платёж
          </button>
        </div>

        {history === null ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        ) : history.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: C.grey, borderRadius: 10, color: C.faint, fontSize: 13 }}>Платежей ещё не было.</div>
        ) : (
          <DataTable columns={columns} rows={history} pageSize={history.length} initialSort={{ key: 'paid_at', dir: 'desc' }} />
        )}

        {editing && (
          <PaymentForm student={student} payment={editing === 'new' ? null : editing} defaultType="monthly" defaultPeriod={month}
            onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await loadHistory(); await onChanged() }} />
        )}

        {confirmDel && (
          <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>Удалить платёж?</h3>
              <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 18px' }}>Платёж на {money(confirmDel.amount)} ₸ от {fmtDate(confirmDel.paid_at)} будет удалён без возможности восстановить.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
                <button onClick={() => { const id = confirmDel.id; setConfirmDel(null); remove(id) }}
                  style={{ flex: 1, padding: 11, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Удалить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
function FinCard({ label, required, paid, status }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 14px' }}>
      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
        {required == null ? '—' : `${money(paid)} / ${money(required)} ₸`}
      </div>
      <StatusChip status={status} />
    </div>
  )
}

// ================= ФОРМА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ ПЛАТЕЖА =================
function PaymentForm({ student, students, payment, defaultType, defaultPeriod, defaultAmount, onClose, onSaved }) {
  const isNew = !payment
  const [studentId, setStudentId] = useState(payment ? null : (student?.id || ''))
  const [type, setType] = useState(payment?.payment_type || defaultType || 'monthly')
  const [period, setPeriod] = useState(payment?.payment_period || defaultPeriod || currentMonth())
  const [amount, setAmount] = useState(payment ? String(payment.amount) : (defaultAmount != null ? String(defaultAmount) : ''))
  const [paidAt, setPaidAt] = useState(payment?.paid_at || new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState(payment?.method || '')
  const [note, setNote] = useState(payment?.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const chosenStudent = student || (students || []).find((s) => s.id === studentId)
  const monthOpts = monthOptions(11, 2).filter((o) => o.v !== 'all')

  async function save() {
    if (isNew && !student && !studentId) { setErr('Выберите ученика'); return }
    if (!amount || Number(amount) <= 0) { setErr('Введите сумму больше нуля'); return }
    setBusy(true); setErr('')
    try {
      if (isNew) {
        await addPayment(student ? student.id : studentId, amount, paidAt, method, note, type, type === 'monthly' ? period : null)
      } else {
        await updatePayment(payment.id, { amount, paidAt, method, note, type, period: type === 'monthly' ? period : null })
      }
      await onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.55)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 75 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 440, padding: 22, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{isNew ? 'Новая оплата' : 'Редактировать платёж'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={19} /></button>
        </div>

        {!student && isNew ? (
          <Field label="Ученик">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp}>
              <option value="">— выберите ученика —</option>
              {(students || []).map((s) => <option key={s.id} value={s.id}>{s.full_name} · {s.office}{s.group_names && s.group_names !== '—' ? ` · ${s.group_names}` : ''}</option>)}
            </select>
          </Field>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{chosenStudent?.full_name}</div>
        )}
        {chosenStudent && (
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
            Долг сейчас: <b style={{ color: chosenStudent.debt > 0 ? '#dc2626' : C.ok }}>{money(chosenStudent.debt)} ₸</b>
            {chosenStudent.last_payment_date && <> · последняя оплата {fmtDate(chosenStudent.last_payment_date)}</>}
          </div>
        )}

        <Field label="Тип оплаты">
          <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
            <option value="monthly">Ежемесячная</option>
            <option value="entry_fee">Входной взнос</option>
          </select>
        </Field>
        {type === 'monthly' && (
          <Field label="Период">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={inp}>
              {monthOpts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Сумма, ₸"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="напр. 25000" style={inp} autoFocus /></Field>
        <Field label="Дата"><input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={inp} /></Field>
        <Field label="Способ оплаты">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inp}>
            <option value="">—</option>
            <option value="Каспи">Каспи</option>
            <option value="Карта">Карта</option>
            <option value="Наличные">Наличные</option>
            <option value="Перевод">Перевод</option>
          </select>
        </Field>
        <Field label="Комментарий (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} style={inp} /></Field>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ================= ЭКСПОРТ EXCEL =================
function exportPaymentsExcel(students, month) {
  const wb = XLSX.utils.book_new()

  addSheet(wb, 'Ученики', students.map((s) => ({
    ФИО: s.full_name, Телефон: s.phone || '', Офис: s.office, Группа: s.group_names || '', Школа: s.school || '',
    'Входной взнос': s.entry_fee_required ? (s.entryStatus === 'paid' ? 'Оплачен' : s.entryStatus === 'partial' ? 'Частично' : 'Не оплачен') : 'Не требуется',
    [`Оплата за ${monthLabel(month)}`]: STATUS_LABEL[s.monthlyStatus] || '',
    Оплачено: (s.monthly_paid || 0) + (s.entry_fee_paid || 0),
    Долг: s.debt,
    Статус: STATUS_LABEL[s.overallStatus] || '',
    'Последняя оплата': s.last_payment_date || '',
  })))

  addSheet(wb, 'Должники', students.filter((s) => s.debt > 0).map((s) => ({
    Ученик: s.full_name, Офис: s.office, Группа: s.group_names || '',
    Период: monthLabel(month), 'Требуется (мес)': s.monthly_fee ?? '', 'Оплачено (мес)': s.monthly_paid ?? '',
    'Долг за взнос': Math.max(0, (s.entry_fee_required ? (s.entry_fee_amount || 0) : 0) - (s.entry_fee_paid || 0)),
    Долг: s.debt, 'Последняя оплата': s.last_payment_date || '', 'Дней просрочки': s.daysOverdue || 0,
  })))

  const officeMap = {}
  students.forEach((s) => (officeMap[s.office] ||= []).push(s))
  addSheet(wb, 'По офисам', Object.entries(officeMap).map(([office, list]) => {
    const expected = list.reduce((n, s) => n + Number(s.monthly_fee || 0) + (s.entry_fee_required ? Number(s.entry_fee_amount || 0) : 0), 0)
    const collected = list.reduce((n, s) => n + Number(s.monthly_paid || 0) + Number(s.entry_fee_paid || 0), 0)
    return { Офис: office, Количество: list.length, Ожидается: expected, Собрано: collected, Долг: Math.max(0, expected - collected), '% оплаты': expected ? Math.round((collected / expected) * 1000) / 10 : '' }
  }))

  const groupMap = {}
  students.forEach((s) => (s.group_names || '').split(', ').filter((g) => g && g !== '—').forEach((g) => (groupMap[g] ||= []).push(s)))
  addSheet(wb, 'По группам', Object.entries(groupMap).map(([group, list]) => {
    const expected = list.reduce((n, s) => n + Number(s.monthly_fee || 0), 0)
    const collected = list.reduce((n, s) => n + Number(s.monthly_paid || 0), 0)
    return { Группа: group, Количество: list.length, Ожидается: expected, Собрано: collected, Долг: Math.max(0, expected - collected), '% оплаты': expected ? Math.round((collected / expected) * 1000) / 10 : '' }
  }))

  XLSX.writeFile(wb, `Оплаты_${monthLabel(month).replace(' ', '_')}.xlsx`)
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
