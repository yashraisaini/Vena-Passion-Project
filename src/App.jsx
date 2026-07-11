import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Nav       from './components/Nav'
import Home      from './pages/Home'
import Login     from './pages/Login'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/"          element={<Home />} />
        <Route path="/login"     element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </AuthProvider>
  )
}
