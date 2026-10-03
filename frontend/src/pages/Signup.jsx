import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ErrorBanner from '../components/ErrorBanner'
import SiteHeader from '../components/SiteHeader'

// This form only ever creates STUDENT accounts. The role is not sent from here:
// the database trigger (handle_new_user) defaults it to 'student' and reads any other
// role only from raw_app_meta_data, which a browser cannot set. full_name goes in
// options.data (user_metadata) because it is not security-sensitive.
// Staff/admin accounts are created by admins in Phase 4.
export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setBusy(false)
    if (error) return setError(error.message)
    // With email confirmation on, Supabase hides duplicates: no error, but the
    // returned user has no identities.
    if (data.user?.identities?.length === 0) return setError('This email is already registered.')
    setDone(true)
  }

  if (done) {
    return (
      <>
        <SiteHeader />
        <main>
          <h1>Check your email</h1>
          <p className="success">
            We sent a confirmation link to {email}. Click it, then <Link to="/login">log in</Link>.
          </p>
        </main>
      </>
    )
  }

  return (
    <>
      <SiteHeader />
      <main>
        <h1>Student Sign up</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          <button disabled={busy}>{busy ? 'Signing up...' : 'Sign up'}</button>
        </form>
        <p>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </main>
    </>
  )
}
