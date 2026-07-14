import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import styles from './ProfileMenu.module.css'

export default function ProfileMenu() {
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!user) return null

  const name = user.user_metadata?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  const initial = (name || user.email || 'U')[0].toUpperCase()

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button className={styles.avatarBtn} onClick={() => setOpen(o => !o)} aria-label="Account menu">
        {initial}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.who}>
            <div className={styles.name}>{name || 'Welcome'}</div>
            <div className={styles.email}>{user.email}</div>
            {profile?.role && <div className={styles.role}>{profile.role === 'provider' ? 'Provider' : 'Patient'}</div>}
          </div>
          <button className={styles.signOutBtn} onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  )
}
