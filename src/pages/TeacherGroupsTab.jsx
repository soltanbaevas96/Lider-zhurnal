import React, { useEffect, useState } from 'react'
import { Users, Search, X, ArrowLeftRight, UserMinus, AlertTriangle, Plus } from 'lucide-react'
import { fetchMyGroupsAndSubjects, fetchStudentsOfGroup, searchStudentsQuick, addStudentToGroup, removeStudentFromGroup } from '../lib/api'
import { C } from '../lib/utils'

// «Управление» в кабинете преподавателя — работа со СВОИМИ группами
// (ТЗ «Управление группами и общее расписание в кабинете преподавателя»).
// Намеренно НЕ создаёт ни новых таблиц, ни новых RPC для чтения: список
// групп берётся через уже существующую teacher_groups (fetchMyGroupsAndSubjects
// — та же функция, что заполняет выбор группы в форме урока Журнала),
// состав группы — через уже существующую fetchStudentsOfGroup (та же,
// что использует AttendancePicker/ConductCard). Полные поля группы
// (предмет/офис/язык/класс) берутся из уже загруженного dict.groups —
// отдельный запрос не нужен.
//
// Преподаватель НЕ может: создать/удалить группу, создать/удалить
// ученика из базы, изменить карточку ученика, назначить себя на чужую
// группу — здесь нет ни одного элемента интерфейса для этого. Поиск
// при добавлении ищет только уже существующих в базе учеников
// (searchStudentsQuick) — «ученик не найден» показывается прямым
// текстом, никакого создания.
export default function TeacherGroupsTab({ teacher, dict }) {
  const [groupIds, setGroupIds] = useState(null)
  const [rosters, setRosters] = useState({}) // groupId -> [students]
  const [err, setErr] = useState('')
  const [openGroupId, setOpenGroupId] = useState(null)
  const [q, setQ] = useState('')

  async function load() {
    setErr('')
    try {
      const links = await fetchMyGroupsAndSubjects(teacher.id)
      const ids = links.groups.map((g) => g.id)
      setGroupIds(ids)
      const lists = await Promise.all(ids.map((id) => fetchStudentsOfGroup(id).catch(() => [])))
      const map = {}
      ids.forEach((id, i) => { map[id] = lists[i] })
      setRosters(map)
    } catch (e) { setErr(e.message || 'Не удалось загрузить группы') }
  }
  useEffect(() => { load() }, [teacher.id])

  // Полные карточки групп — из уже загруженного справочника, не новым
  // запросом; teacher_groups даёт только id/name, остальное не нужно
  // дублировать отдельной выборкой.
  const myGroups = (groupIds || [])
    .map((id) => (dict.groups || []).find((g) => g.id === id))
    .filter(Boolean)
  const filtered = myGroups.filter((g) => !q.trim() || (g.name || '').toLowerCase().includes(q.trim().toLowerCase()))
  const openGroup = myGroups.find((g) => g.id === openGroupId)

  if (openGroup) {
    return (
      <GroupRoster
        group={openGroup}
        myGroups={myGroups}
        students={rosters[openGroup.id] || []}
        onBack={() => setOpenGroupId(null)}
        onChanged={load}
      />
    )
  }

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Управление</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Мои группы</p>
        </div>
        <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 220 }}>
          <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск группы…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none' }} />
        </div>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {groupIds === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : myGroups.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>За вами пока не закреплено ни одной группы</div>
          <div style={{ fontSize: 13, color: C.slate }}>Закрепление групп за преподавателем делает завуч или методист.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, color: C.slate }}>
          По этому поиску групп нет.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map((g) => (
            <div key={g.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>{g.name}</div>
              <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3 }}>
                {(g.subject_name || '').split(' / ')[0]} · {g.office} · {g.lang}{g.grade ? ` · ${g.grade} кл` : ''}
              </div>
              <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6 }}>{(rosters[g.id] || []).length} учеников</div>
              <button onClick={() => setOpenGroupId(g.id)} className="rowflex"
                style={{ gap: 6, marginTop: 12, padding: '8px 14px', background: C.brand, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Users size={14} /> Ученики
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- СОСТАВ ГРУППЫ ----------
function GroupRoster({ group, myGroups, students, onBack, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [transferOf, setTransferOf] = useState(null)   // студент, которого переводим
  const [confirmRemove, setConfirmRemove] = useState(null) // студент на удаление из группы

  async function remove(studentId) {
    setBusy(true); setErr('')
    try { await removeStudentFromGroup(studentId, group.id); setConfirmRemove(null); await onChanged() }
    catch (e) { setErr(e.message || 'Не удалось убрать ученика') }
    finally { setBusy(false) }
  }

  // Перевод = убрать старую связь + добавить новую (существующие
  // примитивы, п.8-10 ТЗ) — сам ученик не создаётся и не удаляется,
  // проведённые занятия в старой группе никак не переписываются
  // (это факты по конкретным lesson, а не по членству в группе).
  async function transfer(studentId, newGroupId) {
    setBusy(true); setErr('')
    try {
      await removeStudentFromGroup(studentId, group.id)
      await addStudentToGroup(studentId, newGroupId)
      setTransferOf(null)
      await onChanged()
    } catch (e) { setErr(e.message || 'Не удалось перевести ученика') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <button onClick={onBack} className="rowflex"
        style={{ gap: 6, marginBottom: 14, background: 'none', border: 'none', color: C.slate, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        ← К моим группам
      </button>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{group.name}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            {(group.subject_name || '').split(' / ')[0]} · {group.office} · {group.lang}
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="rowflex"
          style={{ marginLeft: 'auto', gap: 6, padding: '9px 16px', background: C.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> Добавить ученика
        </button>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>{students.length} учеников</div>

      {students.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, color: C.slate }}>
          В группе пока нет учеников.
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          {students.map((s, i) => (
            <div key={s.id} className="rowflex" style={{ gap: 10, padding: '11px 15px', borderTop: i ? `1px solid ${C.line}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.full_name}</div>
                <div style={{ fontSize: 12, color: C.slate }}>{[s.school, s.grade ? `${s.grade} класс` : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <button onClick={() => setTransferOf(s)} className="rowflex" title="Перевести в другую группу"
                style={{ gap: 5, padding: '6px 11px', background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <ArrowLeftRight size={13} /> Перевести
              </button>
              <button onClick={() => setConfirmRemove(s)} title="Убрать из группы"
                style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: 6 }}>
                <UserMinus size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddStudentModal group={group} existingIds={students.map((s) => s.id)}
          onClose={() => setAddOpen(false)} onAdded={async () => { setAddOpen(false); await onChanged() }} />
      )}

      {transferOf && (
        <TransferModal student={transferOf} fromGroup={group} groups={myGroups.filter((g) => g.id !== group.id)}
          busy={busy} onClose={() => setTransferOf(null)}
          onConfirm={(newGroupId) => transfer(transferOf.id, newGroupId)} />
      )}

      {confirmRemove && (
        <RemoveConfirm student={confirmRemove} busy={busy}
          onCancel={() => setConfirmRemove(null)} onConfirm={() => remove(confirmRemove.id)} />
      )}
    </div>
  )
}

// ---------- ДОБАВИТЬ СУЩЕСТВУЮЩЕГО УЧЕНИКА ----------
function AddStudentModal({ group, existingIds, onClose, onAdded }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState(null) // { student, reasons } — несовпадение класса/языка (п.13 ТЗ)

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setFound([]); return }
    setSearching(true)
    const timer = setTimeout(() => {
      searchStudentsQuick(t).then(setFound).catch(() => setFound([])).finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  function mismatchOf(s) {
    const reasons = []
    if (group.grade && s.grade && String(s.grade) !== String(group.grade)) {
      reasons.push(`ученик ${s.grade} класс, группа ${group.grade} класс`)
    }
    return reasons
  }

  async function doAdd(studentId) {
    setBusy(true); setErr('')
    try { await addStudentToGroup(studentId, group.id); await onAdded() }
    catch (e) { setErr(e.message || 'Не удалось добавить ученика') }
    finally { setBusy(false) }
  }

  function tryAdd(s) {
    setErr(''); setWarn(null)
    // Дубль связи проверяем ДО запроса (п.7,25 ТЗ) — addStudentToGroup
    // сама по себе тоже не создаст вторую строку (see api.js), но так
    // пользователь сразу видит понятную причину, а не молчаливый no-op.
    if (existingIds.includes(s.id)) { setErr('Ученик уже состоит в этой группе.'); return }
    const reasons = mismatchOf(s)
    if (reasons.length) { setWarn({ student: s, reasons }); return }
    doAdd(s.id)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, maxHeight: '85vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Добавить ученика</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ФИО / телефон / школа…" autoFocus
            style={{ width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none' }} />
        </div>

        {searching && <div style={{ fontSize: 12, color: C.faint }}>Ищу…</div>}
        {!searching && q.trim().length >= 2 && found.length === 0 && (
          <div style={{ fontSize: 13, color: C.slate, padding: '10px 0', lineHeight: 1.5 }}>
            Ученик не найден в базе.<br />Создание нового ученика доступно только сотрудникам с соответствующими правами.
          </div>
        )}

        {!warn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {found.map((s) => (
              <div key={s.id} className="rowflex" style={{ gap: 10, padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.full_name}</div>
                  <div style={{ fontSize: 11.5, color: C.slate }}>{[s.school, s.grade ? `${s.grade} класс` : null, s.office].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => tryAdd(s)} disabled={busy}
                  style={{ padding: '6px 12px', background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Добавить
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#b91c1c' }}>
            <div className="rowflex" style={{ gap: 6, fontWeight: 700, marginBottom: 4 }}>
              <AlertTriangle size={14} /> {warn.student.full_name}: параметры не совпадают
            </div>
            {warn.reasons.map((r, i) => <div key={i}>· {r}</div>)}
            <div className="rowflex" style={{ gap: 8, marginTop: 8 }}>
              <button onClick={() => doAdd(warn.student.id)} disabled={busy}
                style={{ padding: '7px 12px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Всё равно добавить
              </button>
              <button onClick={() => setWarn(null)}
                style={{ padding: '7px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  )
}

// ---------- ПЕРЕВОД В ДРУГУЮ ГРУППУ ----------
function TransferModal({ student, fromGroup, groups, busy, onClose, onConfirm }) {
  const [target, setTarget] = useState('')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 65 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 420, padding: 24 }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Перевести ученика</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 12px' }}>
          <b style={{ color: C.ink }}>{student.full_name}</b> сейчас в группе <b>{fromGroup.name}</b>.
        </p>
        {/* Список групп для перевода — только СВОИ закреплённые группы
            (п.8 ТЗ: «видит только те группы, которыми имеет право
            управлять») — не полный справочник всех групп центра. */}
        {groups.length === 0 ? (
          <p style={{ fontSize: 13, color: C.slate }}>У вас нет других закреплённых групп для перевода.</p>
        ) : (
          <>
            <select value={target} onChange={(e) => setTarget(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, outline: 'none', marginBottom: 14 }}>
              <option value="">— выбрать группу —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={() => target && onConfirm(target)} disabled={!target || busy}
              style={{ width: '100%', padding: 12, background: target && !busy ? C.brand : C.line, color: '#fff', border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: target && !busy ? 'pointer' : 'default' }}>
              {busy ? 'Перевожу…' : 'Перевести'}
            </button>
          </>
        )}
        <p style={{ fontSize: 11, color: C.faint, marginTop: 10, textAlign: 'center' }}>
          Уже проведённые занятия ученика в старой группе не меняются.
        </p>
      </div>
    </div>
  )
}

// ---------- УБРАТЬ ИЗ ГРУППЫ ----------
function RemoveConfirm({ student, busy, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 65 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 400, padding: 24 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800 }}>Убрать ученика из группы?</h3>
        <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 16px', lineHeight: 1.6 }}>
          <b style={{ color: C.ink }}>{student.full_name}</b> останется в базе — его можно будет добавить в другую группу.
        </p>
        <div className="rowflex" style={{ gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, background: '#fff', color: C.slate, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            Отмена
          </button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: 11, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? '…' : 'Убрать из группы'}
          </button>
        </div>
      </div>
    </div>
  )
}
