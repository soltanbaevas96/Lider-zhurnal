// ---------- ВЫЧИСЛЕНИЯ ----------
// Количество уроков в записи (1..3). Заменяет прежний подсчёт часов.
export const lessonCount = (lesson) => Number(lesson?.lessons_count) || 1

export const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })

export const initials = (n) => (n || '').split(' ').map((w) => w[0]).join('').slice(0, 2)

export const nameOf = (arr, id) => arr.find((x) => x.id === id)?.full_name
  ?? arr.find((x) => x.id === id)?.name ?? '—'

// ---------- ТРАНСЛИТ И ЛОГИНЫ ----------
const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  ә:'a',ғ:'g',қ:'k',ң:'n',ө:'o',ұ:'u',ү:'u',һ:'h',і:'i',
}
export function translit(s) {
  return (s || '').toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? ch).join('')
    .replace(/[^a-z0-9]/g, '')
}
// «Сапарова Айгерим» -> первая буква имени + фамилия -> asaparova
export function loginFromName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/)
  if (parts.length === 0) return ''
  const surname = translit(parts[0])
  const nameInitial = parts[1] ? translit(parts[1])[0] || '' : ''
  return (nameInitial + surname) || surname
}
export function genPassword(len = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let p = ''
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

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
  if (period.mode === 'day') return 'Сегодня'
  if (period.mode === 'week') return 'Эта неделя'
  if (period.mode === 'month') {
    const opt = monthOptions(13).find((m) => m.v === period.month)
    return opt?.label ?? period.month
  }
  // range
  if (period.from && period.to) return `${fmtShort(period.from)} — ${fmtShort(period.to)}`
  return 'Период'
}

// helpers для дня/недели
function todayISO() { return new Date().toISOString().slice(0, 10) }
function weekRangeNow() {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // понедельник=0
  const mon = new Date(d); mon.setDate(d.getDate() - day)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
}

// Превращает объект периода в { from, to } | null для запроса
export function periodRange(period) {
  if (!period || period.mode === 'all') return null
  if (period.mode === 'day') { const t = todayISO(); return { from: t, to: t } }
  if (period.mode === 'week') return weekRangeNow()
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

// ---------- ОФИС И ЯЗЫК (из note группы / contact ученика) ----------
export const OFFICES = ['Маргулана', 'Усолка', 'Торайгырова']

// Извлекает офис из строки-заметки (ищет одно из известных названий)
export function officeOf(text) {
  const t = text || ''
  for (const o of OFFICES) if (t.includes(o)) return o
  return null
}
// Извлекает язык: 'каз' | 'рус' | null
export function langOf(text) {
  const t = (text || '').toLowerCase()
  if (/\bказ\b/.test(t) || t.includes('каз ') || t.includes('· каз')) return 'каз'
  if (/\bрус\b/.test(t) || t.includes('рус ') || t.includes('· рус')) return 'рус'
  return null
}
