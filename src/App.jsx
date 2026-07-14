import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Nav       from './components/Nav'
import Home      from './pages/Home'
import Login     from './pages/Login'
import ProviderLogin from './pages/ProviderLogin'
import Dashboard from './pages/Dashboard'
import Provider  from './pages/Provider'
import Messages  from './pages/Messages'

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/"               element={<Home />} />
        <Route path="/login"          element={<Login />} />
        <Route path="/provider-login" element={<ProviderLogin />} />
        <Route path="/dashboard"      element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/provider"       element={<ProtectedRoute requireRole="provider"><Provider /></ProtectedRoute>} />
        <Route path="/messages"       element={<ProtectedRoute><Messages /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  )
}
