import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as db from '../lib/db'
import styles from './NotificationBell.module.css'

const POLL_MS = 35000
const TYPE_RANK = { bleed: 0, restock: 0, dose: 1, reminder: 2 }

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!user) return
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function load() {
    db.listMyNotifications(user.id).then(setItems).catch(() => {})
  }

  const unreadCount = items.filter(n => !n.read).length
  const sorted = [...items].sort((a, b) => {
    const r = TYPE_RANK[a.type] - TYPE_RANK[b.type]
    return r !== 0 ? r : new Date(b.created_at) - new Date(a.created_at)
  })

  async function handleOpen() {
    setOpen(o => !o)
  }

  async function handleRowClick(n) {
    if (!n.read) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      db.markNotificationRead(n.id).catch(() => {})
    }
    setOpen(false)

    // nonce forces the destination page's effect to re-fire even if the same
    // notification (or same patient) is clicked again from the same route.
    const nonce = Date.now()
    if (n.type === 'reminder') {
      navigate('/dashboard', { state: { openLogDose: nonce } })
    } else if (n.type === 'bleed') {
      navigate('/provider', { state: { focusPatientId: n.subject_patient_id, focusBleedId: n.related_id, nonce } })
    } else if (n.type === 'dose') {
      navigate('/provider', { state: { focusPatientId: n.subject_patient_id, focusDoseId: n.related_id, nonce } })
    } else if (n.type === 'restock') {
      navigate('/provider', { state: { focusPatientId: n.subject_patient_id, nonce } })
    }
  }

  async function handleMarkAllRead() {
    setItems(prev => prev.map(x => ({ ...x, read: true })))
    try { await db.markAllNotificationsRead(user.id) } catch { /* no-op */ }
  }

  if (!user) return null

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.bell} ${unreadCount > 0 ? styles.glow : ''}`}
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        🔔
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHead}>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button className={styles.markAll} onClick={handleMarkAllRead}>Mark all read</button>
            )}
          </div>
          {sorted.length === 0 ? (
            <p className={styles.empty}>Nothing yet.</p>
          ) : (
            <div className={styles.list}>
              {sorted.map(n => (
                <button
                  key={n.id}
                  className={`${styles.row} ${styles[n.type]} ${!n.read ? styles.unread : ''}`}
                  onClick={() => handleRowClick(n)}
                >
                  <span className={styles.rowMsg}>{n.message}</span>
                  <span className={styles.rowTime}>
                    {new Date(n.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}{' '}
                    {new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
