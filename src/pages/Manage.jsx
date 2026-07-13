import React, { useState, useEffect } from 'react'
import {
  ArrowLeft, Plus, Pencil, Archive, RotateCcw, X, GraduationCap, UserCheck, Users, Check, KeyRound, ShieldCheck, BookOpen, Link2, UsersRound, Search,
} from 'lucide-react'
import DataTable from '../components/DataTable'
import { C, initials, nameOf, avColorByIndex, loginFromName, genPassword, officeOf, langOf, OFFICES } from '../lib/utils'
import { inp, Field } from '../components/ui'
import { GroupMultiSelect } from '../components/GroupSearchSelect'
import {
  addTeacher, addAssistant, addGroup, addSubject, updateRow, archiveRow, restoreRow, inviteTeacher,
  fetchTeacherLinks, saveTeacherLinks, fetchStudentsWithGroups, addStudent, updateStudent, fetchStudentsOfGroup,
  addStudentToGroup, removeStudentFromGroup, fetchAllStudents,
} from '../lib/api'

export default function Manage({ dict, subjects, onBack, onChanged, onOpenStudent }) {
  const [tab, setTab] = useState('teachers')
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal] = useState(null) // { kind, row? }
  const [invite, setInvite] = useState(null) // строка преподавателя для выдачи доступа
  const [linkTeacher, setLinkTeacher] = useState(null) // преподаватель для привязки групп/предметов
  const [confirmArch, setConfirmArch] = useState(null) // строка для подтверждения архива/восстановления
  const [confirmEdit, setConfirmEdit] = useState(null) // строка для подтверждения редактирования
  const [viewGroup, setViewGroup] = useState(null) // группа для просмотра учеников
  const [gOffice, setGOffice] = useState('Маргулана') // фильтр групп: офис
  const [gLang, setGLang] = useState('каз') // фильтр групп: язык
  const [gQuery, setGQuery] = useState('') // поиск по группам
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tabs = [
    { k: 'teachers', t: 'Преподаватели', icon: GraduationCap },
    { k: 'assistants', t: 'Ассистенты', icon: UserCheck },
    { k: 'students', t: 'Ученики', icon: UsersRound },
    { k: 'groups', t: 'Группы', icon: Users },
    { k: 'subjects', t: 'Предметы', icon: BookOpen },
  ]

  let rows = (dict[tab] || []).filter((r) => showArchived ? true : !r.archived)
  // Группы дополнительно фильтруем по офису и языку (из note) + поиск
  if (tab === 'groups') {
    rows = rows.filter((r) => officeOf(r.note) === gOffice && langOf(r.note) === gLang)
    const gq = (gQuery || '').toLowerCase().trim()
    if (gq) rows = rows.filter((r) => (r.name || '').toLowerCase().includes(gq) || (r.note || '').toLowerCase().includes(gq))
  }

  async function handleSave(form) {
    setBusy(true); setErr('')
    try {
      if (modal.row) {
        const patch = tab === 'groups'
          ? { name: form.name }
          : tab === 'subjects'
            ? { name: form.name }
            : tab === 'teachers'
              ? { full_name: form.full_name, subject_id: form.subject_id || null, phone: form.phone }
              : { full_name: form.full_name, phone: form.phone }
        await updateRow(tab, modal.row.id, patch)
      } else {
        if (tab === 'teachers') await addTeacher({ full_name: form.full_name, subject_id: form.subject_id || null, phone: form.phone })
        else if (tab === 'assistants') await addAssistant({ full_name: form.full_name, phone: form.phone })
        else if (tab === 'subjects') await addSubject(form.name)
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
        {tab !== 'students' && (
          <button onClick={() => setModal({ kind: 'new' })} className="rowflex"
            style={{ marginLeft: 'auto', gap: 7, padding: '10px 17px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Plus size={17} /> Добавить
          </button>
        )}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 11, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div className="rowflex" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3, flexWrap: 'wrap' }}>
          {tabs.map((o) => {
            const a = tab === o.k
            const Icon = o.icon
            return <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
              style={{ gap: 6, padding: '8px 15px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: a ? C.card : 'transparent', color: a ? C.brand : C.slate, boxShadow: a ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>
              <Icon size={15} /> {o.t}</button>
          })}
        </div>
        {tab !== 'students' && (
          <label className="rowflex" style={{ marginLeft: 'auto', gap: 7, fontSize: 13, color: C.slate, cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Показывать архивные
          </label>
        )}
      </div>

      {tab === 'students' ? (
        <StudentsManage groups={(dict.groups || []).filter((g) => !g.archived)} onOpenStudent={onOpenStudent} />
      ) : (
      <>
      {tab === 'groups' && (
        <>
          <OfficeLangTabs office={gOffice} lang={gLang} setOffice={setGOffice} setLang={setGLang} count={rows.length} />
          <div className="search-box" style={{ marginBottom: 12, maxWidth: 360 }}>
            <Search size={15} color={C.slate} style={{ position: 'absolute', left: 11, top: 9 }} />
            <input value={gQuery} onChange={(e) => setGQuery(e.target.value)} placeholder="Поиск группы по коду…" />
          </div>
        </>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: C.slate, fontSize: 14 }}>{tab === 'groups' ? 'В этом офисе/языке групп нет.' : 'Пусто. Нажмите «Добавить».'}</div>
        )}
        {rows.map((r, i) => (
          <div key={r.id} className="rowflex lrow" style={{ gap: 11, padding: '8px 14px', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: r.archived ? 0.5 : 1 }}>
            {tab === 'groups' ? (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: C.brandSoft, color: C.brand, display: 'grid', placeItems: 'center' }}><Users size={16} /></div>
            ) : tab === 'subjects' ? (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#f3e8ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}><BookOpen size={16} /></div>
            ) : tab === 'assistants' ? (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: C.tealSoft, color: C.teal, display: 'grid', placeItems: 'center' }}><UserCheck size={16} /></div>
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: avColorByIndex(i), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{initials(r.full_name)}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rowflex" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.full_name || r.name}</span>
                {tab === 'teachers' && !r.archived && (
                  r.profile_id
                    ? <span className="rowflex" style={{ gap: 3, fontSize: 10.5, fontWeight: 600, color: C.ok, background: C.okSoft, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}><ShieldCheck size={10} /> доступ</span>
                    : <span style={{ fontSize: 10.5, fontWeight: 600, color: C.slate, background: C.grey, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>нет доступа</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: C.slate, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tab === 'teachers' && (r.phone || 'преподаватель')}
                {tab === 'assistants' && (r.phone || 'ассистент')}
                {tab === 'groups' && (r.note || (r.archived ? 'в архиве' : 'активна'))}
                {tab === 'subjects' && 'предмет'}
              </div>
            </div>
            {tab === 'subjects' ? (
              <button onClick={() => setConfirmEdit(r)} disabled={busy} title="Переименовать"
                style={{ padding: 7, borderRadius: 8, color: C.slate, background: C.grey, border: 'none', cursor: 'pointer' }}><Pencil size={14} /></button>
            ) : r.archived ? (
              <button onClick={() => setConfirmArch(r)} disabled={busy} className="rowflex" title="Восстановить"
                style={{ gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.ok, background: C.okSoft, border: 'none', cursor: 'pointer' }}>
                <RotateCcw size={13} /> <span className="hide-sm">Вернуть</span></button>
            ) : (
              <>
                {tab === 'groups' && (
                  <button onClick={() => setViewGroup(r)} disabled={busy} className="rowflex" title="Ученики группы"
                    style={{ gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.teal, background: C.tealSoft, border: 'none', cursor: 'pointer' }}>
                    <Users size={13} /> <span className="hide-sm">Ученики</span></button>
                )}
                {tab === 'teachers' && (
                  <button onClick={() => setLinkTeacher(r)} disabled={busy} className="rowflex" title="Группы и предметы"
                    style={{ gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#f3e8ff', border: 'none', cursor: 'pointer' }}>
                    <Link2 size={13} /> <span className="hide-sm">Группы/предметы</span></button>
                )}
                {tab === 'teachers' && !r.profile_id && (
                  <button onClick={() => setInvite(r)} disabled={busy} className="rowflex" title="Выдать доступ в систему"
                    style={{ gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.brand, background: C.brandSoft, border: 'none', cursor: 'pointer' }}>
                    <KeyRound size={13} /> <span className="hide-sm">Доступ</span></button>
                )}
                <button onClick={() => setConfirmEdit(r)} disabled={busy} title="Редактировать"
                  style={{ padding: 7, borderRadius: 8, color: C.slate, background: C.grey, border: 'none', cursor: 'pointer' }}><Pencil size={14} /></button>
                <button onClick={() => setConfirmArch(r)} disabled={busy} title="В архив"
                  style={{ padding: 7, borderRadius: 8, color: C.warn, background: C.warnSoft, border: 'none', cursor: 'pointer' }}><Archive size={14} /></button>
              </>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
        Архивирование не удаляет записи и не влияет на прошлые уроки — архивные просто
        не показываются при создании новых уроков. Это безопасно для истории и отчётов.
      </p>
      </>
      )}

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

      {linkTeacher && (
        <LinkModal
          teacher={linkTeacher}
          groups={(dict.groups || []).filter((g) => !g.archived)}
          subjects={dict.subjects || []}
          onClose={() => setLinkTeacher(null)}
          onDone={() => setLinkTeacher(null)}
        />
      )}

      {confirmArch && (
        <ConfirmModal
          title={confirmArch.archived ? 'Восстановить из архива?' : 'Отправить в архив?'}
          message={confirmArch.archived
            ? `«${confirmArch.full_name || confirmArch.name}» снова станет активным и будет доступен при создании уроков.`
            : `«${confirmArch.full_name || confirmArch.name}» скроется из списков при создании уроков. История и прошлые уроки сохранятся. Можно вернуть в любой момент.`}
          confirmText={confirmArch.archived ? 'Восстановить' : 'В архив'}
          danger={!confirmArch.archived}
          onCancel={() => setConfirmArch(null)}
          onConfirm={async () => { const r = confirmArch; setConfirmArch(null); await toggleArchive(r) }}
        />
      )}

      {confirmEdit && (
        <ConfirmModal
          title="Редактировать запись?"
          message={`Открыть «${confirmEdit.full_name || confirmEdit.name}» для изменения?`}
          confirmText="Редактировать"
          onCancel={() => setConfirmEdit(null)}
          onConfirm={() => { const r = confirmEdit; setConfirmEdit(null); setModal({ kind: 'edit', row: r }) }}
        />
      )}

      {viewGroup && (
        <GroupStudentsModal group={viewGroup} onClose={() => setViewGroup(null)} />
      )}
    </>
  )
}

function InviteModal({ teacher, onClose, onDone }) {
  const [login, setLogin] = useState(loginFromName(teacher.full_name))
  const [password, setPassword] = useState(genPassword())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = login.trim() && password.length >= 6

  async function submit() {
    setBusy(true); setErr('')
    try {
      await inviteTeacher({
        login: login.trim().toLowerCase(),
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
          Создаём вход для <b style={{ color: C.ink }}>{teacher.full_name}</b>. Логин предложен автоматически из ФИО — можно поменять.
        </p>

        <Field label="Логин для входа">
          <input value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())} placeholder="asaparova" style={inp} autoFocus />
        </Field>
        <Field label="Пароль">
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" style={{ ...inp, flex: 1 }} />
            <button onClick={() => setPassword(genPassword())} type="button" title="Сгенерировать"
              style={{ padding: '0 14px', borderRadius: 11, background: C.grey, color: C.brand, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Новый
            </button>
          </div>
        </Field>

        {login && password && (
          <div style={{ background: C.brandSoft, borderRadius: 11, padding: 12, fontSize: 13, color: C.ink, marginBottom: 4 }}>
            Передайте преподавателю — логин: <b>{login}</b> · пароль: <b>{password}</b>
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>Запишите эти данные — после закрытия пароль не восстановить.</div>
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
  const isSubject = tab === 'subjects'
  const isTeacher = tab === 'teachers'
  const nameField = isGroup || isSubject
  const [form, setForm] = useState({
    full_name: row?.full_name || '',
    name: row?.name || '',
    phone: row?.phone || '',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const valid = nameField ? form.name.trim() : form.full_name.trim()

  const title = row ? 'Редактировать' : 'Добавить'
  const label = isGroup ? 'группу' : isSubject ? 'предмет' : tab === 'assistants' ? 'ассистента' : 'преподавателя'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 420, padding: 24 }}>
        <div className="rowflex" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title} {label}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        {isGroup ? (
          <Field label="Название группы"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Напр. ЕНТ-11Б" style={inp} autoFocus /></Field>
        ) : isSubject ? (
          <Field label="Название предмета"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Напр. Математика" style={inp} autoFocus /></Field>
        ) : (
          <>
            <Field label="ФИО"><input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Фамилия Имя" style={inp} autoFocus /></Field>
            <Field label="Телефон (необязательно)"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+7 ___ ___ __ __" style={inp} /></Field>
            {isTeacher && !row && (
              <p style={{ fontSize: 12, color: C.faint, marginTop: -4, marginBottom: 8 }}>Группы и предметы назначите после создания — кнопкой «Группы/предметы».</p>
            )}
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

// Модалка привязки групп и предметов к преподавателю (множественный выбор)
function LinkModal({ teacher, groups, subjects, onClose, onDone }) {
  const [groupIds, setGroupIds] = useState([])
  const [subjectIds, setSubjectIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchTeacherLinks(teacher.id)
      .then(({ groupIds, subjectIds }) => { setGroupIds(groupIds); setSubjectIds(subjectIds) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [teacher.id])

  const toggle = (arr, setArr, id) =>
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])

  async function save() {
    setBusy(true); setErr('')
    try {
      await saveTeacherLinks(teacher.id, groupIds, subjectIds)
      onDone()
    } catch (e) {
      setErr(e.message || 'Не удалось сохранить'); setBusy(false)
    }
  }

  const Chip = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      padding: '8px 13px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
      border: active ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
      background: active ? C.brandSoft : '#fff', color: active ? C.brand : C.slate,
    }}>{children}</button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 480, padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Группы и предметы</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>
        <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 18px' }}>
          Отметьте, какие группы ведёт <b style={{ color: C.ink }}>{teacher.full_name}</b> и по каким предметам.
          При создании урока преподаватель будет выбирать только из отмеченного.
        </p>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Группы</div>
            <div style={{ marginBottom: 20 }}>
              <GroupMultiSelect groups={groups} value={groupIds} onChange={setGroupIds} />
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Предметы</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {subjects.length === 0 && <span style={{ fontSize: 13, color: C.faint }}>Сначала создайте предметы во вкладке «Предметы».</span>}
              {subjects.map((s) => (
                <Chip key={s.id} active={subjectIds.includes(s.id)} onClick={() => toggle(subjectIds, setSubjectIds, s.id)}>{s.name}</Chip>
              ))}
            </div>

            {err && <div style={{ color: '#c2360b', fontSize: 13, margin: '10px 0' }}>{err}</div>}

            <button disabled={busy} onClick={save} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: 12, gap: 7, background: busy ? C.line : C.brand, color: busy ? C.slate : '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: busy ? 'default' : 'pointer' }}>
              <Check size={17} /> {busy ? 'Сохранение…' : 'Сохранить привязки'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- РАЗДЕЛ УЧЕНИКОВ ----------
function StudentsManage({ groups, onOpenStudent }) {
  const [students, setStudents] = useState(null)
  const [modal, setModal] = useState(null) // { row } | 'new'
  const [q, setQ] = useState('')
  const [office, setOffice] = useState('Маргулана')
  const [lang, setLang] = useState('каз')
  const [err, setErr] = useState('')

  async function reload() {
    try { setStudents(await fetchStudentsWithGroups()) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  const filtered = (students || []).filter((s) => {
    if (officeOf(s.contact) !== office || langOf(s.contact) !== lang) return false
    const t = q.toLowerCase().trim()
    return !t || s.full_name.toLowerCase().includes(t)
  })

  const groupName = (id) => groups.find((g) => g.id === id)?.name

  // предметы ученика из contact ("Офис · язык · предметы: X, Y")
  const subjectsOf = (contact) => {
    const m = (contact || '').split('предметы:')[1]
    return m ? m.trim() : ''
  }

  const columns = [
    {
      key: 'full_name', label: 'Ученик', width: '30%',
      render: (s) => (
        <div className="rowflex" style={{ gap: 10 }}>
          <div className="av" style={{ width: 30, height: 30, fontSize: 12, background: avColorByIndex(s._i || 0) }}>{initials(s.full_name)}</div>
          <span onClick={(e) => { if (onOpenStudent) { e.stopPropagation(); onOpenStudent(s.id) } }}
            style={{ fontWeight: 600, color: onOpenStudent ? C.brand : C.ink, cursor: onOpenStudent ? 'pointer' : 'default' }}>
            {s.full_name}
          </span>
        </div>
      ),
    },
    {
      key: 'groups', label: 'Группы', sortable: false,
      sortValue: (s) => s.groupIds.length,
      render: (s) => s.groupIds.length
        ? <span style={{ color: C.ink }}>{s.groupIds.map(groupName).filter(Boolean).join(', ')}</span>
        : <span style={{ color: C.faint }}>без группы</span>,
    },
    {
      key: 'subjects', label: 'Предметы', sortable: false,
      render: (s) => <span style={{ color: C.slate }}>{subjectsOf(s.contact) || '—'}</span>,
    },
    {
      key: 'edit', label: '', width: 46, sortable: false, num: true,
      render: () => <Pencil size={15} color={C.slate} style={{ display: 'inline' }} />,
    },
  ]

  const rowsIndexed = filtered.map((s, i) => ({ ...s, _i: i }))

  return (
    <>
      <OfficeLangTabs office={office} lang={lang} setOffice={setOffice} setLang={setLang} count={filtered.length} />
      <div className="fbar">
        <div className="search-box">
          <Search size={15} color={C.slate} style={{ position: 'absolute', left: 11, top: 9 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск ученика…" />
        </div>
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ gap: 6, padding: '8px 15px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 11, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {students === null ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : (
        <DataTable columns={columns} rows={rowsIndexed} pageSize={30}
          onRowClick={(s) => setModal({ row: s })}
          initialSort={{ key: 'full_name', dir: 'asc' }} />
      )}

      {modal && (
        <StudentModal
          groups={groups}
          row={modal === 'new' ? null : modal.row}
          onClose={() => setModal(null)}
          onDone={async () => { setModal(null); await reload() }}
        />
      )}
    </>
  )
}

function StudentModal({ groups, row, onClose, onDone }) {
  const [name, setName] = useState(row?.full_name || '')
  const [contact, setContact] = useState(row?.contact || '')
  const [groupIds, setGroupIds] = useState(row?.groupIds || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = name.trim()

  const toggle = (id) => setGroupIds((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])

  async function save() {
    setBusy(true); setErr('')
    try {
      if (row) await updateStudent(row.id, name.trim(), contact, groupIds)
      else await addStudent(name.trim(), contact, groupIds)
      onDone()
    } catch (e) { setErr(e.message || 'Не удалось сохранить'); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{row ? 'Редактировать ученика' : 'Новый ученик'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        <Field label="ФИО ученика"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Фамилия Имя" style={inp} autoFocus /></Field>
        <Field label="Телефон / родитель (необязательно)"><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+7 ___ ___ __ __" style={inp} /></Field>

        <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 8 }}>Группы</div>
        <GroupMultiSelect groups={groups} value={groupIds} onChange={setGroupIds} />

        {err && <div style={{ color: '#c2360b', fontSize: 13, margin: '8px 0' }}>{err}</div>}

        <button disabled={!valid || busy} onClick={save} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: 12, gap: 7, background: valid && !busy ? C.brand : C.line, color: valid && !busy ? '#fff' : C.slate, borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: valid && !busy ? 'pointer' : 'default' }}>
          <Check size={17} /> {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

// ---------- ПОДТВЕРЖДЕНИЕ ДЕЙСТВИЯ ----------
function ConfirmModal({ title, message, confirmText = 'Подтвердить', danger = false, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 400, padding: 24 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800 }}>{title}</h3>
        <p style={{ fontSize: 14, color: C.slate, margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: 11, borderRadius: 11, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Отмена
          </button>
          <button onClick={onConfirm}
            style={{ flex: 1, padding: 11, borderRadius: 11, background: danger ? C.warn : C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- УЧЕНИКИ ГРУППЫ ----------
function GroupStudentsModal({ group, onClose }) {
  const [students, setStudents] = useState(null)
  const [allStudents, setAllStudents] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reload() {
    try {
      const [inGroup, all] = await Promise.all([fetchStudentsOfGroup(group.id), fetchAllStudents()])
      setStudents(inGroup); setAllStudents(all)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [group.id])

  const inIds = new Set((students || []).map((s) => s.id))
  const found = allStudents.filter((s) => {
    if (inIds.has(s.id)) return false
    const t = q.toLowerCase().trim()
    if (!t) return false
    return s.full_name.toLowerCase().includes(t)
  }).slice(0, 20)

  async function add(sid) {
    setBusy(true)
    try { await addStudentToGroup(sid, group.id); setQ(''); await reload() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function remove(sid) {
    setBusy(true)
    try { await removeStudentFromGroup(sid, group.id); await reload() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, maxHeight: '88vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{group.name}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>
        {group.note && <p style={{ fontSize: 13, color: C.slate, margin: '0 0 16px' }}>{group.note}</p>}

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 8 }}>{err}</div>}

        {/* Поиск для добавления */}
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Добавить ученика — начните вводить фамилию…"
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, outline: 'none' }} />
        </div>
        {q.trim() && (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 11, marginBottom: 14, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
            {found.length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.faint, textAlign: 'center' }}>Не найдено (или уже в группе)</div>}
            {found.map((s) => (
              <button key={s.id} type="button" disabled={busy} onClick={() => add(s.id)}
                className="rowflex" style={{ width: '100%', textAlign: 'left', gap: 8, padding: '10px 12px', border: 'none', borderTop: `1px solid ${C.grey}`, background: '#fff', cursor: 'pointer' }}>
                <Plus size={15} color={C.brand} />
                <span style={{ fontSize: 14, flex: 1 }}>{s.full_name}</span>
                <span style={{ fontSize: 11.5, color: C.faint }}>добавить</span>
              </button>
            ))}
          </div>
        )}

        {students === null ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        ) : students.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.faint, fontSize: 14, background: C.grey, borderRadius: 11 }}>
            В группе пока нет учеников. Найдите их через поиск выше.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>В группе: {students.length}</div>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
              {students.map((s, i) => (
                <div key={s.id} className="rowflex" style={{ gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: avColorByIndex(i), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{initials(s.full_name)}</div>
                  <span style={{ fontSize: 14, flex: 1 }}>{s.full_name}</span>
                  <button disabled={busy} onClick={() => remove(s.id)} title="Убрать из группы"
                    style={{ border: 'none', background: C.warnSoft, color: C.warn, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}><X size={15} /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- ДВУХУРОВНЕВЫЕ ВКЛАДКИ: ОФИС → ЯЗЫК ----------
function OfficeLangTabs({ office, lang, setOffice, setLang, count }) {
  const langs = [{ k: 'каз', t: 'Казахские' }, { k: 'рус', t: 'Русские' }]
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Офисы */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {OFFICES.map((o) => {
          const a = office === o
          return (
            <button key={o} onClick={() => setOffice(o)}
              style={{ padding: '9px 16px', borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                border: a ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                background: a ? C.brand : '#fff', color: a ? '#fff' : C.slate }}>
              {o}
            </button>
          )
        })}
      </div>
      {/* Языки */}
      <div className="rowflex" style={{ gap: 10 }}>
        <div style={{ display: 'flex', background: C.grey, borderRadius: 10, padding: 3 }}>
          {langs.map((l) => {
            const a = lang === l.k
            return (
              <button key={l.k} onClick={() => setLang(l.k)}
                style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: a ? C.card : 'transparent', color: a ? C.brand : C.slate,
                  boxShadow: a ? '0 1px 4px rgba(20,24,58,.1)' : 'none' }}>
                {l.t}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 12.5, color: C.faint }}>найдено: {count}</span>
      </div>
    </div>
  )
}
