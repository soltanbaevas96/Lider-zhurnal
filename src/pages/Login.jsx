import React, { useState } from 'react'
import { GraduationCap, Video, ClipboardList, LineChart, ShieldCheck, Lock, User } from 'lucide-react'
import { useAuth } from '../lib/auth'

const L = {
  navy1: '#0a1a3f', navy2: '#0d2a5e', navy3: '#12376e',
  ink: '#0b1730', white: '#ffffff', mute: '#aab7d4', faint: '#7f8fb5',
  orange: '#f5a020', orangeHi: '#ffb733', cyan: '#4cc3e0', blue: '#2f6bff',
  field: '#f4f6fb', cardLine: '#e6e9f2',
}

const FEATURES = [
  { icon: Video, title: 'Учёт уроков', sub: 'Дата, время, группа, тема' },
  { icon: ClipboardList, title: 'Планы уроков', sub: 'Файл плана к каждому занятию' },
  { icon: LineChart, title: 'Подсчёт часов', sub: 'Автоматически по каждому учителю' },
  { icon: ShieldCheck, title: 'Контроль завуча', sub: 'Полная сводка по преподавателям' },
]

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true); setErr('')
    const { error } = await signIn(email.trim(), pass)
    if (error) setErr('Неверный логин или пароль')
    setBusy(false)
  }

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: L.white, minHeight: '100vh', background: `radial-gradient(1200px 600px at 78% -10%, ${L.navy3} 0%, ${L.navy2} 40%, ${L.navy1} 100%)` }}>
      <style>{`
        *{box-sizing:border-box;} button{font-family:inherit;cursor:pointer;border:none;}
        input{font-family:inherit;}
        .lp-wrap{max-width:1240px;margin:0 auto;padding:0 28px;}
        .lp-nav-links{display:flex;gap:34px;}
        .lp-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:start;padding:36px 0 60px;}
        .lp-stats{display:flex;flex-wrap:wrap;}
        .lp-foot{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;}
        .lp-h1{font-size:60px;line-height:1.03;font-weight:800;letter-spacing:-1.5px;margin:0;}
        @media(max-width:960px){
          .lp-hero{grid-template-columns:1fr;gap:32px;}
          .lp-nav-links,.lp-phone{display:none!important;}
          .lp-h1{font-size:40px;}
          .lp-foot{grid-template-columns:1fr 1fr;gap:16px;}
        }
        .lp-field{width:100%;padding:14px 16px 14px 42px;border-radius:12px;border:1px solid ${L.cardLine};background:${L.field};font-size:15px;color:${L.ink};outline:none;}
        .lp-field::placeholder{color:#9aa6c2;}
      `}</style>

      <div className="lp-wrap" style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '22px 28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
            Лидер<span style={{ color: L.cyan }}>+</span>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: L.faint, marginTop: 2 }}>СИСТЕМА УЧЁТА УРОКОВ</div>
        </div>
        <nav className="lp-nav-links" style={{ margin: '0 auto' }}>
          {['Возможности', 'Преподаватели', 'Отчёты', 'Контроль'].map((x) => (
            <a key={x} href="#" style={{ color: L.mute, textDecoration: 'none', fontSize: 15, fontWeight: 500 }}>{x}</a>
          ))}
        </nav>
        <span className="lp-phone" style={{ color: L.white, fontWeight: 700, fontSize: 15 }}>+7 705 357 ···</span>
      </div>

      <div className="lp-wrap lp-hero">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${L.navy3}`, background: 'rgba(76,195,224,.08)', padding: '8px 16px', borderRadius: 30, marginBottom: 26 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: L.cyan }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: L.cyan }}>Онлайн-центр «Лидер+» · внутренняя система</span>
          </div>
          <h1 className="lp-h1">Учёт работы<br />преподавателей <span style={{ color: L.orange }}>без Excel</span></h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: L.mute, maxWidth: 540, margin: '26px 0 34px' }}>
            Учителя вносят проведённые уроки и прикрепляют планы, а завуч в один клик видит отработанные часы по каждому преподавателю и группе — за любой период.
          </p>
          <div className="lp-stats" style={{ marginTop: 10 }}>
            {[
              { n: '2', hi: '', l: 'роли: учитель и завуч' },
              { n: '1', hi: '', l: 'клик до отчёта в Excel' },
              { n: '0', hi: '', l: 'ручных таблиц' },
            ].map((s, i) => (
              <div key={i} style={{ paddingRight: 30, marginRight: 30, borderRight: i < 2 ? `1px solid ${L.navy3}` : 'none' }}>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>{s.n}<span style={{ color: L.cyan }}>{s.hi}</span></div>
                <div style={{ fontSize: 14, color: L.faint, marginTop: 4, maxWidth: 130 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Форма входа */}
        <div style={{ background: '#fff', borderRadius: 22, padding: 30, boxShadow: '0 30px 70px rgba(0,0,0,.35)', color: L.ink }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 22 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(135deg,${L.blue},${L.cyan})`, display: 'grid', placeItems: 'center' }}>
              <GraduationCap size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Вход в кабинет</div>
              <div style={{ fontSize: 13, color: '#7a86a3' }}>Для преподавателей и завуча</div>
            </div>
          </div>

          <label style={{ fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 8 }}>Логин</label>
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <User size={17} color="#9aa6c2" style={{ position: 'absolute', left: 15, top: 15 }} />
            <input className="lp-field" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="например asaparova" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>

          <label style={{ fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 8 }}>Пароль</label>
          <div style={{ position: 'relative', marginBottom: 22 }}>
            <Lock size={17} color="#9aa6c2" style={{ position: 'absolute', left: 15, top: 15 }} />
            <input type="password" className="lp-field" value={pass} onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>

          {err && <div style={{ color: '#c2360b', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>{err}</div>}

          <button onClick={submit} disabled={busy}
            style={{ width: '100%', background: `linear-gradient(180deg,${L.blue},#1f56e6)`, color: '#fff', fontWeight: 800, fontSize: 16, padding: 16, borderRadius: 13, boxShadow: '0 10px 26px rgba(47,107,255,.35)', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Вход…' : 'Войти в систему'}
          </button>

          <p style={{ fontSize: 12.5, color: '#9aa6c2', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
            Доступ выдаёт администратор центра «Лидер+».<br />Пароль забыли — обратитесь к завучу.
          </p>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', background: 'rgba(4,12,30,.4)', marginTop: 10 }}>
        <div className="lp-wrap lp-foot" style={{ padding: '26px 28px' }}>
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(76,195,224,.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={22} color={L.cyan} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: L.faint, marginTop: 2 }}>{f.sub}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
