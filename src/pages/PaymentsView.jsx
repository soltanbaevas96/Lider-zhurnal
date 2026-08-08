import React, { useState } from 'react'
import { Building2 } from 'lucide-react'
import { C, OFFICES } from '../lib/utils'
import { PaymentsTab } from './OfficeManagerCabinet'

// Экран «Оплаты» для завуча/директора — все офисы с переключателем.
export default function PaymentsView({ onOpenStudent }) {
  const [office, setOffice] = useState('Маргулана')
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Оплаты</h1>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: C.slate }}>Оплаты учеников по офисам</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
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
      </div>
      <PaymentsTab office={office} onOpenStudent={onOpenStudent} />
    </div>
  )
}
