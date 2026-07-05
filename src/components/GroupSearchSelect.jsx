import React, { useState, useRef, useEffect } from 'react'
import { Search, Check, X } from 'lucide-react'
import { C } from '../lib/utils'

// Выбор ОДНОЙ группы через поиск. value = group_id, onChange(group_id).
export default function GroupSearchSelect({ groups, value, onChange, placeholder = 'Поиск группы…' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  const selected = groups.find((g) => g.id === value)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = groups.filter((g) => {
    const t = q.toLowerCase().trim()
    if (!t) return true
    return g.name.toLowerCase().includes(t) || (g.note || '').toLowerCase().includes(t)
  }).slice(0, 40)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '11px 13px', border: `1px solid ${C.line}`, borderRadius: 11, background: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={15} color={C.slate} />
        <span style={{ flex: 1, color: selected ? C.ink : C.faint }}>
          {selected ? selected.name : 'Выбрать группу'}
        </span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(20,24,58,.14)', zIndex: 80, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${C.line}` }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
              style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: C.faint, textAlign: 'center' }}>Ничего не найдено</div>}
            {filtered.map((g) => (
              <button type="button" key={g.id} onClick={() => { onChange(g.id); setOpen(false); setQ('') }}
                style={{ width: '100%', textAlign: 'left', padding: '10px 13px', border: 'none', borderTop: `1px solid ${C.grey}`, background: g.id === value ? C.brandSoft : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{g.name}</span>
                  {g.note && <span style={{ display: 'block', fontSize: 11.5, color: C.slate }}>{g.note}</span>}
                </span>
                {g.id === value && <Check size={15} color={C.brand} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Мультивыбор групп через поиск. value = массив group_id, onChange(массив).
export function GroupMultiSelect({ groups, value, onChange, placeholder = 'Поиск группы для добавления…' }) {
  const [q, setQ] = useState('')
  const selected = groups.filter((g) => value.includes(g.id))
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  const filtered = groups.filter((g) => {
    if (value.includes(g.id)) return false
    const t = q.toLowerCase().trim()
    if (!t) return false // показываем результаты только при вводе
    return g.name.toLowerCase().includes(t) || (g.note || '').toLowerCase().includes(t)
  }).slice(0, 30)

  return (
    <div>
      {/* выбранные */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {selected.map((g) => (
            <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: C.brandSoft, color: C.brand }}>
              {g.name}
              <button type="button" onClick={() => toggle(g.id)} style={{ border: 'none', background: 'none', color: C.brand, cursor: 'pointer', display: 'flex', padding: 0 }}><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      {/* поиск */}
      <div style={{ position: 'relative' }}>
        <Search size={15} color={C.slate} style={{ position: 'absolute', left: 12, top: 12 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, outline: 'none' }} />
      </div>
      {q.trim() && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, marginTop: 6, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.faint, textAlign: 'center' }}>Ничего не найдено</div>}
          {filtered.map((g) => (
            <button type="button" key={g.id} onClick={() => { toggle(g.id); setQ('') }}
              style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderTop: `1px solid ${C.grey}`, background: '#fff', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{g.name}</span>
              {g.note && <span style={{ display: 'block', fontSize: 11.5, color: C.slate }}>{g.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
