import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)   // { id, full_name, role }
  const [teacher, setTeacher] = useState(null)
  const [curator, setCurator] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(prof || null)
    if (prof && prof.role === 'teacher') {
      const { data: t } = await supabase.from('teachers').select('*').eq('profile_id', userId).maybeSingle()
      setTeacher(t || null)
      // может быть куратором (роль teacher, но есть карточка куратора)
      const { data: c } = await supabase.from('curators').select('*').eq('profile_id', userId).maybeSingle()
      setCurator(c || null)
    } else {
      setTeacher(null); setCurator(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s) await loadProfile(s.user.id)
      else { setProfile(null); setTeacher(null) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Вход по логину: логин -> технический email через функцию email_for_login -> авторизация.
  // Если передан email (содержит @) — используем как есть (для админа-завуча).
  const signIn = async (loginOrEmail, password) => {
    let email = loginOrEmail.trim()
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('email_for_login', { p_login: email.toLowerCase() })
      if (error) return { error: { message: 'Ошибка входа' } }
      if (!data) return { error: { message: 'Неверный логин или пароль' } }
      email = data
    }
    return supabase.auth.signInWithPassword({ email, password })
  }
  const signOut = () => supabase.auth.signOut()

  const isAdmin = profile?.role === 'admin'
  const isDirector = profile?.role === 'director'
  const isOfficeManager = profile?.role === 'office_manager'
  const isSeniorOM = profile?.role === 'senior_office_manager'
  const isAccountant = profile?.role === 'accountant'
  const isMethodist = profile?.role === 'methodist'
  // Директор и завуч видят управленческие разделы. Директор — без правки справочников.
  const isManager = isAdmin || isDirector
  // офис менеджера (null у старшего = все офисы); у методиста тоже
  // просто profile.office — своё поле не заводим, оно уже общее.
  const managerOffice = profile?.office || null

  return (
    <AuthCtx.Provider value={{ session, profile, teacher, curator, isCurator: !!curator, isAdmin, isDirector, isManager, isOfficeManager, isSeniorOM, isAccountant, isMethodist, managerOffice, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}
