import React, { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, Users, CalendarCheck, FileWarning, AlertTriangle,
  GraduationCap, Layers, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts'
import { fetchDashboardData } from '../lib/api'
import { C, periodRange, periodLabelOf, lessonCount } from '../lib/utils'
import PeriodPicker from '../components/PeriodPicker'

export default function Dashboard({ onOpenRisks }) {
  const [period, setPeriod] = useState({ mode: 'month', month: new Date().toISOString().slice(0, 7) })
  const [data, setData] = useState(null)
  const [prev, setPrev] = useState(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => periodRange(period), [period])
  const prevRange = useMemo(() => shiftRange(range), [range])
  const label = periodLabelOf(period)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchDashboardData(range),
      prevRange ? fetchDashboardData(prevRange).catch(() => null) : Promise.resolve(null),
    ])
      .then(([cur, pr]) => { setData(cur); setPrev(pr) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [range, prevRange])

  const kpi = useMemo(() => calcKpi(data), [data])
  const kpiPrev = useMemo(() => calcKpi(prev), [prev])

  // ---------- ГРАФИКИ ----------
  const byOffice = useMemo(() => {
    if (!data) return []
    const m = {}
    data.lessons.filter((l) => l.status === 'проведён').forEach((l) => {
      const g = data.groups.find((x) => x.id === l.group_id)
      if (!g?.office) return
      const key = g.office
      const o = (m[key] ||= { office: key, каз_t: 0, каз_p: 0, рус_t: 0, рус_p: 0 })
      const att = data.attendance.filter((a) => a.lesson_id === l.id)
      const lang = g.lang === 'рус' ? 'рус' : 'каз'
      o[`${lang}_t`] += att.length
      o[`${lang}_p`] += att.filter((a) => a.present).length
    })
    return Object.values(m).map((o) => ({
      office: o.office,
      каз: o.каз_t ? Math.round((o.каз_p / o.каз_t) * 100) : 0,
      рус: o.рус_t ? Math.round((o.рус_p / o.рус_t) * 100) : 0,
    }))
  }, [data])

  const bySubject = useMemo(() => {
    if (!data) return []
    const m = {}
    data.lessons.filter((l) => l.status === 'проведён').forEach((l) => {
      const g = data.groups.find((x) => x.id === l.group_id)
      const subj = g?.subject_name
      if (!subj) return
      const s = (m[subj] ||= { subject: subj.split(' / ')[0], total: 0, present: 0 })
      const att = data.attendance.filter((a) => a.lesson_id === l.id)
      s.total += att.length
      s.present += att.filter((a) => a.present).length
    })
    return Object.values(m)
      .map((s) => ({ ...s, pct: s.total ? Math.round((s.present / s.total) * 100) : 0 }))
      .filter((s) => s.total > 0)
      .sort((a, b) => a.pct - b.pct) // худшие сверху
  }, [data])

  const byWeek = useMemo(() => {
    if (!data) return []
    const m = {}
    data.lessons.filter((l) => l.status === 'проведён').forEach((l) => {
      const wk = weekKey(new Date(l.lesson_date))
      const w = (m[wk] ||= { week: wk, total: 0, present: 0 })
      const att = data.attendance.filter((a) => a.lesson_id === l.id)
      w.total += att.length
      w.present += att.filter((a) => a.present).length
    })
    return Object.values(m).sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({ week: w.week.slice(5), pct: w.total ? Math.round((w.present / w.total) * 100) : 0 }))
  }, [data])

  function exportReport() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Показатель': 'Средняя посещаемость, %', 'Значение': kpi.pct,
    }, {
      'Показатель': 'Проведено занятий', 'Значение': kpi.lessons,
    }, {
      'Показатель': 'Уроков всего', 'Значение': kpi.lessonUnits,
    }, {
      'Показатель': 'Занятий без плана', 'Значение': kpi.noPlan,
    }, {
      'Показатель': 'Учеников в зоне риска', 'Значение': kpi.risk,
    }, {
      'Показатель': 'Активных учеников', 'Значение': kpi.students,
    }, {
      'Показатель': 'Заполняемость групп, %', 'Значение': kpi.fill,
    }]), 'KPI')
    if (byOffice.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byOffice), 'По офисам')
    if (bySubject.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      bySubject.map((s) => ({ 'Предмет': s.subject, 'Посещаемость %': s.pct, 'Отметок': s.total }))
    ), 'По предметам')
    XLSX.writeFile(wb, `Отчёт_${label.replace(/\s/g, '_')}.xlsx`)
  }

  return (
    <div>
      <div className="rowflex" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Дашборд</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>{label} · общая картина по центру</p>
        </div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <button onClick={exportReport} className="rowflex"
          style={{ gap: 6, padding: '8px 14px', background: C.ok, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          <Download size={15} /> Отчёт
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : (
        <>
          {/* ---------- KPI ---------- */}
          <div className="stats" style={{ marginBottom: 12 }}>
            <Kpi icon={TrendingUp} label="Средняя посещаемость" value={`${kpi.pct}%`}
              delta={delta(kpi.pct, kpiPrev.pct)} tint={C.brand} bg={C.brandSoft} />
            <Kpi icon={CalendarCheck} label="Проведено занятий" value={kpi.lessons}
              delta={delta(kpi.lessons, kpiPrev.lessons)} tint={C.teal} bg={C.tealSoft} />
            <Kpi icon={GraduationCap} label="Уроков всего" value={kpi.lessonUnits}
              delta={delta(kpi.lessonUnits, kpiPrev.lessonUnits)} tint={C.ink} bg={C.grey} />
            <Kpi icon={FileWarning} label="Занятий без плана" value={kpi.noPlan}
              delta={delta(kpi.noPlan, kpiPrev.noPlan, true)} tint={C.warn} bg={C.warnSoft} />
          </div>
          <div className="stats" style={{ marginBottom: 18 }}>
            <Kpi icon={AlertTriangle} label="Учеников в риске" value={kpi.risk}
              tint="#dc2626" bg="#fee2e2" onClick={onOpenRisks} />
            <Kpi icon={Users} label="Активных учеников" value={kpi.students} tint={C.ok} bg={C.okSoft} />
            <Kpi icon={Layers} label="Заполняемость групп" value={`${kpi.fill}%`} tint={C.brand} bg={C.brandSoft} />
            <Kpi icon={Layers} label="Групп с занятиями" value={kpi.activeGroups} tint={C.ink} bg={C.grey} />
          </div>

          {kpi.lessons === 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 16, marginBottom: 18, fontSize: 13.5, color: '#92400e' }}>
              <b>Занятий за этот период ещё не было.</b> Графики и метрики наполнятся, когда преподаватели начнут вносить занятия.
            </div>
          )}

          {/* ---------- ГРАФИКИ ---------- */}
          {byOffice.length > 0 && (
            <Panel title="Посещаемость по офисам">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={byOffice}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="office" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="каз" fill={C.brand} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="рус" fill={C.teal} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {bySubject.length > 0 && (
            <Panel title="Посещаемость по предметам" hint="Худшие сверху — там теряем учеников">
              <ResponsiveContainer width="100%" height={Math.max(200, bySubject.length * 32)}>
                <BarChart data={bySubject} layout="vertical" margin={{ left: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="subject" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="pct" radius={[0, 5, 5, 0]}>
                    {bySubject.map((s, i) => (
                      <Cell key={i} fill={s.pct >= 85 ? C.ok : s.pct >= 65 ? '#d97706' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {byWeek.length > 1 && (
            <Panel title="Динамика посещаемости по неделям">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={byWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="pct" stroke={C.brand} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

// ---------- РАСЧЁТ KPI ----------
function calcKpi(data) {
  if (!data) return { pct: 0, lessons: 0, lessonUnits: 0, noPlan: 0, risk: 0, students: 0, fill: 0, activeGroups: 0 }
  const done = data.lessons.filter((l) => l.status === 'проведён')
  const total = data.attendance.length
  const present = data.attendance.filter((a) => a.present).length

  // заполняемость: сколько учеников в группах / суммарная ёмкость
  const inGroups = {}
  data.studentGroups.forEach((sg) => { (inGroups[sg.group_id] ||= new Set()).add(sg.student_id) })
  const capacity = data.groups.reduce((s, g) => s + (g.capacity || 12), 0)
  const filled = data.groups.reduce((s, g) => s + (inGroups[g.id]?.size || 0), 0)

  return {
    pct: total ? Math.round((present / total) * 100) : 0,
    lessons: done.length,
    lessonUnits: done.reduce((s, l) => s + lessonCount(l), 0),
    noPlan: done.filter((l) => !l.plan_path).length,
    risk: data.students.filter((s) => s.status === 'risk' || s.status === 'attention').length,
    students: data.students.length,
    fill: capacity ? Math.round((filled / capacity) * 100) : 0,
    activeGroups: new Set(done.map((l) => l.group_id)).size,
  }
}

// ---------- КОМПОНЕНТЫ ----------
function Kpi({ icon: Icon, label, value, delta, tint, bg, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 14px',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div className="rowflex" style={{ gap: 10, marginBottom: 9 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: bg, color: tint, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={16} />
        </div>
        {delta != null && <Delta v={delta} />}
      </div>
      <div style={{ fontSize: 23, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Delta({ v }) {
  if (!v || v.value === 0) return null
  const good = v.good
  const Icon = v.value > 0 ? TrendingUp : TrendingDown
  return (
    <span className="rowflex" style={{
      marginLeft: 'auto', gap: 3, fontSize: 11.5, fontWeight: 700,
      color: good ? C.ok : '#dc2626',
      background: good ? C.okSoft : '#fee2e2',
      padding: '2px 7px', borderRadius: 20,
    }}>
      <Icon size={11} />{v.value > 0 ? '+' : ''}{v.value}
    </span>
  )
}

function Panel({ title, hint, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <h2 style={{ margin: '0 0 3px', fontSize: 15.5, fontWeight: 800 }}>{title}</h2>
      {hint && <p style={{ margin: '0 0 12px', fontSize: 12, color: C.faint }}>{hint}</p>}
      {!hint && <div style={{ height: 10 }} />}
      {children}
    </div>
  )
}

// дельта к прошлому периоду. lowerIsBetter — когда рост это плохо (напр. занятий без плана)
function delta(cur, prev, lowerIsBetter = false) {
  if (prev == null || prev === 0) return null
  const d = cur - prev
  if (d === 0) return null
  const good = lowerIsBetter ? d < 0 : d > 0
  return { value: d, good }
}

// предыдущий период той же длины
function shiftRange(r) {
  if (!r?.from || !r?.to) return null
  const from = new Date(r.from), to = new Date(r.to)
  const days = Math.round((to - from) / 86400000) + 1
  const pTo = new Date(from); pTo.setDate(pTo.getDate() - 1)
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - days + 1)
  return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) }
}

function weekKey(d) {
  const t = new Date(d)
  const day = (t.getDay() + 6) % 7
  t.setDate(t.getDate() - day)
  return t.toISOString().slice(0, 10)
}
