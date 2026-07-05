import React, { useMemo, useState } from 'react'
import {
  Clock, CheckCircle2, FileText, AlertTriangle, Users, Search, ChevronRight,
  Download, ArrowLeft, UserCheck, ClipboardCheck, Plus,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { C, lessonCount, nameOf, initials, avColorByIndex, periodRange } from '../lib/utils'
import { Stat, MiniStat } from '../components/ui'
import PeriodPicker from '../components/PeriodPicker'
import LessonTable from '../components/LessonTable'
import LessonForm from '../components/LessonForm'
import AttendancePanel from './AttendancePanel'

export default function AdminCabinet({ dict, lessons, period, setPeriod, periodLabel, onLessonChanged, onLessonDeleted }) {
  const [tab, setTab] = useState('teachers')
  const [q, setQ] = useState('')
  const [openTeacher, setOpenTeacher] = useState(null)

  const teacherStats = useMemo(() => dict.teachers.map((t, i) => {
    const done = lessons.filter((l) => l.teacher_id === t.id && l.status === 'проведён')
    return {
      ...t, idx: i,
      hours: done.reduce((s, l) => s + lessonCount(l), 0),
      count: done.length,
      groups: new Set(done.map((l) => l.group_id)).size,
      noPlan: done.filter((l) => !l.plan_path).length,
    }
  }), [dict.teachers, lessons])

  const assistantStats = useMemo(() => dict.assistants.map((a) => {
    const done = lessons.filter((l) => l.assistant_id === a.id && l.status === 'проведён')
    const withT = {}
    done.forEach((l) => {
      withT[l.teacher_id] = withT[l.teacher_id] || { count: 0, hours: 0 }
      withT[l.teacher_id].count++
      withT[l.teacher_id].hours += lessonCount(l)
    })
    return {
      ...a,
      count: done.length,
      hours: done.reduce((s, l) => s + lessonCount(l), 0),
      teachers: Object.entries(withT)
        .map(([tid, v]) => ({ name: nameOf(dict.teachers, tid), ...v }))
        .sort((x, y) => y.hours - x.hours),
    }
  }).sort((x, y) => y.hours - x.hours), [dict.assistants, dict.teachers, lessons])

  const totals = useMemo(() => {
    const done = lessons.filter((l) => l.status === 'проведён')
    return {
      hours: done.reduce((s, l) => s + lessonCount(l), 0),
      count: done.length,
      noPlan: done.filter((l) => !l.plan_path).length,
      cancelled: lessons.filter((l) => l.status === 'отменён').length,
    }
  }, [lessons])

  const filtered = teacherStats.filter((t) => {
    const s = q.toLowerCase().trim()
    return !s || t.full_name.toLowerCase().includes(s)
  })

  function exportAll() {
    const rows = lessons.map((l) => ({
      Дата: l.lesson_date, 
      Уроков: lessonCount(l),
      Преподаватель: nameOf(dict.teachers, l.teacher_id), Группа: nameOf(dict.groups, l.group_id),
      Ассистент: l.assistant_id ? nameOf(dict.assistants, l.assistant_id) : '—',
      Тема: l.topic, Учеников: l.students, Статус: l.status, 'План урока': l.plan_path ? 'есть' : 'нет',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Уроки')
    const summary = teacherStats.map((t) => ({ Преподаватель: t.full_name, Уроков: t.hours, Уроков: t.count, 'Без плана': t.noPlan }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Часы по учителям')
    const asst = []
    assistantStats.forEach((a) => {
      if (!a.count) { asst.push({ Ассистент: a.full_name, Преподаватель: '—', Занятий: 0, Уроков: 0 }); return }
      a.teachers.forEach((t) => asst.push({ Ассистент: a.full_name, Преподаватель: t.name, Занятий: t.count, Уроков: t.hours }))
      asst.push({ Ассистент: a.full_name, Преподаватель: 'ИТОГО', Занятий: a.count, Уроков: a.hours })
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(asst), 'Ассистенты')
    XLSX.writeFile(wb, `Отчёт_${periodLabel.replace(' ', '_')}.xlsx`)
  }

  if (openTeacher) {
    const t = teacherStats.find((x) => x.id === openTeacher)
    return <TeacherProfile t={t} dict={dict} lessons={lessons} periodLabel={periodLabel} onBack={() => setOpenTeacher(null)}
      onLessonChanged={onLessonChanged} onLessonDeleted={onLessonDeleted} />
  }

  return (
    <>
      <div className="rowflex" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Сводка</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>{periodLabel} · контроль работы преподавателей</p>
        </div>
        <div className="rowflex" style={{ marginLeft: 'auto', gap: 10 }}>
          <PeriodPicker period={period} setPeriod={setPeriod} />
          <button onClick={exportAll} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: C.teal, color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={16} /> <span className="hide-sm">Excel</span>
          </button>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 28 }}>
        <Stat icon={Clock} label="Всего уроков" value={totals.hours.toLocaleString('ru-RU')} tint={C.brand} bg={C.brandSoft} />
        <Stat icon={CheckCircle2} label="Проведено уроков" value={totals.count} tint={C.ok} bg={C.okSoft} />
        <Stat icon={FileText} label="Без плана урока" value={totals.noPlan} tint={C.warn} bg={C.warnSoft} />
        <Stat icon={AlertTriangle} label="Отменено" value={totals.cancelled} tint={C.slate} bg={C.grey} />
      </div>

      <div className="rowflex" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: C.grey, borderRadius: 11, padding: 3 }}>
          {[{ k: 'teachers', t: 'Преподаватели' }, { k: 'assistants', t: 'Ассистенты' }, { k: 'attendance', t: 'Посещаемость' }].map((o) => {
            const a = tab === o.k
            return <button key={o.k} onClick={() => setTab(o.k)}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: a ? C.card : 'transparent', color: a ? C.brand : C.slate, boxShadow: a ? '0 1px 4px rgba(20,24,58,.1)' : 'none', border: 'none', cursor: 'pointer' }}>{o.t}</button>
          })}
        </div>
        {tab === 'teachers' && (
          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 220, flex: '0 1 300px' }}>
            <Search size={16} color={C.slate} style={{ position: 'absolute', left: 12, top: 10 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск преподавателя…"
              style={{ width: '100%', padding: '9px 12px 9px 36px', border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, outline: 'none', background: C.card }} />
          </div>
        )}
      </div>

      {tab === 'teachers' ? (
        <div className="tgrid">
          {filtered.map((t) => (
            <button key={t.id} onClick={() => setOpenTeacher(t.id)} className="card-hover"
              style={{ textAlign: 'left', background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, display: 'block', cursor: 'pointer' }}>
              <div className="rowflex" style={{ marginBottom: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: avColorByIndex(t.idx), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15 }}>{initials(t.full_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.full_name}</div>
                  <div style={{ fontSize: 12.5, color: C.slate }}>{nameOf(dict.subjects, t.subject_id)}</div>
                </div>
                <ChevronRight size={18} color={C.faint} />
              </div>
              <div className="rowflex" style={{ gap: 0, borderTop: `1px solid ${C.line}`, paddingTop: 13 }}>
                <MiniStat value={t.hours} label="уроков" tint={C.brand} />
                <MiniStat value={t.count} label="уроков" tint={C.ink} />
                <MiniStat value={t.groups} label="групп" tint={C.ink} />
              </div>
              {t.noPlan > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: C.warn, background: C.warnSoft, padding: '5px 10px', borderRadius: 8, textAlign: 'center' }}>
                  {t.noPlan} без плана
                </div>
              )}
            </button>
          ))}
        </div>
      ) : tab === 'attendance' ? (
        <AttendancePanel dict={dict} periodRange={periodRange(period)} periodLabel={periodLabel} />
      ) : (
        <div className="tgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {assistantStats.map((a) => (
            <div key={a.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
              <div className="rowflex" style={{ marginBottom: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: C.tealSoft, color: C.teal, display: 'grid', placeItems: 'center' }}>
                  <UserCheck size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.full_name}</div>
                  <div style={{ fontSize: 12.5, color: C.slate }}>ассистент</div>
                </div>
              </div>
              <div className="rowflex" style={{ gap: 0, borderTop: `1px solid ${C.line}`, borderBottom: a.teachers.length ? `1px solid ${C.line}` : 'none', padding: '13px 0' }}>
                <MiniStat value={a.hours} label="уроков" tint={C.teal} />
                <MiniStat value={a.count} label="занятий" tint={C.ink} />
                <MiniStat value={a.teachers.length} label="препод." tint={C.ink} />
              </div>
              {a.teachers.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>С преподавателями</div>
                  {a.teachers.map((t) => (
                    <div key={t.name} className="rowflex" style={{ justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                      <span style={{ color: C.ink }}>{t.name}</span>
                      <span style={{ color: C.slate }}><b style={{ color: C.teal }}>{t.hours}</b> ур. · {t.count} зан.</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 12, fontSize: 12.5, color: C.faint, textAlign: 'center' }}>Нет занятий за период</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function TeacherProfile({ t, dict, lessons, periodLabel, onBack, onLessonChanged, onLessonDeleted }) {
  const [editing, setEditing] = useState(null)
  const own = lessons.filter((l) => l.teacher_id === t.id)
  const done = own.filter((l) => l.status === 'проведён')
  const hours = done.reduce((s, l) => s + lessonCount(l), 0)
  const noPlan = done.filter((l) => !l.plan_path).length

  const byGroup = useMemo(() => {
    const m = {}
    done.forEach((l) => {
      m[l.group_id] = m[l.group_id] || { hours: 0, count: 0 }
      m[l.group_id].hours += lessonCount(l)
      m[l.group_id].count++
    })
    return Object.entries(m).map(([gid, v]) => ({ name: nameOf(dict.groups, gid), ...v })).sort((a, b) => b.hours - a.hours)
  }, [done, dict.groups])

  function exportOne() {
    const rows = own.map((l) => ({
      Дата: l.lesson_date, 
      Уроков: lessonCount(l), Группа: nameOf(dict.groups, l.group_id),
      Ассистент: l.assistant_id ? nameOf(dict.assistants, l.assistant_id) : '—',
      Тема: l.topic, Учеников: l.students, Статус: l.status, План: l.plan_path ? 'есть' : 'нет',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Уроки')
    XLSX.writeFile(wb, `${t.full_name.replace(' ', '_')}_${periodLabel.replace(' ', '_')}.xlsx`)
  }

  return (
    <>
      <button onClick={onBack} className="rowflex" style={{ gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, marginBottom: 16, border: 'none', background: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} /> Все преподаватели
      </button>

      <div style={{ background: `linear-gradient(135deg,${C.brand},${C.brand2})`, borderRadius: 18, padding: 22, color: '#fff', marginBottom: 16 }}>
        <div className="rowflex" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>{initials(t.full_name)}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>{t.full_name}</div>
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>{nameOf(dict.subjects, t.subject_id)}{t.phone ? ` · ${t.phone}` : ''}</div>
          </div>
          <button onClick={() => setEditing('new')} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: '#fff', color: C.brand, borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Создать урок
          </button>
          <button onClick={exportOne} className="rowflex" style={{ gap: 7, padding: '9px 15px', background: 'rgba(255,255,255,.2)', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <Download size={16} /> Excel
          </button>
        </div>
        <div className="rowflex" style={{ gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
          <BigNum value={hours} label="уроков за период" />
          <BigNum value={done.length} label="уроков" />
          <BigNum value={byGroup.length} label="групп" />
          <BigNum value={noPlan} label="без плана" warn={noPlan > 0} />
        </div>
      </div>

      {byGroup.length > 0 && (
        <>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Часы по группам</h2>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
            {byGroup.map((g, i) => {
              const pct = (g.hours / byGroup[0].hours) * 100
              return (
                <div key={g.name} style={{ padding: '13px 16px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                  <div className="rowflex" style={{ justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}><Users size={13} style={{ verticalAlign: -2, marginRight: 5, color: C.slate }} />{g.name}</span>
                    <span style={{ fontSize: 13, color: C.slate }}><b style={{ color: C.brand }}>{g.hours}</b> ур. · {g.count} зап.</span>
                  </div>
                  <div style={{ height: 6, background: C.grey, borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${C.brand},${C.brand2})`, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Все уроки</h2>
      <LessonTable lessons={own} dict={dict} onEdit={(l) => setEditing(l)} />

      {editing && (
        <LessonForm
          teacherId={t.id}
          lesson={editing === 'new' ? null : editing}
          dict={dict}
          onClose={() => setEditing(null)}
          onSaved={(l) => { setEditing(null); onLessonChanged(l) }}
          onDeleted={(id) => { setEditing(null); onLessonDeleted(id) }}
        />
      )}
    </>
  )
}

function BigNum({ value, label, warn }) {
  return (
    <div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: warn ? '#ffd7b0' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 5 }}>{label}</div>
    </div>
  )
}
