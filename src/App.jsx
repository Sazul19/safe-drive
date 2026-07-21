import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { logOut } from './lib/auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import SetRole from './pages/SetRole'
import AdminDashboard from './pages/AdminDashboard'
import ResponderManagement from './pages/ResponderManagement'
import PoliceDashboard from './pages/PoliceDashboard'
import AmbulanceDashboard from './pages/AmbulanceDashboard'
import History from './pages/History'
import UserDashboard from './pages/UserDashboard'
import Alerts from './pages/Alerts'
import AccountDeactivated from './pages/AccountDeactivated'

function ProtectedRoute({ role: requiredRole, children }) {
  const { user, role, active, loading } = useAuth()
  if (loading) return <div className="authLoading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!active) return <Navigate to="/deactivated" replace />
  if (role !== requiredRole) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user, role, loading } = useAuth()

  const handleLogout = () => {
    logOut()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    )
  }

  if (!loading && user && role === null) {
    return (
      <Routes>
        <Route path="/auth-error" element={<SetRole />} />
        <Route path="*" element={<Navigate to="/auth-error" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? (role ? <Navigate to={`/${role}`} replace /> : <Navigate to="/auth-error" replace />) : <Login />} />
      <Route path="/signup" element={user ? (role ? <Navigate to={`/${role}`} replace /> : <Navigate to="/auth-error" replace />) : <Signup />} />
      <Route path="/auth-error" element={user && role === null ? <SetRole /> : <Navigate to="/" replace />} />
      <Route path="/" element={
        !user ? <Navigate to="/login" replace /> : role ? <Navigate to={`/${role}`} replace /> : <Navigate to="/login" replace />
      } />
      <Route path="/admin" element={
        <ProtectedRoute role="admin">
          <AdminDashboard onLogout={handleLogout} />
        </ProtectedRoute>
      } />
      <Route path="/admin/responders" element={
        <ProtectedRoute role="admin">
          <ResponderManagement onLogout={handleLogout} />
        </ProtectedRoute>
      } />
      <Route path="/deactivated" element={
        user ? <AccountDeactivated /> : <Navigate to="/login" replace />
      } />
      <Route path="/police" element={
        <ProtectedRoute role="police">
          <PoliceDashboard onLogout={handleLogout} />
        </ProtectedRoute>
      } />
      <Route path="/ambulance" element={
        <ProtectedRoute role="ambulance">
          <AmbulanceDashboard onLogout={handleLogout} />
        </ProtectedRoute>
      } />
      <Route path="/user" element={
        <ProtectedRoute role="user">
          <UserDashboard onLogout={handleLogout} />
        </ProtectedRoute>
      } />
      <Route path="/history" element={
        user && role ? <History /> : <Navigate to="/" replace />
      } />
      <Route path="/alerts" element={
        user && role ? <Alerts onLogout={handleLogout} /> : <Navigate to="/" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
