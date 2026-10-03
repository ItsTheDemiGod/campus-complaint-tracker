import { useAuth } from '../context/AuthContext'
import SiteHeader from '../components/SiteHeader'
import StaffTicketList from '../components/StaffTicketList'

export default function StaffDashboard() {
  const { profile, signOut } = useAuth()

  return (
    <>
      <SiteHeader userName={profile.full_name} userRole={profile.role} onLogout={signOut} />
      <main className="wide">
        <h1>Staff Dashboard</h1>
        <p className="muted">{profile.staff_category?.replace('_', ' ')}</p>

        <h2>My assigned tickets</h2>
        <StaffTicketList />
      </main>
    </>
  )
}
