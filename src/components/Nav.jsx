import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Nav.module.css'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const { user } = useAuth()
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
        <Link to={user ? '/dashboard' : '/login'} className={`${styles.link} ${styles.cta}`}>
          {user ? 'Dashboard' : 'Sign in'}
        </Link>
      </div>
    </nav>
  )
}
