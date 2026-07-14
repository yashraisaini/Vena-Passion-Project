import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import MessageThread from '../components/MessageThread'
import * as db from '../lib/db'
import styles from './Messages.module.css'

export default function Messages() {
  const { user, profile } = useAuth()
  const isProvider = profile?.role === 'provider'

  const [conversations, setConversations] = useState([])
  const [profiles, setProfiles] = useState([])
  const [allMessages, setAllMessages] = useState([])
  const [allReads, setAllReads] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => { load() }, [])

  // Full first load, with the page-level spinner.
  function load() {
    setLoading(true)
    return refresh().finally(() => setLoading(false))
  }

  // Background refresh (sidebar previews/unread dots) — deliberately never
  // touches `loading`. MessageThread calls this after opening a conversation
  // or sending a message; if it set `loading` too, the whole page (including
  // MessageThread itself) would unmount back to the spinner, which would
  // remount MessageThread, which would call this again on mount -- an
  // infinite loop. Only the very first load ever shows the spinner.
  function refresh() {
    return Promise.all([
      db.listMyConversations(),
      db.listAllPatientProfiles(), // returns every profile RLS lets the caller see
      db.listAllMyMessages(),
      db.listAllMyMessageReads(),
    ]).then(([convs, profs, msgs, reads]) => {
      setConversations(convs)
      setProfiles(profs)
      setAllMessages(msgs)
      setAllReads(reads)
      if (!isProvider) {
        const mine = convs.find(c => c.kind === 'patient_team')
        if (mine) setSelectedId(mine.id)
      } else {
        setSelectedId(prev => prev || convs[0]?.id || null)
      }
    })
  }

  const profileById = useMemo(() => {
    const m = {}
    profiles.forEach(p => { m[p.id] = p })
    return m
  }, [profiles])

  function nameFor(p) {
    if (!p) return 'Unknown'
    const n = `${p.first_name || ''} ${p.last_name || ''}`.trim()
    return n || (p.role === 'provider' ? 'Provider' : 'Patient')
  }

  function conversationLabel(c) {
    if (c.kind === 'patient_team') {
      return isProvider ? nameFor(profileById[c.patient_id]) : 'Care Team'
    }
    const otherId = c.participant_a === user.id ? c.participant_b : c.participant_a
    return nameFor(profileById[otherId])
  }

  function lastMessageFor(convId) {
    return allMessages.find(m => m.conversation_id === convId) || null // allMessages sorted desc
  }

  function isUnread(convId) {
    const lastFromOther = allMessages.find(m => m.conversation_id === convId && m.sender_id !== user.id)
    if (!lastFromOther) return false
    const myRead = allReads.find(r => r.conversation_id === convId && r.user_id === user.id)
    if (!myRead) return true
    return new Date(lastFromOther.created_at) > new Date(myRead.last_read_at)
  }

  const patientConvos = conversations.filter(c => c.kind === 'patient_team').sort((a, b) => a.id.localeCompare(b.id))
  const dmConvos = conversations.filter(c => c.kind === 'provider_dm')
  const otherProviders = profiles.filter(p => p.role === 'provider' && p.id !== user.id)

  async function startDM(otherId) {
    setPickerOpen(false)
    try {
      const convId = await db.getOrCreateProviderDM(otherId)
      await refresh()
      setSelectedId(convId)
    } catch {
      // no-op — picker just stays open-ended, user can retry
    }
  }

  const selected = conversations.find(c => c.id === selectedId) || null

  if (loading) return <div className={styles.page}><p className={styles.empty}>Loading…</p></div>

  if (!isProvider) {
    return (
      <div className={styles.page}>
        <div className={styles.soloThread}>
          <MessageThread conversation={selected} currentUserId={user.id} title="Care Team" onSent={refresh} />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <span>Messages</span>
            <button className={styles.newBtn} onClick={() => setPickerOpen(o => !o)}>+ New</button>
          </div>

          {pickerOpen && (
            <div className={styles.picker}>
              {otherProviders.length === 0 ? (
                <p className={styles.emptySmall}>No other providers yet.</p>
              ) : otherProviders.map(p => (
                <button key={p.id} className={styles.pickerRow} onClick={() => startDM(p.id)}>
                  {nameFor(p)}
                </button>
              ))}
            </div>
          )}

          <div className={styles.sectionLabel}>Patients</div>
          {patientConvos.map(c => {
            const last = lastMessageFor(c.id)
            return (
              <button
                key={c.id}
                className={`${styles.convoRow} ${selectedId === c.id ? styles.convoActive : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span className={styles.convoName}>
                  {isUnread(c.id) && <span className={styles.dot} />}
                  {conversationLabel(c)}
                </span>
                {last && <span className={styles.convoPreview}>{last.body || '📎 Attachment'}</span>}
              </button>
            )
          })}

          <div className={styles.sectionLabel}>Direct Messages</div>
          {dmConvos.length === 0 ? (
            <p className={styles.emptySmall}>No direct messages yet.</p>
          ) : dmConvos.map(c => {
            const last = lastMessageFor(c.id)
            return (
              <button
                key={c.id}
                className={`${styles.convoRow} ${selectedId === c.id ? styles.convoActive : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span className={styles.convoName}>
                  {isUnread(c.id) && <span className={styles.dot} />}
                  {conversationLabel(c)}
                </span>
                {last && <span className={styles.convoPreview}>{last.body || '📎 Attachment'}</span>}
              </button>
            )
          })}
        </div>

        <div className={styles.threadPane}>
          <MessageThread
            conversation={selected}
            currentUserId={user.id}
            title={selected ? conversationLabel(selected) : ''}
            onSent={refresh}
          />
        </div>
      </div>
    </div>
  )
}
