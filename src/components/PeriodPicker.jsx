import React, { useState, useMemo } from 'react'
import { CalendarRange, ChevronDown, X } from 'lucide-react'
import { C, monthOptions } from '../lib/utils'
import { inp } from './ui'

// period: { mode: 'month'|'range'|'all', month?, from?, to? }
export default function PeriodPicker({ period, setPeriod }) {
  const [open, setOpen] = useState(false)
  const months = useMemo(() => monthOptions(6), [])

  const label = period.mode === 'range' && period.from && period.to
    ? 'Свой период'
    : period.mode === 'all'
      ? 'Весь период'
      : period.mode === 'day'
        ? 'Сегодня'
        : period.mode === 'week'
          ? 'Эта неделя'
          : months.find((m) => m.v === period.month)?.label ?? 'Месяц'

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} className="rowflex"
        style={{ gap: 8, background: C.card, border: `1px solid ${C.line}`, borderRadius: 11, padding: '7px 12px', cursor: 'pointer' }}>
        <CalendarRange size={16} color={C.brand} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{label}</span>
        <ChevronDown size={14} color={C.slate} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 14px 40px rgba(20,24,58,.18)', padding: 14, width: 280 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Быстрый выбор</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[{ k: 'day', t: 'Сегодня' }, { k: 'week', t: 'Эта неделя' }].map((o) => {
                const active = period.mode === o.k
                return (
                  <button key={o.k} onClick={() => { setPeriod({ mode: o.k }); setOpen(false) }}
                    style={{ flex: 1, fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? C.brand : C.grey, color: active ? '#fff' : C.slate }}>
                    {o.t}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>По месяцам</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {months.map((m) => {
                const active = period.mode === 'month' && period.month === m.v || (m.v === 'all' && period.mode === 'all')
                return (
                  <button key={m.v} onClick={() => { setPeriod(m.v === 'all' ? { mode: 'all' } : { mode: 'month', month: m.v }); setOpen(false) }}
                    style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? C.brand : C.grey, color: active ? '#fff' : C.slate }}>
                    {m.label}
                  </button>
                )
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Произвольный период</div>
            <RangeForm period={period} onApply={(p) => { setPeriod(p); setOpen(false) }} />
          </div>
        </>
      )}
    </div>
  )
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
