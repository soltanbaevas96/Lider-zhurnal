import React, { useEffect, useState } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Check, X, Clock, Wifi, RotateCcw, ArrowLeft, Ban, Paperclip, AlertTriangle,
} from 'lucide-react'
import { fetchMyLessons, fetchStudentsOfGroup, fetchAttendance, fetchLessonTestInfo, conductLesson, cancelLesson, planUrl, uploadPlan } from '../lib/api'
import { ST, REASONS } from '../components/AttendancePicker'
import { C, todayStr, addDaysStr } from '../lib/utils'

const STATUS_META = {
  planned: { label: 'Запланировано', color: C.brand, bg: C.brandSoft },
  проведён: { label: 'Проведено', color: C.ok, bg: C.okSoft },
  отменён: { label: 'Отменено', color: C.slate, bg: C.grey },
}

// onChanged — необязательный колбэк родителя (App.jsx), вызывается после
// проведения/отмены занятия. Нужен, чтобы вкладка «Журнал» (у неё свой
// отдельный, загруженный по периоду список lessons) сразу увидела
// изменение статуса — без него занятие, проведённое здесь, оставалось
// бы в «Журнале» невидимым до смены периода/перезахода (п.51 ТЗ,
// ТЕСТ №3: после проведения занятие должно остаться в журнале).
export default function MyLessons({ teacherId, onChanged }) {
  // todayStr()/addDaysStr() — локальные геттеры даты, не toISOString()
  // (который переводит в UTC и в ночные часы по Казахстану показал бы
  // вчерашний день — см. ТЗ про часовой пояс).
  const [date, setDate] = useState(() => todayStr())
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)   // занятие, которое проводим
  const [err, setErr] = useState('')
  const [overdueExpanded, setOverdueExpanded] = useState(false)

  async function load() {
    setErr('')
    try { setRows(await fetchMyLessons(date)) }
    catch (e) { setErr(e.message); setRows([]) }
  }
  useEffect(() => { load() }, [date])

  const shift = (d) => setDate(addDaysStr(date, d))
  const isToday = date === todayStr()

  // Непроведённые занятия из ПРОШЛОГО (п.2-12 ТЗ) — get_my_lessons
  // возвращает их ВСЕГДА, независимо от того, какой день сейчас
  // просматривается (is_overdue считается от реального today, не от
  // выбранной date), поэтому они не пропадают при переключении дня и
  // не ограничены количеством прошедших дней. dayRows — то же самое,
  // что раньше показывалось как «занятия на дату» (без него сюда бы
  // задваивались уже показанные в блоке overdue строки, если дата
  // видом совпала с прошлым днём — но по построению RPC они дают
  // ОБЪЕДИНЕНИЕ через OR, а не пересечение, так что дубликатов и так
  // не бывает: строка либо попадает в overdue, либо в «на дату», не в обе).
  const overdueRows = (rows || []).filter((r) => r.is_overdue)
  const dayRows = (rows || []).filter((r) => !r.is_overdue)
  const overdueVisible = overdueExpanded ? overdueRows : overdueRows.slice(0, 6)

  // Фильтры «Моих занятий» (п.4 ТЗ) — только те, где реально есть выбор
  // (если у преподавателя в этот день один офис/предмет/группа — фильтр
  // просто не показываем, чтобы не перегружать интерфейс). Считаются
  // только от dayRows — блок «Непроведённые» им не подчиняется, он
  // показывает вообще все просроченные занятия, а не только этого дня.
  const [officeF, setOfficeF] = useState('all')
  const [subjectF, setSubjectF] = useState('all')
  const [groupF, setGroupF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [attentionF, setAttentionF] = useState(null) // 'noplan' | 'notopic' | null

  async function afterConduct() {
    setOpen(null)
    await load()
    await onChanged?.()
  }

  if (open) {
    return <ConductCard lesson={open} teacherId={teacherId} onBack={() => setOpen(null)} onDone={afterConduct} />
  }

  const planned = dayRows.filter((r) => r.status === 'planned')
  const doneList = dayRows.filter((r) => r.status === 'проведён')
  const cancelledList = dayRows.filter((r) => r.status === 'отменён')
  const noPlanList = doneList.filter((r) => !r.plan_path)
  const noTopicList = doneList.filter((r) => !r.topic?.trim())

  const officeOptions = [...new Set(dayRows.map((r) => r.office).filter(Boolean))]
  const subjectOptions = [...new Set(dayRows.map((r) => (r.subject_name || '').split(' / ')[0]).filter(Boolean))]
  const groupOptions = [...new Set(dayRows.map((r) => r.group_name).filter(Boolean))]

  const visibleRows = dayRows.filter((r) => {
    if (officeF !== 'all' && r.office !== officeF) return false
    if (subjectF !== 'all' && (r.subject_name || '').split(' / ')[0] !== subjectF) return false
    if (groupF !== 'all' && r.group_name !== groupF) return false
    if (statusF !== 'all' && r.status !== statusF) return false
    if (attentionF === 'noplan' && (r.status !== 'проведён' || r.plan_path)) return false
    if (attentionF === 'notopic' && (r.status !== 'проведён' || r.topic?.trim())) return false
    return true
  })

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Мои занятия</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            {isToday ? 'Сегодня' : new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="rowflex" style={{ gap: 6 }}>
          <button onClick={() => shift(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ padding: '7px 10px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, outline: 'none' }} />
          <button onClick={() => shift(1)} style={navBtn}><ChevronRight size={16} /></button>
          {!isToday && (
            <button onClick={() => setDate(todayStr())}
              style={{ ...navBtn, width: 'auto', padding: '0 11px', fontSize: 12.5, fontWeight: 600 }}>Сегодня</button>
          )}
        </div>
      </div>

      {/* Непроведённые занятия из прошлого (п.4,26,28 ТЗ) — не привязаны
          к выбранному дню и не пропадают, пока их не проведут/отменят.
          Блок вообще не рендерится, если таких занятий нет (п.29 ТЗ). */}
      {overdueRows.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 13, padding: 14, marginBottom: 16 }}>
          <div className="rowflex" style={{ gap: 7, color: '#92400e', fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>
            <AlertTriangle size={16} /> Непроведённые занятия: {overdueRows.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdueVisible.map((l) => (
              <div key={l.lesson_id} onClick={() => setOpen(l)}
                className="rowflex" style={{ gap: 10, flexWrap: 'wrap', background: '#fff', border: '1px solid #fde68a', borderRadius: 11, padding: '10px 13px', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rowflex" style={{ gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
                      {new Date(l.lesson_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                    </span>
                    {l.time_text && <span style={{ fontSize: 11.5, color: C.slate }}>{l.time_text}</span>}
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{l.group_name}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginTop: 2 }}>
                    {(l.subject_name || '').split(' / ')[0]} · {l.lessons_count} урока
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setOpen(l) }}
                  style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: C.brand, color: '#fff' }}>
                  Провести
                </button>
              </div>
            ))}
          </div>
          {overdueRows.length > overdueVisible.length && (
            <button onClick={() => setOverdueExpanded(true)}
              style={{ marginTop: 8, border: 'none', background: 'none', color: '#92400e', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              Показать ещё {overdueRows.length - overdueVisible.length}
            </button>
          )}
        </div>
      )}

      {dayRows.length > 0 && (
        <div className="rowflex" style={{ gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
          <MiniBadge n={planned.length} label="к проведению" color={C.brand} bg={C.brandSoft} onClick={() => setStatusF(statusF === 'planned' ? 'all' : 'planned')} active={statusF === 'planned'} />
          <MiniBadge n={doneList.length} label="проведено" color={C.ok} bg={C.okSoft} onClick={() => setStatusF(statusF === 'проведён' ? 'all' : 'проведён')} active={statusF === 'проведён'} />
          <MiniBadge n={cancelledList.length} label="отменено" color={C.slate} bg={C.grey} onClick={() => setStatusF(statusF === 'отменён' ? 'all' : 'отменён')} active={statusF === 'отменён'} />
        </div>
      )}

      {(noPlanList.length > 0 || noTopicList.length > 0) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>Требует внимания</div>
          {noPlanList.length > 0 && (
            <AttentionRow onClick={() => setAttentionF(attentionF === 'noplan' ? null : 'noplan')} active={attentionF === 'noplan'}>
              {noPlanList.length} {noPlanList.length === 1 ? 'занятие проведено' : 'занятия проведены'} без плана урока
            </AttentionRow>
          )}
          {noTopicList.length > 0 && (
            <AttentionRow onClick={() => setAttentionF(attentionF === 'notopic' ? null : 'notopic')} active={attentionF === 'notopic'}>
              {noTopicList.length} {noTopicList.length === 1 ? 'занятие проведено' : 'занятия проведены'} без темы урока
            </AttentionRow>
          )}
        </div>
      )}

      {(officeOptions.length > 1 || subjectOptions.length > 1 || groupOptions.length > 1) && (
        <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {officeOptions.length > 1 && (
            <select value={officeF} onChange={(e) => setOfficeF(e.target.value)} style={filterSel}>
              <option value="all">Все офисы</option>
              {officeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {subjectOptions.length > 1 && (
            <select value={subjectF} onChange={(e) => setSubjectF(e.target.value)} style={filterSel}>
              <option value="all">Все предметы</option>
              {subjectOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {groupOptions.length > 1 && (
            <select value={groupF} onChange={(e) => setGroupF(e.target.value)} style={filterSel}>
              <option value="all">Все группы</option>
              {groupOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>
      )}

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {rows === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : dayRows.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <CalendarDays size={30} color={C.faint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>На этот день занятий нет</div>
          <div style={{ fontSize: 13, color: C.slate }}>Занятия появляются из расписания, которое ведёт завуч.</div>
        </div>
      ) : visibleRows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, color: C.slate }}>
          По этому фильтру занятий нет. <button onClick={() => { setOfficeF('all'); setSubjectF('all'); setGroupF('all'); setStatusF('all'); setAttentionF(null) }}
            style={{ border: 'none', background: 'none', color: C.brand, fontWeight: 700, cursor: 'pointer', padding: 0, marginLeft: 4 }}>Сбросить фильтры</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleRows.map((l) => {
            const done = l.status === 'проведён'
            const cancelled = l.status === 'отменён'
            const m = STATUS_META[l.status] || STATUS_META.planned
            const flagged = done && (!l.plan_path || !l.topic?.trim())
            return (
              <div key={l.lesson_id}
                style={{
                  background: C.card, border: `1px solid ${C.line}`,
                  borderLeft: `4px solid ${flagged ? '#d97706' : m.color}`,
                  borderRadius: 13, padding: 15, opacity: cancelled ? 0.6 : 1,
                }}>
                <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rowflex" style={{ gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{l.group_name}</span>
                      {l.time_text && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand, background: C.brandSoft, padding: '2px 9px', borderRadius: 20 }}>
                          {l.time_text}
                        </span>
                      )}
                      {done && (
                        <span className="rowflex" style={{ gap: 4, fontSize: 11.5, fontWeight: 700, color: C.ok, background: C.okSoft, padding: '2px 9px', borderRadius: 20 }}>
                          <Check size={11} /> проведено
                        </span>
                      )}
                      {cancelled && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.slate, background: C.grey, padding: '2px 9px', borderRadius: 20 }}>отменено</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: C.slate, marginTop: 3 }}>
                      {(l.subject_name || '').split(' / ')[0]} · {l.students_count} учеников · {l.lessons_count} урока
                    </div>
                    {done && l.topic && (
                      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 3 }}>Тема: {l.topic}</div>
                    )}
                    {done && (
                      l.plan_path ? (
                        <button onClick={async (e) => { e.stopPropagation(); const url = await planUrl(l.plan_path); if (url) window.open(url, '_blank') }}
                          className="rowflex" style={{ gap: 4, marginTop: 4, fontSize: 11.5, color: C.ok, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                          <Paperclip size={11} /> план прикреплён
                        </button>
                      ) : (
                        <span className="rowflex" style={{ gap: 4, marginTop: 4, fontSize: 11.5, color: '#d97706', fontWeight: 600 }}>
                          <AlertTriangle size={11} /> нет плана
                        </span>
                      )
                    )}
                  </div>

                  {!cancelled && (
                    <button onClick={() => setOpen(l)}
                      style={{
                        padding: '10px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: done ? C.grey : C.brand, color: done ? C.slate : '#fff',
                      }}>
                      {done ? 'Изменить' : 'Провести занятие'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- КАРТОЧКА ПРОВЕДЕНИЯ ЗАНЯТИЯ ----------
function ConductCard({ lesson, teacherId, onBack, onDone }) {
  const [students, setStudents] = useState(null)
  const [marks, setMarks] = useState({})       // { studentId: {status, reason} }
  const [topic, setTopic] = useState(lesson.topic || '')
  const [comment, setComment] = useState('')
  const [count, setCount] = useState(lesson.lessons_count || 2)
  const [hasTest, setHasTest] = useState(false)
  const [maxScore, setMaxScore] = useState('')
  const [planPath, setPlanPath] = useState(lesson.plan_path || null)
  const [planFile, setPlanFile] = useState(null) // новый файл, выбранный, но ещё не загруженный
  const [busy, setBusy] = useState(false)
  const [cancelMode, setCancelMode] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let stop = false
    // Отсутствие группы у занятия — ошибка данных, а не «пустая группа»
    // (п.19 ТЗ): не гадаем и не запрашиваем всё подряд, сразу говорим,
    // в чём дело, и не оставляем список в вечной «Загрузке…».
    if (!lesson.group_id) {
      setStudents([])
      setErr('У этого занятия не указана группа. Обратитесь к администратору.')
      return
    }
    Promise.all([
      fetchStudentsOfGroup(lesson.group_id),
      fetchAttendance(lesson.lesson_id).catch(() => []),
      fetchLessonTestInfo(lesson.lesson_id).catch(() => ({ has_test: false, test_max_score: null })),
    ]).then(([list, saved, testInfo]) => {
      if (stop) return
      setStudents(list)
      setHasTest(!!testInfo.has_test)
      setMaxScore(testInfo.test_max_score ?? '')
      const init = {}
      list.forEach((s) => { init[s.id] = { status: 'present', reason: null, score: '' } })
      saved.forEach((a) => {
        init[a.student_id] = {
          status: a.status || (a.present ? 'present' : 'absent'),
          reason: a.absence_reason || null,
          score: a.score ?? '',
        }
      })
      setMarks(init)
    }).catch((e) => {
      console.error('MyLessons/ConductCard: не удалось загрузить учеников/посещаемость', { lessonId: lesson.lesson_id, groupId: lesson.group_id, error: e })
      if (!stop) { setErr(e.message); setStudents([]) }
    })
    return () => { stop = true }
  }, [lesson])

  const setStatus = (id, status) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], status, reason: status === 'absent' ? p[id]?.reason : null } }))
  const setReason = (id, reason) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], reason } }))
  const setScore = (id, score) =>
    setMarks((p) => ({ ...p, [id]: { ...p[id], score } }))
  // Массовые действия — не заставлять преподавателя жать «Был» по одному на 20+ учеников.
  const setAllStatus = (status) =>
    setMarks((p) => {
      const next = { ...p }
      ;(students || []).forEach((s) => { next[s.id] = { ...next[s.id], status, reason: status === 'absent' ? next[s.id]?.reason : null } })
      return next
    })

  async function save() {
    // проверка: у отсутствующих должна быть причина
    const noReason = (students || []).filter(
      (s) => marks[s.id]?.status === 'absent' && !marks[s.id]?.reason
    )
    if (noReason.length) {
      setErr(`Укажите причину пропуска: ${noReason.map((s) => s.full_name).join(', ')}`)
      return
    }
    setBusy(true); setErr('')
    try {
      let finalPlanPath = planPath
      if (planFile) {
        if (!teacherId) throw new Error('Не удалось определить преподавателя для загрузки файла')
        finalPlanPath = await uploadPlan(planFile, teacherId)
      }
      await conductLesson(lesson.lesson_id, {
        topic, comment, lessons_count: count,
        has_test: hasTest,
        test_max_score: hasTest ? (Number(maxScore) || null) : null,
        plan_path: finalPlanPath,
        attendance: (students || []).map((s) => ({
          student_id: s.id,
          status: marks[s.id]?.status || 'present',
          absence_reason: marks[s.id]?.reason || null,
          score: marks[s.id]?.score,
        })),
      })
      await onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  async function doCancel() {
    setBusy(true); setErr('')
    try { await cancelLesson(lesson.lesson_id, cancelReason); await onDone() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const counts = ST.map((s) => ({
    ...s, n: Object.values(marks).filter((m) => m.status === s.k).length,
  })).filter((s) => s.n > 0)

  return (
    <div>
      <button onClick={onBack} className="rowflex"
        style={{ gap: 6, marginBottom: 14, background: 'none', border: 'none', color: C.slate, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        <ArrowLeft size={16} /> К списку занятий
      </button>

      {/* Шапка занятия */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 13, padding: 16, marginBottom: 12 }}>
        <div className="rowflex" style={{ gap: 9, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{lesson.group_name}</h1>
          {lesson.time_text && (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandSoft, padding: '2px 10px', borderRadius: 20 }}>
              {lesson.time_text}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: C.slate }}>
          {(lesson.subject_name || '').split(' / ')[0]} · {lesson.office}
          {lesson.assistant_name && ` · ассистент: ${lesson.assistant_name}`}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <Label>Тема урока</Label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Что проходили"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          </div>
          <div>
            <Label>Уроков</Label>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setCount(n)}
                  style={{
                    width: 46, padding: '10px 0', borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: 'pointer',
                    border: count === n ? `1.5px solid ${C.brand}` : `1px solid ${C.line}`,
                    background: count === n ? C.brandSoft : '#fff', color: count === n ? C.brand : C.slate,
                  }}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="rowflex" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={hasTest} onChange={(e) => setHasTest(e.target.checked)} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Было тестирование на уроке</span>
          </label>
          {hasTest && (
            <div style={{ marginTop: 8, maxWidth: 160 }}>
              <Label>Максимум баллов за тест</Label>
              <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="напр. 20"
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13.5, outline: 'none' }} />
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <Label>План урока</Label>
          <div className="rowflex" style={{ gap: 8, flexWrap: 'wrap' }}>
            {planFile ? (
              <span className="rowflex" style={{ gap: 6, fontSize: 13, color: C.ink }}>
                <Paperclip size={14} /> {planFile.name} <span style={{ color: C.faint }}>(будет загружен при сохранении)</span>
              </span>
            ) : planPath ? (
              <>
                <button type="button" onClick={async () => { const url = await planUrl(planPath); if (url) window.open(url, '_blank') }}
                  className="rowflex" style={{ gap: 5, fontSize: 12.5, color: C.ok, background: C.okSoft, border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontWeight: 600 }}>
                  <Paperclip size={13} /> Открыть план
                </button>
                <label className="rowflex" style={{ gap: 5, fontSize: 12.5, color: C.slate, border: `1px dashed ${C.line}`, borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>
                  Заменить
                  <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={(e) => setPlanFile(e.target.files[0] || null)} />
                </label>
                <button type="button" onClick={() => { if (confirm('Убрать прикреплённый план?')) setPlanPath(null) }}
                  style={{ fontSize: 12.5, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px' }}>
                  Удалить
                </button>
              </>
            ) : (
              <label className="rowflex" style={{ gap: 6, padding: '9px 12px', border: `1px dashed ${C.line}`, borderRadius: 10, fontSize: 13, color: C.slate, cursor: 'pointer' }}>
                <Paperclip size={14} /> Прикрепить файл (pdf, docx)
                <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={(e) => setPlanFile(e.target.files[0] || null)} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Сводка статусов */}
      {counts.length > 0 && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
          {counts.map((c) => (
            <span key={c.k} style={{ fontSize: 12, fontWeight: 700, color: c.color, background: c.bg, padding: '5px 11px', borderRadius: 20 }}>
              {c.t}: {c.n}
            </span>
          ))}
        </div>
      )}

      {students?.length > 0 && (
        <div className="rowflex" style={{ gap: 6, marginBottom: 10 }}>
          <button onClick={() => setAllStatus('present')}
            style={{ padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${C.ok}`, background: C.okSoft, color: C.ok }}>
            Все были
          </button>
          <button onClick={() => { if (confirm('Отметить всех как отсутствующих?')) setAllStatus('absent') }}
            style={{ padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid #dc2626', background: '#fee2e2', color: '#dc2626' }}>
            Все отсутствуют
          </button>
        </div>
      )}

      {/* Ученики — ошибку (в т.ч. «нет группы») показываем отдельно от
          настоящей пустой группы (п.18-19 ТЗ), не маскируем одно другим. */}
      {students === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка учеников…</div>
      ) : err ? (
        <div style={{ padding: 30, textAlign: 'center', background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 12, color: '#c2360b', fontSize: 13.5 }}>
          {err}
        </div>
      ) : students.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, color: '#92400e', fontSize: 13.5 }}>
          В этой группе пока нет учеников. Обратитесь к завучу, чтобы их добавили.
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 13, overflow: 'hidden' }}>
          {students.map((s, i) => {
            const m = marks[s.id] || { status: 'present' }
            const cur = ST.find((x) => x.k === m.status) || ST[0]
            return (
              <div key={s.id} style={{ borderTop: i ? `1px solid ${C.line}` : 'none', padding: '10px 13px', background: m.status === 'absent' ? '#fffafa' : '#fff' }}>
                <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 130px', fontSize: 14, fontWeight: 600, minWidth: 0 }}>{s.full_name}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ST.map((x) => {
                      const on = m.status === x.k
                      const Icon = x.icon
                      return (
                        <button key={x.k} onClick={() => setStatus(s.id, x.k)} title={x.t}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 8,
                            fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                            border: on ? `1.5px solid ${x.color}` : `1px solid ${C.line}`,
                            background: on ? x.bg : '#fff', color: on ? x.color : C.faint,
                          }}>
                          <Icon size={12} /> <span className="hide-sm">{x.t}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {m.status === 'absent' && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingLeft: 2 }}>
                    <span style={{ fontSize: 11.5, color: C.slate, alignSelf: 'center', marginRight: 3 }}>Причина:</span>
                    {REASONS.map((r) => {
                      const on = m.reason === r.k
                      return (
                        <button key={r.k} onClick={() => setReason(s.id, on ? null : r.k)}
                          style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                            border: on ? `1.5px solid #dc2626` : `1px solid ${C.line}`,
                            background: on ? '#fee2e2' : '#fff', color: on ? '#b91c1c' : C.slate,
                          }}>{r.t}</button>
                      )
                    })}
                  </div>
                )}

                {hasTest && (
                  <div className="rowflex" style={{ gap: 6, marginTop: 8, paddingLeft: 2 }}>
                    <span style={{ fontSize: 11.5, color: C.slate }}>Балл за тест:</span>
                    <input type="number" value={m.score ?? ''} onChange={(e) => setScore(s.id, e.target.value)}
                      placeholder="—" style={{ width: 68, padding: '4px 8px', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 12.5, outline: 'none' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Label>Комментарий к занятию (необязательно)</Label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 300))} rows={2}
          placeholder="Что-то важное про это занятие"
          style={{ width: '100%', padding: 10, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy || !students?.length}
          style={{
            flex: '1 1 200px', padding: 13, borderRadius: 11, background: C.brand, color: '#fff',
            fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>
          {busy ? 'Сохраняю…' : 'Провести занятие'}
        </button>
        {!cancelMode && lesson.status === 'planned' && (
          <button onClick={() => setCancelMode(true)} className="rowflex"
            style={{ gap: 6, padding: '13px 16px', borderRadius: 11, background: C.grey, color: C.slate, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Ban size={15} /> Отменить занятие
          </button>
        )}
      </div>

      {cancelMode && (
        <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: 14 }}>
          <Label>Причина отмены</Label>
          <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            placeholder="напр. карантин, праздник, болезнь преподавателя"
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={() => setCancelMode(false)}
              style={{ flex: 1, padding: 10, borderRadius: 9, background: '#fff', color: C.slate, fontSize: 13.5, fontWeight: 700, border: `1px solid ${C.line}`, cursor: 'pointer' }}>Назад</button>
            <button onClick={doCancel} disabled={busy}
              style={{ flex: 1, padding: 10, borderRadius: 9, background: '#dc2626', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? '…' : 'Отменить занятие'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn = {
  width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.line}`,
  background: '#fff', color: C.slate, cursor: 'pointer', display: 'grid', placeItems: 'center',
}

function Label({ children }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6 }}>{children}</div>
}
function MiniBadge({ n, label, color, bg, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, fontWeight: 700, color, background: bg, padding: '5px 12px', borderRadius: 20,
      border: active ? `1.5px solid ${color}` : '1.5px solid transparent', cursor: onClick ? 'pointer' : 'default',
    }}>
      {n} {label}
    </button>
  )
}
function AttentionRow({ children, onClick, active }) {
  return (
    <div onClick={onClick} className="rowflex"
      style={{ gap: 6, fontSize: 12.5, color: '#92400e', cursor: 'pointer', padding: '3px 0', fontWeight: active ? 800 : 600, textDecoration: active ? 'underline' : 'none' }}>
      <AlertTriangle size={13} /> {children}
    </div>
  )
}
const filterSel = { padding: '7px 10px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 12.5, outline: 'none', background: '#fff' }
