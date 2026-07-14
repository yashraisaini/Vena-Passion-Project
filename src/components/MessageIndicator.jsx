import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as db from '../lib/db'
import styles from './MessageIndicator.module.css'

const POLL_MS = 35000

export default function MessageIndicator() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) return
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  function load() {
    db.countUnreadMessages().then(setCount).catch(() => {})
  }

  if (!user) return null

  return (
    <Link
      to="/messages"
      className={`${styles.icon} ${count > 0 ? styles.glow : ''}`}
      aria-label={count > 0 ? `${count} unread messages` : 'Messages'}
    >
      💬
      {count > 0 && <span className={styles.badge}>{count > 9 ? '9+' : count}</span>}
    </Link>
  )
}
