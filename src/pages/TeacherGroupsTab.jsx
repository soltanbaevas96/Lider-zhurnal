import React, { useEffect, useMemo, useState } from 'react'
import { Users, Search, X, ArrowLeftRight, UserMinus, AlertTriangle, Plus } from 'lucide-react'
import {
  fetchAllStudentGroupLinks, fetchStudentsOfGroup, searchStudentsQuick,
  addStudentToGroup, removeStudentFromGroup, transferStudentGroup,
} from '../lib/api'
import { C, OFFICES } from '../lib/utils'

// «Управление» в кабинете преподавателя (ТЗ «Доработка личного кабинета
// преподавателя — группы + ученики + общее расписание»).
//
// ГЛАВНОЕ ОТЛИЧИЕ от первой версии этой вкладки: список групп — это
// ВСЕ группы CRM (dict.groups), а не только закреплённые за
// преподавателем в teacher_groups. ТЗ прямо это требует (п.3: «НЕ
// делать фильтрацию "только группы преподавателя" — это неправильно»)
// и явно проверяет тестом (п.27): группа должна быть видна и доступна
// для добавления ученика, даже если преподаватель её вообще не ведёт.
// Источник — существующий groups через уже загруженный dict, без
// нового запроса; добавление/перевод/удаление ученика — через RPC
// teacher_add_student_to_group / teacher_remove_student_from_group /
// teacher_move_student_to_group (миграция 77, проверка роли внутри).
//
// Преподаватель по-прежнему НЕ может: создать/удалить группу,
// создать/удалить ученика — в этой вкладке для этого физически нет ни
// одного элемента интерфейса.
export default function TeacherGroupsTab({ dict }) {
  const [links, setLinks] = useState(null) // [{student_id, group_id}] — для подсчёта учеников в списке групп
  const [err, setErr] = useState('')
  const [openGroupId, setOpenGroupId] = useState(null)

  const [q, setQ] = useState('')
  const [officeF, setOfficeF] = useState('all')
  const [langF, setLangF] = useState('all')
  const [gradeF, setGradeF] = useState('all')
  const [subjectF, setSubjectF] = useState('all')

  async function load() {
    setErr('')
    try { setLinks(await fetchAllStudentGroupLinks()) }
    catch (e) { setErr(e.message || 'Не удалось загрузить группы') }
  }
  useEffect(() => { load() }, [])

  const allGroups = (dict.groups || []).filter((g) => !g.archived)
  const countByGroup = useMemo(() => {
    const m = {}
    ;(links || []).forEach((l) => { m[l.group_id] = (m[l.group_id] || 0) + 1 })
    return m
  }, [links])

  const subjectOptions = useMemo(
    () => [...new Set(allGroups.map((g) => (g.subject_name || '').split(' / ')[0]).filter(Boolean))].sort(),
    [allGroups]
  )
  const gradeOptions = useMemo(
    () => [...new Set(allGroups.map((g) => g.grade).filter(Boolean))].sort(),
    [allGroups]
  )

  // Фильтрация целиком на клиенте, по уже один раз загруженным группам
  // (п.4 ТЗ: «фильтры должны работать быстро и не загружать все данные
  // повторно при каждом клике») — второго запроса на каждый клик фильтра нет.
  const filtered = allGroups.filter((g) => {
    if (officeF !== 'all' && g.office !== officeF) return false
    if (langF !== 'all' && g.lang !== langF) return false
    if (gradeF !== 'all' && g.grade !== gradeF) return false
    if (subjectF !== 'all' && (g.subject_name || '').split(' / ')[0] !== subjectF) return false
    const t = q.trim().toLowerCase()
    return !t || (g.name || '').toLowerCase().includes(t)
  }).sort((a, b) => a.name.localeCompare(b.name))

  const openGroup = allGroups.find((g) => g.id === openGroupId)

  if (openGroup) {
    return <GroupRoster group={openGroup} allGroups={allGroups} onBack={() => setOpenGroupId(null)} onChanged={load} />
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Управление</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Все группы центра — {allGroups.length}</p>
      </div>

      <div className="rowflex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={officeF} onChange={(e) => setOfficeF(e.target.value)} style={selSty}>
          <option value="all">Все офисы</option>
          {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={langF} onChange={(e) => setLangF(e.target.value)} style={selSty}>
          <option value="all">Любой язык</option>
          <option value="каз">Казахский</option>
          <option value="рус">Русский</option>
        </select>
        <select value={gradeF} onChange={(e) => setGradeF(e.target.value)} style={selSty}>
          <option value="all">Любой класс</option>
          {gradeOptions.map((g) => <option key={g} value={g}>{g} класс</option>)}
        </select>
        {subjectOptions.length > 1 && (
          <select value={subjectF} onChange={(e) => setSubjectF(e.target.value)} style={selSty}>
            <option value="all">Любой предмет</option>
            {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск группы…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {links === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, color: C.slate }}>
          По этому фильтру групп нет.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {filtered.map((g) => (
            <div key={g.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(g.subject_name || '').split(' / ')[0] || '—'} · {g.office || '—'} · {g.lang || '—'}
              </div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>{countByGroup[g.id] || 0} учеников</div>
              <button onClick={() => setOpenGroupId(g.id)} className="rowflex"
                style={{ gap: 6, marginTop: 11, padding: '7px 13px', background: C.brand, color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <Users size={13} /> Ученики
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- СОСТАВ ГРУППЫ ----------
function GroupRoster({ group, allGroups, onBack, onChanged }) {
  const [students, setStudents] = useState(null) // null = загрузка
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [transferOf, setTransferOf] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)

  async function loadRoster() {
    setErr('')
    try { setStudents(await fetchStudentsOfGroup(group.id)) }
    catch (e) { setErr(e.message || 'Не удалось загрузить состав группы'); setStudents([]) }
  }
  // Состав загружается только при открытии ИМЕННО этой группы (лениво)
  // — со всеми группами центра сразу тянуть полный состав каждой было
  // бы медленно и не нужно (п.4 ТЗ про быстрые фильтры).
  useEffect(() => { loadRoster() }, [group.id])

  async function remove(studentId) {
    setBusy(true); setErr('')
    try { await removeStudentFromGroup(studentId, group.id); setConfirmRemove(null); await loadRoster(); await onChanged() }
    catch (e) { setErr(e.message || 'Не удалось убрать ученика') }
    finally { setBusy(false) }
  }

  async function transfer(studentId, newGroupId) {
    setBusy(true); setErr('')
    try {
      await transferStudentGroup(studentId, group.id, newGroupId)
      setTransferOf(null)
      await loadRoster(); await onChanged()
    } catch (e) { setErr(e.message || 'Не удалось перевести ученика') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <button onClick={onBack} className="rowflex"
        style={{ gap: 6, marginBottom: 14, background: 'none', border: 'none', color: C.slate, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        ← Ко всем группам
      </button>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{group.name}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>
            {(group.subject_name || '').split(' / ')[0] || '—'} · {group.office || '—'} · {group.lang || '—'}{group.grade ? ` · ${group.grade} класс` : ''}
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="rowflex"
          style={{ marginLeft: 'auto', gap: 6, padding: '9px 16px', background: C.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> Добавить ученика
        </button>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {students === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : (
        <>
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
                    <div style={{ fontSize: 12, color: C.slate }}>{[s.school, s.grade ? `${s.grade} класс` : null, s.phone].filter(Boolean).join(' · ') || '—'}</div>
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
        </>
      )}

      {addOpen && (
        <AddStudentModal group={group} existingIds={(students || []).map((s) => s.id)}
          onClose={() => setAddOpen(false)} onAdded={async () => { setAddOpen(false); await loadRoster(); await onChanged() }} />
      )}

      {transferOf && (
        <TransferModal student={transferOf} fromGroup={group} groups={allGroups.filter((g) => g.id !== group.id)}
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
  const [warn, setWarn] = useState(null) // { student, reasons } — несовпадение класса (п. про предупреждение)

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
    // Дубль связи проверяем сразу по уже загруженному составу — RPC
    // (миграция 77) и так идемпотентна (ON CONFLICT DO NOTHING), но
    // так пользователь сразу видит понятную причину, а не молчаливый no-op.
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
            style={{ width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }} />
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
  const [q, setQ] = useState('')
  const [target, setTarget] = useState('')
  // Групп в центре может быть много (все группы CRM, не только свои) —
  // даём быстрый поиск по названию вместо одного длинного select.
  const filtered = groups.filter((g) => !q.trim() || (g.name || '').toLowerCase().includes(q.trim().toLowerCase()))
  const targetGroup = groups.find((g) => g.id === target)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 65 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 420, padding: 24, maxHeight: '85vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Перевести ученика</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 12px' }}>
          <b style={{ color: C.ink }}>{student.full_name}</b> сейчас в группе <b>{fromGroup.name}</b>.
        </p>

        <input value={q} onChange={(e) => { setQ(e.target.value); setTarget('') }} placeholder="Поиск группы…"
          style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13.5, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
        <div style={{ maxHeight: 220, overflow: 'auto', border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 14 }}>
          {filtered.slice(0, 100).map((g) => (
            <div key={g.id} onClick={() => setTarget(g.id)}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderTop: `1px solid ${C.line}`, background: target === g.id ? C.brandSoft : '#fff', color: target === g.id ? C.brand : C.ink, fontWeight: target === g.id ? 700 : 400 }}>
              {g.name}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: C.faint }}>Группы не найдены</div>}
        </div>

        {targetGroup && (
          <p style={{ fontSize: 13, color: C.ink, margin: '0 0 12px' }}>
            Перевести ученика из группы <b>{fromGroup.name}</b> в группу <b>{targetGroup.name}</b>?
          </p>
        )}
        <button onClick={() => target && onConfirm(target)} disabled={!target || busy}
          style={{ width: '100%', padding: 12, background: target && !busy ? C.brand : C.line, color: '#fff', border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: target && !busy ? 'pointer' : 'default' }}>
          {busy ? 'Перевожу…' : 'Перевести'}
        </button>
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

const selSty = { padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12.5, outline: 'none', background: '#fff' }
