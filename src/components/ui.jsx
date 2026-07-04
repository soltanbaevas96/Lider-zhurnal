import React from 'react'
import { C } from '../lib/utils'

export function Stat({ icon: Icon, label, value, tint, bg }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '17px 15px' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: tint, display: 'grid', placeItems: 'center', marginBottom: 11 }}>
        <Icon size={19} />
      </div>
      <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>{label}</div>
    </div>
  )
}

export function MiniStat({ value, label, tint }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: tint, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{label}</div>
    </div>
  )
}

export const inp = {
  width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`,
  borderRadius: 11, fontSize: 14, outline: 'none', background: '#fff',
}

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 13, flex: 1 }}>
      <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

export function Spinner({ label = 'Загрузка…' }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 240, color: C.slate, fontSize: 14 }}>
      <div>
        <div style={{
          width: 34, height: 34, border: `3px solid ${C.line}`, borderTopColor: C.brand,
          borderRadius: 17, margin: '0 auto 12px', animation: 'spin 0.8s linear infinite',
        }} />
        {label}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}
