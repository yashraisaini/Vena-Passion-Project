import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Nav       from './components/Nav'
import Home      from './pages/Home'
import Login     from './pages/Login'
import ProviderLogin from './pages/ProviderLogin'
import Dashboard from './pages/Dashboard'
import Provider  from './pages/Provider'
import Messages  from './pages/Messages'

// Lazy-loaded: TensorFlow.js + the hand-pose model pull in ~1.3MB, which
// would otherwise bloat every user's initial page load even if they never
// touch this feature. This keeps it in its own chunk, fetched only when
// someone actually navigates to /injection-guide.
const InjectionGuide = lazy(() => import('./pages/InjectionGuide'))

// React Router's client-side navigation doesn't auto-scroll to a URL's
// #hash the way a full page load does -- without this, clicking a Link to
// e.g. /#library from any other page just lands at the top of Home.
function ScrollToHash() {
  const location = useLocation()
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    // Give the destination route a frame to mount before scrolling to it.
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [location.pathname, location.hash])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <ScrollToHash />
      <Routes>
        <Route path="/"               element={<Home />} />
        <Route path="/login"          element={<Login />} />
        <Route path="/provider-login" element={<ProviderLogin />} />
        <Route path="/dashboard"      element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/provider"       element={<ProtectedRoute requireRole="provider"><Provider /></ProtectedRoute>} />
        <Route path="/messages"       element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route
          path="/injection-guide"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <InjectionGuide />
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
