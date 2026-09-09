import React, { useState } from 'react'
import { GraduationCap, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { C } from '../lib/utils'

// Экран входа — редизайн (ТЗ «Полный редизайн стартовой страницы»).
// Это ТОЛЬКО визуальная переработка: signIn(), сессия, роли и редирект
// после входа — тот же самый существующий useAuth(), ничего в
// auth-логике не менялось. Раньше страница была лендингом с длинным
// маркетинговым текстом, статистикой и блоком из 4 карточек функций —
// всё это убрано, экран сведён к двум вещам: бренд и форма входа.
export default function Login() {
  const { signIn } = useAuth()
  const [login, setLogin] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    setBusy(true); setErr('')
    const { error } = await signIn(login.trim(), pass)
    // Технический текст ошибки Supabase намеренно не показываем — ни
    // пользователю, ни в консоли не должно быть намёка, какой из двух
    // (логин/пароль) неверен.
    if (error) setErr('Неверный логин или пароль')
    setBusy(false)
  }

  const canSubmit = login.trim() && pass && !busy

  return (
    <div className="lp-page">
      <style>{`
        .lp-page * { box-sizing: border-box; }
        .lp-page {
          min-height: 100vh; display: flex; flex-direction: column;
          background: #F7F9FC; font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .lp-main { flex: 1; display: flex; min-height: 0; }
        .lp-brand {
          flex: 0 0 46%; position: relative; overflow: hidden;
          display: flex; align-items: center; justify-content: center; padding: 40px;
          background: linear-gradient(165deg, #101a45 0%, #0a0f2c 100%);
        }
        .lp-brand::before {
          content: ''; position: absolute; inset: -10%; pointer-events: none;
          background: radial-gradient(560px 380px at 82% 8%, rgba(124,107,240,.20), transparent 60%);
        }
        .lp-brand-inner { position: relative; max-width: 380px; }
        .lp-badge {
          width: 56px; height: 56px; border-radius: 16px; margin-bottom: 24px;
          background: linear-gradient(135deg, ${C.brand}, ${C.brand2});
          display: grid; place-items: center; box-shadow: 0 14px 32px rgba(67,56,202,.45);
        }
        .lp-wordmark { font-size: 40px; font-weight: 800; letter-spacing: -1px; color: #fff; margin: 0 0 16px; }
        .lp-wordmark span { color: ${C.brand2}; }
        .lp-tagline { font-size: 17px; line-height: 1.5; color: #aeb7d9; font-weight: 500; margin: 0 0 18px; }
        .lp-sub { font-size: 14px; color: #7782a8; margin: 0; }
        .lp-formzone { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; }
        .lp-card {
          width: 100%; max-width: 420px; background: #fff; border-radius: 22px; padding: 36px;
          border: 1px solid #eef0f7; box-shadow: 0 24px 60px rgba(20,24,58,.08);
          animation: lp-appear .35s ease-out;
        }
        @keyframes lp-appear { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .lp-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 26px; }
        .lp-card-icon {
          width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
          background: linear-gradient(135deg, ${C.brand}, ${C.brand2}); display: grid; place-items: center;
        }
        .lp-card-title { font-size: 21px; font-weight: 800; color: ${C.ink}; margin: 0; line-height: 1.2; }
        .lp-card-sub { font-size: 13.5px; color: #7a86a3; margin: 3px 0 0; }
        .lp-label { font-size: 13px; font-weight: 700; color: #3d4460; display: block; margin-bottom: 7px; }
        .lp-field-wrap { position: relative; margin-bottom: 18px; }
        .lp-field-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #9aa6c2; pointer-events: none; }
        .lp-field {
          width: 100%; padding: 13px 14px 13px 40px; border-radius: 12px; border: 1.5px solid #e6e9f2;
          background: #f9fafc; font-size: 15px; color: ${C.ink}; outline: none;
          transition: border-color .15s, background .15s, box-shadow .15s;
        }
        .lp-field::placeholder { color: #a3add0; }
        .lp-field:focus {
          border-color: ${C.brand}; background: #fff; box-shadow: 0 0 0 3px rgba(67,56,202,.12);
        }
        .lp-field:disabled { opacity: .65; }
        .lp-field-pass { padding-right: 42px; }
        .lp-eye {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 7px; border-radius: 8px;
          background: none; border: none; color: #9aa6c2; display: flex; cursor: pointer;
        }
        .lp-eye:hover { color: ${C.brand}; background: ${C.brandSoft}; }
        .lp-eye:focus-visible, .lp-field:focus-visible { outline: 2px solid ${C.brand2}; outline-offset: 1px; }
        .lp-error {
          background: #fdecec; color: #c2360b; font-size: 13px; padding: 10px 12px; border-radius: 10px; margin-bottom: 16px;
        }
        .lp-submit {
          width: 100%; height: 50px; border-radius: 13px; border: none; cursor: pointer;
          background: linear-gradient(180deg, ${C.brand2}, ${C.brand}); color: #fff; font-weight: 700; font-size: 15.5px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 12px 26px rgba(67,56,202,.32); transition: filter .15s;
        }
        .lp-submit:hover:not(:disabled) { filter: brightness(1.07); }
        .lp-submit:disabled { opacity: .55; cursor: default; box-shadow: none; }
        .lp-submit:focus-visible { outline: 2px solid ${C.brand2}; outline-offset: 2px; }
        .lp-spinner {
          width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff;
          border-radius: 50%; animation: lp-spin .7s linear infinite;
        }
        @keyframes lp-spin { to { transform: rotate(360deg); } }
        .lp-help { text-align: center; font-size: 13px; color: #8891ac; margin: 20px 0 0; }
        .lp-footer { text-align: center; font-size: 12px; color: #9aa0c0; padding: 14px 0; }

        @media (max-width: 880px) {
          .lp-main { flex-direction: column; }
          .lp-brand { flex: 0 0 auto; padding: 34px 24px 26px; }
          .lp-brand::before { display: none; }
          .lp-badge { width: 44px; height: 44px; border-radius: 13px; margin-bottom: 14px; }
          .lp-wordmark { font-size: 29px; margin-bottom: 6px; }
          .lp-tagline { font-size: 14.5px; margin-bottom: 0; }
          .lp-sub { display: none; }
          .lp-formzone { padding: 22px; }
          .lp-card { padding: 26px 22px; border-radius: 18px; }
        }
      `}</style>

      <div className="lp-main">
        <div className="lp-brand">
          <div className="lp-brand-inner">
            <div className="lp-badge"><GraduationCap size={26} color="#fff" /></div>
            <h1 className="lp-wordmark">Лидер<span>+</span></h1>
            <p className="lp-tagline">Система управления<br />образовательным центром</p>
            <p className="lp-sub">Все процессы центра — в одной системе.</p>
          </div>
        </div>

        <div className="lp-formzone">
          <form className="lp-card" onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
            <div className="lp-card-head">
              <div className="lp-card-icon"><GraduationCap size={21} color="#fff" /></div>
              <div>
                <h2 className="lp-card-title">Войти в систему</h2>
                <p className="lp-card-sub">Введите данные сотрудника</p>
              </div>
            </div>

            <label htmlFor="lp-login" className="lp-label">Логин</label>
            <div className="lp-field-wrap">
              <User size={17} className="lp-field-icon" />
              <input
                id="lp-login" className="lp-field" value={login} disabled={busy}
                onChange={(e) => setLogin(e.target.value)} placeholder="Введите логин"
                autoComplete="username" autoFocus
              />
            </div>

            <label htmlFor="lp-pass" className="lp-label">Пароль</label>
            <div className="lp-field-wrap">
              <Lock size={17} className="lp-field-icon" />
              <input
                id="lp-pass" type={showPass ? 'text' : 'password'} className="lp-field lp-field-pass"
                value={pass} disabled={busy} onChange={(e) => setPass(e.target.value)}
                placeholder="Введите пароль" autoComplete="current-password"
              />
              <button type="button" className="lp-eye" onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'} tabIndex={0}>
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {err && <div className="lp-error" role="alert">{err}</div>}

            <button type="submit" className="lp-submit" disabled={!canSubmit}>
              {busy ? (<><span className="lp-spinner" /> Вход…</>) : (<>Войти <ArrowRight size={18} /></>)}
            </button>

            <p className="lp-help">Нет доступа? Обратитесь к администратору.</p>
          </form>
        </div>
      </div>

      <div className="lp-footer">Лидер+ • Система управления образовательным центром</div>
    </div>
  )
}
