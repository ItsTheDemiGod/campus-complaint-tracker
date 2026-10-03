import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SiteHeader from '../components/SiteHeader'
import StaffManagement from '../components/StaffManagement'
import AdminTicketOverview from '../components/AdminTicketOverview'
import AnalyticsDashboard from '../components/AnalyticsDashboard'

const TABS = [
  { id: 'staff', label: 'Staff Management', Component: StaffManagement },
  { id: 'tickets', label: 'All Tickets', Component: AdminTicketOverview },
  { id: 'analytics', label: 'Analytics', Component: AnalyticsDashboard },
]

export default function AdminDashboard() {
  const { profile, signOut } = useAuth()
  const [tabId, setTabId] = useState('staff')
  const ActiveTab = TABS.find((t) => t.id === tabId).Component

  return (
    <>
      <SiteHeader userName={profile.full_name} userRole={profile.role} onLogout={signOut} />
      <main className="wide">
        <h1>Admin Dashboard</h1>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tabId === t.id ? '' : 'secondary'} onClick={() => setTabId(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <ActiveTab />
      </main>
    </>
  )
}
