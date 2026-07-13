import React, { useEffect, useState, useMemo } from 'react'
import { GraduationCap, LogOut, Settings, FileSpreadsheet, LayoutDashboard, AlertTriangle, Users, BarChart3 } from 'lucide-react'
import { useAuth } from './lib/auth'
import { fetchDictionaries, fetchAllDictionaries, fetchLessons } from './lib/api'
import { C, monthOptions, periodRange, periodLabelOf } from './lib/utils'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import TeacherCabinet from './pages/TeacherCabinet'
import AdminCabinet from './pages/AdminCabinet'
import Manage from './pages/Manage'
import Timesheets from './pages/Timesheets'
import Dashboard from './pages/Dashboard'
import Risks from './pages/Risks'
import StudentCard from './pages/StudentCard'
import Analytics from './pages/Analytics'
import GlobalSearch from './components/GlobalSearch'

export default function App() {
  const { session, profile, teacher, isAdmin, isDirector, isManager, loading, signOut } = useAuth()

  const [dict, setDict] = useState(null)
  const [fullDict, setFullDict] = useState(null) // включая архивные, для управления
  const [lessons, setLessons] = useState([])
  const [period, setPeriod] = useState({ mode: 'month', month: monthOptions(1)[0].v }) // текущий месяц
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('cabinet') // cabinet | dashboard | risks | timesheets | manage | student
  const [openStudent, setOpenStudent] = useState(null) // id ученика для карточки

  const periodLabel = useMemo(() => periodLabelOf(period), [period])

  // Загрузка активных справочников (для форм и отчётов)
  async function reloadDict() {
    const d = await fetchDictionaries()
    setDict(d)
  }
  // Загрузка полных справочников (для раздела управления)
  async function reloadFullDict() {
    const d = await fetchAllDictionaries()
    setFullDict(d)
  }
  async function reloadAllDicts() {
    await Promise.all([reloadDict(), reloadFullDict()])
  }

  async function reloadLessons() {
    return fetchLessons(periodRange(period)).then(setLessons)
  }

  // Загрузка справочников при входе
  useEffect(() => {
    if (!session) return
    reloadDict().catch((e) => setError(e.message))
  }, [session])

  // Загрузка уроков при смене периода
  useEffect(() => {
    if (!session) return
    setDataLoading(true)
    fetchLessons(periodRange(period))
      .then(setLessons)
      .catch((e) => setError(e.message))
      .finally(() => setDataLoading(false))
  }, [session, period])

  const onLessonAdded = (l) => setLessons((prev) => [l, ...prev])
  const onLessonChanged = (l) => setLessons((prev) => prev.map((x) => x.id === l.id ? l : x))
  const onLessonDeleted = (id) => setLessons((prev) => prev.filter((x) => x.id !== id))

  if (loading) return <FullScreen><Spinner label="Проверка сессии…" /></FullScreen>
  if (!session) return <Login />

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      <style>{`
        *{box-sizing:border-box;} button{font-family:inherit;}
        input,select{font-family:inherit;}
        .wrap{max-width:1320px;margin:0 auto;padding:0 18px;}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
        .rowflex{display:flex;align-items:center;gap:12px;}
        @media(max-width:680px){ .stats{grid-template-columns:1fr 1fr;} .hide-sm{display:none!important;} }
        .card-hover{transition:transform .15s ease, box-shadow .15s ease;}
        .card-hover:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(67,56,202,.13);}
        .lrow:hover{background:#faf9ff;}

        /* ---------- ПЛОТНЫЕ ТАБЛИЦЫ ---------- */
        .dt{width:100%;border-collapse:collapse;font-size:13px;}
        .dt thead th{position:sticky;top:0;background:#f7f7fb;text-align:left;font-size:11.5px;font-weight:700;
          color:#6b7194;text-transform:uppercase;letter-spacing:.03em;padding:9px 12px;border-bottom:1px solid #e8e9f3;
          white-space:nowrap;user-select:none;}
        .dt thead th.sortable{cursor:pointer;}
        .dt thead th.sortable:hover{color:#4338ca;}
        .dt tbody td{padding:9px 12px;border-bottom:1px solid #f0f1f7;vertical-align:middle;}
        .dt tbody tr{transition:background .1s;}
        .dt tbody tr:hover{background:#faf9ff;cursor:pointer;}
        .dt tbody tr:last-child td{border-bottom:none;}
        .dt .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}
        .dt-wrap{background:#fff;border:1px solid #e8e9f3;border-radius:12px;overflow:hidden;}
        .dt-scroll{max-height:none;overflow:auto;}

        /* компактные бейджи и чипы фильтров */
        .fbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}
        .fchip{padding:6px 12px;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;border:1px solid #e8e9f3;background:#fff;color:#6b7194;transition:all .12s;white-space:nowrap;}
        .fchip:hover{border-color:#c9cbe0;}
        .fchip.on{background:#4338ca;border-color:#4338ca;color:#fff;}
        .fseg{display:flex;background:#eef0f6;border-radius:9px;padding:3px;}
        .fseg button{padding:6px 13px;border-radius:7px;font-size:12.5px;font-weight:700;border:none;cursor:pointer;background:transparent;color:#6b7194;}
        .fseg button.on{background:#fff;color:#4338ca;box-shadow:0 1px 3px rgba(20,24,58,.12);}
        .search-box{flex:1;min-width:180px;position:relative;}
        .search-box input{width:100%;padding:8px 12px 8px 34px;border:1px solid #e8e9f3;border-radius:9px;font-size:13px;outline:none;background:#fff;}
        .search-box input:focus{border-color:#4338ca;}
        .pager{display:flex;align-items:center;gap:6px;justify-content:center;padding:12px;}
        .pager button{min-width:32px;height:32px;border-radius:8px;border:1px solid #e8e9f3;background:#fff;font-size:13px;font-weight:600;color:#6b7194;cursor:pointer;}
        .pager button.on{background:#4338ca;border-color:#4338ca;color:#fff;}
        .pager button:disabled{opacity:.4;cursor:default;}
        .av{border-radius:8px;color:#fff;display:grid;place-items:center;font-weight:700;flex-shrink:0;}
      `}</style>

      <header style={{ background: C.card, borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
        <div className="wrap rowflex" style={{ padding: '13px 16px', flexWrap: 'wrap' }}>
          <div className="rowflex" style={{ gap: 11 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(135deg,${C.brand},${C.brand2})`, display: 'grid', placeItems: 'center' }}>
              <GraduationCap size={23} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1, letterSpacing: -0.3 }}>Лидер Плюс</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 3 }}>
                {isDirector ? 'Кабинет директора' : isAdmin ? 'Кабинет завуча' : 'Кабинет преподавателя'}
              </div>
            </div>
          </div>
          <div className="rowflex" style={{ marginLeft: 'auto', gap: 12 }}>
            {isManager && <GlobalSearch onOpenStudent={(id) => { setOpenStudent(id) }} />}
            <span className="hide-sm" style={{ fontSize: 13, color: C.slate }}>{profile?.full_name}</span>
            <button onClick={signOut} className="rowflex" title="Выйти"
              style={{ gap: 6, padding: '8px 13px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.slate, background: C.grey, border: 'none', cursor: 'pointer' }}>
              <LogOut size={15} /> <span className="hide-sm">Выйти</span>
            </button>
          </div>
        </div>

        {/* Навигация завуча */}
        {isManager && (
          <div className="wrap" style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
              {[
                { k: 'dashboard', t: 'Дашборд', icon: LayoutDashboard },
                { k: 'cabinet', t: 'Сводка', icon: GraduationCap },
                { k: 'analytics', t: 'Аналитика', icon: BarChart3 },
                { k: 'risks', t: 'Риски', icon: AlertTriangle },
                { k: 'timesheets', t: 'Табели', icon: FileSpreadsheet },
                ...(isAdmin ? [{ k: 'manage', t: 'Управление', icon: Settings }] : []),
              ].map((o) => {
                const on = view === o.k
                const Icon = o.icon
                return (
                  <button key={o.k}
                    onClick={async () => {
                      setOpenStudent(null)
                      if (o.k === 'manage' && !fullDict) {
                        try { await reloadFullDict() } catch (e) { setError(e.message) }
                      }
                      setView(o.k)
                    }}
                    className="rowflex"
                    style={{
                      gap: 6, padding: '9px 14px', borderRadius: '9px 9px 0 0', fontSize: 13, fontWeight: 700,
                      whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
                      color: on ? C.brand : C.slate,
                      background: on ? C.card : 'transparent',
                      borderBottom: on ? `2px solid ${C.brand}` : '2px solid transparent',
                    }}>
                    <Icon size={15} /> {o.t}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </header>

      <main className="wrap" style={{ padding: '20px 16px 64px' }}>
        {error && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 14, borderRadius: 12, marginBottom: 16, fontSize: 14 }}>{error}</div>}

        {!dict ? (
          <Spinner label="Загрузка данных…" />
        ) : openStudent ? (
          <StudentCard studentId={openStudent} onBack={() => setOpenStudent(null)} />
        ) : isManager && view === 'dashboard' ? (
          <Dashboard onOpenRisks={() => setView('risks')} />
        ) : isManager && view === 'analytics' ? (
          <Analytics onOpenStudent={(id) => setOpenStudent(id)} />
        ) : isManager && view === 'risks' ? (
          <Risks onOpenStudent={(id) => setOpenStudent(id)} />
        ) : isManager && view === 'timesheets' ? (
          <Timesheets dict={dict} onOpenStudent={(id) => setOpenStudent(id)} />
        ) : isAdmin && view === 'manage' ? (
          !fullDict ? (
            <Spinner label="Загрузка справочников…" />
          ) : (
            <Manage
              dict={fullDict}
              subjects={fullDict.subjects}
              onBack={() => setView('cabinet')}
              onChanged={reloadAllDicts}
              onOpenStudent={(id) => setOpenStudent(id)}
            />
          )
        ) : isManager ? (
          <AdminCabinet dict={dict} lessons={lessons} period={period} setPeriod={setPeriod} periodLabel={periodLabel}
            onLessonChanged={onLessonChanged} onLessonDeleted={onLessonDeleted} />
        ) : teacher ? (
          <TeacherCabinet teacher={teacher} dict={dict} lessons={lessons} period={period} setPeriod={setPeriod}
            onLessonAdded={onLessonAdded} onLessonChanged={onLessonChanged} onLessonDeleted={onLessonDeleted} />
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 40, textAlign: 'center', color: C.slate }}>
            Ваш аккаунт не привязан к преподавателю. Обратитесь к администратору центра, чтобы он связал ваш профиль с карточкой преподавателя.
          </div>
        )}
        {dataLoading && dict && <div style={{ textAlign: 'center', color: C.faint, fontSize: 12, marginTop: 16 }}>Обновление…</div>}
      </main>
    </div>
  )
}

function FullScreen({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg, fontFamily: "'Inter',system-ui,sans-serif" }}>{children}</div>
}
