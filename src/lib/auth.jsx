import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)   // { id, full_name, role }
  const [teacher, setTeacher] = useState(null)    // строка teachers, если пользователь-преподаватель
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(prof || null)
    if (prof && prof.role === 'teacher') {
      const { data: t } = await supabase.from('teachers').select('*').eq('profile_id', userId).maybeSingle()
      setTeacher(t || null)
    } else {
      setTeacher(null)
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

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthCtx.Provider value={{ session, profile, teacher, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}
