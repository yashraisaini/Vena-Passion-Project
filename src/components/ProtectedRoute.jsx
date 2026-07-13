import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// UX convenience only — hides routes a signed-out or wrong-role user shouldn't
// see in normal use. This is NOT the security boundary: Supabase Row Level
// Security is what actually prevents unauthorized data access, even if this
// component were bypassed entirely.
export default function ProtectedRoute({ children, requireRole }) {
  const { user, profile, profileLoading } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (requireRole && profileLoading) return null
  if (requireRole && profile?.role !== requireRole) return <Navigate to="/dashboard" replace />

  return children
}
