import React, { useEffect, useState } from 'react'
import { Plus, Search, Users, Building2 } from 'lucide-react'
import { fetchStudentsWithGroups } from '../lib/api'
import { C, initials, avColorByIndex, OFFICES } from '../lib/utils'
import DataTable from '../components/DataTable'
import { StudentModal } from './Manage'

// Кабинет офис-менеджера: ученики своего офиса + добавление.
// Старший офис-менеджер (managerOffice=null) видит все офисы.
export default function OfficeManagerCabinet({ managerOffice, isSenior, onOpenStudent }) {
  const [students, setStudents] = useState(null)
  const [modal, setModal] = useState(null)
  const [q, setQ] = useState('')
  const [office, setOffice] = useState(managerOffice || 'Маргулана')
  const [groups, setGroups] = useState([])
  const [err, setErr] = useState('')

  async function reload() {
    try {
      const data = await fetchStudentsWithGroups()
      setStudents(data)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  // группы для формы: собираем из уже загруженных учеников
  useEffect(() => {
    if (!students) return
    const map = {}
    students.forEach((s) => (s.groupsData || []).forEach((g) => { if (g?.id) map[g.id] = g }))
    setGroups(Object.values(map))
  }, [students])

  const activeOffice = isSenior ? office : managerOffice

  const filtered = (students || []).filter((s) => {
    if (s.office !== activeOffice) return false
    const t = q.toLowerCase().trim()
    if (!t) return true
    return (s.full_name || '').toLowerCase().includes(t)
      || (s.parent_name || '').toLowerCase().includes(t)
      || (s.phone || '').includes(t)
      || (s.parent_phone || '').includes(t)
  })

  const columns = [
    {
      key: 'full_name', label: 'Ученик',
      render: (s) => (
        <div className="rowflex" style={{ gap: 10 }}>
          <div className="av" style={{ width: 30, height: 30, fontSize: 12, background: avColorByIndex(s._i || 0) }}>{initials(s.full_name)}</div>
          <span onClick={(e) => { if (onOpenStudent) { e.stopPropagation(); onOpenStudent(s.id) } }}
            style={{ fontWeight: 600, color: onOpenStudent ? C.brand : C.ink, cursor: onOpenStudent ? 'pointer' : 'default' }}>
            {s.full_name}
          </span>
        </div>
      ),
    },
    { key: 'grade', label: 'Класс', width: 80, render: (s) => s.grade || '—' },
    { key: 'school', label: 'Школа', width: 120, render: (s) => s.school || '—' },
    { key: 'phone', label: 'Телефон', width: 140, render: (s) => s.phone || '—' },
    { key: 'parent_name', label: 'Родитель', render: (s) => s.parent_name || '—' },
    { key: 'contract_no', label: 'Договор', width: 130, render: (s) => s.contract_no || '—' },
    {
      key: 'edit', label: '', width: 44, sortable: false,
      render: (s) => (
        <button onClick={(e) => { e.stopPropagation(); setModal({ row: s }) }}
          style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }} title="Редактировать">✎</button>
      ),
    },
  ]

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>
            {isSenior ? 'Ученики всех офисов' : `Ученики · ${managerOffice}`}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            {isSenior ? 'Контроль работы офис-менеджеров' : 'База учащихся вашего офиса'}
          </p>
        </div>
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ gap: 7, padding: '10px 18px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={17} /> Добавить ученика
        </button>
      </div>

      {/* старший переключает офисы */}
      {isSenior && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {OFFICES.map((o) => {
            const on = office === o
            return (
              <button key={o} onClick={() => setOffice(o)} className="rowflex"
                style={{ gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
                <Building2 size={14} /> {o}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={17} color={C.faint} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: ученик, родитель, телефон…"
          style={{ width: '100%', padding: '11px 14px 11px 42px', border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 14, outline: 'none' }} />
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>
        Найдено: <b>{filtered.length}</b>
      </div>

      {students === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <Users size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Учеников не найдено</div>
        </div>
      ) : (
        <DataTable columns={columns} rows={filtered.map((s, i) => ({ ...s, _i: i }))} pageSize={30} />
      )}

      {modal && (
        <StudentModal
          groups={groups}
          row={modal === 'new' ? null : modal.row}
          fixedOffice={isSenior ? activeOffice : managerOffice}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload() }}
        />
      )}
    </div>
  )
}
