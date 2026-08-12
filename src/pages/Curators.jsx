import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, X, Download, GraduationCap, Wallet, Lock, Unlock, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchCurators, updateCuratorRate, addCurator, archiveCurator, fetchCuratorPayroll, closePayroll, reopenPayroll } from '../lib/api'
import { C } from '../lib/utils'
import DataTable from '../components/DataTable'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

export default function Curators({ isAdmin, canEditRate, month }) {
  const canEdit = canEditRate ?? isAdmin
  const [rows, setRows] = useState(null)
  const [pay, setPay] = useState([])          // зарплата за выбранный месяц
  const [edit, setEdit] = useState(null)
  const [add, setAdd] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'close' | 'reopen'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isClosed = pay?.[0]?.is_closed || false

  async function load() {
    try {
      const [list, payroll] = await Promise.all([
        fetchCurators(),
        month ? fetchCuratorPayroll(month).catch(() => []) : Promise.resolve([]),
      ])
      setRows(list); setPay(payroll)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [month])

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

  // сводим ставку и начисление
  const payById = {}
  pay.forEach((p) => { payById[p.curator_id] = p })
  const totalPay = pay.reduce((s, p) => s + Number(p.total || 0), 0)
  const totalUnits = pay.reduce((s, p) => s + Number(p.lesson_units || 0), 0)

  function exportXlsx() {
    const data = (rows || []).map((c, i) => {
      const p = payById[c.id]
      return {
        '№': i + 1, 'Куратор': c.full_name, 'Предмет': c.subject || '',
        'Ставка за урок': Number(c.rate),
        'Уроков за месяц': p?.lesson_units || 0,
        'Занятий': p?.sessions || 0,
        'К выплате': Number(p?.total || 0),
      }
    })
    data.push({ '№': '', 'Куратор': 'ИТОГО', 'Предмет': '', 'Ставка за урок': '',
      'Уроков за месяц': totalUnits, 'Занятий': '', 'К выплате': totalPay })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Кураторы')
    XLSX.writeFile(wb, `Кураторы_${month || 'ставки'}.xlsx`)
  }

  const columns = [
    { key: 'full_name', label: 'Куратор', render: (c) => <b>{c.full_name}</b> },
    { key: 'subject', label: 'Предмет доп.занятий', render: (c) => c.subject || '—' },
    {
      key: 'rate', label: 'Ставка/урок', num: true, width: 140,
      render: (c) => (
        <span className="rowflex" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {Number(c.rate) > 0
            ? <span>{money(c.rate)} ₸</span>
            : <span style={{ color: '#dc2626', fontWeight: 700 }}>не задана</span>}
          {canEdit && !isClosed && (
            <button onClick={(e) => { e.stopPropagation(); setEdit(c) }} title="Изменить ставку"
              style={{ border: 'none', background: C.grey, color: C.slate, borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}>
              <Pencil size={12} />
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'units', label: 'Уроков', num: true, width: 80,
      sortValue: (c) => payById[c.id]?.lesson_units || 0,
      render: (c) => {
        const p = payById[c.id]
        return p ? p.lesson_units : <span style={{ color: C.faint }}>—</span>
      },
    },
    {
      key: 'total', label: 'К выплате', num: true, width: 130,
      sortValue: (c) => Number(payById[c.id]?.total || 0),
      render: (c) => {
        const p = payById[c.id]
        return p
          ? <span style={{ color: C.brand, fontWeight: 800, fontSize: 14 }}>{money(p.total)} ₸</span>
          : <span style={{ color: C.faint }}>—</span>
      },
    },
  ]

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.slate }}>
            Кураторы ведут отдельные дополнительные занятия. У каждого своя ставка за урок.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setAdd(true)} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Добавить
          </button>
        )}
        {rows?.length > 0 && (
          <button onClick={exportXlsx} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {/* Статус периода — тот же месяц, что и у преподавателей (закрытие общее) */}
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
      ) : month && isAdmin ? (
        <div className="rowflex" style={{ gap: 9, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <span>Месяц открыт — суммы пересчитываются при изменении ставок. Закройте его, когда всё проверено.</span>
          <button onClick={() => setConfirm('close')} className="rowflex"
            style={{ marginLeft: 'auto', gap: 5, padding: '6px 12px', background: C.brand, color: '#fff', borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Lock size={13} /> Закрыть месяц
          </button>
        </div>
      ) : null}

      {/* Итоги за месяц */}
      {pay.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ background: C.brandSoft, border: '1px solid #c7d2fe', borderRadius: 12, padding: '13px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.brand, lineHeight: 1.1 }}>{money(totalPay)} ₸</div>
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>к выплате кураторам</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 18px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{totalUnits}</div>
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>уроков проведено</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 18px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{pay.length}</div>
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>кураторов вели занятия</div>
          </div>
        </div>
      )}

      {rows === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <GraduationCap size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Кураторов пока нет</div>
          <div style={{ fontSize: 13, color: C.slate }}>
            Выполните SQL-файл со списком кураторов или добавьте вручную.
          </div>
        </div>
      ) : (
        <>
          {pay.length === 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 12.5 }}>
              За этот месяц кураторы не проводили занятий — начисления нет. Показаны только ставки.
            </div>
          )}
          <DataTable columns={columns} rows={rows} pageSize={40} initialSort={{ key: 'full_name', dir: 'asc' }} />
        </>
      )}

      {edit && <RateModal curator={edit} onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); await load() }} />}
      {add && <AddModal onClose={() => setAdd(false)}
        onSaved={async () => { setAdd(false); await load() }} />}

      {confirm && (
        <ConfirmBox
          title={confirm === 'close' ? 'Закрыть месяц?' : 'Открыть месяц заново?'}
          text={confirm === 'close'
            ? 'Суммы за этот месяц будут зафиксированы (у преподавателей и кураторов сразу). Дальнейшее изменение ставок их не затронет. Это можно отменить.'
            : 'Зафиксированные суммы будут удалены (у преподавателей и кураторов), месяц снова начнёт пересчитываться по текущим ставкам.'}
          confirmText={confirm === 'close' ? 'Закрыть' : 'Открыть'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm === 'close' ? doClose : doReopen}
        />
      )}
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

function RateModal({ curator, onClose, onSaved }) {
  const [rate, setRate] = useState(String(Number(curator.rate) || ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { await updateCuratorRate(curator.id, rate); await onSaved() }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Modal onClose={onClose} title="Ставка куратора">
      <div style={{ fontSize: 13.5, marginBottom: 4 }}><b>{curator.full_name}</b></div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14 }}>{curator.subject}</div>
      <Label>Ставка за один урок, ₸</Label>
      <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus placeholder="напр. 1000"
        style={inpBig} />
      {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}
      <Actions onClose={onClose} onSave={save} busy={busy} />
    </Modal>
  )
}

function AddModal({ onClose, onSaved }) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    if (!name.trim()) { setErr('Введите ФИО'); return }
    setBusy(true); setErr('')
    try { await addCurator(name.trim(), subject.trim(), rate); await onSaved() }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Modal onClose={onClose} title="Новый куратор">
      <Label>ФИО</Label>
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={inpBig} />
      <Label style={{ marginTop: 12 }}>Предмет доп.занятий</Label>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="напр. Химия (каз)" style={inpBig} />
      <Label style={{ marginTop: 12 }}>Ставка за урок, ₸</Label>
      <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="напр. 1000" style={inpBig} />
      {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}
      <Actions onClose={onClose} onSave={save} busy={busy} saveText="Добавить" />
    </Modal>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 400, padding: 22 }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Actions({ onClose, onSave, busy, saveText = 'Сохранить' }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
      <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
      <button onClick={onSave} disabled={busy}
        style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? '…' : saveText}
      </button>
    </div>
  )
}

const inpBig = { width: '100%', padding: '11px 13px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15, fontWeight: 600, outline: 'none' }
function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 5, ...style }}>{children}</div>
}
