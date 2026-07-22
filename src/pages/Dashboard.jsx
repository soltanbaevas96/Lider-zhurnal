import React, { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, Users, CalendarCheck, FileWarning, AlertTriangle,
  Wallet, Layers, UserPlus, CalendarX, Clock, ChevronRight, Minus,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell,
} from 'recharts'
import { fetchDashboard } from '../lib/api'
import { C, periodRange, periodLabelOf } from '../lib/utils'
import PeriodPicker from '../components/PeriodPicker'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')
const pctColor = (p) => p >= 85 ? C.ok : p >= 70 ? '#d97706' : '#dc2626'

const REASON_LABELS = {
  illness: 'Болезнь', school: 'Школа', olympiad: 'Олимпиада',
  vacation: 'Каникулы', no_reason: 'Без причины', other: 'Другое',
  excused: 'Уважительная', no_notice: 'Не предупредил',
  schedule_conflict: 'Расписание', not_set: 'Не указана',
}
const REASON_COLORS = ['#0369a1', '#0d9488', '#7c3aed', '#d97706', '#dc2626', '#6b7194']

export default function Dashboard({ onOpenRisks, onOpenSection }) {
  const [period, setPeriod] = useState({ mode: 'month', month: new Date().toISOString().slice(0, 7) })
  const [cur, setCur] = useState(null)
  const [prev, setPrev] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const range = useMemo(() => periodRange(period), [period])
  const prevRange = useMemo(() => shiftRange(range), [range])
  const label = periodLabelOf(period)

  useEffect(() => {
    setLoading(true); setErr('')
    Promise.all([
      fetchDashboard(range?.from, range?.to),
      prevRange ? fetchDashboard(prevRange.from, prevRange.to).catch(() => null) : Promise.resolve(null),
    ])
      .then(([a, b]) => { setCur(a); setPrev(b) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [range, prevRange])

  const k = cur?.kpi
  const kp = prev?.kpi
  const empty = !loading && (!k || k.lessons_done === 0)

  return (
    <div>
      {/* ---------- ШАПКА ---------- */}
      <div className="rowflex" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: -0.5 }}>Обзор центра</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.slate }}>{label}</p>
        </div>
        <PeriodPicker period={period} setPeriod={setPeriod} />
      </div>

      {err && <Banner type="error">{err}</Banner>}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.slate }}>Загрузка…</div>
      ) : empty ? (
        <EmptyState />
      ) : (
        <>
          {/* ---------- ГЛАВНАЯ ПОЛОСА ---------- */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 12, marginBottom: 12 }}>
            <HeroCard
              value={`${k.attendance_pct}%`}
              label="Средняя посещаемость"
              delta={delta(k.attendance_pct, kp?.attendance_pct)}
              suffix="п.п."
              tint={pctColor(k.attendance_pct)}
              icon={TrendingUp}
              progress={k.attendance_pct}
            />
            <HeroCard
              value={k.lessons_done}
              label="Проведено занятий"
              sub={`${k.lesson_units} уроков`}
              delta={delta(k.lessons_done, kp?.lessons_done)}
              tint={C.brand}
              icon={CalendarCheck}
            />
            <HeroCard
              value={k.students_active}
              label="Активных учеников"
              sub={k.students_new > 0 ? `+${k.students_new} новых за период` : null}
              tint={C.teal}
              icon={Users}
            />
            <HeroCard
              value={`${money(k.payroll_sum)} ₸`}
              label="Фонд оплаты"
              sub={`${k.teachers_active} преподавателей`}
              tint={C.ink}
              icon={Wallet}
              small
            />
          </div>

          {/* ---------- ТРЕБУЕТ ВНИМАНИЯ ---------- */}
          <SectionTitle>Требует внимания</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginBottom: 20 }}>
            <AlertCard
              n={k.students_risk} label="учеников в зоне риска"
              tone={k.students_risk > 0 ? 'danger' : 'ok'}
              icon={AlertTriangle} onClick={onOpenRisks}
            />
            <AlertCard
              n={k.lessons_missed} label="занятий не проведено"
              tone={k.lessons_missed > 0 ? 'warn' : 'ok'}
              icon={CalendarX}
              onClick={() => onOpenSection?.('schedule')}
            />
            <AlertCard
              n={k.no_plan} label="занятий без плана"
              tone={k.no_plan > 0 ? 'warn' : 'ok'}
              icon={FileWarning}
            />
            <AlertCard
              n={k.lessons_cancel} label="отменённых занятий"
              tone={k.lessons_cancel > 0 ? 'warn' : 'ok'}
              icon={Minus}
            />
            <AlertCard
              n={`${k.fill_pct}%`} label="заполняемость групп"
              tone={k.fill_pct < 50 ? 'danger' : k.fill_pct < 70 ? 'warn' : 'ok'}
              icon={Layers}
              onClick={() => onOpenSection?.('analytics')}
            />
          </div>

          {/* ---------- ДИНАМИКА ---------- */}
          {cur.weeks.length >= 3 && (
            <Panel title="Динамика посещаемости" hint="последние 12 недель">
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={cur.weeks.map((w) => ({
                  week: `${w.week_start.slice(8, 10)}.${w.week_start.slice(5, 7)}`,
                  pct: w.pct, lessons: w.lessons,
                }))} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gPct" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.brand} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.brand} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<WeekTip />} cursor={{ stroke: C.line }} />
                  <Area type="monotone" dataKey="pct" stroke={C.brand} strokeWidth={2.5} fill="url(#gPct)" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* ---------- ДВА СТОЛБЦА ---------- */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12, marginBottom: 12 }}>
            {/* Офисы */}
            {cur.offices.length > 0 && (
              <Panel title="Посещаемость по офисам">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {groupOffices(cur.offices).map((o) => (
                    <div key={o.office}>
                      <div className="rowflex" style={{ gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{o.office}</span>
                        <span style={{ fontSize: 11.5, color: C.faint }}>{o.lessons} занятий</span>
                        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: pctColor(o.pct) }}>{o.pct}%</span>
                      </div>
                      {o.langs.map((l) => (
                        <div key={l.lang} className="rowflex" style={{ gap: 8, marginBottom: 3 }}>
                          <span style={{ width: 30, fontSize: 11, color: C.faint }}>{l.lang}</span>
                          <div style={{ flex: 1, height: 7, background: C.grey, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${l.pct}%`, height: '100%', background: pctColor(l.pct), borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: C.slate }}>{l.pct}%</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Предметы */}
            {cur.subjects.length > 0 && (
              <Panel title="Посещаемость по предметам" hint="худшие сверху — там теряем учеников">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cur.subjects.slice(0, 8).map((s) => (
                    <div key={s.subject_name} className="rowflex" style={{ gap: 9 }}>
                      <span style={{ width: 96, fontSize: 12, color: C.slate, textAlign: 'right',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.subject_name}
                      </span>
                      <div style={{ flex: 1, height: 20, background: C.grey, borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          width: `${Math.max(s.pct, 2)}%`, height: '100%',
                          background: pctColor(s.pct), borderRadius: 5,
                          transition: 'width .3s',
                        }} />
                      </div>
                      <span style={{ width: 38, textAlign: 'right', fontSize: 13, fontWeight: 800, color: pctColor(s.pct) }}>
                        {s.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {/* ---------- ЕЩЁ ДВА СТОЛБЦА ---------- */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
            {/* Слабые преподаватели */}
            {cur.worstTeachers.length > 0 && (
              <Panel title="Преподаватели с низкой посещаемостью">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {cur.worstTeachers.map((t, i) => (
                    <div key={t.teacher_id} className="rowflex"
                      style={{ gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.teacher_name}
                      </span>
                      {t.no_plan > 0 && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.warn, background: C.warnSoft, padding: '2px 7px', borderRadius: 20 }}>
                          {t.no_plan} без плана
                        </span>
                      )}
                      <span style={{ fontSize: 11.5, color: C.faint }}>{t.lessons} зан.</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: pctColor(t.pct), minWidth: 40, textAlign: 'right' }}>
                        {t.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Причины пропусков */}
            {cur.reasons.length > 0 && (
              <Panel title="Причины пропусков" hint="отличаем «болеет» от «теряем»">
                <ReasonsBar reasons={cur.reasons} />
              </Panel>
            )}

            {/* Слабые группы */}
            {cur.weakGroups.length > 0 && (
              <Panel title="Группы с низкой заполняемостью" hint="кандидаты на объединение">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {cur.weakGroups.map((g, i) => (
                    <div key={g.group_id} className="rowflex"
                      style={{ gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{g.group_name}</div>
                        <div style={{ fontSize: 11, color: C.faint }}>{g.subject_name} · {g.office}</div>
                      </div>
                      <span style={{ fontSize: 12, color: C.slate }}>
                        {g.students}<span style={{ color: C.faint }}>/{g.capacity}</span>
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: g.fill_pct < 50 ? '#dc2626' : C.slate, minWidth: 40, textAlign: 'right' }}>
                        {g.fill_pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ================= КОМПОНЕНТЫ =================

function HeroCard({ value, label, sub, delta, suffix, tint, icon: Icon, progress, small }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
      padding: '15px 16px', position: 'relative', overflow: 'hidden',
    }}>
      <div className="rowflex" style={{ gap: 9, marginBottom: 11 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: tint + '15', color: tint, display: 'grid', placeItems: 'center' }}>
          <Icon size={16} />
        </div>
        {delta && <DeltaBadge d={delta} suffix={suffix} />}
      </div>
      <div style={{ fontSize: small ? 20 : 27, fontWeight: 800, lineHeight: 1, letterSpacing: -0.8, color: C.ink }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{sub}</div>}
      {progress != null && (
        <div style={{ height: 4, background: C.grey, borderRadius: 3, marginTop: 11, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: tint, borderRadius: 3 }} />
        </div>
      )}
    </div>
  )
}

function AlertCard({ n, label, tone, icon: Icon, onClick }) {
  const t = {
    danger: { c: '#dc2626', bg: '#fef2f2', b: '#fecaca' },
    warn:   { c: '#d97706', bg: '#fffbeb', b: '#fde68a' },
    ok:     { c: C.slate,   bg: C.card,    b: C.line },
  }[tone]
  return (
    <div onClick={onClick}
      style={{
        background: t.bg, border: `1px solid ${t.b}`, borderRadius: 12, padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div className="rowflex" style={{ gap: 7, marginBottom: 7 }}>
        <Icon size={15} color={t.c} />
        {onClick && <ChevronRight size={14} color={C.faint} style={{ marginLeft: 'auto' }} />}
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, color: t.c, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

function ReasonsBar({ reasons }) {
  const total = reasons.reduce((s, r) => s + r.cnt, 0)
  if (!total) return null
  return (
    <>
      <div style={{ display: 'flex', height: 26, borderRadius: 7, overflow: 'hidden', marginBottom: 12 }}>
        {reasons.map((r, i) => (
          <div key={r.reason}
            title={`${REASON_LABELS[r.reason] || r.reason}: ${r.cnt}`}
            style={{
              width: `${(r.cnt / total) * 100}%`,
              background: REASON_COLORS[i % REASON_COLORS.length],
            }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reasons.map((r, i) => (
          <div key={r.reason} className="rowflex" style={{ gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: REASON_COLORS[i % REASON_COLORS.length], flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12.5, color: C.slate }}>{REASON_LABELS[r.reason] || r.reason}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{r.cnt}</span>
            <span style={{ fontSize: 11.5, color: C.faint, width: 38, textAlign: 'right' }}>
              {Math.round((r.cnt / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function WeekTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 11px', boxShadow: '0 4px 14px rgba(20,24,58,.12)' }}>
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 2 }}>неделя с {label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: pctColor(d.pct) }}>{d.pct}%</div>
      <div style={{ fontSize: 11.5, color: C.slate }}>{d.lessons} занятий</div>
    </div>
  )
}

function DeltaBadge({ d, suffix }) {
  const good = d.good
  const Icon = d.value > 0 ? TrendingUp : TrendingDown
  return (
    <span className="rowflex" style={{
      marginLeft: 'auto', gap: 3, fontSize: 11, fontWeight: 700,
      color: good ? C.ok : '#dc2626',
      background: good ? C.okSoft : '#fee2e2',
      padding: '2px 7px', borderRadius: 20,
    }}>
      <Icon size={10} />{d.value > 0 ? '+' : ''}{d.value}{suffix ? ` ${suffix}` : ''}
    </span>
  )
}

function Panel({ title, hint, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ marginBottom: 13 }}>
        <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{title}</h2>
        {hint && <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.faint }}>{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: 'uppercase',
      letterSpacing: '.05em', marginBottom: 9 }}>{children}</div>
  )
}

function Banner({ type, children }) {
  const s = type === 'error'
    ? { bg: '#fde8e8', c: '#c2360b', b: '#fecaca' }
    : { bg: '#fffbeb', c: '#92400e', b: '#fde68a' }
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.b}`, color: s.c, padding: '11px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
      {children}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '50px 30px', textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 15, background: C.brandSoft, color: C.brand,
        display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
        <CalendarCheck size={25} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>За этот период занятий не было</div>
      <div style={{ fontSize: 13.5, color: C.slate, maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>
        Показатели появятся, когда преподаватели начнут проводить занятия.
        Проверьте, что заполнено расписание и созданы занятия на нужный период.
      </div>
    </div>
  )
}

// ================= УТИЛИТЫ =================

// Схлопываем строки office+lang в один офис с разбивкой по языкам
function groupOffices(rows) {
  const m = {}
  rows.forEach((r) => {
    const o = (m[r.office] ||= { office: r.office, lessons: 0, total: 0, present: 0, langs: [] })
    o.lessons += r.lessons
    o.total += r.total
    o.present += r.present
    o.langs.push({ lang: r.lang, pct: r.pct })
  })
  return Object.values(m).map((o) => ({
    ...o,
    pct: o.total ? Math.round((o.present / o.total) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct)
}

function delta(cur, prev) {
  if (prev == null || prev === 0 || cur == null) return null
  const d = cur - prev
  if (d === 0) return null
  return { value: d, good: d > 0 }
}

function shiftRange(r) {
  if (!r?.from || !r?.to) return null
  const from = new Date(r.from), to = new Date(r.to)
  const days = Math.round((to - from) / 86400000) + 1
  const pTo = new Date(from); pTo.setDate(pTo.getDate() - 1)
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - days + 1)
  return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) }
}
