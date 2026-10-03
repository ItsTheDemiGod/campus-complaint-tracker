import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { dashboardFor } from './lib/roles'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import StudentDashboard from './pages/StudentDashboard'
import StaffDashboard from './pages/StaffDashboard'
import AdminDashboard from './pages/AdminDashboard'

// "/" sends logged-out users to /login and logged-in users to their dashboard.
function Home() {
  const { session, profile, loading } = useAuth()
  if (loading) return <main>Loading...</main>
  if (!session || !profile) return <Navigate to="/login" replace />
  return <Navigate to={dashboardFor(profile.role)} replace />
}

const guarded = (role, page) => <ProtectedRoute allowedRoles={[role]}>{page}</ProtectedRoute>

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/student/dashboard" element={guarded('student', <StudentDashboard />)} />
      <Route path="/staff/dashboard" element={guarded('staff', <StaffDashboard />)} />
      <Route path="/admin/dashboard" element={guarded('admin', <AdminDashboard />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
