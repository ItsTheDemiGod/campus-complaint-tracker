import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SiteHeader from '../components/SiteHeader'
import NewTicketForm from '../components/NewTicketForm'
import StudentTicketList from '../components/StudentTicketList'

export default function StudentDashboard() {
  const { profile, signOut } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <SiteHeader userName={profile.full_name} userRole={profile.role} onLogout={signOut} />
      <main className="wide">
        <h1>Student Dashboard</h1>

        <button className="secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Hide form' : 'New complaint'}
        </button>
        {showForm && <NewTicketForm onCreated={() => setRefreshKey((k) => k + 1)} />}

        <h2>My complaints</h2>
        <StudentTicketList refreshKey={refreshKey} />
      </main>
    </>
  )
}
