import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Wallet, Download, Lock, Unlock, ChevronLeft, ChevronRight, Pencil, X, AlertTriangle, Search, RotateCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchPayroll, closePayroll, reopenPayroll, updateTeacherRate,
} from '../lib/api'
import { C, currentMonth, shiftMonthStr, monthRange } from '../lib/utils'
import DataTable from '../components/DataTable'
import Curators from './Curators'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

// 'YYYY-MM-DD' -> 'ДД.ММ.ГГГГ' — чистая строковая работа, без Date/toISOString
// (см. п.9 ТЗ про timezone: любое прохождение через new Date().toISOString()
// в часовом поясе Казахстана (UTC+5) может сдвинуть календарную дату).
function fmtDMY(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function Payroll({ isAdmin, canEditRate }) {
  const canEdit = canEditRate ?? isAdmin
  const [payTab, setPayTab] = useState('teachers') // teachers | curators | assistants

  // ---------- ЕДИНЫЙ выбранный месяц для всех трёх подвкладок ----------
  // Формат всегда 'YYYY-MM'. Инициализация и переключение — ТОЛЬКО через
  // currentMonth()/shiftMonthStr() (lib/utils): они читают/пишут местные
  // календарные поля (getFullYear/getMonth), а не UTC через toISOString.
  // Раньше здесь было new Date().toISOString().slice(0,7) — в часовом поясе
  // Казахстана (UTC+5) это на несколько часов вокруг полуночи «съедало» день
  // и сбивало месяц (см. п.8-9 ТЗ). currentMonth/shiftMonthStr уже
  // используются в PeriodPicker.jsx без такой проблемы — переиспользуем их,
  // а не изобретаем новую логику дат.
  const [month, setMonth] = useState(() => currentMonth())
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editRate, setEditRate] = useState(null) // преподаватель для правки ставки
  const [confirm, setConfirm] = useState(null)   // 'close' | 'reopen'
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [onlyNoRate, setOnlyNoRate] = useState(false)

  const isClosed = rows?.[0]?.is_closed || false
  const range = monthRange(month) // { from, to } — оба YYYY-MM-DD, чистая строковая арифметика

  // Защита от гонки запросов (п.19 ТЗ): если пользователь быстро кликает
  // по стрелкам, применяем только результат САМОГО ПОСЛЕДНЕГО запроса.
  const reqId = useRef(0)
  async function load() {
    const id = ++reqId.current
    setLoading(true); setErr('')
    try {
      const data = await fetchPayroll(month)
      if (id !== reqId.current) return // пришёл устаревший ответ — игнорируем
      setRows(data)
    } catch (e) {
      if (id !== reqId.current) return
      setErr(e.message || 'Не удалось загрузить данные')
      setRows(null)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }
  useEffect(() => { load() }, [month])

  const shiftMonth = (d) => setMonth(shiftMonthStr(month, d))

  const totals = useMemo(() => {
    const r = rows || []
    return {
      sum: r.reduce((s, x) => s + Number(x.total || 0), 0),
      units: r.reduce((s, x) => s + Number(x.lesson_units || 0), 0),
      sessions: r.reduce((s, x) => s + Number(x.sessions || 0), 0),
      noRate: r.filter((x) => !Number(x.rate)).length,
    }
  }, [rows])

  // Поиск по ФИО + фильтр «только без ставки» — работает по уже загруженным
  // данным, мгновенно, без повторных запросов (п.30 ТЗ).
  const visibleRows = useMemo(() => {
    let r = rows || []
    if (onlyNoRate) r = r.filter((x) => !Number(x.rate))
    const s = q.trim().toLowerCase()
    if (s) r = r.filter((x) => (x.teacher_name || '').toLowerCase().includes(s))
    return r
  }, [rows, q, onlyNoRate])

  async function doClose() {
    setBusy(true); setErr('')
    try { await closePayroll(month); setConfirm(null); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }
  async function doReopen() {
    setBusy(true); setErr('')
    try { await reopenPayroll(month); setConfirm(null); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  function exportXlsx() {
    const monthLabel = `${MONTHS[Number(month.slice(5, 7)) - 1]}_${month.slice(0, 4)}`
    const data = (rows || []).map((r, i) => ({
      '№': i + 1,
      'Преподаватель': r.teacher_name,
      'Ставка за урок': Number(r.rate),
      'Уроков': r.lesson_units,
      'Занятий': r.sessions,
      'К выплате': Number(r.total),
      'Статус': Number(r.rate) > 0 ? 'Ставка задана' : 'Нет ставки',
    }))
    data.push({
      '№': '', 'Преподаватель': 'ИТОГО', 'Ставка за урок': '',
      'Уроков': totals.units, 'Занятий': totals.sessions, 'К выплате': totals.sum, 'Статус': '',
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Зарплата')
    XLSX.writeFile(wb, `Зарплата_${monthLabel}.xlsx`)
  }

  const columns = [
    { key: 'teacher_name', label: 'Преподаватель', render: (r) => <b>{r.teacher_name}</b> },
    {
      key: 'rate', label: 'Ставка/урок', num: true, width: 130,
      // rate — numeric в Postgres, PostgREST отдаёт его строкой ("3000.00"),
      // поэтому явно приводим к числу для сортировки (иначе "10000" встанет
      // перед "2000" как при текстовом сравнении).
      sortValue: (r) => Number(r.rate) || 0,
      render: (r) => (
        <span className="rowflex" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {Number(r.rate) > 0
            ? <span>{money(r.rate)} ₸</span>
            : <span style={{ color: '#dc2626', fontWeight: 700 }}>не задана</span>}
          {canEdit && !isClosed && (
            <button onClick={(e) => { e.stopPropagation(); setEditRate(r) }} title="Изменить ставку"
              style={{ border: 'none', background: C.grey, color: C.slate, borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}>
              <Pencil size={12} />
            </button>
          )}
        </span>
      ),
    },
    { key: 'lesson_units', label: 'Уроков', num: true, width: 80 },
    { key: 'sessions', label: 'Занятий', num: true, width: 80 },
    {
      key: 'total', label: 'К выплате', num: true, width: 130,
      sortValue: (r) => Number(r.total) || 0,
      render: (r) => <span style={{ color: C.brand, fontWeight: 800, fontSize: 14 }}>{money(r.total)} ₸</span>,
    },
    {
      key: 'status', label: 'Статус', width: 90, sortable: false,
      render: (r) => Number(r.rate) > 0
        ? <span title="Ставка задана">🟢</span>
        : <span title="Нет ставки">🔴</span>,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div className="rowflex" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Зарплата</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.slate }}>Начисления сотрудников за выбранный месяц</p>
          </div>
          {/* Месяц — общий для всех трёх подвкладок */}
          <div className="rowflex" style={{ gap: 6 }}>
            <button onClick={() => shiftMonth(-1)} style={navBtn} title="Предыдущий месяц"><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>
              {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
            </span>
            <button onClick={() => shiftMonth(1)} style={navBtn} title="Следующий месяц"><ChevronRight size={16} /></button>
            {month !== currentMonth() && (
              <button onClick={() => setMonth(currentMonth())}
                style={{ ...navBtn, width: 'auto', padding: '0 11px', fontSize: 12.5, fontWeight: 600 }}>
                Текущий
              </button>
            )}
          </div>
        </div>
        {/* Период и статус месяца одной строкой — важно для бухгалтерии (п.24, 37 ТЗ) */}
        <div className="rowflex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {range && <span style={{ fontSize: 12, color: C.faint }}>{fmtDMY(range.from)} — {fmtDMY(range.to)}</span>}
          {rows?.length > 0 && (
            isClosed
              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>🔒 Месяц закрыт</span>
              : <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>🔓 Месяц открыт</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {[{ k: 'teachers', t: 'Преподаватели' }, { k: 'curators', t: 'Кураторы' }, { k: 'assistants', t: 'Ассистенты' }].map((o) => {
            const on = payTab === o.k
            return (
              <button key={o.k} onClick={() => setPayTab(o.k)}
                style={{
                  padding: '8px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate,
                }}>{o.t}</button>
            )
          })}
        </div>
      </div>

      {payTab === 'curators' ? (
        <Curators isAdmin={isAdmin} canEditRate={canEdit} month={month} />
      ) : payTab === 'assistants' ? (
        <AssistantsPayroll month={month} range={range} monthLabel={`${MONTHS[Number(month.slice(5, 7)) - 1]}_${month.slice(0, 4)}`} />
      ) : (
      <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
        </div>

        {rows?.length > 0 && (
          <button onClick={exportXlsx} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>

      {/* Статус периода */}
      {isClosed ? (
        <div className="rowflex" style={{ gap: 9, background: C.okSoft, border: `1px solid ${C.ok}33`, color: '#065f46', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          <Lock size={15} />
          <span><b>Месяц закрыт.</b> Суммы зафиксированы — изменение ставок их больше не затронет.</span>
          {isAdmin && (
            <button onClick={() => setConfirm('reopen')} className="rowflex"
              style={{ marginLeft: 'auto', gap: 5, padding: '5px 11px', background: '#fff', color: C.slate, borderRadius: 7, fontSize: 12, fontWeight: 700, border: `1px solid ${C.line}`, cursor: 'pointer' }}>
              <Unlock size={12} /> Открыть заново
            </button>
          )}
        </div>
      ) : rows?.length > 0 && isAdmin ? (
        <div className="rowflex" style={{ gap: 9, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <span>Месяц открыт — суммы пересчитываются при изменении ставок. Закройте его, когда всё проверено.</span>
          <button onClick={() => setConfirm('close')} className="rowflex"
            style={{ marginLeft: 'auto', gap: 5, padding: '6px 12px', background: C.brand, color: '#fff', borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Lock size={13} /> Закрыть месяц
          </button>
        </div>
      ) : null}

      {totals.noRate > 0 && !isClosed && (
        <div className="rowflex" style={{ gap: 9, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}
          onClick={() => setOnlyNoRate((v) => !v)}>
          <AlertTriangle size={15} />
          <span>У <b>{totals.noRate}</b> преподавателей не задана ставка — их зарплата считается как 0. {onlyNoRate ? 'Показаны только они.' : 'Нажмите, чтобы показать только их.'}</span>
        </div>
      )}
      {onlyNoRate && (
        <div className="rowflex" style={{ gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: C.slate }}>Фильтр: только без ставки</span>
          <button onClick={() => setOnlyNoRate(false)} className="rowflex"
            style={{ gap: 4, border: 'none', background: C.grey, color: C.slate, borderRadius: 7, padding: '3px 9px', fontSize: 12, cursor: 'pointer' }}>
            <X size={12} /> сбросить
          </button>
        </div>
      )}

      {/* Итоги */}
      {rows?.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <BigCard value={`${money(totals.sum)} ₸`} label="фонд оплаты за месяц" main />
          <BigCard value={totals.units} label="уроков всего" />
          <BigCard value={totals.sessions} label="занятий" />
          <BigCard value={rows.length} label="преподавателей" />
          {totals.noRate > 0 && <BigCard value={totals.noRate} label="без ставки" warn />}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка начислений…</div>
      ) : err ? (
        <div style={{ padding: 40, textAlign: 'center', background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 14 }}>
          <AlertTriangle size={26} color="#c2360b" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#c2360b', marginBottom: 4 }}>Не удалось загрузить данные о зарплате</div>
          <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 14 }}>{err}</div>
          <button onClick={load} className="rowflex" style={{ gap: 6, margin: '0 auto', padding: '8px 16px', background: '#c2360b', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <RotateCw size={14} /> Повторить
          </button>
        </div>
      ) : !rows?.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <Wallet size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            За {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)} года занятий нет
          </div>
          <div style={{ fontSize: 13, color: C.slate }}>Зарплата посчитается, когда преподаватели внесут занятия.</div>
        </div>
      ) : visibleRows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate }}>
          Ничего не найдено по заданным фильтрам.
        </div>
      ) : (
        <DataTable columns={columns} rows={visibleRows.map((r) => ({ ...r, id: r.teacher_id }))} pageSize={40}
          initialSort={{ key: 'rate', dir: 'asc' }} />
      )}

      {editRate && (
        <RateModal teacher={editRate} onClose={() => setEditRate(null)}
          onSaved={async () => { setEditRate(null); await load() }} />
      )}

      {confirm && (
        <ConfirmBox
          title={confirm === 'close' ? `Закрыть ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}?` : `Открыть ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)} заново?`}
          text={confirm === 'close'
            ? `Суммы за ${MONTHS[Number(month.slice(5, 7)) - 1]} будут зафиксированы. Дальнейшее изменение ставок их не затронет. Это можно отменить.`
            : 'Зафиксированные суммы будут удалены, месяц снова начнёт пересчитываться по текущим ставкам.'}
          confirmText={confirm === 'close' ? 'Закрыть месяц' : 'Открыть месяц'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm === 'close' ? doClose : doReopen}
        />
      )}
    </div>
      )}
    </div>
  )
}

// ---------- КОМПОНЕНТЫ ----------
const navBtn = {
  width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`,
  background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center',
}

function BigCard({ value, label, main, warn }) {
  return (
    <div style={{
      background: warn ? '#fee2e2' : main ? C.brandSoft : C.card,
      border: `1px solid ${warn ? '#fecaca' : main ? '#c7d2fe' : C.line}`,
      borderRadius: 12, padding: '13px 18px', minWidth: 150,
    }}>
      <div style={{ fontSize: main ? 24 : 20, fontWeight: 800, color: warn ? '#b91c1c' : main ? C.brand : C.ink, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function RateModal({ teacher, onClose, onSaved }) {
  const [rate, setRate] = useState(String(Number(teacher.rate) || ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    try { await updateTeacherRate(teacher.teacher_id, rate); await onSaved() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const preview = (Number(rate) || 0) * Number(teacher.lesson_units || 0)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22 }}>
        <div className="rowflex" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ставка за урок</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13.5, marginBottom: 14 }}><b>{teacher.teacher_name}</b></div>

        <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 5 }}>
          Сколько платим за ОДИН урок, ₸
        </label>
        <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus
          placeholder="напр. 2500"
          style={{ width: '100%', padding: '11px 13px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontWeight: 700, outline: 'none' }} />

        <div style={{ background: C.grey, borderRadius: 9, padding: '10px 13px', marginTop: 12, fontSize: 13 }}>
          <div style={{ color: C.slate, marginBottom: 3 }}>
            {teacher.lesson_units} уроков × {money(Number(rate) || 0)} ₸
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.brand }}>= {money(preview)} ₸</div>
        </div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>
          Ставка применится ко всем незакрытым месяцам этого преподавателя.
        </p>
      </div>
    </div>
  )
}

function ConfirmBox({ title, text, confirmText, busy, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 400, padding: 22 }}>
        <h3 style={{ margin: '0 0 9px', fontSize: 17, fontWeight: 800 }}>{title}</h3>
        <p style={{ fontSize: 13.5, color: C.slate, lineHeight: 1.5, margin: '0 0 18px' }}>{text}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={onConfirm} disabled={busy}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? '…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// Зарплата ассистентов: уроки × ставка. Диапазон дат берётся из range,
// который считает родитель через monthRange(month) — та же безопасная
// строковая логика дат, что и у преподавателей/кураторов, единый источник
// месяца (п.14, 43-44 ТЗ). get_assistant_payroll сравнивает lesson_date
// с ЗАКРЫТЫМ диапазоном (>= from и <= to, обе границы включительно —
// проверено по определению RPC в 42_second_assistant.sql), поэтому here
// намеренно сохранён закрытый интервал «первое число — последнее число
// месяца», а не полуоткрытый — иначе в выгрузку попал бы лишний день
// (1-е число следующего месяца).
function AssistantsPayroll({ month, range, monthLabel }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // { id, value }

  const reqId = useRef(0)
  function load() {
    if (!range) return
    const id = ++reqId.current
    setRows(null); setErr('')
    import('../lib/api').then(({ fetchAssistantPayroll }) =>
      fetchAssistantPayroll(range.from, range.to)
        .then((data) => { if (id === reqId.current) setRows(data) })
        .catch((e) => { if (id === reqId.current) setErr(e.message || 'Не удалось загрузить данные') }))
  }
  useEffect(() => { load() }, [range?.from, range?.to])

  async function saveRate(id) {
    try {
      const { updateAssistantRate } = await import('../lib/api')
      await updateAssistantRate(id, editing.value)
      setEditing(null); load()
    } catch (e) { setErr(e.message) }
  }

  const total = (rows || []).reduce((s, r) => s + Number(r.pay || 0), 0)

  function exportXlsx() {
    const data = (rows || []).map((r, i) => ({
      '№': i + 1, 'Ассистент': r.full_name, 'Ставка за урок': Number(r.rate),
      'Уроков': r.lessons_sum, 'Занятий': r.sessions, 'К оплате': Number(r.pay),
    }))
    data.push({ '№': '', 'Ассистент': 'ИТОГО', 'Ставка за урок': '', 'Уроков': '', 'Занятий': '', 'К оплате': total })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Ассистенты')
    XLSX.writeFile(wb, `Зарплата_ассистенты_${monthLabel}.xlsx`)
  }

  const columns = [
    { key: 'full_name', label: 'Ассистент', render: (r) => <b>{r.full_name}</b> },
    { key: 'rate', label: 'Ставка/урок', num: true, width: 150, sortValue: (r) => Number(r.rate) || 0, render: (r) => (
      editing?.id === r.id ? (
        <span className="rowflex" style={{ gap: 5, justifyContent: 'flex-end' }}>
          <input type="number" value={editing.value} autoFocus
            onChange={(e) => setEditing({ id: r.id, value: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveRate(r.id)}
            style={{ width: 80, padding: '4px 8px', border: `1px solid ${C.brand}`, borderRadius: 7, fontSize: 13, textAlign: 'right' }} />
          <button onClick={() => saveRate(r.id)} style={{ border: 'none', background: C.brand, color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>OK</button>
        </span>
      ) : (
        <span className="rowflex" style={{ gap: 6, justifyContent: 'flex-end', cursor: 'pointer' }}
          onClick={() => setEditing({ id: r.id, value: String(r.rate || '') })}>
          {money(r.rate)} ₸ <Pencil size={12} color={C.slate} />
        </span>
      )
    )},
    { key: 'lessons_sum', label: 'Уроков', num: true, width: 100, render: (r) => r.lessons_sum },
    { key: 'sessions', label: 'Занятий', num: true, width: 100, render: (r) => r.sessions },
    { key: 'pay', label: 'К оплате', num: true, width: 140, sortValue: (r) => Number(r.pay) || 0, render: (r) => <b style={{ color: C.brand }}>{money(r.pay)} ₸</b> },
  ]

  if (err) return (
    <div style={{ padding: 40, textAlign: 'center', background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 14 }}>
      <AlertTriangle size={26} color="#c2360b" style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#c2360b', marginBottom: 4 }}>Не удалось загрузить данные о зарплате</div>
      <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 14 }}>{err}</div>
      <button onClick={load} className="rowflex" style={{ gap: 6, margin: '0 auto', padding: '8px 16px', background: '#c2360b', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        <RotateCw size={14} /> Повторить
      </button>
    </div>
  )
  if (rows === null) return <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка начислений…</div>

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: C.slate, flex: 1 }}>Уроки × ставка. Нажмите на ставку, чтобы изменить.</p>
        <div style={{ background: C.brandSoft, border: '1px solid #c7d2fe', borderRadius: 11, padding: '9px 15px' }}>
          <span style={{ fontSize: 12, color: C.slate }}>Итого: </span>
          <b style={{ fontSize: 15, color: C.brand }}>{money(total)} ₸</b>
        </div>
        {rows.length > 0 && (
          <button onClick={exportXlsx} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          Нет ассистентов
        </div>
      ) : <DataTable columns={columns} rows={rows} pageSize={50} />}
    </div>
  )
}
