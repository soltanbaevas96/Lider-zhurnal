import React, { useEffect, useMemo, useState } from 'react'
import {
  Users, Layers, CalendarClock, LayoutDashboard, Search, Plus, X, Check, AlertTriangle, UserMinus, Building2,
} from 'lucide-react'
import {
  fetchStudentsWithGroups, fetchAllGroups, createGroup, updateGroup,
  addStudent, updateStudent, addStudentToGroup, removeStudentFromGroup,
  findStudentsByName, fetchScheduleSlots,
} from '../lib/api'
import { C, initials, avColorByIndex, OFFICES, todayStr } from '../lib/utils'
import { Stat, Field, inp, Spinner } from '../components/ui'
import DataTable from '../components/DataTable'
import Schedule from './Schedule'

// Класс группы читаем из её же кода (все коды центра начинаются с номера
// класса — "10 КМБ-1", "11РМФ-2" и т.д.) — отдельного поля grade у groups
// нет, и заводить его не нужно (п.24 общего ТЗ про офисы — не плодить
// архитектуру там, где хватает существующих данных).
const gradeOfGroup = (name) => (String(name || '').match(/^(\d{1,2})/) || [])[1] || null

const WD_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Методист по решению владельца видит и редактирует ВСЕ офисы разом —
// фильтр «Офис» ниже это просто удобный переключатель контекста
// (какие данные показывать/куда по умолчанию создавать новое), а не
// ограничение доступа: доступ ко всем офисам уже разрешён на уровне
// RLS (миграция 62), «Все офисы» тут всегда доступны.
export default function MethodistCabinet({ dict, onOpenStudent }) {
  const [tab, setTab] = useState('overview')
  const [officeFilter, setOfficeFilter] = useState('all')
  const [students, setStudents] = useState(null)
  const [groups, setGroups] = useState(null)
  const [slots, setSlots] = useState(null)
  const [err, setErr] = useState('')

  async function reload() {
    try {
      const [st, gr, sl] = await Promise.all([
        fetchStudentsWithGroups(),
        fetchAllGroups(),
        fetchScheduleSlots(officeFilter === 'all' ? undefined : officeFilter).catch(() => []),
      ])
      setStudents(st); setGroups(gr); setSlots(sl)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [officeFilter])

  const officeStudents = useMemo(
    () => (students || []).filter((s) => officeFilter === 'all' || s.office === officeFilter),
    [students, officeFilter]
  )
  const officeGroups = useMemo(
    () => (groups || []).filter((g) => officeFilter === 'all' || g.office === officeFilter),
    [groups, officeFilter]
  )

  const tabs = [
    { k: 'overview', t: 'Обзор', icon: LayoutDashboard },
    { k: 'students', t: 'Ученики', icon: Users },
    { k: 'groups', t: 'Группы', icon: Layers },
    { k: 'schedule', t: 'Расписание', icon: CalendarClock },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Методист</h1>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: C.slate }}>Все офисы центра</p>
        <div className="rowflex" style={{ gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
          {['all', ...OFFICES].map((o) => {
            const on = officeFilter === o
            return (
              <button key={o} onClick={() => setOfficeFilter(o)} className="rowflex"
                style={{ gap: 6, padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
                <Building2 size={13} /> {o === 'all' ? 'Все офисы' : o}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {tabs.map((o) => {
            const on = tab === o.k
            const Icon = o.icon
            return (
              <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
                style={{ gap: 6, padding: '9px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                  background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
                <Icon size={15} /> {o.t}
              </button>
            )
          })}
        </div>
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 11, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {students === null ? <Spinner /> : tab === 'overview' ? (
        <OverviewTab students={officeStudents} groups={officeGroups} slots={slots || []}
          onOpenTab={setTab} />
      ) : tab === 'students' ? (
        <StudentsTab officeFilter={officeFilter} students={officeStudents} groups={officeGroups}
          onOpenStudent={onOpenStudent} onChanged={reload} />
      ) : tab === 'groups' ? (
        <GroupsTab officeFilter={officeFilter} groups={officeGroups} students={officeStudents} onChanged={reload} />
      ) : (
        <Schedule dict={dict} isAdmin={false} canEdit lockedOffice={officeFilter === 'all' ? null : officeFilter} />
      )}
    </div>
  )
}

// ==================== ОБЗОР ====================
function OverviewTab({ office, students, groups, slots, onOpenTab }) {
  const todayWd = new Date().getDay() === 0 ? 7 : new Date().getDay()
  const today = todayStr()
  const todaySlots = slots.filter((s) => s.weekday === todayWd && s.active_from <= today && (!s.active_to || s.active_to >= today) && (s.status === 'confirmed' || s.status === 'confirmed_special'))
  const withoutGroup = students.filter((s) => !s.groupsData || s.groupsData.length === 0)
  const grade10 = groups.filter((g) => gradeOfGroup(g.name) === '10').length
  const grade11 = groups.filter((g) => gradeOfGroup(g.name) === '11').length
  const kaz = groups.filter((g) => g.lang === 'каз').length
  const rus = groups.filter((g) => g.lang === 'рус').length
  const overfilled = groups.filter((g) => (g.studentsCount ?? countIn(students, g.id)) > (g.capacity || 13))
  const low = groups.filter((g) => (g.studentsCount ?? countIn(students, g.id)) > 0 && (g.studentsCount ?? countIn(students, g.id)) < 5)
  const teachersToday = new Set(todaySlots.map((s) => s.teacher_id).filter(Boolean)).size

  return (
    <div>
      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat icon={Users} label="Учеников" value={students.length} tint={C.brand} bg={C.brandSoft} />
        <Stat icon={Layers} label="Групп" value={groups.length} tint="#0d9488" bg="#e0f5f2" />
        <Stat icon={CalendarClock} label="Занятий сегодня" value={todaySlots.length} tint="#c2410c" bg="#fdece1" />
        <Stat icon={Users} label="Преподавателей сегодня" value={teachersToday} tint="#7c3aed" bg="#efe6fd" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 16 }}>
        <Panel title="Группы">
          <Row label="10 класс" value={grade10} />
          <Row label="11 класс" value={grade11} />
          <Row label="Казахские" value={kaz} />
          <Row label="Русские" value={rus} />
          <Row label="Почти пустые (< 5 учеников)" value={low.length} warn={low.length > 0} />
          <Row label="Переполнены" value={overfilled.length} warn={overfilled.length > 0} />
        </Panel>
        <Panel title="Ученики">
          <Row label="Всего" value={students.length} />
          <Row label="Без группы" value={withoutGroup.length} warn={withoutGroup.length > 0}
            onClick={withoutGroup.length ? () => onOpenTab('students') : undefined} />
        </Panel>
        <Panel title="Расписание сегодня">
          {todaySlots.length === 0 ? (
            <div style={{ fontSize: 13, color: C.faint }}>Занятий не запланировано</div>
          ) : todaySlots.slice(0, 6).map((s) => (
            <div key={s.id} className="rowflex" style={{ gap: 8, fontSize: 12.5, padding: '5px 0', borderBottom: `1px solid ${C.line}` }}>
              <b>{(s.start_time || '').slice(0, 5)}</b>
              <span>{s.group_name || '—'}</span>
              <span style={{ marginLeft: 'auto', color: C.slate }}>{s.teacher_name || '—'}</span>
            </div>
          ))}
          {todaySlots.length > 6 && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>…ещё {todaySlots.length - 6}</div>}
        </Panel>
      </div>

      {withoutGroup.length > 0 && (
        <Warn onClick={() => onOpenTab('students')}>Требуют распределения: {withoutGroup.length} учеников</Warn>
      )}
      {low.length > 0 && (
        <Warn onClick={() => onOpenTab('groups')}>Группы почти пустые (меньше 5 учеников): {low.length}</Warn>
      )}
      {overfilled.length > 0 && (
        <Warn onClick={() => onOpenTab('groups')}>Группы переполнены: {overfilled.length}</Warn>
      )}

      <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
        <QuickBtn onClick={() => onOpenTab('groups')} icon={Plus} text="Создать группу" />
        <QuickBtn onClick={() => onOpenTab('students')} icon={Plus} text="Добавить ученика" />
        <QuickBtn onClick={() => onOpenTab('schedule')} icon={CalendarClock} text="Открыть расписание" />
      </div>
    </div>
  )
}
function countIn(students, groupId) {
  return students.filter((s) => (s.groupIds || []).includes(groupId)).length
}
function Panel({ title, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ label, value, warn, onClick }) {
  return (
    <div onClick={onClick} className="rowflex" style={{ gap: 8, fontSize: 12.5, padding: '5px 0', cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ color: C.slate }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontWeight: 800, color: warn ? '#c2410c' : C.ink }}>{value}</span>
    </div>
  )
}
function Warn({ children, onClick }) {
  return (
    <div onClick={onClick} className="rowflex" style={{ gap: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 11, padding: '10px 13px', marginBottom: 8, fontSize: 13, fontWeight: 600, cursor: onClick ? 'pointer' : 'default' }}>
      <AlertTriangle size={15} /> {children}
    </div>
  )
}
function QuickBtn({ onClick, icon: Icon, text }) {
  return (
    <button onClick={onClick} className="rowflex"
      style={{ gap: 6, padding: '9px 15px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.brand, cursor: 'pointer' }}>
      <Icon size={15} /> {text}
    </button>
  )
}

// ==================== УЧЕНИКИ ====================
function StudentsTab({ officeFilter, students, groups, onOpenStudent, onChanged }) {
  const [q, setQ] = useState('')
  const [langFilter, setLangFilter] = useState('all')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [onlyWithoutGroup, setOnlyWithoutGroup] = useState(false)
  const [modal, setModal] = useState(null) // 'new' | { row }

  const filtered = students.filter((s) => {
    if (langFilter !== 'all' && s.lang !== langFilter) return false
    if (gradeFilter !== 'all' && String(s.grade) !== gradeFilter) return false
    if (groupFilter !== 'all' && !(s.groupIds || []).includes(groupFilter)) return false
    if (onlyWithoutGroup && (s.groupsData || []).length > 0) return false
    const t = q.toLowerCase().trim()
    if (!t) return true
    return (s.full_name || '').toLowerCase().includes(t) || (s.school || '').toLowerCase().includes(t)
      || (s.phone || '').includes(t) || (s.contract_no || '').toLowerCase().includes(t) || (s.parent_name || '').toLowerCase().includes(t)
  })

  const grades = [...new Set(students.map((s) => s.grade).filter(Boolean))].sort()

  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => (
      <div className="rowflex" style={{ gap: 10 }}>
        <div className="av" style={{ width: 28, height: 28, fontSize: 11, background: avColorByIndex(s._i || 0) }}>{initials(s.full_name)}</div>
        <span onClick={(e) => { if (onOpenStudent) { e.stopPropagation(); onOpenStudent(s.id) } }}
          style={{ fontWeight: 600, color: C.brand, cursor: onOpenStudent ? 'pointer' : 'default' }}>{s.full_name}</span>
      </div>
    )},
    { key: 'school', label: 'Школа', width: 90, render: (s) => s.school || '—' },
    { key: 'grade', label: 'Класс', width: 60, render: (s) => s.grade || '—' },
    { key: 'lang', label: 'Язык', width: 70, render: (s) => s.lang || '—' },
    ...(officeFilter === 'all' ? [{ key: 'office', label: 'Офис', width: 110, render: (s) => s.office || '—' }] : []),
    { key: 'groups', label: 'Группы', render: (s) => s.groupsData?.length
      ? s.groupsData.map((g) => g.name).join(', ')
      : <span style={{ color: '#c2410c', fontWeight: 600 }}>без группы</span> },
    { key: 'phone', label: 'Телефон', width: 130, render: (s) => s.phone || '—' },
    { key: 'edit', label: '', width: 44, sortable: false, render: (s) => (
      <button onClick={(e) => { e.stopPropagation(); setModal({ row: s }) }}
        style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }} title="Управление группами">✎</button>
    )},
  ]

  return (
    <div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="search-box" style={{ minWidth: 220 }}>
          <Search size={15} color={C.slate} style={{ position: 'absolute', left: 11, top: 9 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: ФИО, школа, телефон, договор…" />
        </div>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={{ ...inp, width: 130 }}>
          <option value="all">Любой язык</option>
          <option value="каз">Казахский</option>
          <option value="рус">Русский</option>
        </select>
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ ...inp, width: 110 }}>
          <option value="all">Любой класс</option>
          {grades.map((g) => <option key={g} value={g}>{g} класс</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ ...inp, width: 160 }}>
          <option value="all">Любая группа</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label className="rowflex" style={{ gap: 6, fontSize: 12.5, color: C.slate, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyWithoutGroup} onChange={(e) => setOnlyWithoutGroup(e.target.checked)} /> Без группы
        </label>
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ marginLeft: 'auto', gap: 7, padding: '9px 16px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Добавить ученика
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Найдено: <b>{filtered.length}</b></div>
      <DataTable columns={columns} rows={filtered.map((s, i) => ({ ...s, _i: i }))} pageSize={30} />

      {modal && (
        <MethodistStudentModal
          defaultOffice={officeFilter !== 'all' ? officeFilter : OFFICES[0]}
          groups={groups} row={modal === 'new' ? null : modal.row}
          onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged() }}
        />
      )}
    </div>
  )
}

// Карточка ученика методиста: организационные поля + управление группами
// с проверкой соответствия класс/офис/язык (п.12-15 ТЗ методиста).
function MethodistStudentModal({ defaultOffice, groups, row, onClose, onDone }) {
  const isNew = !row
  const [name, setName] = useState(row?.full_name || '')
  const [school, setSchool] = useState(row?.school || '')
  const [grade, setGrade] = useState(row?.grade || '')
  const [office, setOffice] = useState(row?.office || defaultOffice || OFFICES[0])
  const [lang, setLang] = useState(row?.lang || 'каз')
  const [phone, setPhone] = useState(row?.phone || '')
  const [parentPhone, setParentPhone] = useState(row?.parent_phone || '')
  const [parentName, setParentName] = useState(row?.parent_name || '')
  const [contractNo, setContractNo] = useState(row?.contract_no || '')
  const [note, setNote] = useState(row?.note || '')
  const [groupIds, setGroupIds] = useState(row?.groupIds || [])
  const [addGroupId, setAddGroupId] = useState('')
  const [pendingWarn, setPendingWarn] = useState(null) // группа, которую пытаются добавить с несовпадением
  const [dupWarning, setDupWarning] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = name.trim()

  useEffect(() => {
    const n = name.trim()
    if (n.length < 3) { setDupWarning([]); return }
    const t = setTimeout(() => { findStudentsByName(n, row?.id).then(setDupWarning).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [name, row?.id])

  const currentGroups = groups.filter((g) => groupIds.includes(g.id))
  const availableGroups = groups.filter((g) => !groupIds.includes(g.id))

  function mismatchOf(g) {
    const reasons = []
    const gg = gradeOfGroup(g.name)
    if (grade && gg && String(grade).trim() !== gg) reasons.push(`класс группы ${gg}, у ученика ${grade}`)
    if (lang && g.lang && lang !== g.lang) reasons.push(`язык группы «${g.lang}», у ученика «${lang}»`)
    if (office && g.office && office !== g.office) reasons.push(`офис группы «${g.office}», у ученика «${office}»`)
    return reasons
  }

  function tryAddGroup(id) {
    const g = groups.find((x) => x.id === id)
    if (!g) return
    const reasons = mismatchOf(g)
    if (reasons.length) { setPendingWarn({ group: g, reasons }); return }
    setGroupIds((p) => [...p, id]); setAddGroupId('')
  }
  function confirmAddAnyway() {
    if (!pendingWarn) return
    setGroupIds((p) => [...p, pendingWarn.group.id])
    setPendingWarn(null); setAddGroupId('')
  }
  function removeGroup(id) {
    setGroupIds((p) => p.filter((x) => x !== id))
  }

  async function save() {
    if (!name.trim()) { setErr('Введите ФИО'); return }
    setBusy(true); setErr('')
    try {
      const contact = `${office} · ${lang}`
      const fields = {
        full_name: name.trim(), contact, school: school.trim() || null, grade: grade.trim() || null,
        office, lang: lang || null, phone: phone.trim() || null, parent_phone: parentPhone.trim() || null,
        parent_name: parentName.trim() || null, contract_no: contractNo.trim() || null, note: note.trim() || null,
      }
      if (row) await updateStudent(row.id, fields, groupIds)
      else await addStudent(fields, groupIds)
      onDone()
    } catch (e) { setErr(e.message || 'Не удалось сохранить'); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 520, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isNew ? 'Новый ученик' : 'Ученик'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        <Field label="ФИО ученика"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus /></Field>
        {dupWarning.length > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 14 }}>
            Уже есть {dupWarning.length === 1 ? 'ученик' : 'ученики'} с таким именем — проверьте, не заведён ли он уже.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Школа"><input value={school} onChange={(e) => setSchool(e.target.value)} style={inp} /></Field>
          <div style={{ width: 90 }}><Field label="Класс"><input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="10" style={inp} /></Field></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Офис">
            <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
              {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Язык">
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={inp}>
              <option value="каз">Казахский</option>
              <option value="рус">Русский</option>
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Телефон ученика"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} /></Field>
          <Field label="Телефон родителя"><input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} style={inp} /></Field>
        </div>
        <Field label="ФИ родителя"><input value={parentName} onChange={(e) => setParentName(e.target.value)} style={inp} /></Field>
        <Field label="Номер договора"><input value={contractNo} onChange={(e) => setContractNo(e.target.value)} style={inp} /></Field>
        <Field label="Примечание"><input value={note} onChange={(e) => setNote(e.target.value)} style={inp} /></Field>

        <div style={{ fontSize: 12, color: C.slate, fontWeight: 700, marginTop: 6, marginBottom: 8 }}>Группы</div>
        {currentGroups.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 10 }}>Ученик пока не состоит ни в одной группе</div>
        ) : currentGroups.map((g) => (
          <div key={g.id} className="rowflex" style={{ gap: 8, padding: '7px 10px', background: C.grey, borderRadius: 9, marginBottom: 6, fontSize: 13 }}>
            <b>{g.name}</b>
            <span style={{ color: C.slate, fontSize: 11.5 }}>{(g.subject_name || '').split(' / ')[0]}</span>
            <button onClick={() => removeGroup(g.id)} title="Убрать из группы"
              style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex' }}>
              <UserMinus size={15} />
            </button>
          </div>
        ))}

        <div className="rowflex" style={{ gap: 8, marginTop: 8 }}>
          <select value={addGroupId} onChange={(e) => setAddGroupId(e.target.value)} style={{ ...inp, flex: 1 }}>
            <option value="">— выбрать группу —</option>
            {availableGroups.map((g) => <option key={g.id} value={g.id}>{g.name} · {(g.subject_name || '').split(' / ')[0]}</option>)}
          </select>
          <button onClick={() => addGroupId && tryAddGroup(addGroupId)} disabled={!addGroupId}
            style={{ padding: '10px 16px', background: addGroupId ? C.brand : C.line, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: addGroupId ? 'pointer' : 'default' }}>
            Добавить
          </button>
        </div>

        {pendingWarn && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 13px', marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>
            <div className="rowflex" style={{ gap: 6, fontWeight: 700, marginBottom: 4 }}><AlertTriangle size={14} /> Параметры ученика не соответствуют параметрам группы</div>
            {pendingWarn.reasons.map((r, i) => <div key={i}>· {r}</div>)}
            <div className="rowflex" style={{ gap: 8, marginTop: 8 }}>
              <button onClick={confirmAddAnyway} style={{ padding: '7px 12px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Всё равно добавить</button>
              <button onClick={() => setPendingWarn(null)} style={{ padding: '7px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        )}

        {err && <div style={{ color: '#c2360b', fontSize: 13, margin: '10px 0' }}>{err}</div>}
        <button disabled={!valid || busy} onClick={save} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: 12, gap: 7, background: valid && !busy ? C.brand : C.line, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: valid && !busy ? 'pointer' : 'default' }}>
          <Check size={17} /> {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
        <p style={{ fontSize: 11, color: C.faint, marginTop: 10, textAlign: 'center' }}>
          Убрать ученика из группы можно кнопкой рядом с группой — сам ученик из базы не удаляется.
        </p>
      </div>
    </div>
  )
}

// ==================== ГРУППЫ ====================
function GroupsTab({ officeFilter, groups, students, onChanged }) {
  const [q, setQ] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [langFilter, setLangFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [rosterOf, setRosterOf] = useState(null)

  const countIn = (groupId) => students.filter((s) => (s.groupIds || []).includes(groupId)).length

  const grades = [...new Set(groups.map((g) => gradeOfGroup(g.name)).filter(Boolean))].sort()
  const filtered = groups.filter((g) => {
    if (gradeFilter !== 'all' && gradeOfGroup(g.name) !== gradeFilter) return false
    if (langFilter !== 'all' && g.lang !== langFilter) return false
    const t = q.toLowerCase().trim()
    return !t || (g.name || '').toLowerCase().includes(t) || (g.subject_name || '').toLowerCase().includes(t)
  })

  const columns = [
    { key: 'name', label: 'Группа', render: (g) => <b onClick={(e) => { e.stopPropagation(); setRosterOf(g) }} style={{ cursor: 'pointer', color: C.brand }}>{g.name}</b> },
    ...(officeFilter === 'all' ? [{ key: 'office', label: 'Офис', width: 110, render: (g) => g.office || '—' }] : []),
    { key: 'grade', label: 'Класс', width: 60, render: (g) => gradeOfGroup(g.name) || '—' },
    { key: 'subject_name', label: 'Предмет', render: (g) => (g.subject_name || '—').split(' / ')[0] },
    { key: 'lang', label: 'Язык', width: 80, render: (g) => g.lang || '—' },
    { key: 'fill', label: 'Ученики', width: 110, render: (g) => {
      const n = countIn(g.id); const cap = g.capacity || 13
      return <span style={{ fontWeight: 700, color: n > cap ? '#dc2626' : n === 0 ? C.faint : C.ink }}>{n} / {cap}</span>
    }},
    { key: 'edit', label: '', width: 44, sortable: false, render: (g) => (
      <button onClick={(e) => { e.stopPropagation(); setModal({ row: g }) }}
        style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }} title="Редактировать">✎</button>
    )},
  ]

  return (
    <div>
      <div className="rowflex" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="search-box" style={{ minWidth: 200 }}>
          <Search size={15} color={C.slate} style={{ position: 'absolute', left: 11, top: 9 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск группы / предмета…" />
        </div>
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ ...inp, width: 110 }}>
          <option value="all">Любой класс</option>
          {grades.map((g) => <option key={g} value={g}>{g} класс</option>)}
        </select>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={{ ...inp, width: 130 }}>
          <option value="all">Любой язык</option>
          <option value="каз">Казахский</option>
          <option value="рус">Русский</option>
        </select>
        <button onClick={() => setModal('new')} className="rowflex"
          style={{ marginLeft: 'auto', gap: 7, padding: '9px 16px', background: C.brand, color: '#fff', borderRadius: 11, fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Создать группу
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Групп: <b>{filtered.length}</b></div>
      <DataTable columns={columns} rows={filtered} pageSize={40} />

      {modal && (
        <MethodistGroupModal defaultOffice={officeFilter !== 'all' ? officeFilter : OFFICES[0]} row={modal === 'new' ? null : modal.row}
          onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged() }} />
      )}
      {rosterOf && (
        <GroupRosterModal group={rosterOf} allStudents={students}
          onClose={() => setRosterOf(null)} onChanged={onChanged} />
      )}
    </div>
  )
}

function MethodistGroupModal({ defaultOffice, row, onClose, onDone }) {
  const [name, setName] = useState(row?.name || '')
  const [subject, setSubject] = useState(row?.subject_name || '')
  const [office, setOffice] = useState(row?.office || defaultOffice || OFFICES[0])
  const [lang, setLang] = useState(row?.lang || 'каз')
  const [capacity, setCapacity] = useState(String(row?.capacity || 13))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!name.trim()) { setErr('Введите название группы'); return }
    setBusy(true); setErr('')
    try {
      const fields = {
        name: name.trim(), subject_name: subject.trim() || null, office, lang, capacity: Number(capacity) || 13,
        note: `${subject.trim()} · ${office} · ${lang}`,
      }
      if (row) await updateGroup(row.id, fields)
      else await createGroup(fields)
      onDone()
    } catch (e) {
      const m = e.message || ''
      setErr(/duplicate|unique/i.test(m) ? 'Такая группа уже существует в этом офисе. Проверьте список групп.' : (m || 'Не удалось сохранить'))
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 460, padding: 24 }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{row ? 'Редактировать группу' : 'Новая группа'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>
        <Field label="Название (код группы)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. 10 КМБ-1" style={inp} autoFocus /></Field>
        <Field label="Предмет"><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="напр. Математика" style={inp} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Офис">
            <select value={office} onChange={(e) => setOffice(e.target.value)} style={inp}>
              {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Язык">
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={inp}>
              <option value="каз">Казахский</option>
              <option value="рус">Русский</option>
            </select>
          </Field>
          <div style={{ width: 110 }}><Field label="Вместимость"><input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={inp} /></Field></div>
        </div>
        <p style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
          Преподавателя и кабинет назначают во вкладке «Расписание» — там, где создаётся сам слот занятий.
        </p>
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <button onClick={save} disabled={busy} className="rowflex"
          style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: 12, gap: 7, background: C.brand, color: '#fff', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          <Check size={17} /> {busy ? '…' : (row ? 'Сохранить' : 'Создать')}
        </button>
      </div>
    </div>
  )
}

// Состав группы: список учеников + добавление/удаление (п.18-20 ТЗ).
function GroupRosterModal({ group, allStudents, onClose, onChanged }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inGroup = allStudents.filter((s) => (s.groupIds || []).includes(group.id))
  // предлагаем добавить только учеников ТОГО ЖЕ офиса, что и группа —
  // иначе при просмотре «Все офисы» тут перемешались бы все ученики центра.
  const notInGroup = allStudents.filter((s) => !(s.groupIds || []).includes(group.id) && s.office === group.office)
    .filter((s) => {
      const t = q.toLowerCase().trim()
      return !t || (s.full_name || '').toLowerCase().includes(t)
    })

  async function add(studentId) {
    setBusy(true); setErr('')
    try { await addStudentToGroup(studentId, group.id); await onChanged() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function remove(studentId) {
    setBusy(true); setErr('')
    try { await removeStudentFromGroup(studentId, group.id); await onChanged() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 65 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 560, padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{group.name}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14 }}>
          {(group.subject_name || '').split(' / ')[0]} · {group.office} · {group.lang} · вместимость {group.capacity || 13}
        </div>
        {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 10, borderRadius: 9, marginBottom: 10, fontSize: 13 }}>{err}</div>}

        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Ученики в группе ({inGroup.length})</div>
        <div style={{ marginBottom: 16 }}>
          {inGroup.length === 0 ? <div style={{ fontSize: 12.5, color: C.faint }}>Пока никого</div> : inGroup.map((s) => (
            <div key={s.id} className="rowflex" style={{ gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span>{s.full_name}</span>
              <span style={{ color: C.faint, fontSize: 11.5 }}>{s.school || ''}</span>
              <button onClick={() => remove(s.id)} disabled={busy} title="Убрать из группы"
                style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex' }}>
                <UserMinus size={15} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Добавить ученика</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО…" style={{ ...inp, marginBottom: 8 }} />
        <div style={{ maxHeight: 220, overflow: 'auto' }}>
          {notInGroup.slice(0, 50).map((s) => (
            <div key={s.id} className="rowflex" style={{ gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span>{s.full_name}</span>
              <span style={{ color: C.faint, fontSize: 11.5 }}>{s.grade ? `${s.grade} класс` : ''}</span>
              <button onClick={() => add(s.id)} disabled={busy}
                style={{ marginLeft: 'auto', padding: '4px 10px', background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                + Добавить
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
