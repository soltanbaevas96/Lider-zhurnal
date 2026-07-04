import React, { useState } from 'react'
import {
  ArrowLeft, Plus, Pencil, Archive, RotateCcw, X, GraduationCap, UserCheck, Users, Check, KeyRound, ShieldCheck,
} from 'lucide-react'
import { C, initials, nameOf, avColorByIndex } from '../lib/utils'
import { inp, Field } from '../components/ui'
import {
  addTeacher, addAssistant, addGroup, addSubject, updateRow, archiveRow, restoreRow, inviteTeacher,
} from '../lib/api'

export default function Manage({ dict, subjects, onBack, onChanged }) {
  const [tab, setTab] = useState('teachers')
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal] = useState(null) // { kind, row? }
  const [invite, setInvite] = useState(null) // строка преподавателя для выдачи доступа
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tabs = [
    { k: 'teachers', t: 'Преподаватели', icon: GraduationCap },
    { k: 'assistants', t: 'Ассистенты', icon: UserCheck },
    { k: 'groups', t: 'Группы', icon: Users },
  ]

  const rows = (dict[tab] || []).filter((r) => showArchived ? true : !r.archived)

  async function handleSave(form) {
    setBusy(true); setErr('')
    try {
      if (modal.row) {
        const patch = tab === 'groups'
          ? { name: form.name }
          : tab === 'teachers'
            ? { full_name: form.full_name, subject_id: form.subject_id || null, phone: form.phone }
            : { full_name: form.full_name, phone: form.phone }
        await updateRow(tab, modal.row.id, patch)
      } else {
        if (tab === 'teachers') await addTeacher({ full_name: form.full_name, subject_id: form.subject_id || null, phone: form.phone })
        else if (tab === 'assistants') await addAssistant({ full_name: form.full_name, phone: form.phone })
        else await addGroup({ name: form.name })
      }
      setModal(null)
      await onChanged()
    } catch (e) {
      setErr(e.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  async function toggleArchive(row) {
    setBusy(true); setErr('')
    try {
      if (row.archived) await restoreRow(tab, row.id)
      else await archiveRow(tab, row.id)
      await onChanged()
    } catch (e) {
      setErr(e.message || 'Не удалось изменить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, marginBottom: 16, border: 'none', background: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} /> К сводке
      </button>

      <div className="rowflex" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Управление</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Преподаватели, ассистенты и группы центра</p>
        </div>
        <button onClick={() => setModal({ kind: 'new' })} className="rowflex"
          style={{ marginLeft: 'auto', gap: 7, padding: '10px 17px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={17} /> Добавить
        </button>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 11, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div className="rowflex" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3 }}>
          {tabs.map((o) => {
            const a = tab === o.k
            const Icon = o.icon
            return <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
              style={{ gap: 6, padding: '8px 15px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: a ? C.card : 'transparent', color: a ? C.brand : C.slate, boxShadow: a ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>
              <Icon size={15} /> {o.t}</button>
          })}
        </div>
        <label className="rowflex" style={{ marginLeft: 'auto', gap: 7, fontSize: 13, color: C.slate, cursor: 'pointer' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показывать архивные
        </label>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: C.slate, fontSize: 14 }}>Пусто. Нажмите «Добавить».</div>
        )}
        {rows.map((r, i) => (
          <div key={r.id} className="rowflex" style={{ gap: 14, padding: '13px 16px', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: r.archived ? 0.5 : 1 }}>
            {tab === 'groups' ? (
              <div style={{ width: 40, height: 40, borderRadius: 11, background: C.brandSoft, color: C.brand, display: 'grid', placeItems: 'center' }}><Users size={19} /></div>
            ) : tab === 'assistants' ? (
              <div style={{ width: 40, height: 40, borderRadius: 11, background: C.tealSoft, color: C.teal, display: 'grid', placeItems: 'center' }}><UserCheck size={19} /></div>
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 11, background: avColorByIndex(i), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{initials(r.full_name)}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rowflex" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{r.full_name || r.name}</span>
                {tab === 'teachers' && !r.archived && (
                  r.profile_id
                    ? <span className="rowflex" style={{ gap: 3, fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft, padding: '2px 8px', borderRadius: 20 }}><ShieldCheck size={11} /> есть доступ</span>
                    : <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, background: C.grey, padding: '2px 8px', borderRadius: 20 }}>нет доступа</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: C.slate }}>
                {tab === 'teachers' && (r.subject_id ? nameOf(subjects, r.subject_id) : 'предмет не указан')}
                {tab === 'teachers' && r.phone ? ` · ${r.phone}` : ''}
                {tab === 'assistants' && (r.phone || 'ассистент')}
                {tab === 'groups' && (r.archived ? 'в архиве' : 'активна')}
              </div>
            </div>
            {r.archived
              ? <button onClick={() => toggleArchive(r)} disabled={busy} className="rowflex" title="Восстановить"
                  style={{ gap: 5, padding: '7px 11px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: C.ok, background: C.okSoft, border: 'none', cursor: 'pointer' }}>
                  <RotateCcw size={14} /> <span className="hide-sm">Вернуть</span></button>
              : <>
                  {tab === 'teachers' && !r.profile_id && (
                    <button onClick={() => setInvite(r)} disabled={busy} className="rowflex" title="Выдать доступ в систему"
                      style={{ gap: 5, padding: '7px 11px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: C.brand, background: C.brandSoft, border: 'none', cursor: 'pointer' }}>
                      <KeyRound size={14} /> <span className="hide-sm">Выдать доступ</span></button>
                  )}
                  <button onClick={() => setModal({ kind: 'edit', row: r })} disabled={busy} title="Редактировать"
                    style={{ padding: 8, borderRadius: 9, color: C.slate, background: C.grey, border: 'none', cursor: 'pointer' }}><Pencil size={15} /></button>
                  <button onClick={() => toggleArchive(r)} disabled={busy} title="В архив"
                    style={{ padding: 8, borderRadius: 9, color: C.warn, background: C.warnSoft, border: 'none', cursor: 'pointer' }}><Archive size={15} /></button>
                </>}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
        Архивирование не удаляет записи и не влияет на прошлые уроки — архивные просто
        не показываются при создании новых уроков. Это безопасно для истории и отчётов.
      </p>

      {modal && (
        <EditModal
          tab={tab}
          subjects={subjects}
          row={modal.kind === 'edit' ? modal.row : null}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {invite && (
        <InviteModal
          teacher={invite}
          onClose={() => setInvite(null)}
          onDone={async () => { setInvite(null); await onChanged() }}
        />
      )}
    </>
  )
}

function InviteModal({ teacher, onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = email.trim() && password.length >= 6

  function genPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let p = ''
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)]
    setPassword(p)
  }

  async function submit() {
    setBusy(true); setErr('')
    try {
      await inviteTeacher({
        email: email.trim(),
        password,
        teacher_id: teacher.id,
        full_name: teacher.full_name,
        role: 'teacher',
      })
      await onDone()
    } catch (e) {
      setErr(e.message || 'Не удалось выдать доступ')
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 430, padding: 24 }}>
        <div className="rowflex" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Выдать доступ</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>
        <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 18px' }}>
          Создаём аккаунт входа для <b style={{ color: C.ink }}>{teacher.full_name}</b>. После этого преподаватель сможет входить в систему и вести свой журнал.
        </p>

        <Field label="Email для входа">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@lider.kz" style={inp} autoFocus />
        </Field>
        <Field label="Пароль (минимум 6 символов)">
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Придумайте или сгенерируйте" style={{ ...inp, flex: 1 }} />
            <button onClick={genPassword} type="button" title="Сгенерировать"
              style={{ padding: '0 14px', borderRadius: 11, background: C.grey, color: C.brand, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Сгенерировать
            </button>
          </div>
        </Field>

        {password && (
          <div style={{ background: C.brandSoft, borderRadius: 11, padding: 12, fontSize: 13, color: C.ink, marginBottom: 4 }}>
            Передайте преподавателю: <b>{email || 'email'}</b> / <b>{password}</b>
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>Запишите пароль — после закрытия он не сохранится в открытом виде.</div>
          </div>
        )}

        {err && <div style={{ color: '#c2360b', fontSize: 13, margin: '10px 0' }}>{err}</div>}

        <button disabled={!valid || busy} onClick={submit} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12, padding: 12, gap: 7, background: valid && !busy ? C.brand : C.line, color: valid && !busy ? '#fff' : C.slate, borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: valid && !busy ? 'pointer' : 'default' }}>
          <KeyRound size={16} /> {busy ? 'Создание…' : 'Создать доступ'}
        </button>
      </div>
    </div>
  )
}

function EditModal({ tab, subjects, row, busy, onClose, onSave }) {
  const isGroup = tab === 'groups'
  const isTeacher = tab === 'teachers'
  const [form, setForm] = useState({
    full_name: row?.full_name || '',
    name: row?.name || '',
    subject_id: row?.subject_id || '',
    phone: row?.phone || '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const valid = isGroup ? form.name.trim() : form.full_name.trim()

  const title = row ? 'Редактировать' : 'Добавить'
  const label = isGroup ? 'группу' : tab === 'assistants' ? 'ассистента' : 'преподавателя'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 420, padding: 24 }}>
        <div className="rowflex" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title} {label}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        {isGroup ? (
          <Field label="Название группы"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Напр. ЕНТ-11Б" style={inp} autoFocus /></Field>
        ) : (
          <>
            <Field label="ФИО"><input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Фамилия Имя" style={inp} autoFocus /></Field>
            {isTeacher && (
              <Field label="Предмет">
                <select value={form.subject_id} onChange={(e) => set('subject_id', e.target.value)} style={inp}>
                  <option value="">— не указан —</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Телефон (необязательно)"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+7 ___ ___ __ __" style={inp} /></Field>
          </>
        )}

        <button disabled={!valid || busy} onClick={() => onSave(form)} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 6, padding: 12, gap: 7, background: valid && !busy ? C.brand : C.line, color: valid && !busy ? '#fff' : C.slate, borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: valid && !busy ? 'pointer' : 'default' }}>
          <Check size={17} /> {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
