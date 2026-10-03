import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardFor } from '../lib/roles'
import ErrorBanner from './ErrorBanner'

export default function ProtectedRoute({ allowedRoles, children }) {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) return <main>Loading...</main>
  if (!session) return <Navigate to="/login" replace />

  // Logged in but no usable profile (missing row, or deactivated by an admin).
  if (!profile || !profile.is_active) {
    return (
      <main>
        <ErrorBanner message={profile ? 'This account has been deactivated.' : 'No profile found for this account.'} />
        <button onClick={signOut}>Log out</button>
      </main>
    )
  }

  // Wrong role: send them to their own dashboard.
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={dashboardFor(profile.role)} replace />
  }
  return children
}
