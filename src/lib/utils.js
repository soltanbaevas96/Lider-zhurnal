// ---------- ВЫЧИСЛЕНИЯ ----------
export const hoursBetween = (start, end) => {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

export const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })

export const initials = (n) => (n || '').split(' ').map((w) => w[0]).join('').slice(0, 2)

export const nameOf = (arr, id) => arr.find((x) => x.id === id)?.full_name
  ?? arr.find((x) => x.id === id)?.name ?? '—'

// ---------- ПЕРИОДЫ ----------
// Возвращает список последних N месяцев + «весь период»
export function monthOptions(count = 6) {
  const out = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    out.push({ v, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  out.push({ v: 'all', label: 'Весь период' })
  return out
}

// month 'YYYY-MM' -> { from, to } первого и последнего дня; 'all' -> null
export function monthRange(month) {
  if (month === 'all') return null
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${month}-${String(last).padStart(2, '0')}`
  return { from, to }
}

const fmtShort = (d) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Читабельная подпись периода для заголовков и имён файлов
export function periodLabelOf(period) {
  if (!period || period.mode === 'all') return 'Весь период'
  if (period.mode === 'month') {
    const opt = monthOptions(13).find((m) => m.v === period.month)
    return opt?.label ?? period.month
  }
  // range
  if (period.from && period.to) return `${fmtShort(period.from)} — ${fmtShort(period.to)}`
  return 'Период'
}

// Превращает объект периода в { from, to } | null для запроса
export function periodRange(period) {
  if (!period || period.mode === 'all') return null
  if (period.mode === 'month') return monthRange(period.month)
  if (period.mode === 'range' && period.from && period.to) return { from: period.from, to: period.to }
  return null
}

// ---------- ПАЛИТРА ----------
export const C = {
  ink: '#14183a', slate: '#6b7194', faint: '#9aa0c0', line: '#e8e9f3',
  bg: '#f4f4fb', card: '#ffffff',
  brand: '#4338ca', brandSoft: '#eceafd', brand2: '#7c6bf0',
  teal: '#0d9488', tealSoft: '#d7f2ee',
  ok: '#0f9d58', okSoft: '#e2f5ea', warn: '#e0700b', warnSoft: '#fdf0e0',
  grey: '#eef0f6',
}

export const AVATAR_COLORS = ['#4338ca', '#0d9488', '#c2410c', '#7c3aed', '#0369a1', '#be185d']
export const avColorByIndex = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length]
