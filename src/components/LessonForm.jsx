import React, { useState } from 'react'
import { X, Paperclip, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { C, todayStr } from '../lib/utils'
import { inp, Field } from './ui'
import { createOrGetLesson, updateLesson, deleteLesson, uploadPlan, saveAttendance } from '../lib/api'
import AttendancePicker from './AttendancePicker'
import GroupSearchSelect from './GroupSearchSelect'

// Режимы: без lesson — создание; с lesson — редактирование.
// teacherId нужен для создания (чей урок).
export default function LessonForm({ teacherId, lesson, dict, onClose, onSaved, onDeleted }) {
  // activeLesson — то, что РЕАЛЬНО сейчас редактируется в форме. Обычно
  // совпадает с пропом lesson, но если при СОЗДАНИИ нового урока
  // обнаружился уже существующий (см. conflict ниже) и пользователь
  // нажал «Открыть занятие» — форма переключается на него сама, без
  // участия родителя (ему не нужно ничего знать про этот сценарий).
  const [activeLesson, setActiveLesson] = useState(lesson)
  const editing = !!activeLesson
  const today = todayStr()
  // При РЕДАКТИРОВАНИИ существующего урока группа НЕ подставляется
  // автоматически, даже если lesson.group_id почему-то пуст — иначе
  // список учеников молча показывал бы состав случайной первой группы
  // вместо ошибки (см. миграция 68, п.19 ТЗ). Автоподстановка первой
  // группы остаётся только при СОЗДАНИИ нового урока — там это просто
  // удобное значение по умолчанию, а не подмена реальных данных.
  const [f, setF] = useState({
    group_id: editing ? (activeLesson?.group_id || '') : (dict.groups[0]?.id || ''),
    assistant_id: activeLesson?.assistant_id || '',
    assistant2_id: activeLesson?.assistant2_id || '',
    lesson_date: activeLesson?.lesson_date || today,
    lessons_count: activeLesson?.lessons_count || 1,
    topic: activeLesson?.topic || '',
    students: activeLesson?.students ?? 8,
    status: activeLesson?.status || 'проведён',
    has_test: activeLesson?.has_test || false,
    test_max_score: activeLesson?.test_max_score || '',
  })
  const [showSecondAssistant, setShowSecondAssistant] = useState(!!activeLesson?.assistant2_id)
  const [file, setFile] = useState(null)
  const [attendance, setAttendance] = useState([]) // [{ student_id, present }]
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState('')
  // Урок, уже существующий в базе для той же группы+даты, найденный
  // create_or_get_lesson при попытке создать новый (п.15-16 ТЗ) —
  // отдельно от err, потому что это не ошибка, а нормальный сценарий
  // со своим действием («Открыть занятие»), а не просто текстом.
  const [conflict, setConflict] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.topic.trim() && f.group_id

  // Пользователь согласился открыть уже существующий урок вместо
  // создания нового — переключаем саму форму в режим редактирования
  // найденного, без обращения к родительскому компоненту.
  function openConflict() {
    const l = conflict
    setConflict(null)
    setActiveLesson(l)
    setF({
      group_id: l.group_id || '',
      assistant_id: l.assistant_id || '',
      assistant2_id: l.assistant2_id || '',
      lesson_date: l.lesson_date || today,
      lessons_count: l.lessons_count || 1,
      topic: l.topic || '',
      students: l.students ?? 8,
      status: l.status || 'проведён',
      has_test: l.has_test || false,
      test_max_score: l.test_max_score || '',
    })
    setShowSecondAssistant(!!l.assistant2_id)
  }

  async function save() {
    setSaving(true); setErr('')
    try {
      let plan_path = activeLesson?.plan_path ?? null
      if (file) plan_path = await uploadPlan(file, teacherId)
      const payload = {
        group_id: f.group_id,
        assistant_id: f.assistant_id || null,
        assistant2_id: f.assistant2_id || null,
        lesson_date: f.lesson_date,
        lessons_count: Number(f.lessons_count),
        topic: f.topic.trim(),
        students: Number(f.students),
        status: f.status,
        plan_path,
        has_test: f.has_test,
        test_max_score: f.has_test ? (Number(f.test_max_score) || null) : null,
      }
      let saved
      if (editing) {
        saved = await updateLesson(activeLesson.id, payload)
      } else {
        const result = await createOrGetLesson({ ...payload, teacher_id: teacherId })
        if (!result.is_new) {
          // Занятие для этой группы+даты уже есть — не создаём дубль,
          // показываем найденное и предлагаем открыть его вместо ошибки.
          setConflict(result)
          setSaving(false)
          return
        }
        saved = { id: result.id, ...payload, teacher_id: teacherId }
      }
      // Сохраняем посещаемость (для проведённого урока)
      if (f.status === 'проведён' && attendance.length) {
        try { await saveAttendance(saved.id, attendance) } catch (e) { /* не блокируем урок */ }
      }
      onSaved(saved)
    } catch (e) {
      setErr(e.message || 'Не удалось сохранить урок')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true); setErr('')
    try {
      await deleteLesson(activeLesson.id)
      onDeleted(activeLesson.id)
    } catch (e) {
      setErr(e.message || 'Не удалось удалить урок')
      setSaving(false)
    }
  }

  // Найден уже существующий урок для этой группы+даты (п.15-16 ТЗ) —
  // показываем это отдельным экраном вместо формы создания, вместо
  // молчаливого создания дубля или голой текстовой ошибки.
  if (conflict) {
    const already = conflict.status === 'проведён'
    // Найденный урок со статусом 'planned' пришёл из расписания и ещё
    // не проведён — эта форма (Журнал) в принципе не умеет с ним
    // работать, её выбор статуса — только «Проведён»/«Отменён»
    // (это и была причина исходного бага «нет списка учеников», см.
    // TeacherCabinet.jsx). Такой урок открывают и проводят ТОЛЬКО через
    // «Мои занятия» — поэтому здесь не предлагаем «редактировать на
    // месте», а прямо направляем в нужное место.
    const isPlanned = conflict.status === 'planned'
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 420, padding: 24 }}>
          <div className="rowflex" style={{ gap: 8, marginBottom: 12, color: '#9C6500' }}>
            <AlertTriangle size={19} />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Занятие уже существует</h3>
          </div>
          <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 4px' }}>
            {already
              ? 'Занятие за эту дату для этой группы уже проведено.'
              : isPlanned
                ? 'Это занятие уже есть в расписании и ещё не проведено. Проведите его во вкладке «Мои занятия» — там же можно отметить посещаемость.'
                : 'Это занятие уже создано, но ещё не проведено.'}
          </p>
          <div style={{ marginTop: 12, padding: 12, background: C.grey, borderRadius: 11, fontSize: 13.5 }}>
            <div><b>{f.lesson_date}</b></div>
            <div>{dict.groups.find((g) => g.id === conflict.group_id)?.name || conflict.group_id}</div>
            <div style={{ color: C.slate, marginTop: 2 }}>Статус: {conflict.status}</div>
          </div>
          <div className="rowflex" style={{ gap: 10, marginTop: 16 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 11, background: '#fff', color: C.slate, borderRadius: 10, fontSize: 13.5, fontWeight: 700, border: `1px solid ${C.line}`, cursor: 'pointer' }}>
              Закрыть
            </button>
            {!isPlanned && (
              <button onClick={openConflict} style={{ flex: 1, padding: 11, background: C.brand, color: '#fff', borderRadius: 10, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                Открыть занятие
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 450, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{editing ? 'Редактировать урок' : 'Новый урок'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        <Field label="Группа">
          <GroupSearchSelect groups={dict.groups} value={f.group_id} onChange={(id) => set('group_id', id)} />
        </Field>
        <Field label="Ассистент на уроке">
          <select value={f.assistant_id} onChange={(e) => set('assistant_id', e.target.value)} style={inp}>
            <option value="">Без ассистента</option>
            {dict.assistants.filter((a) => a.id !== f.assistant2_id).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </Field>

        {showSecondAssistant ? (
          <Field label="Второй ассистент">
            <div className="rowflex" style={{ gap: 8 }}>
              <select value={f.assistant2_id} onChange={(e) => set('assistant2_id', e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="">Без второго ассистента</option>
                {dict.assistants.filter((a) => a.id !== f.assistant_id).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <button type="button" onClick={() => { set('assistant2_id', ''); setShowSecondAssistant(false) }}
                title="Убрать второго ассистента"
                style={{ border: 'none', background: C.grey, color: C.slate, borderRadius: 9, padding: '0 12px', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
          </Field>
        ) : (
          <button type="button" onClick={() => setShowSecondAssistant(true)} className="rowflex"
            style={{ gap: 6, background: 'none', border: 'none', color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 13 }}>
            <Plus size={14} /> Добавить второго ассистента
          </button>
        )}
        <Field label="Дата"><input type="date" value={f.lesson_date} onChange={(e) => set('lesson_date', e.target.value)} style={inp} /></Field>
        <Field label="Сколько уроков проведено">
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map((n) => {
              const a = Number(f.lessons_count) === n
              return (
                <button key={n} type="button" onClick={() => set('lessons_count', n)}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 11, fontSize: 15, fontWeight: 800, cursor: 'pointer',
                    border: a ? `2px solid ${C.brand}` : `1.5px solid ${C.line}`,
                    background: a ? C.brandSoft : '#fff', color: a ? C.brand : C.slate }}>
                  {n} {n === 1 ? 'урок' : 'урока'}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Тема урока"><input value={f.topic} onChange={(e) => set('topic', e.target.value)} placeholder="Напр. Квадратные уравнения" style={inp} /></Field>
        <Field label="Статус">
          <select value={f.status} onChange={(e) => set('status', e.target.value)} style={inp}>
            <option value="проведён">Проведён</option>
            <option value="отменён">Отменён</option>
          </select>
        </Field>

        {f.status === 'проведён' && (
          <>
            <label className="rowflex" style={{ gap: 8, cursor: 'pointer', marginBottom: 13 }}>
              <input type="checkbox" checked={f.has_test} onChange={(e) => set('has_test', e.target.checked)} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Было тестирование на уроке</span>
            </label>
            {f.has_test && (
              <Field label="Максимум баллов за тест">
                <input type="number" value={f.test_max_score} onChange={(e) => set('test_max_score', e.target.value)}
                  placeholder="напр. 20" style={{ ...inp, maxWidth: 140 }} />
              </Field>
            )}
            <Field label="Посещаемость">
              <AttendancePicker
                groupId={f.group_id}
                lessonId={editing ? activeLesson.id : null}
                hasTest={f.has_test}
                onChange={(recs) => { setAttendance(recs); set('students', recs.filter((r) => r.present).length) }}
              />
            </Field>
          </>
        )}
        <Field label="План урока">
          <label className="rowflex" style={{ gap: 8, padding: '10px 12px', border: `1px dashed ${C.line}`, borderRadius: 11, fontSize: 13, color: C.slate, cursor: 'pointer' }}>
            <Paperclip size={15} /> {file?.name || (activeLesson?.plan_path ? 'Заменить файл плана' : 'Прикрепить файл (pdf, docx)')}
            <input type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          {activeLesson?.plan_path && !file && <div style={{ fontSize: 12, color: C.ok, marginTop: 6 }}>Файл плана уже прикреплён</div>}
        </Field>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 10 }}>{err}</div>}

        <button disabled={!valid || saving} onClick={save}
          style={{ width: '100%', marginTop: 4, padding: 12, background: valid && !saving ? C.brand : C.line, color: valid && !saving ? '#fff' : C.slate, borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: valid && !saving ? 'pointer' : 'default' }}>
          {saving ? 'Сохранение…' : editing ? 'Сохранить изменения' : 'Сохранить урок'}
        </button>

        {editing && (
          confirmDel ? (
            <div style={{ marginTop: 12, padding: 12, background: '#fdecec', borderRadius: 11 }}>
              <div style={{ fontSize: 13, color: '#c2360b', marginBottom: 10 }}>Удалить урок безвозвратно?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={remove} disabled={saving} style={{ flex: 1, padding: 10, background: '#dc2626', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Да, удалить</button>
                <button onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: 10, background: C.grey, color: C.slate, borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: 11, gap: 7, background: 'none', color: '#dc2626', borderRadius: 11, fontSize: 13.5, fontWeight: 600, border: `1px solid #f3c9c9`, cursor: 'pointer' }}>
              <Trash2 size={15} /> Удалить урок
            </button>
          )
        )}
      </div>
    </div>
  )
}
