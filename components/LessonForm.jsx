import React, { useState } from 'react'
import { X, Paperclip, Trash2 } from 'lucide-react'
import { C } from '../lib/utils'
import { inp, Field } from './ui'
import { createLesson, updateLesson, deleteLesson, uploadPlan, saveAttendance } from '../lib/api'
import AttendancePicker from './AttendancePicker'
import GroupSearchSelect from './GroupSearchSelect'

// Режимы: без lesson — создание; с lesson — редактирование.
// teacherId нужен для создания (чей урок).
export default function LessonForm({ teacherId, lesson, dict, onClose, onSaved, onDeleted }) {
  const editing = !!lesson
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    group_id: lesson?.group_id || dict.groups[0]?.id || '',
    assistant_id: lesson?.assistant_id || '',
    lesson_date: lesson?.lesson_date || today,
    lessons_count: lesson?.lessons_count || 1,
    topic: lesson?.topic || '',
    students: lesson?.students ?? 8,
    status: lesson?.status || 'проведён',
  })
  const [file, setFile] = useState(null)
  const [attendance, setAttendance] = useState([]) // [{ student_id, present }]
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.topic.trim() && f.group_id

  async function save() {
    setSaving(true); setErr('')
    try {
      let plan_path = lesson?.plan_path ?? null
      if (file) plan_path = await uploadPlan(file)
      const payload = {
        group_id: f.group_id,
        assistant_id: f.assistant_id || null,
        lesson_date: f.lesson_date,
        lessons_count: Number(f.lessons_count),
        topic: f.topic.trim(),
        students: Number(f.students),
        status: f.status,
        plan_path,
      }
      let saved
      if (editing) {
        saved = await updateLesson(lesson.id, payload)
      } else {
        saved = await createLesson({ ...payload, teacher_id: teacherId })
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
      await deleteLesson(lesson.id)
      onDeleted(lesson.id)
    } catch (e) {
      setErr(e.message || 'Не удалось удалить урок')
      setSaving(false)
    }
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
            {dict.assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </Field>
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
          <Field label="Посещаемость">
            <AttendancePicker
              groupId={f.group_id}
              lessonId={editing ? lesson.id : null}
              onChange={(recs) => { setAttendance(recs); set('students', recs.filter((r) => r.present).length) }}
            />
          </Field>
        )}
        <Field label="План урока">
          <label className="rowflex" style={{ gap: 8, padding: '10px 12px', border: `1px dashed ${C.line}`, borderRadius: 11, fontSize: 13, color: C.slate, cursor: 'pointer' }}>
            <Paperclip size={15} /> {file?.name || (lesson?.plan_path ? 'Заменить файл плана' : 'Прикрепить файл (pdf, docx)')}
            <input type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          {lesson?.plan_path && !file && <div style={{ fontSize: 12, color: C.ok, marginTop: 6 }}>Файл плана уже прикреплён</div>}
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
