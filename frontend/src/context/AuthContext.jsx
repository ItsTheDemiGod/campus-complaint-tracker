import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  // profile row + which user id it belongs to (null profile = fetched but missing)
  const [profileState, setProfileState] = useState({ userId: null, profile: null })

  // 1. Session: initial check + live updates on login/logout/token refresh.
  // The .catch prevents a network hiccup here from leaving sessionLoading stuck
  // true forever (every page would hang on "Loading..." with no way out).
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setSessionLoading(false))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // 2. Profile: fetched in its own effect, NOT inside onAuthStateChange
  // (supabase-js can deadlock if you call the client from that callback).
  // Same stuck-loading concern as above: on failure, still resolve profileState
  // (as "no profile") so ProtectedRoute can show its existing deactivated/missing-
  // profile message instead of hanging on "Loading..." indefinitely.
  const user = session?.user ?? null
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfileState({ userId: user.id, profile: data })
      })
      .catch(() => {
        if (!cancelled) setProfileState({ userId: user.id, profile: null })
      })
    return () => { cancelled = true }
  }, [user?.id])

  const profileReady = !user || profileState.userId === user.id
  const value = {
    session,
    user,
    profile: user && profileReady ? profileState.profile : null,
    loading: sessionLoading || !profileReady,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
