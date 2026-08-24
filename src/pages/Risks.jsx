import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Phone, RefreshCw, MessageCircle, X, ShieldCheck, History } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchRiskStudents, recalcRiskFlags, saveContact, fetchContactedStudents } from '../lib/api'
import { C, fmtDate, OFFICES } from '../lib/utils'
import DataTable from '../components/DataTable'

const STATUS_LABEL = { risk: 'Риск оттока', attention: 'Внимание' }

// fixedOffice: если задан (кабинет офис-менеджера) — список сразу
// ограничен одним офисом, свои вкладки офисов не показываем.
export default function Risks({ onOpenStudent, fixedOffice }) {
  const [rows, setRows] = useState(null)
  const [contactRows, setContactRows] = useState(null) // история «Отработано»
  const [section, setSection] = useState('pending') // pending | contacted
  const [busy, setBusy] = useState(false)
  const [contact, setContact] = useState(null) // ученик для фиксации контакта
  const [err, setErr] = useState('')
  const [officeTab, setOfficeTab] = useState('all')

  async function load() {
    try { setRows(await fetchRiskStudents()) }
    catch (e) { setErr(e.message) }
  }
  async function loadContacted() {
    try { setContactRows(await fetchContactedStudents()) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])
  // историю подгружаем лениво — только когда впервые открыли вкладку
  useEffect(() => { if (section === 'contacted' && contactRows === null) loadContacted() }, [section])

  async function recalc() {
    setBusy(true); setErr('')
    try { await recalcRiskFlags(); await load() }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  // скрываем тех, с кем связались менее 7 дней назад (+ фильтр по офису, если задан)
  const visible = (fixedOffice ? (rows || []).filter((s) => s.office === fixedOffice) : (rows || [])).filter((s) => {
    if (!s.last_contact_at) return true
    const days = (Date.now() - new Date(s.last_contact_at)) / 86400000
    return days >= 7
  })

  const contacted = fixedOffice ? (contactRows || []).filter((s) => s.office === fixedOffice) : (contactRows || [])

  const sectionRows = section === 'pending' ? visible : contacted

  function exportRisks() {
    const data = visible.map((s, i) => ({
      '№': i + 1,
      'ФИО': s.full_name,
      'Статус': s.status === 'risk' ? 'Риск оттока' : 'Внимание',
      'Причина': s.risk_reason || '',
      'Офис': s.office || '',
      'Язык': s.lang || '',
      'Телефон ученика': s.phone || '',
      'Родитель': s.parent_name || '',
      'Телефон родителя': s.parent_phone || '',
      'Последний контакт': s.last_contact_at ? fmtDate(s.last_contact_at.slice(0, 10)) : '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Ученики в риске')
    XLSX.writeFile(wb, `Риски_оттока_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const parentCol = {
    key: 'parent_phone', label: 'Родитель', sortable: false,
    render: (s) => s.parent_phone ? (
      <span>
        <a href={`tel:${s.parent_phone}`} onClick={(e) => e.stopPropagation()}
          style={{ color: C.ink, fontWeight: 600, textDecoration: 'none' }}>{s.parent_phone}</a>
        {s.parent_name && <span style={{ color: C.faint, fontSize: 11.5, display: 'block' }}>{s.parent_name}</span>}
      </span>
    ) : '—',
  }
  const officeCol = { key: 'office', label: 'Офис', render: (s) => s.office || '—' }
  const showOfficeCol = !fixedOffice && officeTab === 'all'

  const pendingColumns = [
    {
      key: 'status', label: '', width: 34, sortable: true,
      render: (s) => (
        <span title={s.risk_reason || ''} style={{ color: s.status === 'risk' ? '#dc2626' : '#d97706', display: 'flex' }}>
          <AlertTriangle size={16} />
        </span>
      ),
    },
    {
      key: 'full_name', label: 'Ученик',
      render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b>,
    },
    { key: 'risk_reason', label: 'Причина', render: (s) => s.risk_reason || '—' },
    ...(showOfficeCol ? [officeCol] : []),
    { key: 'lang', label: 'Язык', width: 60, render: (s) => s.lang || '—' },
    parentCol,
    {
      key: 'last_contact_at', label: 'Контакт',
      render: (s) => s.last_contact_at
        ? <span style={{ fontSize: 12, color: C.slate }}>{fmtDate(s.last_contact_at.slice(0, 10))}</span>
        : <span style={{ color: C.faint }}>—</span>,
    },
    {
      key: 'act', label: '', width: 110, sortable: false, num: true,
      render: (s) => (
        <button onClick={(e) => { e.stopPropagation(); setContact(s) }}
          className="rowflex" style={{ gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', background: C.brandSoft, color: C.brand }}>
          <MessageCircle size={13} /> Связались
        </button>
      ),
    },
  ]

  const contactedColumns = [
    {
      key: 'full_name', label: 'Ученик',
      render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b>,
    },
    {
      key: 'status_at_contact', label: 'Было', width: 110,
      render: (s) => s.status_at_contact ? (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          color: s.status_at_contact === 'risk' ? '#dc2626' : '#d97706',
          background: s.status_at_contact === 'risk' ? '#fee2e2' : '#fef3c7',
        }}>{STATUS_LABEL[s.status_at_contact] || s.status_at_contact}</span>
      ) : <span style={{ color: C.faint }}>—</span>,
    },
    { key: 'risk_reason', label: 'Причина пропуска', render: (s) => s.risk_reason || '—' },
    ...(showOfficeCol ? [officeCol] : []),
    parentCol,
    { key: 'note', label: 'Комментарий', render: (s) => s.note || <span style={{ color: C.faint }}>—</span> },
    {
      key: 'contacted_at', label: 'Когда', width: 100,
      render: (s) => <span style={{ fontSize: 12, color: C.slate }}>{fmtDate(s.contacted_at.slice(0, 10))}</span>,
    },
  ]

  const columns = section === 'pending' ? pendingColumns : contactedColumns

  const riskCount = visible.filter((s) => s.status === 'risk').length
  const attnCount = visible.filter((s) => s.status === 'attention').length

  // вкладки: «Все офисы» + сами офисы, с числом учеников на каждой (для активной вкладки)
  const officeTabs = useMemo(() => {
    const tabs = [{ k: 'all', t: 'Все офисы', n: sectionRows.length }]
    OFFICES.forEach((o) => tabs.push({ k: o, t: o, n: sectionRows.filter((s) => s.office === o).length }))
    return tabs
  }, [sectionRows])

  const tabRows = fixedOffice || officeTab === 'all' ? sectionRows : sectionRows.filter((s) => s.office === officeTab)

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Риски оттока</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            {section === 'pending'
              ? 'Ученики, которых стоит удержать. С кем связались — скрываются на 7 дней.'
              : 'Кто уже отработан: с кем связались и по какой причине был риск.'}
          </p>
        </div>
        {section === 'pending' && (
          <button onClick={recalc} disabled={busy} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.grey, color: C.slate, borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <RefreshCw size={15} /> {busy ? 'Считаю…' : 'Пересчитать'}
          </button>
        )}
        {section === 'pending' && visible.length > 0 && (
          <button onClick={exportRisks} className="rowflex"
            style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={15} /> Excel
          </button>
        )}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {/* К отработке / Отработано */}
      <div className="fseg" style={{ marginBottom: 14, width: 'fit-content' }}>
        <button className={section === 'pending' ? 'on' : ''} onClick={() => setSection('pending')}>
          <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />К отработке
        </button>
        <button className={section === 'contacted' ? 'on' : ''} onClick={() => setSection('contacted')}>
          <History size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Отработано
        </button>
      </div>

      {section === 'pending' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <Counter n={riskCount} label="риск оттока" color="#dc2626" bg="#fee2e2" />
          <Counter n={attnCount} label="внимание" color="#d97706" bg="#fef3c7" />
        </div>
      )}

      {/* Вкладки офисов (не нужны, если офис уже зафиксирован кабинетом офис-менеджера) */}
      {!fixedOffice && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {officeTabs.map((o) => {
            const on = officeTab === o.k
            return (
              <button key={o.k} onClick={() => setOfficeTab(o.k)} className="rowflex"
                style={{
                  gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate,
                }}>
                {o.t}
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 20,
                  background: on ? 'rgba(255,255,255,.25)' : C.grey, color: on ? '#fff' : C.faint,
                }}>{o.n}</span>
              </button>
            )
          })}
        </div>
      )}

      {(section === 'pending' ? rows : contactRows) === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : sectionRows.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          {section === 'pending' ? (
            <>
              <ShieldCheck size={32} color={C.ok} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Учеников в зоне риска нет</div>
              <div style={{ fontSize: 13, color: C.slate }}>
                Флаги считаются по пропускам и посещаемости. Появятся, когда начнутся занятия.
              </div>
            </>
          ) : (
            <>
              <History size={32} color={C.faint} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Пока никого не отрабатывали</div>
              <div style={{ fontSize: 13, color: C.slate }}>
                Здесь появится история, когда кто-то нажмёт «Связались» на вкладке «К отработке».
              </div>
            </>
          )}
        </div>
      ) : tabRows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          В офисе «{officeTab}» {section === 'pending' ? 'учеников в зоне риска нет' : 'история пуста'}.
        </div>
      ) : (
        <DataTable columns={columns} rows={tabRows} pageSize={25}
          onRowClick={(s) => onOpenStudent?.(s.student_id || s.id)} />
      )}

      {contact && (
        <ContactModal student={contact} onClose={() => setContact(null)}
          onSaved={async () => { setContact(null); await load(); setContactRows(null) }} />
      )}
    </div>
  )
}

function Counter({ n, label, color, bg }) {
  return (
    <div className="rowflex" style={{ gap: 8, background: bg, borderRadius: 10, padding: '9px 14px' }}>
      <span style={{ fontSize: 20, fontWeight: 800, color }}>{n}</span>
      <span style={{ fontSize: 12.5, color, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

function ContactModal({ student, onClose, onSaved }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    try {
      await saveContact(student.id, note.trim(), { risk_reason: student.risk_reason, status: student.status })
      await onSaved()
    }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 420, padding: 22 }}>
        <div className="rowflex" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Связались с родителем</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13.5, marginBottom: 4 }}><b>{student.full_name}</b></div>
        {student.parent_phone && (
          <div className="rowflex" style={{ gap: 6, fontSize: 13, color: C.slate, marginBottom: 14 }}>
            <Phone size={13} /> {student.parent_phone} {student.parent_name && `· ${student.parent_name}`}
          </div>
        )}

        <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 5 }}>Что сказали</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={3}
          placeholder="Напр. болел, вернётся на следующей неделе"
          style={{ width: '100%', padding: 10, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ fontSize: 11, color: C.faint, textAlign: 'right', marginTop: 3 }}>{note.length}/200</div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Отмена
          </button>
          <button onClick={save} disabled={busy}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Сохраняю…' : 'Зафиксировать'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>
          Ученик скроется из списка рисков на 7 дней. Запись сохранится в его истории.
        </p>
      </div>
    </div>
  )
}
