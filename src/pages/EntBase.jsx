import React, { useEffect, useMemo, useState } from 'react'
import {
  Search, X, Plus, Pencil, Trash2, Award, Check, Download, TrendingUp, TrendingDown, Minus,
  Users, BookOpen, School as SchoolIcon, BarChart3, ArrowLeft, ClipboardList,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  fetchEntDataset, fetchKnownSchools, updateStudentEntProfile,
  fetchEntAttempts, addEntAttempt, updateEntAttempt, deleteEntAttempt, addEntAttemptsBulk,
} from '../lib/api'
import { C, OFFICES, initials, avColorByIndex, fmtDate, nameOf } from '../lib/utils'
import { inp, Field } from '../components/ui'
import DataTable from '../components/DataTable'

const LANGS = [{ k: 'каз', t: 'Казахский' }, { k: 'рус', t: 'Русский' }]
const MAX = { history: 20, reading: 10, math: 10, subj: 50 }
const TOTAL_MAX = MAX.history + MAX.reading + MAX.math + MAX.subj * 2 // 140
const FIXED_SUBJECTS = [
  { k: 'history_kz_score', label: 'История Казахстана', max: MAX.history },
  { k: 'reading_score', label: 'Грамотность чтения', max: MAX.reading },
  { k: 'math_literacy_score', label: 'Математическая грамотность', max: MAX.math },
]
const BUCKETS = [
  { k: '0-59', min: 0, max: 59 }, { k: '60-79', min: 60, max: 79 }, { k: '80-99', min: 80, max: 99 },
  { k: '100-119', min: 100, max: 119 }, { k: '120-139', min: 120, max: 139 }, { k: '140', min: 140, max: 140 },
]

// ---------- утилиты ----------
const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
const round1 = (n) => n == null ? null : Math.round(n * 10) / 10
const fmtDyn = (d) => d == null ? '—' : d > 0 ? `+${d}` : `${d}`
function scoreColor(total) {
  if (total == null) return C.faint
  if (total >= 120) return '#0f9d58'
  if (total >= 100) return '#4338ca'
  if (total >= 80) return '#d97706'
  return '#dc2626'
}
function dynColor(d) {
  if (d == null) return C.faint
  if (d > 0) return '#0f9d58'
  if (d === 0) return C.slate
  return '#dc2626'
}
function DynBadge({ d }) {
  if (d == null) return <span style={{ color: C.faint }}>—</span>
  const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus
  return (
    <span className="rowflex" style={{ gap: 3, color: dynColor(d), fontWeight: 700, justifyContent: 'flex-end' }}>
      <Icon size={12} /> {fmtDyn(d)}
    </span>
  )
}
function aggregate(list) {
  // list: студенты с .last/.best/.dyn/.attemptsCount
  const withResults = list.filter((s) => s.attemptsCount > 0)
  const lasts = withResults.map((s) => s.last)
  const bests = withResults.map((s) => s.best)
  const dyns = list.filter((s) => s.dyn != null).map((s) => s.dyn)
  return {
    count: list.length,
    withResults: withResults.length,
    avgLast: round1(avg(lasts)),
    best: bests.length ? Math.max(...bests) : null,
    minLast: lasts.length ? Math.min(...lasts) : null,
    avgDyn: round1(avg(dyns)),
  }
}
function subjectNameScore(attempt, subjectName) {
  if (attempt.subject1_name === subjectName) return attempt.subject1_score
  if (attempt.subject2_name === subjectName) return attempt.subject2_score
  return null
}

export default function EntBase({ dict }) {
  const [data, setData] = useState(null) // { students, links, groups, attempts }
  const [schools, setSchools] = useState([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('students')
  const [openStudentId, setOpenStudentId] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  async function reload() {
    try {
      const [d, sc] = await Promise.all([fetchEntDataset(), fetchKnownSchools()])
      setData(d); setSchools(sc)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { reload() }, [])

  const groupsById = useMemo(() => Object.fromEntries((data?.groups || []).map((g) => [g.id, g])), [data])
  const groupsByStudent = useMemo(() => {
    const m = {}
    ;(data?.links || []).forEach((l) => { (m[l.student_id] ||= []).push(l.group_id) })
    return m
  }, [data])
  const attemptsByStudent = useMemo(() => {
    const m = {}
    ;(data?.attempts || []).forEach((a) => { (m[a.student_id] ||= []).push(a) })
    return m
  }, [data])

  // единый обогащённый список учеников — источник для всех вкладок
  const studentsEx = useMemo(() => (data?.students || []).map((s) => {
    const at = attemptsByStudent[s.id] || []
    const groupIds = groupsByStudent[s.id] || []
    const groupNames = groupIds.map((id) => groupsById[id]?.name).filter(Boolean)
    const scores = at.map((a) => a.total_score)
    const last = scores.length ? scores[scores.length - 1] : null
    const first = scores.length ? scores[0] : null
    const best = scores.length ? Math.max(...scores) : null
    const dyn = (first != null && last != null) ? last - first : null
    return {
      ...s, groupIds, groupNames, groupNamesText: groupNames.join(', '),
      attempts: at, attemptsCount: at.length, last, first, best, dyn,
      subj1Name: nameOf(dict.subjects, s.profile_subject_1_id),
      subj2Name: nameOf(dict.subjects, s.profile_subject_2_id),
    }
  }), [data, attemptsByStudent, groupsByStudent, groupsById, dict.subjects])

  const studentById = useMemo(() => Object.fromEntries(studentsEx.map((s) => [s.id, s])), [studentsEx])
  const activeGroups = useMemo(() => (data?.groups || []).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [data])

  const TABS = [
    { k: 'students', t: 'Ученики', icon: Users },
    { k: 'attempts', t: 'Попытки', icon: ClipboardList },
    { k: 'subjects', t: 'По предметам', icon: BookOpen },
    { k: 'groups', t: 'По группам', icon: Award },
    { k: 'schools', t: 'По школам', icon: SchoolIcon },
    { k: 'analytics', t: 'Аналитика', icon: BarChart3 },
  ]

  function exportExcel(scope) {
    exportEntExcel(scope, dict)
  }

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>База учеников · ЕНТ</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>Профильные предметы и результаты пробных ЕНТ по всему центру.</p>
        </div>
        <button onClick={() => setBulkOpen(true)} className="rowflex"
          style={{ gap: 6, padding: '9px 16px', background: C.brandSoft, color: C.brand, borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Plus size={15} /> Новая попытка
        </button>
      </div>

      <div className="rowflex" style={{ gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((o) => {
          const on = tab === o.k
          const Icon = o.icon
          return (
            <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
              style={{ gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
              <Icon size={14} /> {o.t}
            </button>
          )
        })}
      </div>

      {err && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {data === null ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : tab === 'students' ? (
        <StudentsTab dict={dict} students={studentsEx} groups={activeGroups} schools={schools}
          onOpenStudent={setOpenStudentId} onExport={exportExcel} />
      ) : tab === 'attempts' ? (
        <AttemptsTab dict={dict} students={studentsEx} groups={activeGroups} schools={schools}
          onOpenStudent={setOpenStudentId} onExport={exportExcel} />
      ) : tab === 'subjects' ? (
        <SubjectsTab dict={dict} students={studentsEx} onOpenStudent={setOpenStudentId} />
      ) : tab === 'groups' ? (
        <GroupsTab students={studentsEx} groups={activeGroups} onOpenStudent={setOpenStudentId} />
      ) : tab === 'schools' ? (
        <SchoolsTab students={studentsEx} onOpenStudent={setOpenStudentId} />
      ) : (
        <AnalyticsTab dict={dict} students={studentsEx} groups={activeGroups} schools={schools} />
      )}

      {openStudentId && studentById[openStudentId] && (
        <EntStudentModal student={studentById[openStudentId]} dict={dict} schools={schools}
          onClose={() => setOpenStudentId(null)} onChanged={reload} />
      )}

      {bulkOpen && (
        <BulkAttemptModal students={studentsEx} groups={activeGroups} dict={dict}
          onClose={() => setBulkOpen(false)} onSaved={async () => { setBulkOpen(false); await reload() }} />
      )}
    </div>
  )
}

// ================= ВКЛАДКА «УЧЕНИКИ» =================
function StudentsTab({ dict, students, groups, schools, onOpenStudent, onExport }) {
  const [office, setOffice] = useState('')
  const [lang, setLang] = useState('')
  const [group, setGroup] = useState('')
  const [school, setSchool] = useState('')
  const [grade, setGrade] = useState('')
  const [subj1, setSubj1] = useState('')
  const [subj2, setSubj2] = useState('')
  const [hasResults, setHasResults] = useState('')
  const [lastMin, setLastMin] = useState(''); const [lastMax, setLastMax] = useState('')
  const [bestMin, setBestMin] = useState(''); const [bestMax, setBestMax] = useState('')
  const [q, setQ] = useState('')

  const grades = useMemo(() => [...new Set(students.map((s) => s.grade).filter(Boolean))].sort(), [students])

  const filtered = students.filter((s) => {
    if (office && s.office !== office) return false
    if (lang && s.lang !== lang) return false
    if (group && !s.groupIds.includes(group)) return false
    if (school && s.school !== school) return false
    if (grade && s.grade !== grade) return false
    if (subj1 && s.profile_subject_1_id !== subj1) return false
    if (subj2 && s.profile_subject_2_id !== subj2) return false
    if (hasResults === 'yes' && s.attemptsCount === 0) return false
    if (hasResults === 'no' && s.attemptsCount > 0) return false
    if (lastMin !== '' && (s.last == null || s.last < Number(lastMin))) return false
    if (lastMax !== '' && (s.last == null || s.last > Number(lastMax))) return false
    if (bestMin !== '' && (s.best == null || s.best < Number(bestMin))) return false
    if (bestMax !== '' && (s.best == null || s.best > Number(bestMax))) return false
    const t = q.toLowerCase().trim()
    return !t || s.full_name.toLowerCase().includes(t)
  })

  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => (
      <div className="rowflex" style={{ gap: 9 }}>
        <div className="av" style={{ width: 26, height: 26, fontSize: 10.5, background: avColorByIndex(s._i || 0) }}>{initials(s.full_name)}</div>
        <b style={{ color: C.brand }}>{s.full_name}</b>
      </div>
    )},
    { key: 'school', label: 'Школа', render: (s) => s.school || <span style={{ color: C.faint }}>—</span> },
    { key: 'groupNamesText', label: 'Группа', render: (s) => s.groupNamesText || <span style={{ color: C.faint }}>—</span> },
    { key: 'office', label: 'Офис', width: 110 },
    { key: 'lang', label: 'Язык', width: 60 },
    { key: 'subj1Name', label: 'Профиль 1', sortable: false, render: (s) => s.subj1Name || <span style={{ color: C.faint }}>—</span> },
    { key: 'subj2Name', label: 'Профиль 2', sortable: false, render: (s) => s.subj2Name || <span style={{ color: C.faint }}>—</span> },
    { key: 'last', label: 'Последний', num: true, width: 100, sortValue: (s) => s.last ?? -1,
      render: (s) => s.last != null ? <b style={{ color: scoreColor(s.last) }}>{s.last}</b> : <span style={{ color: C.faint }}>—</span> },
    { key: 'best', label: 'Лучший', num: true, width: 90, sortValue: (s) => s.best ?? -1,
      render: (s) => s.best != null ? <b style={{ color: scoreColor(s.best) }}>{s.best}</b> : <span style={{ color: C.faint }}>—</span> },
    { key: 'dyn', label: 'Динамика', num: true, width: 100, sortValue: (s) => s.dyn ?? -999, render: (s) => <DynBadge d={s.dyn} /> },
  ]

  return (
    <div>
      <FilterBar>
        <SelectF value={office} onChange={setOffice} placeholder="Все офисы" options={OFFICES.map((o) => [o, o])} />
        <SelectF value={lang} onChange={setLang} placeholder="Все языки" options={LANGS.map((l) => [l.k, l.t])} />
        <SelectF value={group} onChange={setGroup} placeholder="Все группы" options={groups.map((g) => [g.id, g.name])} />
        <SelectF value={school} onChange={setSchool} placeholder="Все школы" options={schools.map((s) => [s, s])} />
        <SelectF value={grade} onChange={setGrade} placeholder="Все классы" options={grades.map((g) => [g, g])} />
        <SelectF value={subj1} onChange={setSubj1} placeholder="Профиль 1: любой" options={dict.subjects.map((s) => [s.id, s.name])} />
        <SelectF value={subj2} onChange={setSubj2} placeholder="Профиль 2: любой" options={dict.subjects.map((s) => [s.id, s.name])} />
        <SelectF value={hasResults} onChange={setHasResults} placeholder="Результаты: все" options={[['yes', 'есть результаты'], ['no', 'без результатов']]} />
        <RangeF label="Последний" min={lastMin} max={lastMax} setMin={setLastMin} setMax={setLastMax} />
        <RangeF label="Лучший" min={bestMin} max={bestMax} setMin={setBestMin} setMax={setBestMax} />
        <SearchF q={q} setQ={setQ} />
        <button onClick={() => onExport({ students: filtered })} className="rowflex"
          style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={14} /> Excel
        </button>
      </FilterBar>

      <div style={{ fontSize: 12.5, color: C.slate, margin: '10px 0' }}>Учеников: <b>{filtered.length}</b></div>

      {filtered.length === 0 ? (
        <Empty icon={Users} text="Учеников не найдено" />
      ) : (
        <DataTable columns={columns} rows={filtered.map((s, i) => ({ ...s, _i: i }))} pageSize={filtered.length}
          onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'full_name', dir: 'asc' }} />
      )}
    </div>
  )
}

// ================= ВКЛАДКА «ПОПЫТКИ» =================
function AttemptsTab({ dict, students, groups, schools, onOpenStudent, onExport }) {
  const [office, setOffice] = useState('')
  const [lang, setLang] = useState('')
  const [group, setGroup] = useState('')
  const [school, setSchool] = useState('')
  const [subj, setSubj] = useState('') // фикс. или профильный, по имени
  const [attemptNo, setAttemptNo] = useState('') // позиция попытки, 1-based
  const [scoreMin, setScoreMin] = useState(''); const [scoreMax, setScoreMax] = useState('')

  const rows = useMemo(() => {
    const out = []
    students.forEach((s) => {
      s.attempts.forEach((a, idx) => {
        out.push({ ...a, _no: idx + 1, _student: s })
      })
    })
    return out
  }, [students])

  const maxAttemptNo = rows.reduce((m, r) => Math.max(m, r._no), 0)
  const subjectOptions = useMemo(() => {
    const names = new Set()
    rows.forEach((r) => { names.add(r.subject1_name); names.add(r.subject2_name) })
    return [...FIXED_SUBJECTS.map((f) => f.label), ...[...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'))]
  }, [rows])

  const filtered = rows.filter((r) => {
    const s = r._student
    if (office && s.office !== office) return false
    if (lang && s.lang !== lang) return false
    if (group && !s.groupIds.includes(group)) return false
    if (school && s.school !== school) return false
    if (attemptNo && r._no !== Number(attemptNo)) return false
    if (subj) {
      const isFixed = FIXED_SUBJECTS.find((f) => f.label === subj)
      if (isFixed) { /* всегда есть у каждой попытки */ }
      else if (r.subject1_name !== subj && r.subject2_name !== subj) return false
    }
    if (scoreMin !== '' && r.total_score < Number(scoreMin)) return false
    if (scoreMax !== '' && r.total_score > Number(scoreMax)) return false
    return true
  })

  const columns = [
    { key: 'attempt_date', label: 'Дата', width: 95, render: (r) => fmtDate(r.attempt_date) },
    { key: '_no', label: '№', width: 50, render: (r) => r._no },
    { key: 'full_name', label: 'Ученик', sortValue: (r) => r._student.full_name, render: (r) => <b style={{ color: C.brand }}>{r._student.full_name}</b> },
    { key: 'group', label: 'Группа', sortable: false, render: (r) => r._student.groupNamesText || '—' },
    { key: 'school', label: 'Школа', sortValue: (r) => r._student.school || '', render: (r) => r._student.school || '—' },
    { key: 'history_kz_score', label: 'История', num: true, width: 75 },
    { key: 'reading_score', label: 'Чтение', num: true, width: 75 },
    { key: 'math_literacy_score', label: 'Мат.гр.', num: true, width: 75 },
    { key: 'subject1_score', label: 'Профиль 1', num: true, width: 100, render: (r) => `${r.subject1_score}` , sortValue: (r)=>r.subject1_score},
    { key: 'subject2_score', label: 'Профиль 2', num: true, width: 100, sortValue: (r)=>r.subject2_score },
    { key: 'total_score', label: 'Итого', num: true, width: 90, render: (r) => <b style={{ color: scoreColor(r.total_score) }}>{r.total_score}</b> },
  ]

  return (
    <div>
      <FilterBar>
        <SelectF value={office} onChange={setOffice} placeholder="Все офисы" options={OFFICES.map((o) => [o, o])} />
        <SelectF value={lang} onChange={setLang} placeholder="Все языки" options={LANGS.map((l) => [l.k, l.t])} />
        <SelectF value={group} onChange={setGroup} placeholder="Все группы" options={groups.map((g) => [g.id, g.name])} />
        <SelectF value={school} onChange={setSchool} placeholder="Все школы" options={schools.map((s) => [s, s])} />
        <SelectF value={subj} onChange={setSubj} placeholder="Любой предмет" options={subjectOptions.map((s) => [s, s])} />
        <SelectF value={attemptNo} onChange={setAttemptNo} placeholder="Попытка: все"
          options={Array.from({ length: maxAttemptNo }, (_, i) => [String(i + 1), `Попытка №${i + 1}`])} />
        <RangeF label="Итого" min={scoreMin} max={scoreMax} setMin={setScoreMin} setMax={setScoreMax} />
        <button onClick={() => onExport({ attempts: filtered })} className="rowflex"
          style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={14} /> Excel
        </button>
      </FilterBar>

      <div style={{ fontSize: 12.5, color: C.slate, margin: '10px 0' }}>Записей: <b>{filtered.length}</b></div>

      {filtered.length === 0 ? (
        <Empty icon={ClipboardList} text="Попыток не найдено" />
      ) : (
        <DataTable columns={columns} rows={filtered.map((r, i) => ({ ...r, id: r.id || i }))} pageSize={Math.min(filtered.length, 500)}
          onRowClick={(r) => onOpenStudent(r._student.id)} initialSort={{ key: 'attempt_date', dir: 'desc' }} />
      )}
    </div>
  )
}

// ================= ВКЛАДКА «ПО ПРЕДМЕТАМ» =================
function SubjectsTab({ dict, students, onOpenStudent }) {
  const profileSubjectNames = useMemo(() => {
    const names = new Set()
    students.forEach((s) => { if (s.subj1Name) names.add(s.subj1Name); if (s.subj2Name) names.add(s.subj2Name) })
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [students])

  const [mode, setMode] = useState('all') // all | history_kz_score | reading_score | math_literacy_score | profile
  const [profileSubj, setProfileSubj] = useState(profileSubjectNames[0] || '')

  const fixedStats = FIXED_SUBJECTS.map((f) => {
    const vals = students.filter((s) => s.attemptsCount > 0).map((s) => s.attempts[s.attempts.length - 1][f.k])
    return { ...f, count: vals.length, avgV: round1(avg(vals)), maxV: vals.length ? Math.max(...vals) : null, minV: vals.length ? Math.min(...vals) : null }
  })

  const profileStats = profileSubjectNames.map((name) => {
    const rel = students.map((s) => {
      const relAttempts = s.attempts.filter((a) => a.subject1_name === name || a.subject2_name === name)
      if (!relAttempts.length) return null
      return subjectNameScore(relAttempts[relAttempts.length - 1], name)
    }).filter((v) => v != null)
    return { label: name, count: rel.length, avgV: round1(avg(rel)), maxV: rel.length ? Math.max(...rel) : null, minV: rel.length ? Math.min(...rel) : null }
  })

  return (
    <div>
      <div className="rowflex" style={{ gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', 'Все'], ['history_kz_score', 'История Казахстана'], ['reading_score', 'Грамотность чтения'], ['math_literacy_score', 'Математическая грамотность'], ['profile', 'Профильные']].map(([k, t]) => {
          const on = mode === k
          return (
            <button key={k} onClick={() => setMode(k)}
              style={{ padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate }}>
              {t}
            </button>
          )
        })}
        {mode === 'profile' && (
          <select value={profileSubj} onChange={(e) => setProfileSubj(e.target.value)} style={{ ...inp, width: 'auto', padding: '7px 12px', fontSize: 12.5 }}>
            {profileSubjectNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {mode === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <SectionLabel>Обязательные предметы (по последней попытке каждого ученика)</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {fixedStats.map((f) => <SubjectKpi key={f.k} {...f} />)}
            </div>
          </div>
          <div>
            <SectionLabel>Профильные предметы</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {profileStats.map((f) => <SubjectKpi key={f.label} {...f} />)}
            </div>
          </div>
        </div>
      )}

      {mode !== 'all' && mode !== 'profile' && (
        <FixedSubjectDetail subject={FIXED_SUBJECTS.find((f) => f.k === mode)} students={students} onOpenStudent={onOpenStudent} />
      )}

      {mode === 'profile' && profileSubj && (
        <ProfileSubjectDetail subjectName={profileSubj} students={students} onOpenStudent={onOpenStudent} />
      )}
    </div>
  )
}

function SubjectKpi({ label, max, count, avgV, maxV, minV }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>{count} учеников</div>
      <div className="rowflex" style={{ gap: 12 }}>
        <MiniNum label="средний" value={avgV} max={max} />
        <MiniNum label="макс" value={maxV} max={max} />
        <MiniNum label="мин" value={minV} max={max} />
      </div>
    </div>
  )
}
function MiniNum({ label, value, max }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{value ?? '—'}{max ? <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>/{max}</span> : null}</div>
      <div style={{ fontSize: 10.5, color: C.faint }}>{label}</div>
    </div>
  )
}

function FixedSubjectDetail({ subject, students, onOpenStudent }) {
  const rows = students.filter((s) => s.attemptsCount > 0).map((s) => {
    const first = s.attempts[0][subject.k]
    const last = s.attempts[s.attempts.length - 1][subject.k]
    return { ...s, subjFirst: first, subjLast: last, subjDyn: last - first }
  })
  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b> },
    { key: 'groupNamesText', label: 'Группа', render: (s) => s.groupNamesText || '—' },
    { key: 'school', label: 'Школа', render: (s) => s.school || '—' },
    { key: 'subjFirst', label: 'Первая попытка', num: true, width: 120 },
    { key: 'subjLast', label: 'Последняя', num: true, width: 100 },
    { key: 'subjDyn', label: 'Динамика', num: true, width: 100, render: (s) => <DynBadge d={s.subjDyn} /> },
  ]
  return rows.length === 0 ? <Empty icon={BookOpen} text="Нет данных" /> : (
    <DataTable columns={columns} rows={rows} pageSize={rows.length} onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'subjLast', dir: 'asc' }} />
  )
}

function ProfileSubjectDetail({ subjectName, students, onOpenStudent }) {
  const rows = students.map((s) => {
    const rel = s.attempts.filter((a) => a.subject1_name === subjectName || a.subject2_name === subjectName)
    if (!rel.length) return null
    const first = subjectNameScore(rel[0], subjectName)
    const last = subjectNameScore(rel[rel.length - 1], subjectName)
    return { ...s, subjFirst: first, subjLast: last, subjDyn: last - first, subjCount: rel.length }
  }).filter(Boolean)
  const columns = [
    { key: 'full_name', label: 'Ученик', render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b> },
    { key: 'groupNamesText', label: 'Группа', render: (s) => s.groupNamesText || '—' },
    { key: 'school', label: 'Школа', render: (s) => s.school || '—' },
    { key: 'subjCount', label: 'Попыток', num: true, width: 90 },
    { key: 'subjFirst', label: 'Первая попытка', num: true, width: 120 },
    { key: 'subjLast', label: 'Последняя', num: true, width: 100 },
    { key: 'subjDyn', label: 'Динамика', num: true, width: 100, render: (s) => <DynBadge d={s.subjDyn} /> },
  ]
  return rows.length === 0 ? <Empty icon={BookOpen} text="Нет учеников с этим профильным предметом" /> : (
    <DataTable columns={columns} rows={rows} pageSize={rows.length} onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'subjLast', dir: 'asc' }} />
  )
}

// ================= ВКЛАДКА «ПО ГРУППАМ» =================
function GroupsTab({ students, groups, onOpenStudent }) {
  const [openGroup, setOpenGroup] = useState(null)

  const rows = groups.map((g) => {
    const list = students.filter((s) => s.groupIds.includes(g.id))
    return { ...g, ...aggregate(list), students: list }
  }).filter((g) => g.count > 0)

  if (openGroup) {
    const g = rows.find((r) => r.id === openGroup)
    if (!g) { setOpenGroup(null); return null }
    return <GroupDetail group={g} onBack={() => setOpenGroup(null)} onOpenStudent={onOpenStudent} />
  }

  const columns = [
    { key: 'name', label: 'Группа', render: (g) => <b style={{ color: C.brand }}>{g.name}</b> },
    { key: 'office', label: 'Офис', width: 110 },
    { key: 'count', label: 'Учеников', num: true, width: 100 },
    { key: 'avgLast', label: 'Средний', num: true, width: 100, render: (g) => g.avgLast ?? '—' },
    { key: 'best', label: 'Лучший', num: true, width: 90, render: (g) => g.best ?? '—' },
    { key: 'minLast', label: 'Минимальный', num: true, width: 120, render: (g) => g.minLast ?? '—' },
    { key: 'avgDyn', label: 'Средний прирост', num: true, width: 130, render: (g) => <DynBadge d={g.avgDyn} /> },
  ]
  return rows.length === 0 ? <Empty icon={Award} text="Нет групп с учениками" /> : (
    <DataTable columns={columns} rows={rows} pageSize={rows.length} onRowClick={(g) => setOpenGroup(g.id)} initialSort={{ key: 'avgLast', dir: 'desc' }} />
  )
}

function GroupDetail({ group, onBack, onOpenStudent }) {
  const subjRows = useMemo(() => {
    const list = FIXED_SUBJECTS.map((f) => {
      const vals = group.students.filter((s) => s.attemptsCount > 0).map((s) => s.attempts[s.attempts.length - 1][f.k])
      return { label: f.label, max: f.max, avgV: round1(avg(vals)), maxV: vals.length ? Math.max(...vals) : null, minV: vals.length ? Math.min(...vals) : null }
    })
    const names = new Set()
    group.students.forEach((s) => { if (s.subj1Name) names.add(s.subj1Name); if (s.subj2Name) names.add(s.subj2Name) })
    ;[...names].sort((a, b) => a.localeCompare(b, 'ru')).forEach((name) => {
      const vals = group.students.map((s) => {
        const rel = s.attempts.filter((a) => a.subject1_name === name || a.subject2_name === name)
        return rel.length ? subjectNameScore(rel[rel.length - 1], name) : null
      }).filter((v) => v != null)
      list.push({ label: name, max: MAX.subj, avgV: round1(avg(vals)), maxV: vals.length ? Math.max(...vals) : null, minV: vals.length ? Math.min(...vals) : null })
    })
    return list
  }, [group])

  const studentCols = [
    { key: 'full_name', label: 'Ученик', render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b> },
    { key: 'school', label: 'Школа', render: (s) => s.school || '—' },
    { key: 'last', label: 'Последний', num: true, width: 100, render: (s) => s.last ?? '—' },
    { key: 'best', label: 'Лучший', num: true, width: 90, render: (s) => s.best ?? '—' },
    { key: 'dyn', label: 'Динамика', num: true, width: 100, render: (s) => <DynBadge d={s.dyn} /> },
  ]

  return (
    <div>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        <ArrowLeft size={15} /> Все группы
      </button>
      <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{group.name}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <Kpi label="Учеников" value={group.count} />
        <Kpi label="Средний" value={group.avgLast ?? '—'} />
        <Kpi label="Лучший" value={group.best ?? '—'} />
        <Kpi label="Минимальный" value={group.minLast ?? '—'} />
        <Kpi label="Средний прирост" value={<DynBadge d={group.avgDyn} />} />
      </div>

      <SectionLabel>По предметам</SectionLabel>
      <div style={{ marginBottom: 20, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {subjRows.map((r, i) => (
          <div key={r.label} className="rowflex" style={{ gap: 10, padding: '9px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
            <span style={{ flex: 1, fontSize: 13 }}>{r.label}</span>
            <span style={{ fontSize: 12.5, color: C.slate, width: 100, textAlign: 'right' }}>ср. {r.avgV ?? '—'}</span>
            <span style={{ fontSize: 12.5, color: C.slate, width: 90, textAlign: 'right' }}>макс {r.maxV ?? '—'}</span>
            <span style={{ fontSize: 12.5, color: C.slate, width: 90, textAlign: 'right' }}>мин {r.minV ?? '—'}</span>
          </div>
        ))}
      </div>

      <SectionLabel>Ученики группы</SectionLabel>
      <DataTable columns={studentCols} rows={group.students} pageSize={group.students.length} onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'last', dir: 'asc' }} />
    </div>
  )
}

// ================= ВКЛАДКА «ПО ШКОЛАМ» =================
function SchoolsTab({ students, onOpenStudent }) {
  const [openSchool, setOpenSchool] = useState(null)
  const rows = useMemo(() => {
    const m = {}
    students.forEach((s) => { if (s.school) (m[s.school] ||= []).push(s) })
    return Object.entries(m).map(([school, list]) => ({ school, ...aggregate(list), students: list }))
  }, [students])

  if (openSchool) {
    const g = rows.find((r) => r.school === openSchool)
    if (!g) { setOpenSchool(null); return null }
    const columns = [
      { key: 'full_name', label: 'Ученик', render: (s) => <b style={{ color: C.brand }}>{s.full_name}</b> },
      { key: 'groupNamesText', label: 'Группа', render: (s) => s.groupNamesText || '—' },
      { key: 'last', label: 'Последний', num: true, width: 100, render: (s) => s.last ?? '—' },
      { key: 'best', label: 'Лучший', num: true, width: 90, render: (s) => s.best ?? '—' },
      { key: 'dyn', label: 'Динамика', num: true, width: 100, render: (s) => <DynBadge d={s.dyn} /> },
    ]
    return (
      <div>
        <button onClick={() => setOpenSchool(null)} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
          <ArrowLeft size={15} /> Все школы
        </button>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{g.school}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          <Kpi label="Учеников" value={g.count} />
          <Kpi label="Средний" value={g.avgLast ?? '—'} />
          <Kpi label="Лучший" value={g.best ?? '—'} />
          <Kpi label="Средний прирост" value={<DynBadge d={g.avgDyn} />} />
        </div>
        <DataTable columns={columns} rows={g.students} pageSize={g.students.length} onRowClick={(s) => onOpenStudent(s.id)} initialSort={{ key: 'last', dir: 'asc' }} />
      </div>
    )
  }

  const columns = [
    { key: 'school', label: 'Школа', render: (r) => <b style={{ color: C.brand }}>{r.school}</b> },
    { key: 'count', label: 'Учеников', num: true, width: 100 },
    { key: 'avgLast', label: 'Средний', num: true, width: 100, render: (r) => r.avgLast ?? '—' },
    { key: 'best', label: 'Лучший', num: true, width: 90, render: (r) => r.best ?? '—' },
    { key: 'avgDyn', label: 'Средний прирост', num: true, width: 130, render: (r) => <DynBadge d={r.avgDyn} /> },
  ]
  return rows.length === 0 ? <Empty icon={SchoolIcon} text="Нет данных по школам" /> : (
    <DataTable columns={columns} rows={rows.map((r,i)=>({...r,id:r.school}))} pageSize={rows.length} onRowClick={(r) => setOpenSchool(r.school)} initialSort={{ key: 'avgLast', dir: 'desc' }} />
  )
}

// ================= ВКЛАДКА «АНАЛИТИКА» =================
function AnalyticsTab({ dict, students, groups, schools }) {
  const [office, setOffice] = useState('')
  const [lang, setLang] = useState('')
  const [group, setGroup] = useState('')
  const [school, setSchool] = useState('')

  const filtered = students.filter((s) =>
    (!office || s.office === office) && (!lang || s.lang === lang) &&
    (!group || s.groupIds.includes(group)) && (!school || s.school === school))

  const agg = aggregate(filtered)
  const high = filtered.filter((s) => s.last != null && s.last >= 120).length
  const low = filtered.filter((s) => s.last != null && s.last < 80).length

  const buckets = BUCKETS.map((b) => ({
    name: b.k, count: filtered.filter((s) => s.last != null && s.last >= b.min && s.last <= b.max).length,
  }))

  const maxAttempts = Math.max(0, ...filtered.map((s) => s.attemptsCount))
  const trend = Array.from({ length: maxAttempts }, (_, i) => {
    const vals = filtered.filter((s) => s.attempts[i]).map((s) => s.attempts[i].total_score)
    return { name: `П${i + 1}`, avg: round1(avg(vals)) }
  })

  const officeRows = OFFICES.map((o) => {
    const list = students.filter((s) => s.office === o)
    return { office: o, ...aggregate(list) }
  })

  return (
    <div>
      <FilterBar>
        <SelectF value={office} onChange={setOffice} placeholder="Все офисы" options={OFFICES.map((o) => [o, o])} />
        <SelectF value={lang} onChange={setLang} placeholder="Все языки" options={LANGS.map((l) => [l.k, l.t])} />
        <SelectF value={group} onChange={setGroup} placeholder="Все группы" options={groups.map((g) => [g.id, g.name])} />
        <SelectF value={school} onChange={setSchool} placeholder="Все школы" options={schools.map((s) => [s, s])} />
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '16px 0' }}>
        <Kpi label="Всего учеников" value={agg.count} />
        <Kpi label="С хотя бы 1 попыткой" value={agg.withResults} />
        <Kpi label="Средний результат" value={agg.avgLast ?? '—'} />
        <Kpi label="Лучший результат" value={agg.best ?? '—'} />
        <Kpi label="Средний прирост" value={<DynBadge d={agg.avgDyn} />} />
        <Kpi label="120+ баллов" value={high} tint={C.ok} />
        <Kpi label="Ниже 80" value={low} tint="#dc2626" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        <Panel title="Распределение по баллам">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                {buckets.map((b, i) => <Cell key={i} fill={scoreColor(BUCKETS[i].min)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Средний балл по попыткам" hint="растёт ли результат центра от попытки к попытке">
          {trend.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: C.faint, fontSize: 13 }}>Пока нет попыток</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, TOTAL_MAX]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="avg" stroke={C.brand} strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Сравнение офисов">
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
          {officeRows.map((r, i) => (
            <div key={r.office} className="rowflex" style={{ gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{r.office}</span>
              <span style={{ fontSize: 12, color: C.slate, width: 90, textAlign: 'right' }}>{r.count} чел.</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, width: 90, textAlign: 'right' }}>ср. {r.avgLast ?? '—'}</span>
              <span style={{ fontSize: 12.5, color: C.slate, width: 90, textAlign: 'right' }}>макс {r.best ?? '—'}</span>
              <span style={{ width: 90, textAlign: 'right' }}><DynBadge d={r.avgDyn} /></span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// ================= МЕЛКИЕ UI-ПОМОЩНИКИ =================
function FilterBar({ children }) {
  return <div className="rowflex" style={{ gap: 8, flexWrap: 'wrap' }}>{children}</div>
}
function SelectF({ value, onChange, placeholder, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, width: 'auto', padding: '7px 10px', fontSize: 12.5 }}>
      <option value="">{placeholder}</option>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  )
}
function RangeF({ label, min, max, setMin, setMax }) {
  return (
    <div className="rowflex" style={{ gap: 4 }}>
      <span style={{ fontSize: 11.5, color: C.faint }}>{label}:</span>
      <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="от" style={{ ...inp, width: 52, padding: '7px 6px', fontSize: 12.5 }} />
      <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="до" style={{ ...inp, width: 52, padding: '7px 6px', fontSize: 12.5 }} />
    </div>
  )
}
function SearchF({ q, setQ }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
      <Search size={14} color={C.faint} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО…" style={{ ...inp, padding: '7px 10px 7px 30px', fontSize: 12.5 }} />
    </div>
  )
}
function Kpi({ label, value, tint }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 14px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tint || C.ink, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{label}</div>
    </div>
  )
}
function Panel({ title, hint, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</div>
        {hint && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 9 }}>{children}</div>
}
function Empty({ icon: Icon, text }) {
  return (
    <div style={{ padding: 50, textAlign: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <Icon size={28} color={C.faint} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 700 }}>{text}</div>
    </div>
  )
}

// ================= КАРТОЧКА УЧЕНИКА =================
function EntStudentModal({ student, dict, schools, onClose, onChanged }) {
  const [school, setSchool] = useState(student.school || '')
  const [subj1, setSubj1] = useState(student.profile_subject_1_id || '')
  const [subj2, setSubj2] = useState(student.profile_subject_2_id || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [attempts, setAttempts] = useState(null)
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [err, setErr] = useState('')

  async function loadAttempts() {
    try { setAttempts(await fetchEntAttempts(student.id)) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { loadAttempts() }, [student.id])

  async function saveProfile() {
    setSavingProfile(true); setErr(''); setProfileMsg('')
    try {
      await updateStudentEntProfile(student.id, { school, profile_subject_1_id: subj1, profile_subject_2_id: subj2 })
      setProfileMsg('Сохранено'); await onChanged()
    } catch (e) { setErr(e.message) } finally { setSavingProfile(false) }
  }

  const subj1Name = nameOf(dict.subjects, subj1)
  const subj2Name = nameOf(dict.subjects, subj2)
  const canAddAttempt = subj1 && subj2 && subj1 !== subj2

  const scores = (attempts || []).map((a) => a.total_score)
  const last = scores.length ? scores[scores.length - 1] : null
  const first = scores.length ? scores[0] : null
  const best = scores.length ? Math.max(...scores) : null
  const dyn = (first != null && last != null) ? last - first : null

  const chartData = (attempts || []).map((a, i) => ({ name: `П${i + 1}`, date: fmtDate(a.attempt_date), score: a.total_score }))

  const attemptColumns = [
    { key: 'n', label: '№', width: 40, sortable: false, render: (a) => attempts.indexOf(a) + 1 },
    { key: 'attempt_date', label: 'Дата', width: 95, render: (a) => fmtDate(a.attempt_date) },
    { key: 'history_kz_score', label: 'История КЗ', num: true, width: 90, render: (a) => `${a.history_kz_score}/${MAX.history}` },
    { key: 'reading_score', label: 'Чтение', num: true, width: 80, render: (a) => `${a.reading_score}/${MAX.reading}` },
    { key: 'math_literacy_score', label: 'Мат. гр.', num: true, width: 80, render: (a) => `${a.math_literacy_score}/${MAX.math}` },
    { key: 'subject1_score', label: 'Профиль 1', num: true, width: 120, render: (a) => <span title={a.subject1_name}>{a.subject1_name}: {a.subject1_score}/{MAX.subj}</span> },
    { key: 'subject2_score', label: 'Профиль 2', num: true, width: 120, render: (a) => <span title={a.subject2_name}>{a.subject2_name}: {a.subject2_score}/{MAX.subj}</span> },
    { key: 'total_score', label: 'Итог', num: true, width: 90, render: (a) => <b style={{ color: a.total_score === best ? C.ok : C.ink }}>{a.total_score}/{TOTAL_MAX}</b> },
    {
      key: 'act', label: '', width: 80, sortable: false, render: (a) => (
        <div className="rowflex" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <button onClick={(e) => { e.stopPropagation(); setEditing(a) }} title="Редактировать" style={{ border: 'none', background: 'none', color: C.slate, cursor: 'pointer', padding: 4 }}><Pencil size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); setConfirmDel(a) }} title="Удалить" style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: 820, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{student.full_name}</h3>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3 }}>
              {student.office} · {student.lang === 'каз' ? 'Казахский' : 'Русский'}{student.grade ? ` · ${student.grade} класс` : ''}{student.groupNamesText ? ` · ${student.groupNamesText}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: C.slate, border: 'none', background: 'none', cursor: 'pointer' }}><X size={21} /></button>
        </div>

        {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 12 }}>{err}</div>}

        {scores.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Kpi label="Последний результат" value={`${last}/${TOTAL_MAX}`} tint={scoreColor(last)} />
            <Kpi label="Лучший результат" value={`${best}/${TOTAL_MAX}`} tint={C.ok} />
            <Kpi label="Первый результат" value={`${first}/${TOTAL_MAX}`} />
            <Kpi label="Прирост" value={<DynBadge d={dyn} />} />
          </div>
        )}

        {chartData.length > 1 && (
          <Panel title="Динамика пробных ЕНТ">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, TOTAL_MAX]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(name, p) => p?.[0]?.payload ? `${name} · ${p[0].payload.date}` : name} />
                <Line type="monotone" dataKey="score" stroke={C.brand} strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}

        <div style={{ background: C.grey, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Школа и профильные предметы</div>
          <div className="rowflex" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px' }}>
              <Field label="Школа">
                <input value={school} onChange={(e) => setSchool(e.target.value)} list="ent-schools-list" placeholder="Начните вводить или выберите" style={inp} />
                <datalist id="ent-schools-list">{schools.map((sc) => <option key={sc} value={sc} />)}</datalist>
              </Field>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Field label="Профильный предмет 1">
                <select value={subj1} onChange={(e) => setSubj1(e.target.value)} style={inp}>
                  <option value="">— не указан —</option>
                  {dict.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Field label="Профильный предмет 2">
                <select value={subj2} onChange={(e) => setSubj2(e.target.value)} style={inp}>
                  <option value="">— не указан —</option>
                  {dict.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
          {subj1 && subj2 && subj1 === subj2 && <div style={{ color: '#c2360b', fontSize: 12.5, marginBottom: 8 }}>Профильные предметы должны отличаться.</div>}
          <div className="rowflex" style={{ gap: 10 }}>
            <button onClick={saveProfile} disabled={savingProfile} className="rowflex"
              style={{ gap: 6, padding: '8px 16px', background: C.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: savingProfile ? 0.6 : 1 }}>
              <Check size={14} /> {savingProfile ? 'Сохраняю…' : 'Сохранить'}
            </button>
            {profileMsg && <span style={{ fontSize: 12.5, color: C.ok, fontWeight: 600 }}>{profileMsg}</span>}
          </div>
        </div>

        <div className="rowflex" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Пробные ЕНТ</div>
          <button onClick={() => setEditing('new')} disabled={!canAddAttempt} className="rowflex"
            style={{ marginLeft: 'auto', gap: 6, padding: '7px 14px', background: canAddAttempt ? C.brandSoft : C.grey,
              color: canAddAttempt ? C.brand : C.faint, border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: canAddAttempt ? 'pointer' : 'default' }}>
            <Plus size={14} /> Добавить попытку
          </button>
        </div>
        {!canAddAttempt && <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>Сначала укажите и сохраните два разных профильных предмета выше.</div>}

        {attempts === null ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.slate }}>Загрузка…</div>
        ) : attempts.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: C.grey, borderRadius: 10, color: C.faint, fontSize: 13 }}>Пока ни одной попытки не записано.</div>
        ) : (
          <DataTable columns={attemptColumns} rows={attempts} pageSize={attempts.length} initialSort={{ key: 'attempt_date', dir: 'desc' }} />
        )}

        {editing && (
          <AttemptForm studentId={student.id} attempt={editing === 'new' ? null : editing}
            subject1Id={subj1} subject1Name={subj1Name} subject2Id={subj2} subject2Name={subj2Name}
            onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await loadAttempts(); await onChanged() }} />
        )}

        {confirmDel && (
          <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>Удалить попытку?</h3>
              <p style={{ fontSize: 13.5, color: C.slate, margin: '0 0 18px' }}>Результат за {fmtDate(confirmDel.attempt_date)} ({confirmDel.total_score}/{TOTAL_MAX}) будет удалён без возможности восстановить.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
                <button onClick={async () => { const id = confirmDel.id; setConfirmDel(null); try { await deleteEntAttempt(id); await loadAttempts(); await onChanged() } catch (e) { setErr(e.message) } }}
                  style={{ flex: 1, padding: 11, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Удалить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ================= ФОРМА ПОПЫТКИ (одна, из карточки) =================
function AttemptForm({ studentId, attempt, subject1Id, subject1Name, subject2Id, subject2Name, onClose, onSaved }) {
  const isNew = !attempt
  const s1name = isNew ? subject1Name : attempt.subject1_name
  const s2name = isNew ? subject2Name : attempt.subject2_name

  const [date, setDate] = useState(attempt?.attempt_date || new Date().toISOString().slice(0, 10))
  const [hist, setHist] = useState(attempt ? String(attempt.history_kz_score) : '')
  const [read, setRead] = useState(attempt ? String(attempt.reading_score) : '')
  const [math, setMath] = useState(attempt ? String(attempt.math_literacy_score) : '')
  const [s1, setS1] = useState(attempt ? String(attempt.subject1_score) : '')
  const [s2, setS2] = useState(attempt ? String(attempt.subject2_score) : '')
  const [comment, setComment] = useState(attempt?.comment || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const total = [hist, read, math, s1, s2].reduce((sum, v) => sum + (Number(v) || 0), 0)

  function validate() {
    const checks = [[hist, 0, MAX.history, 'История Казахстана'], [read, 0, MAX.reading, 'Грамотность чтения'],
      [math, 0, MAX.math, 'Математическая грамотность'], [s1, 0, MAX.subj, s1name], [s2, 0, MAX.subj, s2name]]
    for (const [v, min, max, label] of checks) {
      if (v === '' || v == null || Number.isNaN(Number(v))) return `Введите число для «${label}»`
      const n = Number(v)
      if (n < min || n > max) return `«${label}»: допустимо от ${min} до ${max}`
    }
    return null
  }

  async function save() {
    const v = validate()
    if (v) { setErr(v); return }
    setBusy(true); setErr('')
    const fields = {
      attempt_date: date, history_kz_score: hist, reading_score: read, math_literacy_score: math,
      subject1_id: isNew ? subject1Id : attempt.subject1_id, subject1_name: s1name, subject1_score: s1,
      subject2_id: isNew ? subject2Id : attempt.subject2_id, subject2_name: s2name, subject2_score: s2,
      comment,
    }
    try {
      if (isNew) await addEntAttempt(studentId, fields)
      else await updateEntAttempt(attempt.id, fields)
      await onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.55)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 440, padding: 22, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{isNew ? 'Новая попытка' : 'Редактировать попытку'}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={19} /></button>
        </div>
        <Field label="Дата пробного ЕНТ"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
        <div className="rowflex" style={{ gap: 10 }}>
          <ScoreField label="История Казахстана" max={MAX.history} value={hist} onChange={setHist} />
          <ScoreField label="Грамотность чтения" max={MAX.reading} value={read} onChange={setRead} />
        </div>
        <div className="rowflex" style={{ gap: 10 }}>
          <ScoreField label="Мат. грамотность" max={MAX.math} value={math} onChange={setMath} />
          <div style={{ flex: 1 }} />
        </div>
        <div className="rowflex" style={{ gap: 10 }}>
          <ScoreField label={s1name} max={MAX.subj} value={s1} onChange={setS1} />
          <ScoreField label={s2name} max={MAX.subj} value={s2} onChange={setS2} />
        </div>
        <Field label="Комментарий (необязательно)"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="напр. писал в другом кабинете" style={inp} /></Field>
        <div style={{ background: C.brandSoft, borderRadius: 10, padding: '10px 14px', marginBottom: 12, textAlign: 'center' }}>
          <span style={{ fontSize: 12.5, color: C.slate }}>Итог: </span><b style={{ fontSize: 17, color: C.brand }}>{total}/{TOTAL_MAX}</b>
        </div>
        {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
function ScoreField({ label, max, value, onChange }) {
  return (
    <div style={{ marginBottom: 13, flex: 1 }}>
      <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 5 }}>{label} (0–{max})</label>
      <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`0–${max}`} style={inp} />
    </div>
  )
}

// ================= МАССОВЫЙ ВВОД ПО ГРУППЕ =================
function BulkAttemptModal({ students, groups, dict, onClose, onSaved }) {
  const [step, setStep] = useState(1) // 1: дата+группа, 2: таблица
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [groupId, setGroupId] = useState('')
  const [rows, setRows] = useState([]) // { student, hist, read, math, s1, s2 }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const groupStudents = students.filter((s) => s.groupIds.includes(groupId))

  function startStep2() {
    if (!groupId) { setErr('Выберите группу'); return }
    setErr('')
    setRows(groupStudents.map((s) => ({ student: s, hist: '', read: '', math: '', s1: '', s2: '' })))
    setStep(2)
  }

  function setCell(idx, field, value) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  function rowTotal(r) {
    return [r.hist, r.read, r.math, r.s1, r.s2].reduce((s, v) => s + (Number(v) || 0), 0)
  }
  function rowFilled(r) {
    return [r.hist, r.read, r.math, r.s1, r.s2].every((v) => v !== '' && v != null)
  }
  function rowValid(r) {
    if (!rowFilled(r)) return true // пустые — просто пропустим, это не ошибка
    const checks = [[r.hist, 0, MAX.history], [r.read, 0, MAX.reading], [r.math, 0, MAX.math], [r.s1, 0, MAX.subj], [r.s2, 0, MAX.subj]]
    return checks.every(([v, min, max]) => !Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max)
  }

  const filledRows = rows.filter(rowFilled)
  const invalidRows = rows.filter((r) => rowFilled(r) && !rowValid(r))

  async function save() {
    if (invalidRows.length > 0) { setErr('Есть баллы вне допустимого диапазона — проверьте подсвеченные строки.'); return }
    if (filledRows.length === 0) { setErr('Заполните результаты хотя бы одного ученика.'); return }
    setBusy(true); setErr('')
    try {
      await addEntAttemptsBulk(filledRows.map((r) => ({
        studentId: r.student.id, attempt_date: date,
        history_kz_score: r.hist, reading_score: r.read, math_literacy_score: r.math,
        subject1_id: r.student.profile_subject_1_id, subject1_name: r.student.subj1Name, subject1_score: r.s1,
        subject2_id: r.student.profile_subject_2_id, subject2_name: r.student.subj2Name, subject2_score: r.s2,
      })))
      await onSaved()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,.55)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 65 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: '100%', maxWidth: step === 2 ? 920 : 440, padding: 24, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="rowflex" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Новая попытка по группе</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: C.slate, cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {step === 1 ? (
          <>
            <Field label="Дата пробного ЕНТ"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
            <Field label="Группа">
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={inp}>
                <option value="">— выберите группу —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.office})</option>)}
              </select>
            </Field>
            {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <button onClick={startStep2} style={{ width: '100%', padding: 12, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Далее — заполнить результаты
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 12 }}>
              {groups.find((g) => g.id === groupId)?.name} · {fmtDate(date)} · оставьте строку пустой, если ученик не сдавал — она не будет сохранена
            </div>
            {groupStudents.length === 0 ? (
              <Empty icon={Users} text="В этой группе нет учеников" />
            ) : (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'auto', marginBottom: 14 }}>
                <table className="dt" style={{ minWidth: 760 }}>
                  <thead><tr>
                    <th>Ученик</th><th>История (0-{MAX.history})</th><th>Чтение (0-{MAX.reading})</th><th>Мат.гр. (0-{MAX.math})</th>
                    <th>Профиль 1</th><th>Профиль 2</th><th style={{ textAlign: 'right' }}>Итого</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const missingProfile = !r.student.profile_subject_1_id || !r.student.profile_subject_2_id
                      const invalid = rowFilled(r) && !rowValid(r)
                      return (
                        <tr key={r.student.id} style={{ background: invalid ? '#fee2e2' : 'transparent' }}>
                          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {r.student.full_name}
                            {missingProfile && <div style={{ fontSize: 10.5, color: '#dc2626' }}>нет профильных предметов</div>}
                          </td>
                          <td><CellInput value={r.hist} onChange={(v) => setCell(i, 'hist', v)} disabled={missingProfile} /></td>
                          <td><CellInput value={r.read} onChange={(v) => setCell(i, 'read', v)} disabled={missingProfile} /></td>
                          <td><CellInput value={r.math} onChange={(v) => setCell(i, 'math', v)} disabled={missingProfile} /></td>
                          <td><CellInput value={r.s1} onChange={(v) => setCell(i, 's1', v)} disabled={missingProfile} title={r.student.subj1Name} /></td>
                          <td><CellInput value={r.s2} onChange={(v) => setCell(i, 's2', v)} disabled={missingProfile} title={r.student.subj2Name} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{rowFilled(r) ? rowTotal(r) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: 11, borderRadius: 10, background: C.grey, color: C.ink, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Назад</button>
              <button onClick={save} disabled={busy} className="rowflex"
                style={{ flex: 2, justifyContent: 'center', gap: 6, padding: 11, borderRadius: 10, background: C.brand, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                <Check size={16} /> {busy ? 'Сохраняю…' : `Сохранить результаты (${filledRows.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
function CellInput({ value, onChange, disabled, title }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} title={title}
    style={{ width: 62, padding: '5px 7px', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 12.5, outline: 'none', background: disabled ? C.grey : '#fff' }} />
}

// ================= ЭКСПОРТ EXCEL =================
function exportEntExcel(scope, dict) {
  const students = scope.students || (scope.attempts ? [...new Map(scope.attempts.map((a) => [a._student.id, a._student])).values()] : [])
  const attemptsFlat = scope.attempts || students.flatMap((s) => s.attempts.map((a, i) => ({ ...a, _no: i + 1, _student: s })))

  const wb = XLSX.utils.book_new()

  // Лист 1 — Ученики
  const sh1 = students.map((s) => ({
    ID: s.id, ФИО: s.full_name, Офис: s.office, Язык: s.lang, Группа: s.groupNamesText || '', Школа: s.school || '',
    'Профиль 1': s.subj1Name || '', 'Профиль 2': s.subj2Name || '',
    'Последний результат': s.last ?? '', 'Лучший результат': s.best ?? '', 'Динамика': s.dyn ?? '',
  }))
  addSheet(wb, 'Ученики', sh1)

  // Лист 2 — Все попытки
  const sh2 = attemptsFlat.map((a) => ({
    Ученик: a._student.full_name, Офис: a._student.office, Группа: a._student.groupNamesText || '', Школа: a._student.school || '',
    Дата: a.attempt_date, Попытка: a._no, История: a.history_kz_score, Чтение: a.reading_score, 'Мат. грамотность': a.math_literacy_score,
    'Профиль 1': a.subject1_name, 'Балл профиля 1': a.subject1_score, 'Профиль 2': a.subject2_name, 'Балл профиля 2': a.subject2_score,
    Итого: a.total_score,
  }))
  addSheet(wb, 'Все попытки', sh2)

  // Лист 3 — По группам
  const groupMap = {}
  students.forEach((s) => (s.groupNames || []).forEach((gn) => { (groupMap[gn] ||= []).push(s) }))
  const sh3 = Object.entries(groupMap).map(([name, list]) => {
    const a = aggregate(list)
    return { Группа: name, Количество: a.count, Средний: a.avgLast ?? '', Лучший: a.best ?? '', Минимальный: a.minLast ?? '', Прирост: a.avgDyn ?? '' }
  })
  addSheet(wb, 'По группам', sh3)

  // Лист 4 — По предметам
  const sh4 = []
  FIXED_SUBJECTS.forEach((f) => {
    const vals = students.filter((s) => s.attemptsCount > 0).map((s) => s.attempts[s.attempts.length - 1][f.k])
    sh4.push({ Предмет: f.label, Количество: vals.length, Средний: round1(avg(vals)) ?? '', Максимум: vals.length ? Math.max(...vals) : '', Минимум: vals.length ? Math.min(...vals) : '' })
  })
  const profileNames = new Set()
  students.forEach((s) => { if (s.subj1Name) profileNames.add(s.subj1Name); if (s.subj2Name) profileNames.add(s.subj2Name) })
  ;[...profileNames].sort((a, b) => a.localeCompare(b, 'ru')).forEach((name) => {
    const vals = students.map((s) => {
      const rel = s.attempts.filter((a) => a.subject1_name === name || a.subject2_name === name)
      return rel.length ? subjectNameScore(rel[rel.length - 1], name) : null
    }).filter((v) => v != null)
    sh4.push({ Предмет: name, Количество: vals.length, Средний: round1(avg(vals)) ?? '', Максимум: vals.length ? Math.max(...vals) : '', Минимум: vals.length ? Math.min(...vals) : '' })
  })
  addSheet(wb, 'По предметам', sh4)

  // Лист 5 — Аналитика
  const a = aggregate(students)
  const sh5 = [
    { Показатель: 'Всего учеников в выборке', Значение: a.count },
    { Показатель: 'С хотя бы одной попыткой', Значение: a.withResults },
    { Показатель: 'Средний последний результат', Значение: a.avgLast ?? '' },
    { Показатель: 'Лучший результат', Значение: a.best ?? '' },
    { Показатель: 'Минимальный последний результат', Значение: a.minLast ?? '' },
    { Показатель: 'Средний прирост', Значение: a.avgDyn ?? '' },
    { Показатель: '120+ баллов', Значение: students.filter((s) => s.last != null && s.last >= 120).length },
    { Показатель: 'Ниже 80 баллов', Значение: students.filter((s) => s.last != null && s.last < 80).length },
  ]
  addSheet(wb, 'Аналитика', sh5)

  XLSX.writeFile(wb, `ЕНТ_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
