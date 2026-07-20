import React, { useEffect, useMemo, useState } from 'react'
import { Layers, GraduationCap, BookOpen, Download, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchGroupsAnalytics, fetchTeachersAnalytics, fetchSubjectsAnalytics } from '../lib/api'
import { C, periodRange, periodLabelOf, OFFICES } from '../lib/utils'
import PeriodPicker from '../components/PeriodPicker'
import DataTable from '../components/DataTable'

const pctColor = (p) => p >= 85 ? C.ok : p >= 65 ? '#d97706' : '#dc2626'

export default function Analytics({ onOpenStudent }) {
  const [tab, setTab] = useState('groups') // groups | teachers | subjects
  const [period, setPeriod] = useState({ mode: 'month', month: new Date().toISOString().slice(0, 7) })
  const [office, setOffice] = useState('')  // '' = все
  const [lang, setLang] = useState('')      // '' = все
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => periodRange(period), [period])
  const label = periodLabelOf(period)

  useEffect(() => {
    setLoading(true)
    const fn = tab === 'groups' ? fetchGroupsAnalytics
      : tab === 'teachers' ? fetchTeachersAnalytics
      : fetchSubjectsAnalytics
    fn(range?.from, range?.to)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [tab, range])

  // фильтр офис/язык (только для групп — у остальных нет этих полей)
  const filtered = useMemo(() => {
    if (!rows) return []
    if (tab !== 'groups') return rows
    return rows.filter((r) =>
      (!office || r.office === office) && (!lang || r.lang === lang)
    )
  }, [rows, tab, office, lang])

  function exportXlsx() {
    const wb = XLSX.utils.book_new()
    let data = []
    if (tab === 'groups') {
      data = filtered.map((g) => ({
        'Группа': g.group_name, 'Предмет': g.subject_name, 'Офис': g.office, 'Язык': g.lang,
        'Преподаватель': g.teacher_name, 'Учеников': g.students_count, 'Ёмкость': g.capacity,
        'Заполняемость %': g.fill_pct, 'Занятий': g.lessons_done, 'Отменено': g.lessons_cancelled,
        'Посещаемость %': g.attendance_pct, 'В риске': g.risk_students,
      }))
    } else if (tab === 'teachers') {
      data = filtered.map((t) => ({
        'Преподаватель': t.teacher_name, 'Групп': t.groups_count, 'Учеников': t.students_count,
        'Занятий': t.lessons_done, 'Уроков': t.lesson_units, 'Отменено': t.lessons_cancelled,
        'Без плана': t.no_plan, 'Посещаемость %': t.attendance_pct, 'В риске': t.risk_students,
      }))
    } else {
      data = filtered.map((s) => ({
        'Предмет': s.subject_name, 'Групп': s.groups_count, 'Учеников': s.students_count,
        'Преподавателей': s.teachers_count, 'Занятий': s.lessons_done, 'Посещаемость %': s.attendance_pct,
      }))
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Аналитика')
    XLSX.writeFile(wb, `Аналитика_${tab}_${label.replace(/\s/g, '_')}.xlsx`)
  }

  const groupCols = [
    { key: 'group_name', label: 'Группа', render: (g) => <b>{g.group_name}</b> },
    { key: 'subject_name', label: 'Предмет', render: (g) => (g.subject_name || '—').split(' / ')[0] },
    { key: 'teacher_name', label: 'Преподаватель' },
    { key: 'office', label: 'Офис', width: 100 },
    {
      key: 'students_count', label: 'Учеников', num: true, width: 80,
      render: (g) => <span>{g.students_count}<span style={{ color: C.faint, fontWeight: 400 }}>/{g.capacity}</span></span>,
    },
    {
      key: 'fill_pct', label: 'Заполн.', num: true, width: 75,
      render: (g) => <span style={{ color: g.fill_pct < 50 ? '#dc2626' : C.ink }}>{g.fill_pct}%</span>,
    },
    { key: 'lessons_done', label: 'Занятий', num: true, width: 70 },
    {
      key: 'attendance_pct', label: 'Посещ.', num: true, width: 75,
      render: (g) => g.lessons_done
        ? <span style={{ color: pctColor(g.attendance_pct), fontWeight: 800 }}>{g.attendance_pct}%</span>
        : <span style={{ color: C.faint }}>—</span>,
    },
    {
      key: 'risk_students', label: 'Риск', num: true, width: 60,
      render: (g) => g.risk_students > 0
        ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{g.risk_students}</span>
        : <span style={{ color: C.faint }}>0</span>,
    },
  ]

  const teacherCols = [
    { key: 'teacher_name', label: 'Преподаватель', render: (t) => <b>{t.teacher_name}</b> },
    { key: 'groups_count', label: 'Групп', num: true, width: 70 },
    { key: 'students_count', label: 'Учеников', num: true, width: 85 },
    { key: 'lessons_done', label: 'Занятий', num: true, width: 75 },
    {
      key: 'lesson_units', label: 'Уроков', num: true, width: 75,
      render: (t) => <span style={{ color: C.brand, fontWeight: 800 }}>{t.lesson_units}</span>,
    },
    { key: 'lessons_cancelled', label: 'Отмен', num: true, width: 65 },
    {
      key: 'no_plan', label: 'Без плана', num: true, width: 85,
      render: (t) => <span style={{ color: t.no_plan > 3 ? '#dc2626' : C.ink }}>{t.no_plan}</span>,
    },
    {
      key: 'attendance_pct', label: 'Посещ.', num: true, width: 75,
      render: (t) => t.lessons_done
        ? <span style={{ color: pctColor(t.attendance_pct), fontWeight: 800 }}>{t.attendance_pct}%</span>
        : <span style={{ color: C.faint }}>—</span>,
    },
    {
      key: 'risk_students', label: 'Риск', num: true, width: 60,
      render: (t) => t.risk_students > 0
        ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{t.risk_students}</span>
        : <span style={{ color: C.faint }}>0</span>,
    },
  ]

  const subjectCols = [
    { key: 'subject_name', label: 'Предмет', render: (s) => <b>{(s.subject_name || '').split(' / ')[0]}</b> },
    { key: 'groups_count', label: 'Групп', num: true, width: 75 },
    {
      key: 'students_count', label: 'Учеников', num: true, width: 90,
      render: (s) => <span style={{ color: C.brand, fontWeight: 800 }}>{s.students_count}</span>,
    },
    { key: 'teachers_count', label: 'Препод.', num: true, width: 80 },
    { key: 'lessons_done', label: 'Занятий', num: true, width: 80 },
    {
      key: 'attendance_pct', label: 'Посещ.', num: true, width: 80,
      render: (s) => s.lessons_done
        ? <span style={{ color: pctColor(s.attendance_pct), fontWeight: 800 }}>{s.attendance_pct}%</span>
        : <span style={{ color: C.faint }}>—</span>,
    },
  ]

  const cols = tab === 'groups' ? groupCols : tab === 'teachers' ? teacherCols : subjectCols
  const keyed = filtered.map((r, i) => ({
    ...r,
    id: r.group_id || r.teacher_id || r.subject_name || i,
  }))

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Аналитика</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>{label} · где проседает центр</p>
        </div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <button onClick={exportXlsx} className="rowflex"
          style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={15} /> Excel
        </button>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { k: 'groups', t: 'Группы', icon: Layers },
          { k: 'teachers', t: 'Преподаватели', icon: GraduationCap },
          { k: 'subjects', t: 'Предметы', icon: BookOpen },
        ].map((o) => {
          const on = tab === o.k
          const Icon = o.icon
          return (
            <button key={o.k} onClick={() => setTab(o.k)} className="rowflex"
              style={{
                gap: 6, padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: on ? `1.5px solid ${C.brand}` : `1.5px solid ${C.line}`,
                background: on ? C.brand : '#fff', color: on ? '#fff' : C.slate,
              }}>
              <Icon size={15} /> {o.t}
            </button>
          )
        })}
      </div>

      {/* Фильтры офис/язык — только для групп */}
      {tab === 'groups' && (
        <div className="fbar">
          <button className={`fchip ${!office ? 'on' : ''}`} onClick={() => setOffice('')}>Все офисы</button>
          {OFFICES.map((o) => (
            <button key={o} className={`fchip ${office === o ? 'on' : ''}`} onClick={() => setOffice(o)}>{o}</button>
          ))}
          <span style={{ width: 10 }} />
          <button className={`fchip ${!lang ? 'on' : ''}`} onClick={() => setLang('')}>Все языки</button>
          <button className={`fchip ${lang === 'каз' ? 'on' : ''}`} onClick={() => setLang('каз')}>Каз</button>
          <button className={`fchip ${lang === 'рус' ? 'on' : ''}`} onClick={() => setLang('рус')}>Рус</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : (
        <>
          {tab === 'groups' && filtered.some((g) => g.fill_pct < 50) && (
            <Hint text="Красная заполняемость (<50%) — кандидаты на объединение или закрытие групп." />
          )}
          {tab === 'teachers' && filtered.some((t) => t.no_plan > 3) && (
            <Hint text="Красное «без плана» (>3) — преподаватели, которые не прикрепляют планы уроков." />
          )}
          <DataTable columns={cols} rows={keyed} pageSize={30} />
        </>
      )}
    </div>
  )
}

function Hint({ text }) {
  return (
    <div className="rowflex" style={{ gap: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '9px 13px', borderRadius: 10, fontSize: 12.5, marginBottom: 12 }}>
      <AlertTriangle size={14} /> {text}
    </div>
  )
}
