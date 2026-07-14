import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import MessageIndicator from './MessageIndicator'
import ProfileMenu from './ProfileMenu'
import styles from './Nav.module.css'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const { user, profile } = useAuth()
  const loc = useLocation()

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.filled : ''}`}>
      <Link to="/" className={styles.brand}>
        <span className={styles.pulse} />
        VENA
      </Link>
      <div className={styles.links}>
        <Link to="/#guide"    className={styles.link}>Guide</Link>
        <Link to="/#library"  className={styles.link}>Treatments</Link>
        {profile?.role === 'provider' && (
          <Link to="/provider" className={styles.link}>Provider View</Link>
        )}
        {user && <MessageIndicator />}
        <Link to={user ? '/dashboard' : '/login'} className={`${styles.link} ${styles.cta}`}>
          {user ? 'Dashboard' : 'Log in'}
        </Link>
        {user && <NotificationBell />}
        {user && <ProfileMenu />}
      </div>
    </nav>
  )
}
