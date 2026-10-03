import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { dashboardFor } from '../lib/roles'
import ErrorBanner from '../components/ErrorBanner'
import SiteHeader from '../components/SiteHeader'

export default function Login() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Redirect once the profile (and so the role) is loaded. Also covers
  // an already-logged-in user who opens /login.
  useEffect(() => {
    if (profile?.is_active) navigate(dashboardFor(profile.role), { replace: true })
  }, [profile, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message) // e.g. "Invalid login credentials", "Email not confirmed"
  }

  return (
    <>
      <SiteHeader />
      <main>
        <h1>Log in</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          <button disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        </form>
        <p>
          New student? <Link to="/signup">Sign up</Link>
        </p>
      </main>
    </>
  )
}
