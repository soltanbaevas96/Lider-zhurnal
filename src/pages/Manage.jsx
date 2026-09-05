import React, { useState, useEffect } from 'react'
import {
  ArrowLeft, Plus, Pencil, Archive, RotateCcw, X, GraduationCap, UserCheck, Users, Check, KeyRound, ShieldCheck, BookOpen, Link2, UsersRound, Search, Trash2, Wallet, Building2, Upload, AlertTriangle, ClipboardList, Lock, Unlock,
} from 'lucide-react'
import DataTable from '../components/DataTable'
import { C, initials, nameOf, avColorByIndex, loginFromName, genPassword, officeOf, langOf, OFFICES } from '../lib/utils'
import { inp, Field } from '../components/ui'
import { GroupMultiSelect } from '../components/GroupSearchSelect'
import {
  addTeacher, addAssistant, addCurator, addGroup, addSubject, updateRow, archiveRow, restoreRow, inviteTeacher,
  fetchTeacherLinks, saveTeacherLinks, fetchStudentsWithGroups, addStudent, updateStudent, fetchStudentsOfGroup,
  addStudentToGroup, removeStudentFromGroup, fetchAllStudents, deleteStudent, findStudentsByName,
  getAccountInfo, adminSetPassword, adminSetRole, adminSoftDelete, adminCreateAccount,
  fetchProfilesByRole, adminUpdateProfileName, fetchAccountsByRole, setAccountActive,
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
  const [accountFor, setAccountFor] = useState(null) // сотрудник для карточки учётки (логин/пароль/роль)
  const [confirmDelete, setConfirmDelete] = useState(null) // строка для подтверждения удаления
  const [gOffice, setGOffice] = useState('Маргулана') // фильтр групп: офис
  const [gLang, setGLang] = useState('каз') // фильтр групп: язык
  const [gQuery, setGQuery] = useState('') // поиск по группам
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tabs = [
    { k: 'teachers', t: 'Преподаватели', icon: GraduationCap },
    { k: 'curators', t: 'Кураторы', icon: UserCheck },
    { k: 'assistants', t: 'Ассистенты', icon: UserCheck },
    { k: 'office_managers', t: 'Офис-менеджеры', icon: Building2 },
    { k: 'methodists', t: 'Методисты', icon: ClipboardList },
    { k: 'accountants', t: 'Бухгалтер', icon: Wallet },
    { k: 'students', t: 'Ученики', icon: UsersRound },
    { k: 'groups', t: 'Группы', icon: Users },
    { k: 'subjects', t: 'Предметы', icon: BookOpen },
  ]
  // Вкладки без карточек-таблиц (office_managers/accountants) и ученики
  // используют свои собственные экраны/кнопки — общий блок «Добавить» и
  // «Показывать архивные» тут не подходит.
  const isAccountsOnlyTab = tab === 'office_managers' || tab === 'accountants' || tab === 'methodists'

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
          ? { name: form.name, subject_name: form.subject_name || null, office: form.g_office || null, lang: form.g_lang || null,
              capacity: Number(form.capacity) || 13, note: `${form.subject_name || ''} · ${form.g_office || ''} · ${form.g_lang || ''}` }
          : tab === 'subjects'
            ? { name: form.name }
            : tab === 'teachers'
              ? { full_name: form.full_name, subject_id: form.subject_id || null, phone: form.phone }
              : tab === 'curators'
                ? { full_name: form.full_name, subject: form.subject || null, rate: Number(form.rate) || 0, phone: form.phone }
                : tab === 'assistants'
                  ? { full_name: form.full_name, rate: Number(form.rate) || 0, phone: form.phone }
                  : { full_name: form.full_name, phone: form.phone }
        await updateRow(tab, modal.row.id, patch)
      } else {
        if (tab === 'teachers') await addTeacher({ full_name: form.full_name, subject_id: form.subject_id || null, phone: form.phone })
        else if (tab === 'curators') await addCurator(form.full_name, form.subject || null, Number(form.rate) || 0)
        else if (tab === 'assistants') await addAssistant({ full_name: form.full_name, phone: form.phone, rate: Number(form.rate) || 0 })
        else if (tab === 'subjects') await addSubject(form.name)
        else await addGroup({
          name: form.name, subject_name: form.subject_name || null,
          office: form.g_office || 'Маргулана', lang: form.g_lang || 'каз',
          capacity: Number(form.capacity) || 13,
          note: `${form.subject_name || ''} · ${form.g_office || 'Маргулана'} · ${form.g_lang || 'каз'}`,
        })
      }
      setModal(null)
      await onChanged()
    } catch (e) {
      const m = e.message || ''
      if (m.includes('duplicate') || m.includes('unique')) {
        setErr(tab === 'groups' ? 'Группа с таким кодом уже есть в этом офисе. Выберите другой код.' : 'Такая запись уже существует.')
      } else {
        setErr(m || 'Не удалось сохранить')
      }
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
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Преподаватели, ассистенты, кураторы и группы центра <span style={{ color: C.faint, fontSize: 11 }}>· v5</span></p>
        </div>
        {tab !== 'students' && !isAccountsOnlyTab && (
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
        {tab !== 'students' && !isAccountsOnlyTab && (
          <label className="rowflex" style={{ marginLeft: 'auto', gap: 7, fontSize: 13, color: C.slate, cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Показывать архивные
          </label>
        )}
      </div>

      {tab === 'office_managers' ? (
        <AccountsManage
          roles={['office_manager', 'senior_office_manager']}
          roleOptions={[
            { v: 'office_manager', t: 'Обычный — свой офис' },
            { v: 'senior_office_manager', t: 'Старший — все офисы' },
          ]}
        />
      ) : tab === 'methodists' ? (
        <AccountsManage
          roles={['methodist']}
          roleOptions={[{ v: 'methodist', t: 'Методист' }]}
          withStatus
        />
      ) : tab === 'accountants' ? (
        <AccountsManage
          roles={['accountant']}
          roleOptions={[{ v: 'accountant', t: 'Бухгалтер' }]}
        />
      ) : tab === 'students' ? (
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
          <div key={r.id} className="rowflex lrow" style={{ gap: 11, padding: '8px 14px', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: r.archived ? 0.5 : 1, flexWrap: 'wrap' }}>
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
                {(tab === 'teachers' || tab === 'curators' || tab === 'assistants') && !r.archived && (
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
                {(tab === 'teachers' || tab === 'curators' || tab === 'assistants') && (
                  <button onClick={() => setAccountFor(r)} disabled={busy} className="rowflex" title="Профиль: логин, пароль, доступ"
                    style={{ gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.brand, background: C.brandSoft, border: 'none', cursor: 'pointer' }}>
                    <KeyRound size={13} /> <span className="hide-sm">Профиль</span></button>
                )}
                <button onClick={() => setConfirmEdit(r)} disabled={busy} title="Редактировать"
                  style={{ padding: 7, borderRadius: 8, color: C.slate, background: C.grey, border: 'none', cursor: 'pointer' }}><Pencil size={14} /></button>
                <button onClick={() => setConfirmArch(r)} disabled={busy} title="В архив"
                  style={{ padding: 7, borderRadius: 8, color: C.warn, background: C.warnSoft, border: 'none', cursor: 'pointer' }}><Archive size={14} /></button>
                {(tab === 'teachers' || tab === 'curators' || tab === 'assistants') && (
                  <button onClick={() => setConfirmDelete(r)} disabled={busy} title="Удалить"
                    style={{ padding: 7, borderRadius: 8, color: '#dc2626', background: '#fee2e2', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                )}
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

      {accountFor && (
        <AccountModal row={accountFor} kind={tab} onClose={() => setAccountFor(null)} onDone={async () => { setAccountFor(null); await onChanged() }} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Удалить сотрудника?"
          message={`«${confirmDelete.full_name}» будет удалён, вход в систему отключён. История его уроков сохранится. Это действие необратимо.`}
          confirmText="Удалить"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const r = confirmDelete; setConfirmDelete(null)
            try { await adminSoftDelete(tab, r.id); await onChanged() } catch (e) { alert(e.message) }
          }}
        />
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
    subject: row?.subject || '',
    rate: row?.rate || '',
    subject_name: row?.subject_name || '',
    g_office: row?.office || 'Маргулана',
    g_lang: row?.lang || 'каз',
    capacity: row?.capacity || '13',
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const valid = nameField ? form.name.trim() : form.full_name.trim()

  const title = row ? 'Редактировать' : 'Добавить'
  const label = isGroup ? 'группу' : isSubject ? 'предмет' : tab === 'assistants' ? 'ассистента' : tab === 'curators' ? 'куратора' : 'преподавателя'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 420, padding: 24 }}>
        <div className="rowflex" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title} {label}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        {isGroup ? (
          <>
            <Field label="Название (код группы)"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Напр. 11КМС-1" style={inp} autoFocus /></Field>
            <Field label="Предмет"><input value={form.subject_name || ''} onChange={(e) => set('subject_name', e.target.value)} placeholder="Напр. Математика" style={inp} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Офис">
                  <select value={form.g_office || 'Маргулана'} onChange={(e) => set('g_office', e.target.value)} style={inp}>
                    {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Язык">
                  <select value={form.g_lang || 'каз'} onChange={(e) => set('g_lang', e.target.value)} style={inp}>
                    <option value="каз">Казахский</option>
                    <option value="рус">Русский</option>
                  </select>
                </Field>
              </div>
              <div style={{ width: 110 }}>
                <Field label="Вместимость"><input type="number" value={form.capacity || '13'} onChange={(e) => set('capacity', e.target.value)} style={inp} /></Field>
              </div>
            </div>
          </>
        ) : isSubject ? (
          <Field label="Название предмета"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Напр. Математика" style={inp} autoFocus /></Field>
        ) : (
          <>
            <Field label="ФИО"><input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Фамилия Имя" style={inp} autoFocus /></Field>
            <Field label="Телефон (необязательно)"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+7 ___ ___ __ __" style={inp} /></Field>
            {(tab === 'curators' || tab === 'assistants') && (
              <div style={{ display: 'flex', gap: 10 }}>
                {tab === 'curators' && (
                  <div style={{ flex: 1 }}>
                    <Field label="Предмет"><input value={form.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder="напр. Математика" style={inp} /></Field>
                  </div>
                )}
                <div style={{ width: tab === 'curators' ? 130 : '100%' }}>
                  <Field label="Ставка за урок, ₸"><input type="number" value={form.rate || ''} onChange={(e) => set('rate', e.target.value)} placeholder="0" style={inp} /></Field>
                </div>
              </div>
            )}
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
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [q, setQ] = useState('')
  const [office, setOffice] = useState('Маргулана')
  const [lang, setLang] = useState('каз')
  const [err, setErr] = useState('')

  async function reload() {
    try { setStudents(await fetchStudentsWithGroups()) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  // пока идёт поиск — ищем по всем офисам/языкам сразу, не только по открытой вкладке
  const searching = q.trim().length > 0
  const filtered = (students || []).filter((s) => {
    // офис/язык берём из колонок напрямую; если пусто — из contact (старые данные)
    const sOffice = s.office || officeOf(s.contact)
    const sLang = s.lang || langOf(s.contact)
    if (!searching && (sOffice !== office || sLang !== lang)) return false
    const t = q.toLowerCase().trim()
    return !t || s.full_name.toLowerCase().includes(t)
  })

  const groupName = (id) => groups.find((g) => g.id === id)?.name

  // предметы ученика — из RPC (_subjects), иначе из данных групп
  const subjectsOfStudent = (s) => {
    if (s._subjects?.length) return [...new Set(s._subjects)].join(', ')
    const subs = (s.groupsData || [])
      .map((g) => g?.subject_name).filter(Boolean)
      .map((full) => String(full).split(' / ')[0])
    return [...new Set(subs)].join(', ')
  }
  // имена групп — из данных групп напрямую (не зависим от словаря)
  const groupNamesOf = (s) => {
    if (s.groupsData?.length) return s.groupsData.map((g) => g.name).filter(Boolean).join(', ')
    return (s.groupIds || []).map(groupName).filter(Boolean).join(', ')
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
    ...(searching ? [{
      key: 'office', label: 'Офис', width: 110,
      render: (s) => {
        const sOffice = s.office || officeOf(s.contact)
        const sLang = s.lang || langOf(s.contact)
        return <span style={{ color: C.slate }}>{sOffice || '—'}{sLang ? ` · ${sLang}` : ''}</span>
      },
    }] : []),
    {
      key: 'groups', label: 'Группы', sortable: false,
      sortValue: (s) => s.groupIds.length,
      render: (s) => s.groupIds.length
        ? <span style={{ color: C.ink }}>{groupNamesOf(s)}</span>
        : <span style={{ color: C.faint }}>без группы</span>,
    },
    {
      key: 'subjects', label: 'Предметы', sortable: false,
      render: (s) => <span style={{ color: C.slate }}>{subjectsOfStudent(s) || '—'}</span>,
    },
    {
      key: 'edit', label: '', width: 40, sortable: false, num: true,
      render: () => <Pencil size={15} color={C.slate} style={{ display: 'inline' }} />,
    },
    {
      key: 'delete', label: '', width: 40, sortable: false, num: true,
      render: (s) => (
        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(s) }} title="Удалить"
          style={{ padding: 6, borderRadius: 8, color: '#dc2626', background: '#fee2e2', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
          <Trash2 size={14} />
        </button>
      ),
    },
  ]

  const rowsIndexed = filtered.map((s, i) => ({ ...s, _i: i }))

  return (
    <>
      <div style={{ opacity: searching ? 0.4 : 1, pointerEvents: searching ? 'none' : 'auto' }}>
        <OfficeLangTabs office={office} lang={lang} setOffice={setOffice} setLang={setLang} count={filtered.length} />
      </div>
      <div className="fbar">
        <div className="search-box">
          <Search size={15} color={C.slate} style={{ position: 'absolute', left: 11, top: 9 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск ученика…" />
        </div>
        <button onClick={() => setImportOpen(true)} className="rowflex"
          style={{ gap: 6, padding: '8px 15px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Upload size={15} /> Импорт
        </button>
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

      {confirmDelete && (
        <ConfirmModal
          title="Удалить ученика?"
          message={`«${confirmDelete.full_name}» исчезнет из активных списков и из всех групп. История посещаемости и оплат сохранится.`}
          confirmText="Удалить"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const s = confirmDelete; setConfirmDelete(null)
            try { await deleteStudent(s.id); await reload() } catch (e) { setErr(e.message) }
          }}
        />
      )}

      {importOpen && (
        <StudentImportWizard groups={groups} onClose={() => setImportOpen(false)}
          onDone={async () => { setImportOpen(false); await reload() }} />
      )}
    </>
  )
}

// ---------- МАССОВЫЙ ИМПОРТ УЧЕНИКОВ ----------
// Вставка строк (как при копировании из Excel): ФИО, Школа, Класс, Офис,
// Язык, Группы (через ;), Тел. ученика, Тел. родителя, Договор, ФИ
// родителя, Примечание. Дубликаты проверяются через ту же
// findStudentsByName, что и обычная форма добавления (точное имя,
// без учёта регистра) — совпавший ученик не создаётся заново, только
// довязывается к недостающим группам. Группы должны уже существовать —
// импорт учеников их не создаёт (в отличие от групп при импорте
// расписания, тут это осознанно строже: разночтение в названии группы
// должно решаться вручную, а не тихой автосозданием дубля группы).
function normStudentName(s) { return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ') }

function StudentImportWizard({ groups, onClose, onDone }) {
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState(null)
  const [checking, setChecking] = useState(false)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')

  async function parse() {
    setErr(''); setChecking(true)
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    try {
      const parsed = await Promise.all(lines.map(async (line, i) => {
        const cols = line.split('\t').map((c) => c.trim())
        const [fullName, school, grade, office, lang, groupsRaw, studentPhone, parentPhone, contract, parentName, note] = cols
        const groupCodes = (groupsRaw || '').split(';').map((g) => g.trim()).filter((g) => /^\d{1,2}\s/.test(g))
        const otherText = (groupsRaw || '').split(';').map((g) => g.trim()).filter((g) => g && !/^\d{1,2}\s/.test(g))
        const matchedGroups = []
        const unmatchedGroups = []
        groupCodes.forEach((code) => {
          const g = groups.find((gr) => normStudentName(gr.name) === normStudentName(code) && gr.office === office)
          if (g) matchedGroups.push(g); else unmatchedGroups.push(code)
        })
        let dup = []
        if (fullName) { try { dup = await findStudentsByName(fullName) } catch { dup = [] } }
        return {
          i, fullName, school, grade, office, lang, studentPhone, parentPhone, contract, parentName, note,
          matchedGroups, unmatchedGroups, otherText, isDuplicate: dup.length > 0, dupInfo: dup[0] || null,
          ok: !!fullName && !!office,
        }
      }))
      setRows(parsed)
    } catch (e) { setErr(e.message) } finally { setChecking(false) }
  }

  async function run() {
    setRunning(true); setErr('')
    const stats = { total: rows.length, created: 0, skippedDuplicate: 0, groupsLinked: 0, groupsUnmatched: 0, errors: [] }
    try {
      for (const r of rows) {
        if (!r.ok) continue
        try {
          if (r.isDuplicate) {
            // Уже есть в базе (скорее всего «перезаключение») — не создаём
            // повторно, только довязываем недостающие группы.
            stats.skippedDuplicate++
            for (const g of r.matchedGroups) {
              await addStudentToGroup(r.dupInfo.id, g.id)
              stats.groupsLinked++
            }
          } else {
            await addStudent({
              full_name: r.fullName, school: r.school, grade: r.grade, office: r.office, lang: r.lang,
              phone: r.studentPhone || null, parent_phone: r.parentPhone || null, parent_name: r.parentName || null,
              contract_no: r.contract || null, note: r.note || null,
            }, r.matchedGroups.map((g) => g.id))
            stats.created++
            stats.groupsLinked += r.matchedGroups.length
          }
          stats.groupsUnmatched += r.unmatchedGroups.length
        } catch (e) { stats.errors.push(`${r.fullName}: ${e.message}`) }
      }
      setReport(stats)
      await onDone()
    } catch (e) { setErr(e.message) } finally { setRunning(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 820, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Импорт учеников</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {report ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Импорт завершён</div>
            <div style={{ background: C.grey, borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.9 }}>
              Строк обработано: <b>{report.total}</b><br />
              Создано новых учеников: <b>{report.created}</b><br />
              Пропущено как дубликат (уже есть в базе): <b>{report.skippedDuplicate}</b><br />
              Связей с группами добавлено: <b>{report.groupsLinked}</b><br />
              Кодов групп не найдено в базе: <b style={{ color: report.groupsUnmatched ? '#d97706' : undefined }}>{report.groupsUnmatched}</b><br />
              Ошибок: <b style={{ color: report.errors.length ? '#dc2626' : undefined }}>{report.errors.length}</b>
            </div>
            {report.errors.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#dc2626' }}>{report.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>
            )}
            <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Готово</button>
          </div>
        ) : rows ? (
          <div>
            <p style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>
              Проверьте перед импортом. 🆕 — будет создан новый ученик. 👤 — уже есть в базе (только довяжем группы, повторно не создаём).
              Коды групп, которых нет в базе для этого офиса, не привяжутся — их нужно проверить отдельно.
            </p>
            <div className="dt-wrap" style={{ maxHeight: 400, overflow: 'auto' }}><div className="dt-scroll"><table className="dt">
              <thead><tr><th style={{ width: 40 }}>#</th><th>Ученик</th><th style={{ width: 100 }}>Офис</th><th style={{ width: 60 }}>Класс</th><th>Группы</th><th style={{ width: 60 }}>OK</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i}>
                    <td>{r.i + 1}</td>
                    <td>{r.isDuplicate ? <span title="Уже есть в базе">👤</span> : <span title="Новый">🆕</span>} {r.fullName || <span style={{ color: '#dc2626' }}>— нет имени —</span>}</td>
                    <td>{r.office || <span style={{ color: '#dc2626' }}>?</span>}</td>
                    <td>{r.grade}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.matchedGroups.map((g) => g.name).join(', ')}
                      {r.unmatchedGroups.length > 0 && (
                        <span style={{ color: '#d97706' }}> {r.matchedGroups.length ? '· ' : ''}⚠️ не найдено: {r.unmatchedGroups.join(', ')}</span>
                      )}
                      {r.otherText.length > 0 && (
                        <span style={{ color: C.faint }}> {(r.matchedGroups.length || r.unmatchedGroups.length) ? '· ' : ''}(в файле: {r.otherText.join(', ')})</span>
                      )}
                    </td>
                    <td>{r.ok ? <Check size={14} color="#0f9d58" /> : <AlertTriangle size={14} color="#dc2626" />}</td>
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
            <Label>Вставьте строки (столбцы через Tab — как при копировании из Excel)</Label>
            <p style={{ fontSize: 11.5, color: C.faint, marginBottom: 6, lineHeight: 1.5 }}>
              ФИО · Школа · Класс · Офис (точное название) · Язык · Группы через «;» · Тел. ученика · Тел. родителя · Договор · ФИ родителя · Примечание
            </p>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={12}
              placeholder={'Азамова Малика\t39\t10\tМаргулана\tрус\t10 РММГ-1;10 РМИ-1;10 РММ-2\t87785740159\t87715605666\tСН060626/003\tАзамова Асем\tновый\n...'}
              style={{ ...inp, width: '100%', fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
              <button onClick={parse} disabled={!raw.trim() || checking} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: (raw.trim() && !checking) ? 1 : 0.5 }}>{checking ? 'Проверяю…' : 'Проверить сопоставление'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
function Label({ children, style }) {
  return <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 6, ...style }}>{children}</div>
}

// ---------- УЧЁТКИ БЕЗ КАРТОЧКИ (офис-менеджеры, бухгалтер) ----------
// В отличие от преподавателей/кураторов/ассистентов, у этих ролей нет
// отдельной таблицы-карточки — сама учётка (запись в profiles) и есть
// вся сущность. Поэтому создание/редактирование/удаление устроено проще.
const ROLE_LABEL = {
  office_manager: 'обычный офис-менеджер',
  senior_office_manager: 'старший офис-менеджер',
  accountant: 'бухгалтер',
  methodist: 'методист',
}
// Роли, у которых есть привязка к офису (нужен select «Офис» в форме).
const ROLES_WITH_OFFICE = ['office_manager', 'methodist']

function AccountsManage({ roles, roleOptions, withStatus }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // 'new' | { row }
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmBlock, setConfirmBlock] = useState(null) // строка для подтверждения блокировки/разблокировки
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reload() {
    try { setRows(await (withStatus ? fetchAccountsByRole(roles) : fetchProfilesByRole(roles))) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [roles.join(',')])

  return (
    <>
      <div className="fbar">
        <div style={{ flex: 1 }} />
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ gap: 6, padding: '8px 15px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 11, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows === null ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.slate, fontSize: 14 }}>Пусто. Нажмите «Добавить».</div>
        ) : rows.map((r, i) => (
          <div key={r.id} className="rowflex lrow" style={{ gap: 11, padding: '10px 14px', borderTop: i ? `1px solid ${C.line}` : 'none', flexWrap: 'wrap' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: avColorByIndex(i), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
              {initials(r.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div className="rowflex" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.full_name || <span style={{ color: C.faint }}>без имени</span>}</span>
                {withStatus ? (
                  r.active ? (
                    <span className="rowflex" style={{ gap: 3, fontSize: 10.5, fontWeight: 600, color: C.ok, background: C.okSoft, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      <ShieldCheck size={10} /> активен
                    </span>
                  ) : (
                    <span className="rowflex" style={{ gap: 3, fontSize: 10.5, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      <Lock size={10} /> заблокирован
                    </span>
                  )
                ) : (
                  <span className="rowflex" style={{ gap: 3, fontSize: 10.5, fontWeight: 600, color: C.ok, background: C.okSoft, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    <ShieldCheck size={10} /> доступ
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: C.slate }}>
                {ROLE_LABEL[r.role] || r.role}{ROLES_WITH_OFFICE.includes(r.role) && r.office ? ` · ${r.office}` : ''}
              </div>
            </div>
            <button onClick={() => setModal({ row: r })} disabled={busy} className="rowflex" title="Логин, пароль, доступ"
              style={{ gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.brand, background: C.brandSoft, border: 'none', cursor: 'pointer' }}>
              <KeyRound size={13} /> <span className="hide-sm">Профиль</span>
            </button>
            {withStatus ? (
              <button onClick={() => setConfirmBlock(r)} disabled={busy} className="rowflex"
                title={r.active ? 'Заблокировать' : 'Разблокировать'}
                style={{ gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  color: r.active ? '#dc2626' : C.ok, background: r.active ? '#fee2e2' : C.okSoft }}>
                {r.active ? <Lock size={13} /> : <Unlock size={13} />}
                <span className="hide-sm">{r.active ? 'Заблокировать' : 'Разблокировать'}</span>
              </button>
            ) : (
              <button onClick={() => setConfirmDelete(r)} disabled={busy} title="Удалить"
                style={{ padding: 7, borderRadius: 8, color: '#dc2626', background: '#fee2e2', border: 'none', cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <AccountOnlyModal
          row={modal === 'new' ? null : modal.row}
          roleOptions={roleOptions}
          defaultRole={roleOptions[0]?.v}
          onClose={() => setModal(null)}
          onDone={async () => { setModal(null); await reload() }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Удалить учётку?"
          message={`«${confirmDelete.full_name}» больше не сможет войти в систему. Действие необратимо.`}
          confirmText="Удалить"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const r = confirmDelete; setConfirmDelete(null); setBusy(true)
            try { await adminSoftDelete('accounts', r.id); await reload() }
            catch (e) { setErr(e.message) } finally { setBusy(false) }
          }}
        />
      )}

      {confirmBlock && (
        <ConfirmModal
          title={confirmBlock.active ? 'Заблокировать методиста?' : 'Разблокировать методиста?'}
          message={confirmBlock.active
            ? `«${confirmBlock.full_name}» больше не сможет войти в систему. Все его группы, ученики и история действий сохранятся — можно разблокировать в любой момент.`
            : `«${confirmBlock.full_name}» снова сможет входить в систему.`}
          confirmText={confirmBlock.active ? 'Заблокировать' : 'Разблокировать'}
          danger={confirmBlock.active}
          onCancel={() => setConfirmBlock(null)}
          onConfirm={async () => {
            const r = confirmBlock; setConfirmBlock(null); setBusy(true)
            try { await setAccountActive(r.id, !r.active); await reload() }
            catch (e) { setErr(e.message) } finally { setBusy(false) }
          }}
        />
      )}
    </>
  )
}

function AccountOnlyModal({ row, roleOptions, defaultRole, onClose, onDone }) {
  const isNew = !row
  const [fullName, setFullName] = useState(row?.full_name || '')
  const [login, setLogin] = useState(isNew ? '' : row?.username || '')
  const [pass, setPass] = useState(isNew ? genPassword() : '')
  const [role, setRole] = useState(row?.role || defaultRole)
  const [office, setOffice] = useState(row?.office || '')
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isNew) {
      getAccountInfo(row.id).then(setInfo).catch((e) => setErr(e.message))
      if (!login) setLogin(loginFromName(row.full_name || ''))
    }
  }, [row])

  async function create() {
    if (!fullName.trim()) { setErr('Введите ФИО'); return }
    if (!login.trim()) { setErr('Введите логин'); return }
    if (!pass || pass.length < 4) { setErr('Пароль минимум 4 символа'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      await adminCreateAccount(null, null, login.trim().toLowerCase(), pass, role, fullName.trim(), ROLES_WITH_OFFICE.includes(role) ? office : null)
      setMsg('Учётка создана')
      await onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function saveName() {
    if (!fullName.trim()) { setErr('Введите ФИО'); return }
    setBusy(true); setErr(''); setMsg('')
    try { await adminUpdateProfileName(row.id, fullName.trim()); setMsg('ФИО обновлено') }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function savePassword() {
    if (!pass || pass.length < 4) { setErr('Пароль минимум 4 символа'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      await adminSetPassword(row.id, pass)
      setMsg('Пароль изменён'); setPass('')
      setInfo(await getAccountInfo(row.id))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function saveRole() {
    setBusy(true); setErr(''); setMsg('')
    try {
      await adminSetRole(row.id, role, ROLES_WITH_OFFICE.includes(role) ? office : null)
      setMsg('Доступ обновлён')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isNew ? 'Новая учётка' : 'Профиль сотрудника'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        {isNew ? (
          <>
            <Field label="ФИО"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Фамилия Имя" style={inp} autoFocus /></Field>
            <Field label="Логин"><input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="напр. asaparova" style={inp} /></Field>
            <Field label="Пароль">
              <div className="rowflex" style={{ gap: 8 }}>
                <input value={pass} onChange={(e) => setPass(e.target.value)} style={{ ...inp, flex: 1 }} />
                <button onClick={() => setPass(genPassword())} type="button" title="Сгенерировать"
                  style={{ padding: '0 14px', borderRadius: 11, background: C.grey, color: C.brand, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Ещё
                </button>
              </div>
            </Field>
            {roleOptions.length > 1 && (
              <Field label="Доступ (роль)">
                <select value={role} onChange={(e) => setRole(e.target.value)} style={inp}>
                  {roleOptions.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                </select>
              </Field>
            )}
            {ROLES_WITH_OFFICE.includes(role) && (
              <Field label="Офис">
                <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
                  <option value="">— выберите —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            )}
            {login && pass && (
              <div style={{ background: C.brandSoft, borderRadius: 11, padding: 12, fontSize: 13, color: C.ink, marginBottom: 4 }}>
                Передайте сотруднику — логин: <b>{login}</b> · пароль: <b>{pass}</b>
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>Запишите эти данные — после закрытия пароль не восстановить.</div>
              </div>
            )}
            <button onClick={create} disabled={busy} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', gap: 6, padding: 12, background: C.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
              <Check size={16} /> {busy ? 'Создание…' : 'Создать учётку'}
            </button>
          </>
        ) : (
          <>
            <Field label="ФИО">
              <div className="rowflex" style={{ gap: 8 }}>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ ...inp, flex: 1 }} />
                <button onClick={saveName} disabled={busy} style={{ padding: '10px 14px', background: C.ink, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Сохранить</button>
              </div>
            </Field>

            <div style={{ background: C.grey, borderRadius: 12, padding: 14, margin: '12px 0' }}>
              <div className="rowflex" style={{ gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.slate, width: 60 }}>Логин:</span>
                <b style={{ fontSize: 14, fontFamily: 'monospace' }}>{info?.login || login || '—'}</b>
              </div>
              <div className="rowflex" style={{ gap: 8 }}>
                <span style={{ fontSize: 12, color: C.slate, width: 60 }}>Пароль:</span>
                <b style={{ fontSize: 14, fontFamily: 'monospace' }}>{info?.password || '—'}</b>
              </div>
            </div>

            <Field label="Новый пароль">
              <div className="rowflex" style={{ gap: 8 }}>
                <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Введите новый пароль" style={inp} />
                <button onClick={savePassword} disabled={busy} style={{ padding: '10px 14px', background: C.brand, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Сменить</button>
              </div>
            </Field>

            {roleOptions.length > 1 && (
              <Field label="Доступ (роль)">
                <select value={role} onChange={(e) => setRole(e.target.value)} style={inp}>
                  {roleOptions.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                </select>
              </Field>
            )}
            {ROLES_WITH_OFFICE.includes(role) && (
              <Field label="Офис">
                <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
                  <option value="">— выберите —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            )}
            <button onClick={saveRole} disabled={busy} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', gap: 6, padding: 11, background: C.ink, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
              <ShieldCheck size={15} /> Сохранить доступ
            </button>
          </>
        )}

        {msg && <div style={{ color: C.ok, fontSize: 13, marginTop: 10, textAlign: 'center' }}>{msg}</div>}
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
      </div>
    </div>
  )
}

export function StudentModal({ groups, row, onClose, onDone, fixedOffice }) {
  const [name, setName] = useState(row?.full_name || '')
  const [school, setSchool] = useState(row?.school || '')
  const [grade, setGrade] = useState(row?.grade || '')
  const [office, setOffice] = useState(row?.office || fixedOffice || 'Маргулана')
  const [lang, setLang] = useState(row?.lang || 'каз')
  const [phone, setPhone] = useState(row?.phone || '')
  const [parentPhone, setParentPhone] = useState(row?.parent_phone || '')
  const [parentName, setParentName] = useState(row?.parent_name || '')
  const [contractNo, setContractNo] = useState(row?.contract_no || '')
  const [note, setNote] = useState(row?.note || '')
  const [groupIds, setGroupIds] = useState(row?.groupIds || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [dupWarning, setDupWarning] = useState([])
  const valid = name.trim()

  // Предупреждаем, если активный ученик с таким же именем уже есть —
  // не блокируем (бывают тёзки), но даём заметить возможный дубль.
  useEffect(() => {
    const n = name.trim()
    if (n.length < 3) { setDupWarning([]); return }
    const t = setTimeout(() => {
      findStudentsByName(n, row?.id).then(setDupWarning).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [name, row?.id])

  async function save() {
    setBusy(true); setErr('')
    try {
      // contact собираем в формате "Офис · язык" — по нему работает фильтр списка
      const contact = `${office || ''}${office && lang ? ' · ' : ''}${lang || ''}`.trim()
      const fields = {
        full_name: name.trim(), contact,
        school: school.trim() || null,
        grade: grade.trim() || null,
        office: office || null,
        lang: lang || null,
        phone: phone.trim() || null,
        parent_phone: parentPhone.trim() || null,
        parent_name: parentName.trim() || null,
        contract_no: contractNo.trim() || null,
        note: note.trim() || null,
      }
      if (row) await updateStudent(row.id, fields, groupIds)
      else await addStudent(fields, groupIds)
      onDone()
    } catch (e) { setErr(e.message || 'Не удалось сохранить'); setBusy(false) }
  }

  async function remove() {
    setBusy(true); setErr('')
    try { await deleteStudent(row.id); onDone() }
    catch (e) { setErr(e.message || 'Не удалось удалить'); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 500, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{row ? 'Редактировать ученика' : 'Новый ученик'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        <Field label="ФИО ученика"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Фамилия Имя" style={inp} autoFocus /></Field>

        {dupWarning.length > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
            Уже есть {dupWarning.length === 1 ? 'ученик с таким именем' : `${dupWarning.length} ученика с таким именем`}: {dupWarning.map((d, i) => (
              <b key={d.id}>{i > 0 && '; '}{d.office || '—'}{d.contract_no ? `, договор ${d.contract_no}` : ''}</b>
            ))}. Проверьте — возможно, это уже заведённый ученик, а не новый.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Школа"><input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="№ или название" style={inp} /></Field>
          </div>
          <div style={{ width: 90 }}>
            <Field label="Класс"><input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="11" style={inp} /></Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Офис">
              <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
                {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Язык">
              <select value={lang} onChange={(e) => setLang(e.target.value)} style={inp}>
                <option value="каз">Казахский</option>
                <option value="рус">Русский</option>
              </select>
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Телефон ученика"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ___ ___ __ __" style={inp} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Телефон родителя"><input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="+7 ___ ___ __ __" style={inp} /></Field>
          </div>
        </div>

        <Field label="ФИ родителя"><input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Фамилия Имя родителя" style={inp} /></Field>
        <Field label="Номер договора"><input value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="напр. М03062026/001" style={inp} /></Field>
        <Field label="Примечание"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр. новый / перезаключение" style={inp} /></Field>

        <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginBottom: 8, marginTop: 4 }}>Группы</div>
        <GroupMultiSelect groups={groups} value={groupIds} onChange={setGroupIds} />

        {err && <div style={{ color: '#c2360b', fontSize: 13, margin: '8px 0' }}>{err}</div>}

        <button disabled={!valid || busy} onClick={save} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12, padding: 12, gap: 7, background: valid && !busy ? C.brand : C.line, color: valid && !busy ? '#fff' : C.slate, borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: valid && !busy ? 'pointer' : 'default' }}>
          <Check size={17} /> {busy ? 'Сохранение…' : 'Сохранить'}
        </button>

        {row && (
          confirmDel ? (
            <div style={{ marginTop: 12, padding: 12, background: '#fdecec', borderRadius: 11 }}>
              <div style={{ fontSize: 13, color: '#c2360b', marginBottom: 10 }}>
                Удалить ученика? Он исчезнет из активных списков и из всех групп. История посещаемости и оплат сохранится.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={remove} disabled={busy} style={{ flex: 1, padding: 10, background: '#dc2626', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Да, удалить</button>
                <button onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: 10, background: C.grey, color: C.slate, borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: 11, gap: 7, background: 'none', color: '#dc2626', borderRadius: 11, fontSize: 13.5, fontWeight: 600, border: `1px solid #f3c9c9`, cursor: 'pointer' }}>
              <Trash2 size={15} /> Удалить ученика
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ---------- ПОДТВЕРЖДЕНИЕ ДЕЙСТВИЯ ----------
// Карточка сотрудника: логин, пароль (смена), роль (= доступ к вкладкам)
const ROLE_OPTIONS = [
  { v: 'teacher', t: 'Преподаватель — свои занятия и журнал' },
  { v: 'admin', t: 'Завуч — полный доступ' },
  { v: 'director', t: 'Директор — просмотр всего' },
  { v: 'assistant', t: 'Ассистент — помощь на занятиях' },
  { v: 'office_manager', t: 'Офис-менеджер — свой офис' },
  { v: 'senior_office_manager', t: 'Старший офис-менеджер — все офисы' },
  { v: 'accountant', t: 'Бухгалтер — зарплата, табель, оплаты' },
]

function AccountModal({ row, kind, onClose, onDone }) {
  const hasAccount = !!row.profile_id
  const [info, setInfo] = useState(null)
  const [pass, setPass] = useState('')
  const [login, setLogin] = useState('')
  const [role, setRole] = useState('')
  const [office, setOffice] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const defaultRole = kind === 'assistants' ? 'assistant' : 'teacher'

  useEffect(() => {
    if (hasAccount) {
      getAccountInfo(row.profile_id).then((d) => {
        setInfo(d); setRole(d?.role || defaultRole); setOffice(d?.office || '')
      }).catch((e) => setErr(e.message))
    } else {
      // предлагаем логин из имени (транслит)
      setLogin(loginFromName(row.full_name || ''))
      setPass(genPassword())
      setRole(defaultRole)
    }
  }, [row.profile_id])

  async function createAccount() {
    if (!login.trim()) { setErr('Введите логин'); return }
    if (!pass || pass.length < 4) { setErr('Пароль минимум 4 символа'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      const needOffice = role === 'office_manager'
      await adminCreateAccount(kind, row.id, login.trim().toLowerCase(), pass, role, row.full_name, needOffice ? office : null)
      setMsg('Учётка создана')
      await onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function savePassword() {
    if (!pass || pass.length < 4) { setErr('Пароль минимум 4 символа'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      await adminSetPassword(row.profile_id, pass)
      setMsg('Пароль изменён'); setPass('')
      const d = await getAccountInfo(row.profile_id); setInfo(d)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function saveRole() {
    setBusy(true); setErr(''); setMsg('')
    try {
      const needOffice = role === 'office_manager'
      await adminSetRole(row.profile_id, role, needOffice ? office : null)
      setMsg('Доступ обновлён')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Профиль сотрудника</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{row.full_name}</div>
        {!hasAccount ? (
          <>
            <div style={{ background: '#fff7e6', border: '1px solid #f59e0b', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#78350f' }}>
              У сотрудника ещё нет входа в систему. Задайте логин, пароль и доступ.
            </div>
            <Field label="Логин"><input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="напр. ivanovi" style={inp} /></Field>
            <Field label="Пароль"><input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="пароль" style={inp} /></Field>
            <Field label="Доступ (роль)">
              <select value={role} onChange={(e) => setRole(e.target.value)} style={inp}>
                {ROLE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </Field>
            {kind === 'curators' && (
              <div style={{ background: C.brandSoft, borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 12.5, color: C.brand, lineHeight: 1.5 }}>
                Куратор входит как обычный «Преподаватель» — оставьте эту роль. Кабинет куратора
                откроется автоматически, потому что вход привязывается к карточке в разделе «Кураторы».
              </div>
            )}
            {role === 'office_manager' && (
              <Field label="Офис (для офис-менеджера)">
                <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
                  <option value="">— выберите —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            )}
            <button onClick={createAccount} disabled={busy} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', gap: 6, padding: 12, background: C.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
              <Check size={16} /> {busy ? 'Создание…' : 'Создать вход'}
            </button>
            {msg && <div style={{ color: C.ok, fontSize: 13, marginTop: 10, textAlign: 'center' }}>{msg}</div>}
            {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
          </>
        ) : !info ? <div style={{ color: C.slate, fontSize: 13, padding: 12 }}>Загрузка…</div> : (
          <>
            <div style={{ background: C.grey, borderRadius: 12, padding: 14, margin: '12px 0' }}>
              <div className="rowflex" style={{ gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.slate, width: 60 }}>Логин:</span>
                <b style={{ fontSize: 14, fontFamily: 'monospace' }}>{info.login}</b>
              </div>
              <div className="rowflex" style={{ gap: 8 }}>
                <span style={{ fontSize: 12, color: C.slate, width: 60 }}>Пароль:</span>
                <b style={{ fontSize: 14, fontFamily: 'monospace' }}>{info.password || '—'}</b>
              </div>
            </div>

            {/* смена пароля */}
            <Field label="Новый пароль">
              <div className="rowflex" style={{ gap: 8 }}>
                <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Введите новый пароль" style={inp} />
                <button onClick={savePassword} disabled={busy} style={{ padding: '10px 14px', background: C.brand, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Сменить</button>
              </div>
            </Field>

            {/* роль = доступ */}
            <Field label="Доступ (роль)">
              <select value={role} onChange={(e) => setRole(e.target.value)} style={inp}>
                {ROLE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </Field>
            {role === 'office_manager' && (
              <Field label="Офис (для офис-менеджера)">
                <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
                  <option value="">— выберите —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            )}
            <button onClick={saveRole} disabled={busy} className="rowflex"
              style={{ width: '100%', justifyContent: 'center', gap: 6, padding: 11, background: C.ink, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
              <ShieldCheck size={15} /> Сохранить доступ
            </button>

            {msg && <div style={{ color: C.ok, fontSize: 13, marginTop: 10, textAlign: 'center' }}>{msg}</div>}
            {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  )
}

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
