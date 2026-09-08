import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Trash2, Zap, X, AlertTriangle, ChevronLeft, ChevronRight,
  Search, Download, Printer, Upload, Check, Maximize2, RotateCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchScheduleSlots, saveScheduleSlot, checkScheduleConflicts, deleteSchedule,
  getScheduleSlotImpact, syncAllSchedules,
  generateLessons, fetchMissedLessons, addGroup,
} from '../lib/api'
import { C, OFFICES, todayStr, addDaysStr, mondayOf, fmtDate } from '../lib/utils'
import GroupSearchSelect from '../components/GroupSearchSelect'

const WD = [
  { n: 1, t: 'Понедельник', s: 'Пн' }, { n: 2, t: 'Вторник', s: 'Вт' }, { n: 3, t: 'Среда', s: 'Ср' },
  { n: 4, t: 'Четверг', s: 'Чт' }, { n: 5, t: 'Пятница', s: 'Пт' }, { n: 6, t: 'Суббота', s: 'Сб' }, { n: 7, t: 'Воскресенье', s: 'Вс' },
]

// Единая цветовая система статуса — статус хранится отдельным полем в БД
// (schedule.status), цвет только сопровождает его, а не заменяет.
const STATUS_META = {
  confirmed: { label: 'Подтверждено', color: '#1e3a8a', bg: '#e5edff', border: '#93b0f0' },
  confirmed_special: { label: 'Подтверждено (особое)', color: '#7f1d1d', bg: '#fbe7e7', border: '#e3a3a3' },
  reserve: { label: 'Резерв', color: '#166534', bg: '#e2f5ea', border: '#8fd6ac' },
  occupied_other: { label: 'Занято — другой центр', color: '#4b5563', bg: '#eef0f4', border: '#c7cbd3' },
}
const fmtHM = (t) => (t || '').slice(0, 5)
// 'HH:MM' -> минуты с начала суток, и обратно.
const toMin = (t) => { const [h, m] = (t || '0:0').slice(0, 5).split(':').map(Number); return h * 60 + (m || 0) }
const fromMin = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const isRealStatus = (s) => s === 'confirmed' || s === 'confirmed_special'
const timeOverlap = (a, b) => toMin(a.start_time) < toMin(b.end_time) && toMin(b.start_time) < toMin(a.end_time)
const INF_DATE = '9999-12-31'
const dateRangesOverlap = (a, b) =>
  (a.active_from || '0001-01-01') <= (b.active_to || INF_DATE) && (a.active_to || INF_DATE) >= (b.active_from || '0001-01-01')

// Последний выбранный офис (п.12-13 ТЗ) — только удобство на этом
// браузере, не источник истины ни для чего; при ошибке чтения/записи
// (приватный режим и т.п.) просто ничего не сохраняем/не читаем.
const LAST_OFFICE_KEY = 'lp_schedule_office'
function getStoredOffice() {
  try { return localStorage.getItem(LAST_OFFICE_KEY) || '' } catch { return '' }
}
function setStoredOffice(o) {
  try { localStorage.setItem(LAST_OFFICE_KEY, o) } catch { /* ignore */ }
}

// Конфликты — единая функция для сетки/списка/статистики (п.5-9,32-35 ТЗ
// + п.15-16 ТЗ по режиму «По преподавателям»):
//  - КАБИНЕТ и ГРУППА проверяются ТОЛЬКО внутри одного офиса. officeItems
//    здесь — база расчёта: обычно занятия ТЕКУЩЕГО офиса (без учёта
//    строчных фильтров кабинета/группы/поиска — иначе фильтр мог бы
//    случайно спрятать вторую половину настоящего конфликта), но при
//    выбранном преподавателе это ВСЕ его занятия по всем офисам сразу —
//    поэтому здесь ЯВНО проверяется a.office === b.office, а не
//    подразумевается неявно (иначе кабинет «2» в разных офисах одного
//    преподавателя ошибочно считался бы конфликтом кабинета).
//  - ПРЕПОДАВАТЕЛЬ и АССИСТЕНТ проверяются ГЛОБАЛЬНО по всем офисам
//    (allItems — вообще все занятия центра) — человек физически не может
//    вести два занятия одновременно, даже в разных офисах. Именно эта
//    ветка и ловит «Маргулана 18:00 / Усолка 18:00» для одного
//    преподавателя (п.15-16 ТЗ) — офис здесь намеренно не сравнивается.
// Возвращает Map(id -> { room, group, teacher: otherSlot|null, assistant: otherSlot|null }).
function computeConflicts(officeItems, allItems) {
  const map = new Map()
  const ensure = (id) => {
    if (!map.has(id)) map.set(id, { room: false, group: false, teacher: null, assistant: null })
    return map.get(id)
  }
  const sameSlot = (a, b) => a.weekday === b.weekday && timeOverlap(a, b) && dateRangesOverlap(a, b)

  for (let i = 0; i < officeItems.length; i++) {
    for (let j = i + 1; j < officeItems.length; j++) {
      const a = officeItems[i], b = officeItems[j]
      if (!sameSlot(a, b) || a.office !== b.office) continue
      if (a.room && b.room && a.room === b.room) { ensure(a.id).room = true; ensure(b.id).room = true }
      if (a.group_id && b.group_id && a.group_id === b.group_id) { ensure(a.id).group = true; ensure(b.id).group = true }
    }
  }

  officeItems.forEach((a) => {
    if (!isRealStatus(a.status)) return
    if (a.teacher_id) {
      const clash = allItems.find((b) => b.id !== a.id && b.teacher_id === a.teacher_id && isRealStatus(b.status) && sameSlot(a, b))
      if (clash) ensure(a.id).teacher = clash
    }
    if (a.assistant_id) {
      const clash = allItems.find((b) => b.id !== a.id && b.assistant_id === a.assistant_id && isRealStatus(b.status) && sameSlot(a, b))
      if (clash) ensure(a.id).assistant = clash
    }
  })

  return map
}
// Короткая, конкретная подпись конфликта для карточки/тултипа (п.9,34 ТЗ:
// не «Конфликт расписания», а понятная причина).
function conflictLabel(info) {
  if (!info) return null
  if (info.room) return 'Конфликт кабинета'
  if (info.group) return 'Группа уже занята'
  if (info.teacher) return `Преподаватель занят в ${info.teacher.office} ${fmtHM(info.teacher.start_time)}–${fmtHM(info.teacher.end_time)}`
  if (info.assistant) return `Ассистент занят в ${info.assistant.office} ${fmtHM(info.assistant.start_time)}–${fmtHM(info.assistant.end_time)}`
  return null
}

// isAdmin — управляет только массовыми/системными действиями (Импорт,
// «Создать занятия» пачкой) + правом переносить занятие в другой офис.
// canEdit — обычный CRUD слотов в ТЕКУЩЕМ офисе — по умолчанию совпадает
// с isAdmin, но методист получает canEdit=true, isAdmin=false (свой офис,
// без массовых инструментов). lockedOffice — если задан, офис не
// выбирается, а зафиксирован (кабинет методиста — только его офис).
export default function Schedule({ dict, isAdmin, canEdit, lockedOffice, onFullBleed }) {
  const canEditSlots = canEdit ?? isAdmin

  // Расписание — единственный экран, которому нужна полная ширина окна.
  useEffect(() => {
    onFullBleed?.(true)
    return () => onFullBleed?.(false)
  }, [])

  const [slots, setSlots] = useState(null)
  const [missed, setMissed] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [mode, setMode] = useState('week') // week | list | groups | teachers
  // «Все офисы» больше не рабочий режим (п.2,12 ТЗ) — офис всегда
  // конкретный: зафиксированный (методист) → последний выбранный на этом
  // браузере → первый из справочника.
  const [office, setOffice] = useState(() => lockedOffice || getStoredOffice() || OFFICES[0])
  const [room, setRoom] = useState('')
  const [grade, setGrade] = useState('')
  const [teacherF, setTeacherF] = useState('')
  const [groupF, setGroupF] = useState('')
  const [q, setQ] = useState('')
  const [refDate, setRefDate] = useState(() => todayStr())
  // Адаптивный показ дней — на узком экране/ноутбуке не нужно насильно
  // втискивать все 7 дней, если из-за этого текст перестаёт читаться.
  const [dayCount, setDayCount] = useState(7)
  const [dayOffset, setDayOffset] = useState(0)

  const [editSlot, setEditSlot] = useState(null)   // объект слота | 'new' | { weekday, start_time, end_time } для нового с предзаполнением
  const [confirmDel, setConfirmDel] = useState(null) // id слота на удаление
  const [delImpact, setDelImpact] = useState(null)   // { future_count, conducted_count } для диалога подтверждения (п.27 ТЗ)
  const [gen, setGen] = useState(false)
  const [excelOpen, setExcelOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const pageRef = useRef(null)

  function changeOffice(next) {
    if (next === office) return
    setOffice(next)
    if (!lockedOffice) setStoredOffice(next)
    // Старые данные другого офиса не должны оставаться в фильтрах (п.13 ТЗ).
    setRoom(''); setGroupF(''); setQ('')
  }

  const reqId = useRef(0)
  async function load() {
    const id = ++reqId.current
    setLoading(true); setErr('')
    try {
      // Грузим расписание ВСЕХ офисов одним запросом (не по одному на
      // каждый переключатель) — это нужно, чтобы корректно проверять
      // глобальный конфликт преподавателя/ассистента между офисами
      // (п.8,34-35 ТЗ). Но дальше, ДО любого расчёта (ширины карточек,
      // конфликтов кабинета/группы, статистики), всё сразу фильтруется
      // по текущему офису (п.10-11,25 ТЗ) — другие офисы эти расчёты
      // никак не затрагивают.
      const [rows, miss] = await Promise.all([fetchScheduleSlots(), fetchMissedLessons(14).catch(() => [])])
      if (id !== reqId.current) return
      setSlots(rows); setMissed(miss)
    } catch (e) {
      if (id !== reqId.current) return
      setErr(e.message || 'Не удалось загрузить расписание')
    } finally { if (id === reqId.current) setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const weekStart = useMemo(() => mondayOf(refDate), [refDate])
  const weekEnd = useMemo(() => addDaysStr(weekStart, 6), [weekStart])

  // Все занятия ТЕКУЩЕГО офиса (без учёта фильтров кабинета/преподавателя/
  // группы/поиска/недели) — база и для расчёта конфликтов кабинета/группы,
  // и для «По группам»/«По преподавателям» этого офиса.
  const officeSlots = useMemo(() => (slots || []).filter((r) => r.office === office), [slots, office])

  // Режим «По преподавателям» (п.1-3 ТЗ): если в фильтре выбран конкретный
  // преподаватель — база расчёта меняется с «текущий офис» на «ВСЕ его
  // занятия по ВСЕМ офисам». Фильтр офиса при этом не отбрасывается молча
  // (п.4 ТЗ) — просто перестаёт быть базой выборки, пока явно не сброшен
  // выбор преподавателя. Матчим строго по teacher_id, не по имени (п.6 ТЗ).
  const teacherActive = !!teacherF
  const teacherSlots = useMemo(
    () => (slots || []).filter((r) => r.teacher_id === teacherF),
    [slots, teacherF]
  )
  const baseSlots = teacherActive ? teacherSlots : officeSlots
  const selectedTeacherName = teacherActive ? ((dict.teachers || []).find((t) => t.id === teacherF)?.full_name || '') : ''

  const roomOptions = useMemo(() => [...new Set(officeSlots.map((s) => s.room))].sort(), [officeSlots])
  // Группы для фильтра — при выбранном преподавателе это ЕГО группы по
  // всем офисам (п.7 ТЗ: «все группы преподавателя по всем офисам должны
  // быть видны»), иначе — группы текущего офиса, как раньше.
  const groupFilterOptions = useMemo(() => {
    if (teacherActive) {
      const ids = new Set(teacherSlots.map((r) => r.group_id).filter(Boolean))
      return (dict.groups || []).filter((g) => ids.has(g.id))
    }
    return (dict.groups || []).filter((g) => g.office === office)
  }, [teacherActive, teacherSlots, dict.groups, office])

  // Класс слота — у самого schedule такого поля нет, берём из его группы
  // (groups.grade).
  const gradeOfSlot = (r) => (dict.groups || []).find((g) => g.id === r.group_id)?.grade || null

  // conflictMap считается от baseSlots (не officeSlots) — иначе конфликт
  // «тот же преподаватель в 18:00 в Маргулана и в Усолке» (п.8-9 ТЗ) не
  // попал бы в officeItems целиком и не был бы найден. Кабинет/группа
  // внутри computeConflicts дополнительно проверяют a.office===b.office,
  // так что при разных офисах преподавателя они не сработают ложно.
  const conflictMap = useMemo(() => computeConflicts(baseSlots, slots || []), [baseSlots, slots])

  // Слот считается видимым в выбранной неделе, если период его действия
  // (active_from/active_to) пересекается с [weekStart, weekEnd].
  const visibleSlots = useMemo(() => {
    const s = q.trim().toLowerCase()
    return baseSlots.filter((r) => {
      // Кабинет — фильтр по номеру кабинета не имеет смысла при просмотре
      // преподавателя по всем офисам сразу (номера кабинетов не связаны
      // между офисами), поэтому пропускается в этом режиме.
      if (!teacherActive && room && r.room !== room) return false
      if (grade && gradeOfSlot(r) !== grade) return false
      if (teacherF && r.teacher_id !== teacherF) return false
      if (groupF && r.group_id !== groupF) return false
      if (r.active_from > weekEnd) return false
      if (r.active_to && r.active_to < weekStart) return false
      if (!s) return true
      return (r.group_name || '').toLowerCase().includes(s) || (r.teacher_name || '').toLowerCase().includes(s) || (r.room || '').toLowerCase().includes(s)
    })
  }, [baseSlots, teacherActive, room, grade, teacherF, groupF, q, weekStart, weekEnd, dict.groups])

  // Сводка сверху — «настоящих» занятий/резервов/занято/конфликтов
  // текущего офиса (п.14 ТЗ).
  const summary = useMemo(() => {
    const real = visibleSlots.filter((r) => isRealStatus(r.status))
    const reserve = visibleSlots.filter((r) => r.status === 'reserve')
    const occupied = visibleSlots.filter((r) => r.status === 'occupied_other')
    const conflicts = visibleSlots.filter((r) => { const c = conflictMap.get(r.id); return c && (c.room || c.group || c.teacher || c.assistant) })
    return { real: real.length, reserve: reserve.length, occupied: occupied.length, conflicts: conflicts.length }
  }, [visibleSlots, conflictMap])

  // Перед удалением показываем, сколько занятий реально затронет удаление
  // (п.27 ТЗ) — отдельным запросом, до самого подтверждения.
  async function openDeleteConfirm(id) {
    setConfirmDel(id); setDelImpact(null)
    try { setDelImpact(await getScheduleSlotImpact(id)) }
    catch { setDelImpact({ future_count: null, conducted_count: null }) }
  }

  // Удаляет (архивирует) слот расписания. На сервере это снимает ТОЛЬКО
  // будущие непроведённые занятия этого слота — проведённые остаются в
  // истории/табеле/зарплате навсегда (миграция 67, п.9-10 ТЗ).
  async function remove(id) {
    setBusy(true)
    try {
      const r = await deleteSchedule(id)
      setConfirmDel(null); setDelImpact(null)
      setMsg(`Расписание удалено. Будущих занятий удалено: ${r?.future_deleted ?? 0}. Проведённых занятий сохранено: ${r?.conducted_protected ?? 0}.`)
      await load()
      setTimeout(() => setMsg(''), 8000)
    }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  // «Синхронизировать» (п.21 ТЗ) — защитный пересчёт будущих занятий по
  // всем активным слотам сразу, для уже существующих (созданных раньше)
  // данных. Проведённые занятия не трогает никогда.
  async function runSync() {
    setSyncBusy(true); setErr('')
    try {
      const r = await syncAllSchedules()
      setMsg(`Синхронизация завершена. Проверено слотов: ${r?.slots_processed ?? 0}. Будущих занятий пересоздано: ${r?.future_created ?? 0}. Устаревших удалено: ${r?.future_deleted ?? 0}.`)
      await load()
      setTimeout(() => setMsg(''), 10000)
    } catch (e) { setErr(e.message) }
    finally { setSyncBusy(false) }
  }

  function exportXlsx() {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Расписание', visibleSlots.map((r) => ({
      Офис: r.office, Кабинет: r.room, День: WD.find((w) => w.n === r.weekday)?.t || r.weekday,
      Время: `${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`,
      Группа: r.group_name || (r.status === 'reserve' ? 'РЕЗЕРВ' : r.status === 'occupied_other' ? 'ЗАНЯТО — другой центр' : ''),
      Преподаватель: r.teacher_name || '', Статус: STATUS_META[r.status]?.label || r.status,
    })))
    const byGroup = {}
    visibleSlots.filter((r) => r.group_id).forEach((r) => { (byGroup[r.group_id] ||= []).push(r) })
    const groupRows = []
    Object.values(byGroup).forEach((arr) => arr.forEach((r) => groupRows.push({
      Группа: r.group_name, Офис: r.office, Кабинет: r.room, День: WD.find((w) => w.n === r.weekday)?.t,
      Время: `${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`, Преподаватель: r.teacher_name || '',
    })))
    addSheet(wb, 'По группам', groupRows)
    const byTeacher = {}
    visibleSlots.filter((r) => r.teacher_id).forEach((r) => { (byTeacher[r.teacher_id] ||= []).push(r) })
    const teacherRows = []
    Object.values(byTeacher).forEach((arr) => arr.forEach((r) => teacherRows.push({
      Преподаватель: r.teacher_name, Группа: r.group_name, Офис: r.office, Кабинет: r.room,
      День: WD.find((w) => w.n === r.weekday)?.t, Время: `${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`,
    })))
    addSheet(wb, 'По преподавателям', teacherRows)
    // В режиме «По преподавателям» visibleSlots уже содержит ТОЛЬКО
    // занятия выбранного преподавателя по всем офисам (п.10 ТЗ), колонка
    // «Офис» в каждом листе уже есть — дополнительно фильтровать нечего,
    // меняется только имя файла.
    const fileLabel = teacherActive ? (selectedTeacherName || 'преподаватель') : office
    XLSX.writeFile(wb, `Расписание_${fileLabel}_${weekStart}.xlsx`)
    setExcelOpen(false)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { pageRef.current?.requestFullscreen?.().catch(() => {}); setFullscreen(true) }
    else { document.exitFullscreen?.().catch(() => {}); setFullscreen(false) }
  }
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', height: fullscreen ? '100vh' : 'calc(100vh - 132px)', minHeight: 480, background: fullscreen ? '#fff' : 'transparent', padding: fullscreen ? 16 : 0 }}>
      <style>{`
        .print-only { display: none; }
        @media print {
          @page { size: landscape; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .sched-day { break-inside: avoid; }
        }
      `}</style>

      {/* Заголовок при печати (п.11 ТЗ) — сам экранный <h1> внутри
          скрывается печатью вместе со всей панелью управления, поэтому
          нужен отдельный печатный заголовок с тем же текстом и периодом. */}
      <div className="print-only" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          {teacherActive ? `Расписание преподавателя: ${selectedTeacherName || '—'}` : `Расписание — ${office}`}
        </h1>
        <div style={{ fontSize: 13, color: '#555' }}>{fmtDate(weekStart)} — {fmtDate(weekEnd)}</div>
      </div>

      <div className="rowflex no-print" style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 130 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>
            {teacherActive ? `Расписание преподавателя: ${selectedTeacherName || '—'}` : 'Расписание'}
          </h1>
        </div>

        {/* Офис — главный переключатель контекста (п.13,40 ТЗ): один
            офис = одно рабочее расписание. Только он и определяет, что
            видно; «Все офисы» здесь никогда не появляется. Исключение —
            режим «По преподавателям» (п.1-4 ТЗ): пока выбран конкретный
            преподаватель, база выборки — все его офисы сразу, а сам
            переключатель офиса становится неактивным (но НЕ пропадает и
            НЕ игнорируется молча — рядом явное пояснение). */}
        {lockedOffice ? (
          <span className="rowflex" style={{ gap: 6, padding: '9px 14px', background: C.brandSoft, borderRadius: 10, fontSize: 13.5, fontWeight: 800, color: C.brand }}>
            {lockedOffice}
          </span>
        ) : (
          <select value={office} onChange={(e) => changeOffice(e.target.value)} disabled={teacherActive}
            title={teacherActive ? 'При выбранном преподавателе показываются все его офисы' : undefined}
            style={{ ...selSty, padding: '9px 14px', fontSize: 13.5, fontWeight: 800, color: C.brand, background: C.brandSoft, border: `1.5px solid ${C.brand}`, opacity: teacherActive ? 0.55 : 1, cursor: teacherActive ? 'not-allowed' : 'pointer' }}>
            {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {teacherActive && (
          <span className="rowflex" style={{ gap: 6, padding: '9px 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, fontSize: 12.5, fontWeight: 700, color: '#3730a3' }}>
            Показано расписание преподавателя по всем офисам
          </span>
        )}

        <div className="rowflex" style={{ gap: 6 }}>
          <button onClick={() => setRefDate(addDaysStr(refDate, -7))} style={navBtn} title="Предыдущая неделя"><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 12.5, color: C.slate, fontWeight: 600, minWidth: 128, textAlign: 'center' }}>{fmtDate(weekStart)} — {fmtDate(weekEnd)}</span>
          <button onClick={() => setRefDate(addDaysStr(refDate, 7))} style={navBtn} title="Следующая неделя"><ChevronRight size={16} /></button>
          <button onClick={() => setRefDate(todayStr())} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12.5, fontWeight: 700 }}>Сегодня</button>
        </div>

        <div className="rowflex" style={{ gap: 8, marginLeft: 'auto' }}>
          {isAdmin && (
            <>
              <button onClick={() => setImportOpen(true)} className="rowflex"
                style={{ gap: 6, padding: '8px 14px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Upload size={15} /> Импорт
              </button>
              <button onClick={() => setGen(true)} className="rowflex"
                style={{ gap: 6, padding: '8px 14px', background: C.teal, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <Zap size={15} /> Создать занятия
              </button>
              <button onClick={runSync} disabled={syncBusy} className="rowflex" title="Пересчитать будущие занятия по всем слотам (проведённые не трогает)"
                style={{ gap: 6, padding: '8px 14px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: syncBusy ? 0.6 : 1 }}>
                <RotateCw size={15} /> {syncBusy ? 'Синхронизирую…' : 'Синхронизировать'}
              </button>
            </>
          )}
          {canEditSlots && !teacherActive && (
            <button onClick={() => setEditSlot('new')} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Plus size={16} /> Добавить занятие
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExcelOpen((v) => !v)} className="rowflex"
              style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Download size={15} /> Excel
            </button>
            {excelOpen && (
              <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(20,24,58,.15)', zIndex: 20, minWidth: 180 }}>
                <div onClick={exportXlsx} style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = C.grey} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                  Скачать (3 листа)
                </div>
              </div>
            )}
          </div>
          <button onClick={() => window.print()} className="rowflex" title="Печать текущего расписания"
            style={{ gap: 6, padding: '8px 14px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Printer size={15} /> Печать
          </button>
          <button onClick={toggleFullscreen} className="rowflex" title={fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
            style={{ gap: 6, padding: '8px 14px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Maximize2 size={15} /> <span className="hide-sm">{fullscreen ? 'Свернуть' : 'Во весь экран'}</span>
          </button>
        </div>
      </div>

      {err && <div className="no-print" style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}
      {msg && <div className="no-print" style={{ background: C.okSoft, color: '#065f46', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{msg}</div>}

      {missed.length > 0 && (
        <div className="no-print" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: 13, marginBottom: 14 }}>
          <div className="rowflex" style={{ gap: 8, color: '#92400e', fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
            <AlertTriangle size={15} /> Занятия, которые не провели ({missed.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {missed.slice(0, 6).map((m) => (
              <div key={m.lesson_id} className="rowflex" style={{ gap: 10, fontSize: 12.5, color: '#78350f' }}>
                <span style={{ minWidth: 70 }}>{m.lesson_date?.slice(8, 10)}.{m.lesson_date?.slice(5, 7)}</span>
                <span style={{ fontWeight: 700 }}>{m.group_name}</span>
                <span style={{ color: '#92400e' }}>{m.teacher_name}</span>
                <span style={{ marginLeft: 'auto', color: '#a16207' }}>{m.days_ago} дн. назад</span>
              </div>
            ))}
            {missed.length > 6 && <div style={{ fontSize: 12, color: '#a16207' }}>…ещё {missed.length - 6}</div>}
          </div>
        </div>
      )}

      {/* Режимы + фильтры */}
      <div className="no-print rowflex" style={{ gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['week', 'Сетка'], ['list', 'Список'], ['groups', 'По группам'], ['teachers', 'По преподавателям']].map(([k, t]) => {
          const on = mode === k
          return <button key={k} onClick={() => setMode(k)}
            style={{ padding: '8px 15px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>{t}</button>
        })}
        {mode === 'week' && (
          <div style={{ display: 'flex', background: C.grey, borderRadius: 9, padding: 3, marginLeft: 6 }}>
            {[[1, '1 день'], [3, '3 дня'], [7, 'Неделя']].map(([n, t]) => {
              const on = dayCount === n
              return <button key={n} onClick={() => { setDayCount(n); setDayOffset(0) }}
                style={{ padding: '6px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer', background: on ? '#fff' : 'transparent', color: on ? C.brand : C.slate, boxShadow: on ? '0 1px 3px rgba(20,24,58,.12)' : 'none' }}>{t}</button>
            })}
          </div>
        )}
      </div>
      <div className="no-print rowflex" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {mode === 'week' && !teacherActive && (
          <select value={room} onChange={(e) => setRoom(e.target.value)} style={selSty}>
            <option value="">Все кабинеты</option>
            {roomOptions.map((r) => <option key={r} value={r}>Кабинет {r}</option>)}
          </select>
        )}
        <select value={grade} onChange={(e) => setGrade(e.target.value)} style={selSty}>
          <option value="">Все классы</option>
          <option value="10">10 класс</option>
          <option value="11">11 класс</option>
        </select>
        {(mode === 'week' || mode === 'list') && (
          <>
            <select value={teacherF} onChange={(e) => setTeacherF(e.target.value)} style={selSty}>
              <option value="">Все преподаватели</option>
              {(dict.teachers || []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <select value={groupF} onChange={(e) => setGroupF(e.target.value)} style={selSty}>
              <option value="">Все группы</option>
              {groupFilterOptions.map((g) => <option key={g.id} value={g.id}>{g.name}{teacherActive ? ` (${g.office})` : ''}</option>)}
            </select>
          </>
        )}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск группы / преподавателя / кабинета…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
        </div>
      </div>

      {mode === 'week' && !loading && (
        <div className="no-print rowflex" style={{ gap: 14, marginBottom: 10, fontSize: 12.5, color: C.slate, flexWrap: 'wrap' }}>
          <span>Занятий: <b style={{ color: C.ink }}>{summary.real}</b></span>
          <span>Резерв: <b style={{ color: '#166534' }}>{summary.reserve}</b></span>
          <span>Занято (другой центр): <b style={{ color: C.slate }}>{summary.occupied}</b></span>
          <span>Конфликтов: <b style={{ color: summary.conflicts ? '#dc2626' : C.ink }}>{summary.conflicts}</b></span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : mode === 'groups' ? (
        <GroupsMode slots={visibleSlots} onOpen={(s) => setEditSlot(s)} />
      ) : mode === 'teachers' ? (
        <TeachersMode slots={visibleSlots} dict={dict} onOpen={(s) => setEditSlot(s)} />
      ) : mode === 'list' ? (
        <ScheduleList
          slots={visibleSlots} weekStart={weekStart} gradeOfSlot={gradeOfSlot} conflictMap={conflictMap}
          onOpenSlot={(r) => setEditSlot(r)}
          canEditSlots={canEditSlots && !teacherActive}
          onAdd={() => setEditSlot('new')}
          emptyMessage={teacherActive ? `У ${selectedTeacherName || 'преподавателя'} нет занятий на эту неделю.` : undefined}
        />
      ) : (
        <ScheduleGrid
          slots={visibleSlots}
          weekStart={weekStart}
          dayCount={dayCount}
          dayOffset={dayOffset}
          setDayOffset={setDayOffset}
          canEditSlots={canEditSlots && !teacherActive}
          gradeOfSlot={gradeOfSlot}
          conflictMap={conflictMap}
          onOpenSlot={(r) => setEditSlot(r)}
          onCreateAt={(weekday, time) => setEditSlot({
            weekday, start_time: time, end_time: fromMin(toMin(time) + 80),
          })}
          emptyMessage={teacherActive && visibleSlots.length === 0 ? `У ${selectedTeacherName || 'преподавателя'} нет занятий на эту неделю.` : ''}
        />
      )}

      {editSlot && (
        <SlotModal slot={editSlot} dict={dict} roomOptions={roomOptions} pageOffice={office} lockedOffice={lockedOffice}
          canTransferOffice={isAdmin}
          onClose={() => setEditSlot(null)}
          onSaved={async (result) => {
            setEditSlot(null)
            // future_synced/conducted_protected приходят только при
            // изменении УЖЕ существующего слота (миграция 67) — для
            // нового слота сервер вернёт 0/0, сообщение не показываем.
            if (result && (result.future_synced || result.conducted_protected)) {
              setMsg(`Расписание обновлено. Будущих занятий синхронизировано: ${result.future_synced}. Проведённых занятий сохранено: ${result.conducted_protected}.`)
              setTimeout(() => setMsg(''), 8000)
            }
            await load()
          }}
          onDelete={(id) => { setEditSlot(null); openDeleteConfirm(id) }} />
      )}

      {confirmDel && (
        <ConfirmBox
          title="Удалить занятие из расписания?"
          busy={busy}
          onCancel={() => { setConfirmDel(null); setDelImpact(null) }}
          onConfirm={() => remove(confirmDel)}
          confirmText="Удалить расписание">
          {delImpact ? (
            <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 4px', lineHeight: 1.6 }}>
              У этого расписания{' '}
              <b style={{ color: C.ink }}>{delImpact.future_count ?? '—'}</b> будущих непроведённых занятий и{' '}
              <b style={{ color: C.ink }}>{delImpact.conducted_count ?? '—'}</b> уже проведённых.<br />
              Будущие непроведённые занятия будут удалены. Проведённые занятия сохранятся в истории, посещаемости, табеле и зарплате — они не удаляются никогда.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: C.slate, margin: 0 }}>Проверяю связанные занятия…</p>
          )}
        </ConfirmBox>
      )}

      {gen && (
        <GenerateModal onClose={() => setGen(false)}
          onDone={async (n) => {
            setGen(false)
            setMsg(`Создано занятий: ${n}. Преподаватели увидят их в разделе «Мои занятия».`)
            await load()
            setTimeout(() => setMsg(''), 8000)
          }} />
      )}

      {importOpen && (
        <ImportWizard dict={dict} initialOffice={office} onClose={() => setImportOpen(false)} onDone={async () => { setImportOpen(false); await load() }} />
      )}
    </div>
  )
}

// ================= СЕТКА (проекция по реальному времени, ТЗ v3) =================
// Высота и позиция карточки строго пропорциональны реальному времени
// занятия (top/height считаются из start_time/end_time в минутах —
// НЕ из округления до часа/строки). Пересечения одного дня — НОРМАЛЬНОЕ
// явление (разные кабинеты одного офиса) и никогда не сжимают карточку
// ниже читаемого минимума: максимум MAX_LANES карточек кладутся рядом
// (каждая — 100/MAX_LANES % ширины), а всё, что не помещается, уходит
// в один явный «+N занятий», раскрывающийся списком по клику.
const PX_PER_MIN = 1.6
const MAX_LANES = 2

function layoutDay(items) {
  const sorted = [...items].sort((a, b) => toMin(a.start_time) - toMin(b.start_time) || toMin(a.end_time) - toMin(b.end_time))
  // Кластеры — максимальные цепочки транзитивно пересекающихся занятий.
  // Считаем ширину/дорожки ОТДЕЛЬНО для каждого кластера, а не для дня
  // целиком — иначе одно случайное 6-кратное наложение в 14:00 сжимало
  // бы совершенно не пересекающуюся карточку в 8:00 (была ровно эта
  // ошибка в предыдущей версии сетки).
  const clusters = []
  let cur = [], curEnd = -1
  sorted.forEach((it) => {
    const s = toMin(it.start_time), e = toMin(it.end_time)
    if (cur.length && s >= curEnd) { clusters.push(cur); cur = [] }
    cur.push(it)
    curEnd = cur.length === 1 ? e : Math.max(curEnd, e)
  })
  if (cur.length) clusters.push(cur)

  const placed = []
  const overflow = []
  clusters.forEach((cluster) => {
    const laneEnds = []
    const withLane = cluster.map((it) => {
      const s = toMin(it.start_time), e = toMin(it.end_time)
      let lane = laneEnds.findIndex((end) => end <= s)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e) } else laneEnds[lane] = e
      return { ...it, _lane: lane }
    })
    const totalLanes = laneEnds.length
    if (totalLanes <= MAX_LANES) {
      withLane.forEach((it) => placed.push({ ...it, _lanes: totalLanes || 1 }))
    } else {
      // MAX_LANES-1 карточек показываем нормально, остальное — в overflow
      // на месте последней дорожки (никогда не сужаем меньше 100/MAX_LANES%).
      withLane.forEach((it) => {
        if (it._lane < MAX_LANES - 1) placed.push({ ...it, _lanes: MAX_LANES })
      })
      const hidden = withLane.filter((it) => it._lane >= MAX_LANES - 1)
      if (hidden.length) {
        overflow.push({
          start: Math.min(...hidden.map((it) => toMin(it.start_time))),
          end: Math.max(...hidden.map((it) => toMin(it.end_time))),
          lane: MAX_LANES - 1, lanes: MAX_LANES, items: hidden,
        })
      }
    }
  })
  return { placed, overflow }
}

function ScheduleGrid({ slots, weekStart, dayCount, dayOffset, setDayOffset, canEditSlots, gradeOfSlot, conflictMap, onOpenSlot, onCreateAt, emptyMessage }) {
  const [overflowOpen, setOverflowOpen] = useState(null) // { items }
  const maxOffset = Math.max(0, 7 - dayCount)
  const offset = Math.min(dayOffset, maxOffset)
  useEffect(() => { if (offset !== dayOffset) setDayOffset(offset) }, [offset])
  const visibleDays = WD.slice(offset, offset + dayCount)
  const todayStrVal = todayStr()

  const { gridStartMin, gridEndMin } = useMemo(() => {
    let mn = 8 * 60, mx = 21 * 60
    if (slots.length) {
      mn = Math.min(mn, Math.floor(Math.min(...slots.map((s) => toMin(s.start_time))) / 60) * 60)
      mx = Math.max(mx, Math.ceil(Math.max(...slots.map((s) => toMin(s.end_time))) / 60) * 60)
    }
    return { gridStartMin: mn, gridEndMin: mx }
  }, [slots])
  const gridHeight = (gridEndMin - gridStartMin) * PX_PER_MIN
  const hourMarks = []
  for (let m = gridStartMin; m <= gridEndMin; m += 60) hourMarks.push(m)

  const byDay = useMemo(() => {
    const m = {}
    WD.forEach((w) => { m[w.n] = layoutDay(slots.filter((s) => s.weekday === w.n)) })
    return m
  }, [slots])

  function yToTime(y) {
    let mins = gridStartMin + y / PX_PER_MIN
    mins = Math.round(mins / 10) * 10
    mins = Math.max(gridStartMin, Math.min(gridEndMin - 10, mins))
    return fromMin(mins)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Пустая неделя у выбранного преподавателя — показываем понятное
          сообщение, но сама сетка остаётся видимой (п.13 ТЗ), а не
          подменяется пустым экраном. */}
      {emptyMessage && (
        <div className="no-print" style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {emptyMessage}
        </div>
      )}
      {dayCount < 7 && (
        <div className="rowflex no-print" style={{ gap: 8, marginBottom: 8 }}>
          <button onClick={() => setDayOffset(Math.max(0, offset - dayCount))} disabled={offset === 0} style={{ ...navBtn, opacity: offset === 0 ? 0.4 : 1 }} title="Предыдущие дни"><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.slate }}>
            {fmtDate(addDaysStr(weekStart, visibleDays[0].n - 1))} — {fmtDate(addDaysStr(weekStart, visibleDays[visibleDays.length - 1].n - 1))}
          </span>
          <button onClick={() => setDayOffset(Math.min(maxOffset, offset + dayCount))} disabled={offset === maxOffset} style={{ ...navBtn, opacity: offset === maxOffset ? 0.4 : 1 }} title="Следующие дни"><ChevronRight size={14} /></button>
        </div>
      )}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'auto', background: '#fff', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `54px repeat(${visibleDays.length}, minmax(180px, 1fr))`, minWidth: 54 + visibleDays.length * 180 }}>
          <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 4, background: '#fff', borderBottom: `1px solid ${C.line}`, height: 46 }} />
          {visibleDays.map((w, i) => {
            const dateStr = addDaysStr(weekStart, w.n - 1)
            const isToday = dateStr === todayStrVal
            return (
              <div key={w.n} style={{
                position: 'sticky', top: 0, zIndex: 3, background: isToday ? C.brandSoft : '#fff',
                borderBottom: `1px solid ${C.line}`, borderLeft: `1px solid ${C.line}`, padding: '6px 4px', textAlign: 'center', height: 46,
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: isToday ? C.brand : C.slate, textTransform: 'uppercase', letterSpacing: 0.3 }}>{w.s}</div>
                <div style={{ fontSize: 11, color: isToday ? C.brand : C.faint, fontWeight: isToday ? 700 : 400 }}>{dateStr.slice(8, 10)}.{dateStr.slice(5, 7)}</div>
              </div>
            )
          })}

          <div style={{ position: 'sticky', left: 0, zIndex: 2, background: '#fff', borderRight: `1px solid ${C.line}` }}>
            <div style={{ position: 'relative', height: gridHeight }}>
              {hourMarks.map((m) => (
                <div key={m} style={{ position: 'absolute', top: (m - gridStartMin) * PX_PER_MIN - 7, right: 5, fontSize: 10.5, color: C.faint }}>{fromMin(m)}</div>
              ))}
            </div>
          </div>

          {visibleDays.map((w, i) => {
            const dateStr = addDaysStr(weekStart, w.n - 1)
            const isToday = dateStr === todayStrVal
            const { placed, overflow } = byDay[w.n] || { placed: [], overflow: [] }
            return (
              <div key={w.n}
                onClick={(e) => {
                  if (!canEditSlots) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  onCreateAt(w.n, yToTime(e.clientY - rect.top))
                }}
                style={{
                  position: 'relative', borderLeft: `1px solid ${C.line}`, height: gridHeight,
                  background: isToday ? 'rgba(67,56,202,.035)' : '#fff', cursor: canEditSlots ? 'pointer' : 'default',
                }}>
                {hourMarks.map((m) => (
                  <div key={m} style={{ position: 'absolute', top: (m - gridStartMin) * PX_PER_MIN, left: 0, right: 0, borderTop: `1px solid ${C.line}`, pointerEvents: 'none' }} />
                ))}
                {placed.map((r) => {
                  const top = (toMin(r.start_time) - gridStartMin) * PX_PER_MIN
                  const height = Math.max(24, (toMin(r.end_time) - toMin(r.start_time)) * PX_PER_MIN - 2)
                  const widthPct = 100 / r._lanes
                  const leftPct = r._lane * widthPct
                  return (
                    <LessonCard key={r.id} r={r} grade={gradeOfSlot(r)} conflict={conflictMap.get(r.id)}
                      onClick={() => onOpenSlot(r)}
                      style={{ position: 'absolute', top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, boxSizing: 'border-box' }} />
                  )
                })}
                {overflow.map((ov, i2) => {
                  const top = (ov.start - gridStartMin) * PX_PER_MIN
                  const height = Math.max(24, (ov.end - ov.start) * PX_PER_MIN - 2)
                  const widthPct = 100 / ov.lanes
                  const leftPct = ov.lane * widthPct
                  return (
                    <div key={i2} onClick={(e) => { e.stopPropagation(); setOverflowOpen(ov.items) }}
                      style={{
                        position: 'absolute', top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, boxSizing: 'border-box',
                        background: C.grey, border: `1.5px dashed ${C.faint}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: C.slate, cursor: 'pointer',
                      }}>
                      +{ov.items.length} занятия
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {overflowOpen && (
        <div onClick={() => setOverflowOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 90 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 420, padding: 20, maxHeight: '80vh', overflow: 'auto' }}>
            <div className="rowflex" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800 }}>Занятия в это время ({overflowOpen.length})</h3>
              <button onClick={() => setOverflowOpen(null)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overflowOpen.map((r) => (
                <div key={r.id} onClick={() => { onOpenSlot(r); setOverflowOpen(null) }} style={{ padding: '10px 12px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>{fmtHM(r.start_time)}–{fmtHM(r.end_time)} · каб. {r.room}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{r.group_name || STATUS_META[r.status]?.label}</div>
                  {r.teacher_name && <div style={{ fontSize: 12, color: C.slate }}>{r.teacher_name}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LessonCard({ r, grade, conflict, onClick, style }) {
  const m = STATUS_META[r.status] || STATUS_META.confirmed
  const isReal = isRealStatus(r.status)
  const hasConflict = !!(conflict && (conflict.room || conflict.group || conflict.teacher || conflict.assistant))
  const label = conflictLabel(conflict)
  return (
    <div onClick={(e) => { e.stopPropagation(); onClick() }}
      title={isReal
        ? `${r.group_name}${grade ? ` (${grade} кл)` : ''} · ${(r.subject_name || '').split(' / ')[0]} · ${r.teacher_name || '—'}${r.assistant_name ? ` · асс. ${r.assistant_name}` : ''} · каб. ${r.room} · ${r.office} · ${r.students_count ?? ''} уч. · ${fmtHM(r.start_time)}–${fmtHM(r.end_time)}${label ? ` · ⚠ ${label}` : ''}`
        : `${m.label} · каб. ${r.room} · ${fmtHM(r.start_time)}–${fmtHM(r.end_time)}`}
      style={{ ...style, background: m.bg, border: `1.5px solid ${hasConflict ? '#dc2626' : m.border}`, borderRadius: 7, padding: '3px 6px', overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: m.color, whiteSpace: 'nowrap' }}>{fmtHM(r.start_time)}–{fmtHM(r.end_time)}</div>
      {isReal ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {grade && <span style={{ color: C.slate, fontWeight: 600 }}>{grade}кл </span>}{r.group_name}
          </div>
          <div style={{ fontSize: 9.5, color: C.slate, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.teacher_name || '—'} · каб.{r.room}</div>
        </>
      ) : (
        <div style={{ fontSize: 10.5, fontWeight: 800, color: m.color }}>{m.label}</div>
      )}
      {hasConflict && (
        <div className="rowflex" style={{ gap: 3, fontSize: 9, fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <AlertTriangle size={9} /> {label}
        </div>
      )}
    </div>
  )
}

// ================= РЕЖИМ «СПИСОК» =================
// Полная альтернатива сетке — хронологический список по дням, карточки
// на всю ширину, всегда полноразмерные и читаемые.
function ScheduleList({ slots, weekStart, gradeOfSlot, conflictMap, onOpenSlot, canEditSlots, onAdd, emptyMessage }) {
  const byDay = useMemo(() => {
    const m = {}
    WD.forEach((w) => { m[w.n] = [] })
    slots.forEach((s) => { (m[s.weekday] ||= []).push(s) })
    Object.keys(m).forEach((k) => { m[k].sort((a, b) => toMin(a.start_time) - toMin(b.start_time)) })
    return m
  }, [slots])

  const daysWithData = WD.filter((w) => (byDay[w.n] || []).length > 0)
  if (daysWithData.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
        <p style={{ color: C.slate, fontSize: 13.5, margin: canEditSlots ? '0 0 14px' : 0 }}>{emptyMessage || 'На эту неделю занятий нет.'}</p>
        {canEditSlots && (
          <button onClick={onAdd} style={{ padding: '9px 16px', background: C.brand, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Добавить занятие</button>
        )}
      </div>
    )
  }

  const todayStrVal = todayStr()
  return (
    <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {daysWithData.map((w) => {
          const dateStr = addDaysStr(weekStart, w.n - 1)
          const isToday = dateStr === todayStrVal
          const items = byDay[w.n]
          return (
            <div key={w.n} className="sched-day">
              <div className="rowflex" style={{ gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: isToday ? C.brand : C.ink }}>{w.t}</span>
                <span style={{ fontSize: 12.5, color: C.faint }}>{dateStr.slice(8, 10)}.{dateStr.slice(5, 7)}</span>
                {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: C.brand, background: C.brandSoft, padding: '2px 8px', borderRadius: 6 }}>Сегодня</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((r) => {
                  const m = STATUS_META[r.status] || STATUS_META.confirmed
                  const isReal = isRealStatus(r.status)
                  const grade = gradeOfSlot(r)
                  const conflict = conflictMap.get(r.id)
                  const hasConflict = !!(conflict && (conflict.room || conflict.group || conflict.teacher || conflict.assistant))
                  const label = conflictLabel(conflict)
                  return (
                    <div key={r.id} onClick={() => onOpenSlot(r)} className="rowflex"
                      style={{ gap: 14, padding: '10px 14px', background: m.bg, border: `1.5px solid ${hasConflict ? '#dc2626' : m.border}`, borderRadius: 11, cursor: 'pointer', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: m.color, minWidth: 100 }}>{fmtHM(r.start_time)}–{fmtHM(r.end_time)}</span>
                      {isReal ? (
                        <>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>{grade && <span style={{ color: C.slate, fontWeight: 600 }}>{grade}кл </span>}{r.group_name}</span>
                          <span style={{ fontSize: 12.5, color: C.slate }}>{(r.subject_name || '').split(' / ')[0]}</span>
                          <span style={{ fontSize: 12.5, color: C.slate }}>{r.teacher_name || '—'}</span>
                          <span style={{ fontSize: 12.5, color: C.faint }}>каб. {r.room}</span>
                          {r.students_count != null && <span style={{ fontSize: 12.5, color: C.faint }}>{r.students_count} уч.</span>}
                        </>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 800, color: m.color }}>{m.label} · каб. {r.room}</span>
                      )}
                      {hasConflict && (
                        <span className="rowflex" style={{ gap: 4, fontSize: 11.5, fontWeight: 800, color: '#dc2626', marginLeft: 'auto' }}>
                          <AlertTriangle size={13} /> {label}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ================= РЕЖИМ «ПО ГРУППАМ» =================
function GroupsMode({ slots, onOpen }) {
  const [q, setQ] = useState('')
  const byGroup = useMemo(() => {
    const m = {}
    slots.filter((s) => s.group_id).forEach((s) => { (m[s.group_id] ||= { id: s.group_id, name: s.group_name, office: s.office, lang: s.lang, rows: [] }).rows.push(s) })
    return Object.values(m).filter((g) => !q.trim() || g.name.toLowerCase().includes(q.toLowerCase().trim()))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [slots, q])

  if (slots.length === 0) return <Empty text="В этом офисе пока нет занятий." />
  return (
    <div>
      <div style={{ marginBottom: 12 }}><SearchBox q={q} setQ={setQ} placeholder="Поиск группы…" /></div>
      {byGroup.length === 0 ? <Empty text="Группы не найдены." /> : (
        <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
          <thead><tr><th>Группа</th><th>Кабинеты</th><th>Преподаватель</th><th>Дни</th><th>Время</th></tr></thead>
          <tbody>
            {byGroup.map((g) => (
              <React.Fragment key={g.id}>
                {g.rows.sort((a, b) => a.weekday - b.weekday).map((r, i) => (
                  <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                    {i === 0 && <td rowSpan={g.rows.length} style={{ fontWeight: 700, verticalAlign: 'top' }}>{g.name}</td>}
                    <td>{r.room}</td>
                    <td>{r.teacher_name || '—'}</td>
                    <td>{WD.find((w) => w.n === r.weekday)?.s}</td>
                    <td>{fmtHM(r.start_time)}–{fmtHM(r.end_time)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

// ================= РЕЖИМ «ПО ПРЕПОДАВАТЕЛЯМ» =================
// Показывает занятия преподавателя ТОЛЬКО в текущем офисе (п.28 ТЗ) — если
// преподаватель работает и в других офисах, там нужно переключить офис.
function TeachersMode({ slots, dict, onOpen }) {
  const [q, setQ] = useState('')
  const byTeacher = useMemo(() => {
    const m = {}
    slots.filter((s) => s.teacher_id).forEach((s) => { (m[s.teacher_id] ||= { id: s.teacher_id, name: s.teacher_name, rows: [] }).rows.push(s) })
    return Object.values(m).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase().trim()))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [slots, q])

  if (slots.length === 0) return <Empty text="В этом офисе пока нет занятий." />
  return (
    <div>
      <div style={{ marginBottom: 12 }}><SearchBox q={q} setQ={setQ} placeholder="Поиск преподавателя…" /></div>
      {byTeacher.length === 0 ? <Empty text="Ничего не найдено." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byTeacher.map((t) => (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>{t.name}</div>
              <div className="dt-wrap"><div className="dt-scroll"><table className="dt">
                <thead><tr><th style={{ width: 110 }}>День</th><th style={{ width: 110 }}>Время</th><th>Группа</th><th style={{ width: 90 }}>Каб.</th></tr></thead>
                <tbody>
                  {t.rows.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((r) => (
                    <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                      <td>{WD.find((w) => w.n === r.weekday)?.t}</td>
                      <td>{fmtHM(r.start_time)}–{fmtHM(r.end_time)}</td>
                      <td style={{ fontWeight: 600 }}>{r.group_name}</td>
                      <td>{r.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchBox({ q, setQ, placeholder }) {
  return (
    <div style={{ position: 'relative', maxWidth: 320 }}>
      <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
    </div>
  )
}
function Empty({ text }) {
  return <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate, fontSize: 13.5 }}>{text}</div>
}
function addSheet(wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ ' ': 'нет данных' }])
  if (rows.length) {
    const headers = Object.keys(rows[0])
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)) + 2 }))
    ws['!autofilter'] = { ref: ws['!ref'] }
  }
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}
const navBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center' }
const selSty = { padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5, outline: 'none', background: '#fff' }

// ================= СОЗДАНИЕ / РЕДАКТИРОВАНИЕ СЛОТА =================
// Офис ЗАФИКСИРОВАН контекстом страницы (pageOffice/lockedOffice) — его
// нельзя случайно поменять обычным редактированием (п.30-31 ТЗ). Перенос
// в другой офис — отдельная явная операция с подтверждением, доступная
// только тем, кто видит несколько офисов (canTransferOffice), и только
// для уже существующего занятия.
function SlotModal({ slot, dict, roomOptions, pageOffice, lockedOffice, canTransferOffice, onClose, onSaved, onDelete }) {
  const editing = slot !== 'new' && slot?.id
  const fixedOffice = lockedOffice || pageOffice
  const [office, setOffice] = useState(editing ? slot.office : fixedOffice)
  const [transferMode, setTransferMode] = useState(false)
  const [room, setRoom] = useState(slot?.room || '')
  const [groupId, setGroupId] = useState(slot?.group_id || '')
  const [teacherId, setTeacherId] = useState(slot?.teacher_id || '')
  const [assistantId, setAssistantId] = useState(slot?.assistant_id || '')
  const [days, setDays] = useState(editing ? [slot.weekday] : slot?.weekday ? [slot.weekday] : [])
  const [startTime, setStartTime] = useState(slot?.start_time?.slice(0, 5) || '')
  const [endTime, setEndTime] = useState(slot?.end_time?.slice(0, 5) || '')
  const [count, setCount] = useState(slot?.lessons_count || 2)
  const [status, setStatus] = useState(slot?.status || 'confirmed')
  const [activeFrom, setActiveFrom] = useState(slot?.active_from || todayStr())
  const [activeTo, setActiveTo] = useState(slot?.active_to || '')
  const [notes, setNotes] = useState(slot?.notes || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [confirmDel, setConfirmDel] = useState(false)

  const isReal = status === 'confirmed' || status === 'confirmed_special'
  const toggleDay = (n) => setDays((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])

  // Живая проверка конфликта — по кабинету/группе/преподавателю/ассистенту,
  // пока форма ещё заполняется, с небольшим дебаунсом.
  useEffect(() => {
    if (!office || !room || !startTime || !endTime || days.length === 0) { setConflicts([]); return }
    const t = setTimeout(() => {
      Promise.all(days.map((d) => checkScheduleConflicts({
        office, room, teacherId: isReal ? (teacherId || null) : null, assistantId: isReal ? (assistantId || null) : null,
        groupId: isReal ? (groupId || null) : null, weekday: d,
        startTime, endTime, activeFrom, activeTo: activeTo || null, excludeId: editing ? slot.id : null,
      }))).then((results) => setConflicts(results.flat())).catch(() => setConflicts([]))
    }, 350)
    return () => clearTimeout(t)
  }, [office, room, teacherId, assistantId, groupId, days, startTime, endTime, activeFrom, activeTo, isReal])

  async function save() {
    setErr('')
    if (!office || !room || !startTime || !endTime || days.length === 0) { setErr('Заполните кабинет, время и хотя бы один день'); return }
    if (isReal && (!groupId || !teacherId)) { setErr('Для подтверждённого занятия обязательны группа и преподаватель'); return }
    if (conflicts.length > 0) { setErr('Есть конфликт расписания — сначала устраните его'); return }
    setBusy(true)
    try {
      let result = null
      if (editing) {
        result = await saveScheduleSlot(slot.id, {
          office, room, groupId: isReal ? groupId : null, teacherId: isReal ? teacherId : null, assistantId: isReal ? (assistantId || null) : null,
          weekday: days[0], startTime, endTime, lessonsCount: Number(count), status, activeFrom, activeTo: activeTo || null, notes,
        })
      } else {
        for (const d of days) {
          await saveScheduleSlot(null, {
            office, room, groupId: isReal ? groupId : null, teacherId: isReal ? teacherId : null, assistantId: isReal ? (assistantId || null) : null,
            weekday: d, startTime, endTime, lessonsCount: Number(count), status, activeFrom, activeTo: activeTo || null, notes,
          })
        }
      }
      await onSaved(result)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 520, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{editing ? 'Занятие' : 'Добавить занятие'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <Label>Статус *</Label>
        <div className="rowflex" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {Object.entries(STATUS_META).map(([k, m]) => (
            <button key={k} onClick={() => setStatus(k)}
              style={{ padding: '7px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: status === k ? `1.5px solid ${m.color}` : `1px solid ${C.line}`, background: status === k ? m.bg : '#fff', color: status === k ? m.color : C.slate }}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Офис</Label>
            {transferMode ? (
              <div className="rowflex" style={{ gap: 6 }}>
                <select value={office} onChange={(e) => setOffice(e.target.value)} style={inpSty}>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <button onClick={() => setTransferMode(false)} title="Готово"
                  style={{ padding: '0 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}><Check size={16} /></button>
              </div>
            ) : (
              <div className="rowflex" style={{ gap: 8 }}>
                <div style={{ ...inpSty, background: C.grey, flex: 1 }}>{office}</div>
                {editing && !lockedOffice && canTransferOffice && (
                  <button onClick={() => setTransferMode(true)} title="Перенести занятие в другой офис"
                    style={{ padding: '0 10px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.slate, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ⇄ В другой офис
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <Label>Кабинет *</Label>
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="напр. 3" list="room-options" style={inpSty} />
            <datalist id="room-options">{roomOptions.map((r) => <option key={r} value={r} />)}</datalist>
          </div>
        </div>

        {isReal && (
          <>
            <Label>Группа *</Label>
            <GroupSearchSelect groups={(dict.groups || []).filter((g) => g.office === office)} value={groupId} onChange={setGroupId} />
            <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>Преподаватель *</Label>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={inpSty}>
                  <option value="">— выбрать —</option>
                  {(dict.teachers || []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <Label>Ассистент</Label>
                <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} style={inpSty}>
                  <option value="">— не назначен —</option>
                  {(dict.assistants || []).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <Label style={{ marginTop: 14 }}>Дни недели *</Label>
        <div className="rowflex" style={{ gap: 5, flexWrap: 'wrap' }}>
          {WD.map((w) => (
            <button key={w.n} disabled={editing} onClick={() => toggleDay(w.n)}
              style={{ padding: '8px 13px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: editing ? 'default' : 'pointer',
                border: days.includes(w.n) ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                background: days.includes(w.n) ? C.brand : '#fff', color: days.includes(w.n) ? '#fff' : C.slate, opacity: editing && !days.includes(w.n) ? 0.4 : 1 }}>{w.s}</button>
          ))}
        </div>
        {!editing && <p style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>Несколько дней — создастся отдельная запись на каждый.</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Начало *</Label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inpSty} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Окончание *</Label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inpSty} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Уроков</Label>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setCount(n)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    border: count === n ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`, background: count === n ? C.brandSoft : '#fff', color: count === n ? C.brand : C.slate }}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <Label>Действует с</Label>
            <input type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} style={inpSty} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Действует по (необязательно)</Label>
            <input type="date" value={activeTo} onChange={(e) => setActiveTo(e.target.value)} style={inpSty} />
          </div>
        </div>

        <Label style={{ marginTop: 14 }}>Комментарий</Label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inpSty, resize: 'vertical' }} />

        {conflicts.length > 0 && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 13px', marginTop: 14, fontSize: 12.5, color: '#b91c1c' }}>
            {conflicts.map((c, i) => (
              <div key={i} className="rowflex" style={{ gap: 6 }}>
                <AlertTriangle size={13} />
                {c.kind === 'room' && <span>Конфликт расписания. Кабинет {c.room} ({c.office}) уже занят {c.group_name ? `«${c.group_name}»` : STATUS_META.reserve.label.toLowerCase()} с {fmtHM(c.start_time)} до {fmtHM(c.end_time)}.</span>}
                {c.kind === 'group' && <span>Группа {c.group_name} уже занята с {fmtHM(c.start_time)} до {fmtHM(c.end_time)} ({c.office}).</span>}
                {c.kind === 'teacher' && <span>Преподаватель {c.teacher_name} уже занят в {c.office} с {fmtHM(c.start_time)} до {fmtHM(c.end_time)}.</span>}
                {c.kind === 'assistant' && <span>Ассистент {c.assistant_name} уже занят в {c.office} с {fmtHM(c.start_time)} до {fmtHM(c.end_time)}.</span>}
              </div>
            ))}
          </div>
        )}
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {editing && (
            <button onClick={() => setConfirmDel(true)} title="Удалить"
              style={{ padding: '11px 14px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy || conflicts.length > 0}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: (busy || conflicts.length > 0) ? 0.5 : 1 }}>
            {busy ? 'Сохраняю…' : editing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmBox title="Удалить занятие из расписания?" busy={false}
          onCancel={() => setConfirmDel(false)} onConfirm={() => onDelete(slot.id)} confirmText="Удалить" />
      )}
    </div>
  )
}

// ================= ГЕНЕРАЦИЯ ЗАНЯТИЙ (без изменений формулы) =================
function GenerateModal({ onClose, onDone }) {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(addDaysStr(todayStr(), 30))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    setBusy(true); setErr('')
    try { const n = await generateLessons(from, to); await onDone(n) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 400, padding: 22 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800 }}>Создать занятия из расписания</h3>
        <p style={{ fontSize: 13, color: C.slate, margin: '0 0 16px', lineHeight: 1.5 }}>
          Система создаст ожидаемые занятия за выбранный период по подтверждённым слотам
          (резерв и «занято» занятий не создают). Преподаватели увидят их в «Мои занятия».
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Label>С даты</Label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inpSty} /></div>
          <div style={{ flex: 1 }}><Label>По дату</Label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inpSty} /></div>
        </div>
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={run} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.teal, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Создаю…' : 'Создать'}</button>
        </div>
        <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>Повторный запуск не создаст дубли — только недостающие занятия.</p>
      </div>
    </div>
  )
}

// ================= МАСТЕР ИМПОРТА =================
// Вставка структурированных строк (Офис\tКабинет\tДень\tНачало\tКонец\tГруппа\tПреподаватель\t[Статус]),
// а не разбор исходного Excel «в лоб» — исходный файл слишком неровный
// (смещённые заголовки, ФИЗ/МАТ вместо кода группы, опечатки в именах),
// автоматический парсинг рисковал бы тихо создать неверные записи в живой
// базе. Здесь группы/преподаватели ищутся по нормализованному сравнению,
// несовпадения не создаются молча — их нужно разрешить вручную.
const DAY_ALIASES = { 'пн': 1, 'понедельник': 1, 'вт': 2, 'вторник': 2, 'ср': 3, 'среда': 3, 'чт': 4, 'четверг': 4, 'пт': 5, 'пятница': 5, 'сб': 6, 'суббота': 6, 'вс': 7, 'воскресенье': 7 }
function normName(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ').replace(/[-–—]/g, '-')
}
function guessLang(groupName) {
  const m = /^\d{1,2}\s*([а-яё])/i.exec(groupName || '')
  if (!m) return null
  const c = m[1].toLowerCase()
  if (c === 'к') return 'каз'
  if (c === 'р') return 'рус'
  return null
}

// Расписание почти всегда пишет преподавателя как «Имя И.» (имя + первая
// буква фамилии/отчества), а в базе — полное ФИО, поэтому точное сравнение
// строк почти никогда не совпадает. Ищем по имени + начальной букве второго
// слова, независимо от порядка «Имя Фамилия» / «Фамилия Имя» в базе.
// Автоматически подставляем совпадение, ТОЛЬКО если оно единственное —
// при неоднозначности (два тёзки с одинаковой буквой) оставляем на ручной
// выбор, чтобы не назначить занятие не тому человеку.
function matchTeacherFuzzy(scheduleName, teachers) {
  const exactWanted = normName(scheduleName)
  const exact = teachers.find((t) => normName(t.full_name) === exactWanted)
  if (exact) return exact

  const m = /^([a-zа-яёіңғүұқөhәA-Z]+)\s+([a-zа-яёA-Z])\.?\s*$/u.exec((scheduleName || '').trim())
  if (!m) return null
  const firstName = m[1].toLowerCase()
  const initial = m[2].toLowerCase()

  const candidates = teachers.filter((t) => {
    const words = normName(t.full_name).split(' ').filter(Boolean)
    const hasFirst = words.includes(firstName)
    const hasInitialWord = words.some((w) => w !== firstName && w[0] === initial)
    return hasFirst && hasInitialWord
  })
  return candidates.length === 1 ? candidates[0] : null
}

function ImportWizard({ dict, initialOffice, onClose, onDone }) {
  const [office, setOffice] = useState(initialOffice || OFFICES[0])
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState(null) // после разбора/сопоставления
  const [teacherOverrides, setTeacherOverrides] = useState({}) // rowIndex -> teacher_id
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')

  // Статус берётся из 8-го столбца текстом — обычно это цвет ячейки в
  // исходном Excel: бирюзовый/«тёмно-синий» → подтверждено, розовый/
  // «бордовый» → особое (в реальном файле это оказалось строго 10 класс
  // против 11-го — закономерность, не единичные случаи), зелёный →
  // резерв, белый (без заливки) → занято другим центром.
  function classifyStatus(statusRaw) {
    const s = normName(statusRaw)
    if (/резерв/.test(s)) return 'reserve'
    if (/особ/.test(s)) return 'confirmed_special'
    if (/занят/.test(s)) return 'occupied_other'
    return 'confirmed'
  }

  function parse() {
    setErr('')
    const groupsByOffice = (dict.groups || []).filter((g) => g.office === office)
    const groupIndex = {}
    groupsByOffice.forEach((g) => { groupIndex[normName(g.name)] = g })
    const teachers = dict.teachers || []

    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const parsed = lines.map((line, i) => {
      const cols = line.split('\t').map((c) => c.trim())
      const [office_, room, dayRaw, start, end, groupName, teacherName, statusRaw, notes] = cols
      const day = DAY_ALIASES[normName(dayRaw)] || Number(dayRaw) || null
      const status = classifyStatus(statusRaw)
      const needsGroupTeacher = status === 'confirmed' || status === 'confirmed_special'
      let matchedGroup = null, willCreateGroup = false
      if (needsGroupTeacher && groupName) {
        matchedGroup = groupIndex[normName(groupName)] || null
        willCreateGroup = !matchedGroup && /^1[01]/.test(groupName.trim())
      }
      const matchedTeacher = needsGroupTeacher && teacherName ? matchTeacherFuzzy(teacherName, teachers) : null
      return {
        i, office: office_ || office, room, day, start, end, groupName, teacherName, status, notes: notes || '',
        needsGroupTeacher, matchedGroup, willCreateGroup, matchedTeacher,
        ok: needsGroupTeacher ? !!(day && start && end && room && (matchedGroup || willCreateGroup) && matchedTeacher) : !!(day && start && end && room),
      }
    })
    setRows(parsed)
    setTeacherOverrides({})
  }

  async function run() {
    setRunning(true); setErr('')
    const stats = { total: rows.length, groupsFound: 0, groupsCreated: 0, teachersFound: 0, teachersNotFound: 0, confirmed: 0, special: 0, reserve: 0, occupied: 0, skipped: 0, errors: [] }
    // Одна и та же новая группа встречается в расписании много раз (разные
    // дни недели) — создаём её только один раз за весь импорт, дальше
    // переиспользуем id из этого кеша, а не зовём addGroup() повторно
    // (иначе вторая же строка с той же группой падала на unique-constraint).
    const createdGroups = {}
    try {
      for (const r of rows) {
        try {
          const teacherId = teacherOverrides[r.i] || r.matchedTeacher?.id || null
          if (r.needsGroupTeacher && !teacherId) { stats.teachersNotFound++; stats.skipped++; continue }
          if (!r.day || !r.start || !r.end || !r.room) { stats.skipped++; continue }

          let groupId = r.matchedGroup?.id || null
          if (r.needsGroupTeacher) {
            const key = normName(r.groupName)
            if (groupId) stats.groupsFound++
            else if (createdGroups[key]) { groupId = createdGroups[key] }
            else if (r.willCreateGroup) {
              const created = await addGroup({ name: r.groupName.trim(), office: r.office, lang: guessLang(r.groupName), archived: false })
              groupId = created.id
              createdGroups[key] = groupId
              stats.groupsCreated++
            } else { stats.skipped++; continue }
            stats.teachersFound++
          }

          await saveScheduleSlot(null, {
            office: r.office, room: r.room, groupId: r.needsGroupTeacher ? groupId : null, teacherId: r.needsGroupTeacher ? teacherId : null,
            assistantId: null, weekday: r.day, startTime: r.start, endTime: r.end, lessonsCount: 2,
            status: r.status, activeFrom: todayStr(), activeTo: null, notes: r.notes || null,
          })
          if (r.status === 'confirmed') stats.confirmed++
          else if (r.status === 'confirmed_special') stats.special++
          else if (r.status === 'reserve') stats.reserve++
          else stats.occupied++
        } catch (e) {
          // Ошибка на ОДНОЙ строке (например неожиданный конфликт расписания
          // или дубль имени группы) не должна обрывать весь импорт — остальные
          // строки продолжают обрабатываться, а эта попадает в отчёт.
          stats.errors.push(`${r.groupName || STATUS_META[r.status].label} (каб. ${r.room}, ${WD.find((w) => w.n === r.day)?.t || r.day}, ${r.start}–${r.end}): ${e.message}`)
        }
      }
      setReport(stats)
      await onDone()
    } catch (e) { setErr(e.message) } finally { setRunning(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 780, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Импорт расписания</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {report ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Импорт завершён</div>
            <div style={{ background: C.grey, borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.9 }}>
              Строк обработано: <b>{report.total}</b><br />
              Групп найдено в базе: <b>{report.groupsFound}</b> · Создано новых: <b>{report.groupsCreated}</b><br />
              Преподавателей сопоставлено: <b>{report.teachersFound}</b> · Не сопоставлено: <b style={{ color: report.teachersNotFound ? '#dc2626' : undefined }}>{report.teachersNotFound}</b><br />
              Подтверждённых слотов создано: <b>{report.confirmed}</b><br />
              Подтверждённых (особых) создано: <b>{report.special}</b><br />
              Резервов создано: <b>{report.reserve}</b><br />
              «Занято — другой центр» создано: <b>{report.occupied}</b><br />
              Пропущено (не хватило данных): <b>{report.skipped}</b><br />
              Ошибок при сохранении: <b style={{ color: report.errors.length ? '#dc2626' : undefined }}>{report.errors.length}</b>
            </div>
            {report.errors.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#dc2626' }}>{report.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>
            )}
            <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Готово</button>
          </div>
        ) : rows ? (
          <div>
            <p style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Проверьте сопоставление перед импортом. Строки с ⚠️ не будут импортированы, пока преподаватель не выбран вручную.</p>
            <div className="dt-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><div className="dt-scroll"><table className="dt">
              <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 60 }}>Каб.</th><th style={{ width: 60 }}>День</th><th style={{ width: 100 }}>Время</th><th style={{ width: 110 }}>Тип</th><th>Группа</th><th>Преподаватель</th><th style={{ width: 50 }}>OK</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i}>
                    <td>{r.i + 1}</td><td>{r.room || '—'}</td><td>{r.day ? WD.find((w) => w.n === r.day)?.s : <span style={{ color: '#dc2626' }}>?</span>}</td>
                    <td>{r.start && r.end ? `${r.start}–${r.end}` : <span style={{ color: '#dc2626' }}>?</span>}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, color: STATUS_META[r.status].color }}>{STATUS_META[r.status].label}</span></td>
                    <td>{!r.needsGroupTeacher ? <i style={{ color: C.faint }}>{r.notes || '—'}</i> : r.matchedGroup ? r.groupName : r.willCreateGroup ? <span style={{ color: '#d97706' }}>🆕 {r.groupName}</span> : <span style={{ color: '#dc2626' }}>⚠️ {r.groupName || '—'}</span>}</td>
                    <td>{!r.needsGroupTeacher ? '—' : r.matchedTeacher ? r.teacherName : (
                      <select value={teacherOverrides[r.i] || ''} onChange={(e) => setTeacherOverrides((p) => ({ ...p, [r.i]: e.target.value }))} style={{ ...selSty, padding: '4px 8px' }}>
                        <option value="">⚠️ {r.teacherName || 'выбрать…'}</option>
                        {(dict.teachers || []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                    )}</td>
                    <td>{r.ok || teacherOverrides[r.i] ? <Check size={14} color="#0f9d58" /> : <AlertTriangle size={14} color="#dc2626" />}</td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
            {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setRows(null)} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Назад</button>
              <button onClick={run} disabled={running} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: running ? 0.6 : 1 }}>{running ? 'Импортирую…' : 'Импортировать'}</button>
            </div>
          </div>
        ) : (
          <div>
            <Label>Офис по умолчанию (если не указан в столбце)</Label>
            <select value={office} onChange={(e) => setOffice(e.target.value)} style={inpSty}>
              {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <Label style={{ marginTop: 14 }}>Вставьте строки (по одной на занятие, столбцы через Tab — как при копировании из Excel)</Label>
            <p style={{ fontSize: 11.5, color: C.faint, marginBottom: 6, lineHeight: 1.5 }}>
              Офис · Кабинет · День (Пн/Вт/…) · Начало (ЧЧ:ММ) · Конец · Группа · Преподаватель · Статус (пусто = подтверждено, «особое», «резерв», «занято») · [Заметка]
            </p>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={10}
              placeholder={'Торайгырова\t7\tПн\t14:00\t16:00\t11 КТФ-2\tГульжихан К.\n...'}
              style={{ ...inpSty, fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
              <button onClick={parse} disabled={!raw.trim()} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: raw.trim() ? 1 : 0.5 }}>Проверить сопоставление</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfirmBox({ title, children, busy, onCancel, onConfirm, confirmText }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 90 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 420, padding: 22 }}>
        <h3 style={{ margin: children ? '0 0 10px' : '0 0 16px', fontSize: 16, fontWeight: 800 }}>{title}</h3>
        {children}
        <div style={{ display: 'flex', gap: 10, marginTop: children ? 16 : 0 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}

function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6, ...style }}>{children}</div>
}
const inpSty = { width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }
