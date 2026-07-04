import React, { useEffect, useState, useMemo } from 'react'
import { GraduationCap, LogOut, Settings } from 'lucide-react'
import { useAuth } from './lib/auth'
import { fetchDictionaries, fetchAllDictionaries, fetchLessons } from './lib/api'
import { C, monthOptions, periodRange, periodLabelOf } from './lib/utils'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import TeacherCabinet from './pages/TeacherCabinet'
import AdminCabinet from './pages/AdminCabinet'
import Manage from './pages/Manage'

export default function App() {
  const { session, profile, teacher, isAdmin, loading, signOut } = useAuth()

  const [dict, setDict] = useState(null)
  const [fullDict, setFullDict] = useState(null) // включая архивные, для управления
  const [lessons, setLessons] = useState([])
  const [period, setPeriod] = useState({ mode: 'month', month: monthOptions(1)[0].v }) // текущий месяц
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('cabinet') // cabinet | manage

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
        .wrap{max-width:1120px;margin:0 auto;padding:0 16px;}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
        .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}
        .rowflex{display:flex;align-items:center;gap:12px;}
        @media(max-width:680px){ .stats{grid-template-columns:1fr 1fr;} .hide-sm{display:none!important;} }
        .card-hover{transition:transform .15s ease, box-shadow .15s ease;}
        .card-hover:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(67,56,202,.13);}
        .lrow:hover{background:#faf9ff;}
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
                {isAdmin ? 'Кабинет завуча' : 'Кабинет преподавателя'}
              </div>
            </div>
          </div>
          <div className="rowflex" style={{ marginLeft: 'auto', gap: 12 }}>
            <span className="hide-sm" style={{ fontSize: 13, color: C.slate }}>{profile?.full_name}</span>
            {isAdmin && (
              <button
                onClick={async () => {
                  if (view === 'manage') { setView('cabinet'); return }
                  if (!fullDict) { try { await reloadFullDict() } catch (e) { setError(e.message) } }
                  setView('manage')
                }}
                className="rowflex" title="Управление справочниками"
                style={{ gap: 6, padding: '8px 13px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: view === 'manage' ? C.brand : C.slate, background: view === 'manage' ? C.brandSoft : C.grey, border: 'none', cursor: 'pointer' }}>
                <Settings size={15} /> <span className="hide-sm">Управление</span>
              </button>
            )}
            <button onClick={signOut} className="rowflex" title="Выйти"
              style={{ gap: 6, padding: '8px 13px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.slate, background: C.grey, border: 'none', cursor: 'pointer' }}>
              <LogOut size={15} /> <span className="hide-sm">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <main className="wrap" style={{ padding: '20px 16px 64px' }}>
        {error && <div style={{ background: '#fde8e8', color: '#c2360b', padding: 14, borderRadius: 12, marginBottom: 16, fontSize: 14 }}>{error}</div>}

        {!dict ? (
          <Spinner label="Загрузка данных…" />
        ) : isAdmin && view === 'manage' ? (
          !fullDict ? (
            <Spinner label="Загрузка справочников…" />
          ) : (
            <Manage
              dict={fullDict}
              subjects={fullDict.subjects}
              onBack={() => setView('cabinet')}
              onChanged={reloadAllDicts}
            />
          )
        ) : isAdmin ? (
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
