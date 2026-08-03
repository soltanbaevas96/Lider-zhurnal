import React, { useState, useMemo } from 'react'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { C, monthOptions, shiftMonthStr } from '../lib/utils'
import { inp } from './ui'

// period: { mode: 'month'|'range'|'all'|'day'|'week', month?, from?, to? }
export default function PeriodPicker({ period, setPeriod }) {
  const [open, setOpen] = useState(false)
  const months = useMemo(() => monthOptions(8, 4), [])

  const label = period.mode === 'range' && period.from && period.to
    ? 'Свой период'
    : period.mode === 'all'
      ? 'Весь период'
      : period.mode === 'day'
        ? 'Сегодня'
        : period.mode === 'week'
          ? 'Эта неделя'
          : months.find((m) => m.v === period.month)?.label
            ?? monthLabel(period.month)
            ?? 'Месяц'

  // стрелки работают только в режиме месяца
  const isMonth = period.mode === 'month' && period.month
  const shift = (n) => setPeriod({ mode: 'month', month: shiftMonthStr(period.month, n) })

  return (
    <div className="rowflex" style={{ gap: 5, position: 'relative' }}>
      {isMonth && (
        <button onClick={() => shift(-1)} title="Предыдущий месяц"
          style={arrowBtn}><ChevronLeft size={15} /></button>
      )}

      <div style={{ position: 'relative' }}>
        <button onClick={() => setOpen((o) => !o)} className="rowflex"
          style={{ gap: 8, background: C.card, border: `1px solid ${C.line}`, borderRadius: 11, padding: '7px 12px', cursor: 'pointer' }}>
          <CalendarRange size={16} color={C.brand} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{label}</span>
          <ChevronDown size={14} color={C.slate} />
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 14px 40px rgba(20,24,58,.18)', padding: 14, width: 290, maxHeight: 420, overflowY: 'auto' }}>
              <Title>Быстрый выбор</Title>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[
                  { k: 'day', t: 'Сегодня' },
                  { k: 'week', t: 'Эта неделя' },
                  { k: 'thismonth', t: 'Этот месяц' },
                ].map((o) => {
                  const thisMonth = new Date().toISOString().slice(0, 7)
                  const active = o.k === 'thismonth'
                    ? (period.mode === 'month' && period.month === thisMonth)
                    : period.mode === o.k
                  return (
                    <button key={o.k}
                      onClick={() => {
                        setPeriod(o.k === 'thismonth' ? { mode: 'month', month: thisMonth } : { mode: o.k })
                        setOpen(false)
                      }}
                      style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? C.brand : C.grey, color: active ? '#fff' : C.slate, whiteSpace: 'nowrap' }}>
                      {o.t}
                    </button>
                  )
                })}
              </div>

              <Title>По месяцам</Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {months.map((m) => {
                  const active = (period.mode === 'month' && period.month === m.v)
                    || (m.v === 'all' && period.mode === 'all')
                  const future = m.v !== 'all' && m.v > new Date().toISOString().slice(0, 7)
                  return (
                    <button key={m.v}
                      onClick={() => { setPeriod(m.v === 'all' ? { mode: 'all' } : { mode: 'month', month: m.v }); setOpen(false) }}
                      style={{
                        fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8,
                        border: future ? `1px dashed ${C.line}` : 'none', cursor: 'pointer',
                        background: active ? C.brand : future ? '#fff' : C.grey,
                        color: active ? '#fff' : future ? C.faint : C.slate,
                      }}>
                      {m.label}
                    </button>
                  )
                })}
              </div>

              <Title>Произвольный период</Title>
              <RangeForm period={period} onApply={(p) => { setPeriod(p); setOpen(false) }} />
            </div>
          </>
        )}
      </div>

      {isMonth && (
        <button onClick={() => shift(1)} title="Следующий месяц"
          style={arrowBtn}><ChevronRight size={15} /></button>
      )}
    </div>
  )
}

const arrowBtn = {
  width: 30, height: 32, borderRadius: 9, border: `1px solid ${C.line}`,
  background: C.card, color: C.slate, cursor: 'pointer',
  display: 'grid', placeItems: 'center', flexShrink: 0,
}

function Title({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
      {children}
    </div>
  )
}

// Для месяцев вне списка (если ушли стрелками далеко)
function monthLabel(m) {
  if (!m) return null
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(y, mm - 1, 1)
  const s = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function RangeForm({ period, onApply }) {
  const [from, setFrom] = useState(period.mode === 'range' ? period.from : '')
  const [to, setTo] = useState(period.mode === 'range' ? period.to : '')
  const valid = from && to && from <= to

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: C.slate, display: 'block', marginBottom: 4 }}>С</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, padding: '8px 10px', fontSize: 13 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: C.slate, display: 'block', marginBottom: 4 }}>По</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inp, padding: '8px 10px', fontSize: 13 }} />
        </div>
      </div>
      <button disabled={!valid} onClick={() => onApply({ mode: 'range', from, to })}
        style={{ width: '100%', padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: valid ? 'pointer' : 'default', background: valid ? C.brand : C.line, color: valid ? '#fff' : C.slate }}>
        Применить
      </button>
    </div>
  )
}
