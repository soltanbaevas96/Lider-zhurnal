import React, { useEffect, useMemo, useState } from 'react'
import {
  Wallet, Download, Lock, Unlock, ChevronLeft, ChevronRight, Pencil, Check, X, AlertTriangle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchPayroll, closePayroll, reopenPayroll, updateTeacherRate,
} from '../lib/api'
import { C } from '../lib/utils'
import DataTable from '../components/DataTable'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

export default function Payroll({ isAdmin }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editRate, setEditRate] = useState(null) // преподаватель для правки ставки
  const [confirm, setConfirm] = useState(null)   // 'close' | 'reopen'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isClosed = rows?.[0]?.is_closed || false

  async function load() {
    setLoading(true); setErr('')
    try { setRows(await fetchPayroll(month)) }
    catch (e) { setErr(e.message); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [month])

  const shiftMonth = (d) => {
    const [y, m] = month.split('-').map(Number)
    setMonth(new Date(y, m - 1 + d, 1).toISOString().slice(0, 7))
  }

  const totals = useMemo(() => {
    const r = rows || []
    return {
      sum: r.reduce((s, x) => s + Number(x.total || 0), 0),
      units: r.reduce((s, x) => s + Number(x.lesson_units || 0), 0),
      sessions: r.reduce((s, x) => s + Number(x.sessions || 0), 0),
      noRate: r.filter((x) => !Number(x.rate)).length,
    }
  }, [rows])

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
    const data = (rows || []).map((r, i) => ({
      '№': i + 1,
      'Преподаватель': r.teacher_name,
      'Ставка за урок': Number(r.rate),
      'Уроков': r.lesson_units,
      'Занятий': r.sessions,
      'К выплате': Number(r.total),
    }))
    data.push({
      '№': '', 'Преподаватель': 'ИТОГО', 'Ставка за урок': '',
      'Уроков': totals.units, 'Занятий': totals.sessions, 'К выплате': totals.sum,
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Зарплата')
    XLSX.writeFile(wb, `Зарплата_${MONTHS[Number(month.slice(5, 7)) - 1]}_${month.slice(0, 4)}.xlsx`)
  }

  const columns = [
    { key: 'teacher_name', label: 'Преподаватель', render: (r) => <b>{r.teacher_name}</b> },
    {
      key: 'rate', label: 'Ставка/урок', num: true, width: 130,
      render: (r) => (
        <span className="rowflex" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {Number(r.rate) > 0
            ? <span>{money(r.rate)} ₸</span>
            : <span style={{ color: '#dc2626', fontWeight: 700 }}>не задана</span>}
          {isAdmin && !isClosed && (
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
      render: (r) => <span style={{ color: C.brand, fontWeight: 800, fontSize: 14 }}>{money(r.total)} ₸</span>,
    },
  ]

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Зарплата</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            Уроки × ставка. Занятие = 2 или 3 урока.
          </p>
        </div>

        {/* Месяц */}
        <div className="rowflex" style={{ gap: 6 }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>
            {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
          </span>
          <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
        </div>

        {rows?.length > 0 && (
          <button onClick={exportXlsx} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

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
        <div className="rowflex" style={{ gap: 9, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <span>У <b>{totals.noRate}</b> преподавателей не задана ставка — их зарплата считается как 0. Задайте ставку через карандаш в строке.</span>
        </div>
      )}

      {/* Итоги */}
      {rows?.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <BigCard value={`${money(totals.sum)} ₸`} label="фонд оплаты за месяц" main />
          <BigCard value={totals.units} label="уроков всего" />
          <BigCard value={totals.sessions} label="занятий" />
          <BigCard value={rows.length} label="преподавателей" />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : !rows?.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <Wallet size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>За этот месяц занятий не было</div>
          <div style={{ fontSize: 13, color: C.slate }}>Зарплата посчитается, когда преподаватели внесут занятия.</div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.teacher_id }))} pageSize={40} />
      )}

      {editRate && (
        <RateModal teacher={editRate} onClose={() => setEditRate(null)}
          onSaved={async () => { setEditRate(null); await load() }} />
      )}

      {confirm && (
        <ConfirmBox
          title={confirm === 'close' ? 'Закрыть месяц?' : 'Открыть месяц заново?'}
          text={confirm === 'close'
            ? `Суммы за ${MONTHS[Number(month.slice(5, 7)) - 1]} будут зафиксированы. Дальнейшее изменение ставок их не затронет. Это можно отменить.`
            : 'Зафиксированные суммы будут удалены, месяц снова начнёт пересчитываться по текущим ставкам.'}
          confirmText={confirm === 'close' ? 'Закрыть' : 'Открыть'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm === 'close' ? doClose : doReopen}
        />
      )}
    </div>
  )
}

// ---------- КОМПОНЕНТЫ ----------
const navBtn = {
  width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`,
  background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center',
}

function BigCard({ value, label, main }) {
  return (
    <div style={{
      background: main ? C.brandSoft : C.card,
      border: `1px solid ${main ? '#c7d2fe' : C.line}`,
      borderRadius: 12, padding: '13px 18px', minWidth: 150,
    }}>
      <div style={{ fontSize: main ? 24 : 20, fontWeight: 800, color: main ? C.brand : C.ink, lineHeight: 1.1 }}>{value}</div>
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
