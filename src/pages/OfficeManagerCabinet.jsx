import React, { useEffect, useState } from 'react'
import { Plus, Search, Users, Building2, Wallet, Layers, X, Check, AlertTriangle } from 'lucide-react'
import {
  fetchStudentsWithGroups, fetchAllGroups, createGroup, updateGroup,
} from '../lib/api'
import { C, initials, avColorByIndex, OFFICES } from '../lib/utils'
import DataTable from '../components/DataTable'
import { StudentModal } from './Manage'
import Risks from './Risks'
import PaymentsBase from './PaymentsBase'

export default function OfficeManagerCabinet({ managerOffice, isSenior, onOpenStudent }) {
  const [tab, setTab] = useState('students')
  const [office, setOffice] = useState(managerOffice || 'Маргулана')
  const activeOffice = isSenior ? office : managerOffice

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>
          {isSenior ? 'Все офисы' : managerOffice}
        </h1>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: C.slate }}>
          {isSenior ? 'Контроль работы офис-менеджеров' : 'База учащихся, группы и оплаты вашего офиса'}
        </p>

        {isSenior && (
          <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
            {OFFICES.map((o) => {
              const on = office === o
              return (
                <button key={o} onClick={() => setOffice(o)} className="rowflex"
                  style={{ gap: 6, padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                    background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
                  <Building2 size={14} /> {o}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {[
            { k: 'students', t: 'Ученики', icon: Users },
            { k: 'groups', t: 'Группы', icon: Layers },
            { k: 'payments', t: 'Оплаты', icon: Wallet },
            { k: 'risks', t: 'Риски', icon: AlertTriangle },
          ].map((o) => {
            const on = tab === o.k
            const Icon = o.icon
            return (
              <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
                style={{ gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
                <Icon size={15} /> {o.t}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'students' && <StudentsTab homeOffice={managerOffice} onOpenStudent={onOpenStudent} />}
      {tab === 'groups' && <GroupsTab homeOffice={managerOffice} />}
      {tab === 'payments' && <PaymentsBase fixedOffice={activeOffice} />}
      {tab === 'risks' && <Risks fixedOffice={activeOffice} onOpenStudent={onOpenStudent} />}
    </div>
  )
}

function StudentsTab({ homeOffice, onOpenStudent }) {
  const [students, setStudents] = useState(null)
  const [groups, setGroups] = useState([])
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  // по умолчанию свой офис, но ученик мог перейти/ходить в другой —
  // поэтому доступен переключатель на все офисы
  const [officeFilter, setOfficeFilter] = useState(homeOffice || 'all')

  async function reload() {
    try {
      const [st, gr] = await Promise.all([fetchStudentsWithGroups(), fetchAllGroups().catch(() => [])])
      setStudents(st); setGroups(gr)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  const filtered = (students || []).filter((s) => {
    if (officeFilter !== 'all' && s.office !== officeFilter) return false
    const t = q.toLowerCase().trim()
    if (!t) return true
    return (s.full_name || '').toLowerCase().includes(t)
      || (s.parent_name || '').toLowerCase().includes(t)
      || (s.phone || '').includes(t) || (s.parent_phone || '').includes(t)
  })

  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => (
      <div className="rowflex" style={{ gap: 10 }}>
        <div className="av" style={{ width: 30, height: 30, fontSize: 12, background: avColorByIndex(s._i || 0) }}>{initials(s.full_name)}</div>
        <span onClick={(e) => { if (onOpenStudent) { e.stopPropagation(); onOpenStudent(s.id) } }}
          style={{ fontWeight: 600, color: C.brand, cursor: 'pointer' }}>{s.full_name}</span>
      </div>
    )},
    ...(officeFilter === 'all' ? [{ key: 'office', label: 'Офис', width: 110, render: (s) => s.office || '—' }] : []),
    { key: 'grade', label: 'Класс', width: 70, render: (s) => s.grade || '—' },
    { key: 'groups', label: 'Группы', render: (s) => s.groupsData?.length ? s.groupsData.map((g) => g.name).join(', ') : <span style={{ color: C.faint }}>без группы</span> },
    { key: 'phone', label: 'Телефон', width: 130, render: (s) => s.phone || '—' },
    { key: 'parent_name', label: 'Родитель', render: (s) => s.parent_name || '—' },
    { key: 'edit', label: '', width: 44, sortable: false, render: (s) => (
      <button onClick={(e) => { e.stopPropagation(); setModal({ row: s }) }}
        style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }} title="Редактировать">✎</button>
    )},
  ]

  return (
    <div>
      <OfficeFilterChips value={officeFilter} onChange={setOfficeFilter} />
      <div className="rowflex" style={{ gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={17} color={C.faint} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: ученик, родитель, телефон…"
            style={{ width: '100%', padding: '11px 14px 11px 42px', border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 14, outline: 'none' }} />
        </div>
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ gap: 7, padding: '10px 18px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={17} /> Добавить ученика
        </button>
      </div>
      {err && <ErrBox>{err}</ErrBox>}
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Найдено: <b>{filtered.length}</b></div>
      {students === null ? <Loading /> : filtered.length === 0 ? (
        <Empty icon={Users} text="Учеников не найдено" />
      ) : (
        <DataTable columns={columns} rows={filtered.map((s, i) => ({ ...s, _i: i }))} pageSize={30} />
      )}
      {modal && (
        <StudentModal groups={groups} row={modal === 'new' ? null : modal.row}
          fixedOffice={officeFilter !== 'all' ? officeFilter : (homeOffice || 'Маргулана')}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload() }} />
      )}
    </div>
  )
}

function GroupsTab({ homeOffice }) {
  const [groups, setGroups] = useState(null)
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [officeFilter, setOfficeFilter] = useState(homeOffice || 'all')

  async function reload() {
    try { setGroups(await fetchAllGroups()) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  const filtered = (groups || []).filter((g) => {
    if (officeFilter !== 'all' && g.office !== officeFilter) return false
    const t = q.toLowerCase().trim()
    return !t || (g.name || '').toLowerCase().includes(t) || (g.subject_name || '').toLowerCase().includes(t)
  })

  const columns = [
    { key: 'name', label: 'Группа', render: (g) => <b>{g.name}</b> },
    ...(officeFilter === 'all' ? [{ key: 'office', label: 'Офис', width: 110, render: (g) => g.office || '—' }] : []),
    { key: 'subject_name', label: 'Предмет', render: (g) => (g.subject_name || '—').split(' / ')[0] },
    { key: 'lang', label: 'Язык', width: 80, render: (g) => g.lang || '—' },
    { key: 'capacity', label: 'Вместимость', width: 110, num: true, render: (g) => g.capacity || 12 },
    { key: 'edit', label: '', width: 44, sortable: false, render: (g) => (
      <button onClick={(e) => { e.stopPropagation(); setModal({ row: g }) }}
        style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }} title="Редактировать">✎</button>
    )},
  ]

  return (
    <div>
      <OfficeFilterChips value={officeFilter} onChange={setOfficeFilter} />
      <div className="rowflex" style={{ gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={17} color={C.faint} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск группы…"
            style={{ width: '100%', padding: '11px 14px 11px 42px', border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 14, outline: 'none' }} />
        </div>
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ gap: 7, padding: '10px 18px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={17} /> Создать группу
        </button>
      </div>
      {err && <ErrBox>{err}</ErrBox>}
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Групп: <b>{filtered.length}</b></div>
      {groups === null ? <Loading /> : filtered.length === 0 ? (
        <Empty icon={Layers} text="Групп не найдено" />
      ) : (
        <DataTable columns={columns} rows={filtered} pageSize={40} />
      )}
      {modal && (
        <GroupModal row={modal === 'new' ? null : modal.row}
          office={modal === 'new' ? (officeFilter !== 'all' ? officeFilter : (homeOffice || 'Маргулана')) : modal.row.office}
          onClose={() => setModal(null)} onDone={() => { setModal(null); reload() }} />
      )}
    </div>
  )
}

function OfficeFilterChips({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
      {['all', ...OFFICES].map((o) => {
        const on = value === o
        return (
          <button key={o} onClick={() => onChange(o)} className="rowflex"
            style={{ gap: 6, padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
              background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
            <Building2 size={14} /> {o === 'all' ? 'Все офисы' : o}
          </button>
        )
      })}
    </div>
  )
}

function GroupModal({ row, office, onClose, onDone }) {
  const [name, setName] = useState(row?.name || '')
  const [subject, setSubject] = useState(row?.subject_name || '')
  const [lang, setLang] = useState(row?.lang || 'каз')
  const [capacity, setCapacity] = useState(String(row?.capacity || 12))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!name.trim()) { setErr('Введите название группы'); return }
    setBusy(true); setErr('')
    try {
      const fields = {
        name: name.trim(), subject_name: subject.trim() || null,
        office, lang, capacity: Number(capacity) || 12,
        note: `${subject.trim()} · ${office} · ${lang}`,
      }
      if (row) await updateGroup(row.id, fields)
      else await createGroup(fields)
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Modal title={row ? 'Редактировать группу' : 'Новая группа'} onClose={onClose}>
      <Field label="Название (код группы)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. 11КМС-1" style={inp} autoFocus /></Field>
      <Field label="Предмет"><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="напр. Математика" style={inp} /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Язык">
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={inp}>
              <option value="каз">Казахский</option>
              <option value="рус">Русский</option>
            </select>
          </Field>
        </div>
        <div style={{ width: 120 }}>
          <Field label="Вместимость"><input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={inp} /></Field>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>Офис: <b>{office}</b></div>
      {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}
      <SaveBtn onClick={save} busy={busy} text={row ? 'Сохранить' : 'Создать'} />
    </Modal>
  )
}

function Modal({ title, children, onClose, wide, onDoneClose }) {
  return (
    <div onClick={onDoneClose || onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: wide ? 540 : 460, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <button onClick={onDoneClose || onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 5 }}>{label}</div>{children}</div>
}
function SaveBtn({ onClick, busy, text }) {
  return (
    <button onClick={onClick} disabled={busy} className="rowflex"
      style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: 12, gap: 7, background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
      <Check size={17} /> {busy ? '…' : text}
    </button>
  )
}
function ErrBox({ children }) {
  return <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{children}</div>
}
function Loading() {
  return <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
}
function Empty({ icon: Icon, text }) {
  return (
    <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <Icon size={30} color={C.faint} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 15, fontWeight: 700 }}>{text}</div>
    </div>
  )
}
const inp = { width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }
