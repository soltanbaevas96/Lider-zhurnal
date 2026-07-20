import React, { useState, useEffect, useRef } from 'react'
import { Search, User, Layers, GraduationCap, X } from 'lucide-react'
import { globalSearch } from '../lib/api'
import { C } from '../lib/utils'

const ICONS = { student: User, group: Layers, teacher: GraduationCap }
const LABELS = { student: 'Ученик', group: 'Группа', teacher: 'Преподаватель' }

export default function GlobalSearch({ onOpenStudent }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    setBusy(true)
    const t = setTimeout(() => {
      globalSearch(q)
        .then((r) => { setResults(r); setOpen(true) })
        .catch(() => setResults([]))
        .finally(() => setBusy(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div ref={ref} style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
      <Search size={15} color={C.slate} style={{ position: 'absolute', left: 11, top: 10 }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)}
        placeholder="Поиск: ученик, родитель, телефон, группа…"
        style={{
          width: '100%', padding: '9px 30px 9px 34px', border: `1px solid ${C.line}`,
          borderRadius: 9, fontSize: 13, outline: 'none', background: '#fff',
        }} />
      {q && (
        <button onClick={() => { setQ(''); setResults([]); setOpen(false) }}
          style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'none', color: C.faint, cursor: 'pointer', display: 'flex' }}>
          <X size={15} />
        </button>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 5, zIndex: 90,
          background: '#fff', border: `1px solid ${C.line}`, borderRadius: 11,
          boxShadow: '0 10px 30px rgba(20,24,58,.16)', overflow: 'hidden', maxHeight: 340, overflowY: 'auto',
        }}>
          {busy && <div style={{ padding: 13, fontSize: 13, color: C.faint, textAlign: 'center' }}>Ищу…</div>}
          {!busy && results.length === 0 && (
            <div style={{ padding: 13, fontSize: 13, color: C.faint, textAlign: 'center' }}>Ничего не найдено</div>
          )}
          {results.map((r, i) => {
            const Icon = ICONS[r.kind] || User
            const clickable = r.kind === 'student' && r.id && onOpenStudent
            return (
              <button key={i} disabled={!clickable}
                onClick={() => { if (clickable) { onOpenStudent(r.id); setOpen(false); setQ('') } }}
                className="rowflex"
                style={{
                  width: '100%', textAlign: 'left', gap: 10, padding: '9px 12px', border: 'none',
                  borderTop: i ? `1px solid ${C.grey}` : 'none', background: '#fff',
                  cursor: clickable ? 'pointer' : 'default',
                }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: C.grey, color: C.slate, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {LABELS[r.kind]}{r.subtitle ? ` · ${r.subtitle}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
