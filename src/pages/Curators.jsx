import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, X, Download, GraduationCap } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchCurators, updateCuratorRate, addCurator, archiveCurator } from '../lib/api'
import { C } from '../lib/utils'
import DataTable from '../components/DataTable'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

export default function Curators({ isAdmin }) {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)   // куратор для правки ставки
  const [add, setAdd] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    try { setRows(await fetchCurators()) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  function exportXlsx() {
    const data = (rows || []).map((c, i) => ({
      '№': i + 1, 'Куратор': c.full_name, 'Предмет': c.subject || '',
      'Ставка за урок': Number(c.rate),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Кураторы')
    XLSX.writeFile(wb, `Кураторы_ставки.xlsx`)
  }

  const columns = [
    { key: 'full_name', label: 'Куратор', render: (c) => <b>{c.full_name}</b> },
    { key: 'subject', label: 'Предмет доп.занятий', render: (c) => c.subject || '—' },
    {
      key: 'rate', label: 'Ставка/урок', num: true, width: 150,
      render: (c) => (
        <span className="rowflex" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {Number(c.rate) > 0
            ? <span>{money(c.rate)} ₸</span>
            : <span style={{ color: '#dc2626', fontWeight: 700 }}>не задана</span>}
          {isAdmin && (
            <button onClick={(e) => { e.stopPropagation(); setEdit(c) }} title="Изменить ставку"
              style={{ border: 'none', background: C.grey, color: C.slate, borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}>
              <Pencil size={12} />
            </button>
          )}
        </span>
      ),
    },
  ]

  const total = (rows || []).reduce((s, c) => s + Number(c.rate || 0), 0)

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
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

      {rows === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <GraduationCap size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Кураторов пока нет</div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={40} initialSort={{ key: 'full_name', dir: 'asc' }} />
      )}

      {edit && <RateModal curator={edit} onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); await load() }} />}
      {add && <AddModal onClose={() => setAdd(false)}
        onSaved={async () => { setAdd(false); await load() }} />}
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
