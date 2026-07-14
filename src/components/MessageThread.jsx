import { useEffect, useRef, useState } from 'react'
import * as db from '../lib/db'
import styles from './MessageThread.module.css'

const POLL_MS = 30000
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export default function MessageThread({ conversation, currentUserId, title, onSent }) {
  const [messages, setMessages] = useState([])
  const [attachments, setAttachments] = useState([])
  const [reads, setReads] = useState([])
  const [signedUrls, setSignedUrls] = useState({}) // { storage_path: url }
  const [body, setBody] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    load(true)
    const id = setInterval(() => { if (!document.hidden) load(false) }, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function load(isInitial) {
    if (!conversation) return
    Promise.all([
      db.listMyMessages(conversation.id),
      db.listMyMessageReads(conversation.id),
    ]).then(async ([msgs, readRows]) => {
      setMessages(msgs)
      setReads(readRows)
      const atts = await db.listAttachmentsForMessages(msgs.map(m => m.id))
      setAttachments(atts)
      db.markConversationRead(conversation.id, currentUserId).catch(() => {})
      if (isInitial) onSent?.()
    }).catch(() => {})
  }

  useEffect(() => {
    const missing = attachments.filter(a => IMAGE_TYPES.includes(a.mime_type) && !signedUrls[a.storage_path])
    if (missing.length === 0) return
    Promise.all(missing.map(a => db.getAttachmentSignedUrl(a.storage_path).then(url => [a.storage_path, url]).catch(() => null)))
      .then(pairs => {
        const next = {}
        pairs.filter(Boolean).forEach(([path, url]) => { next[path] = url })
        setSignedUrls(prev => ({ ...prev, ...next }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments])

  function addFiles(fileList) {
    setPendingFiles(prev => [...prev, ...Array.from(fileList)])
  }

  function removePendingFile(idx) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSend() {
    if (!body.trim() && pendingFiles.length === 0) return
    setSending(true)
    setError('')
    try {
      const msg = await db.sendMessage(conversation.id, currentUserId, body.trim())
      for (const file of pendingFiles) {
        await db.uploadMessageAttachment(conversation.id, msg.id, file)
      }
      setBody('')
      setPendingFiles([])
      await load(false)
      onSent?.()
    } catch (err) {
      setError(err?.message || 'Failed to send — try again')
    } finally {
      setSending(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  // "Seen" is derived from the other side(s)' message_reads cursor vs. the
  // timestamp of the last message *I* sent -- see MessageThread's usage in
  // Messages.jsx for how `conversation` distinguishes patient_team (N
  // possible provider readers) from provider_dm (exactly one other reader).
  function seenForLastOwnMessage() {
    const mine = [...messages].reverse().find(m => m.sender_id === currentUserId)
    if (!mine) return false
    if (conversation.kind === 'provider_dm') {
      const otherId = conversation.participant_a === currentUserId ? conversation.participant_b : conversation.participant_a
      const row = reads.find(r => r.user_id === otherId)
      return !!row && new Date(row.last_read_at) >= new Date(mine.created_at)
    }
    // patient_team
    if (currentUserId === conversation.patient_id) {
      return reads.some(r => r.user_id !== conversation.patient_id && new Date(r.last_read_at) >= new Date(mine.created_at))
    }
    const row = reads.find(r => r.user_id === conversation.patient_id)
    return !!row && new Date(row.last_read_at) >= new Date(mine.created_at)
  }

  if (!conversation) {
    return <div className={styles.empty}>Select a conversation to start messaging.</div>
  }

  const lastMineId = [...messages].reverse().find(m => m.sender_id === currentUserId)?.id
  const seen = seenForLastOwnMessage()

  return (
    <div
      className={`${styles.thread} ${dragOver ? styles.dragOver : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className={styles.header}>{title}</div>

      <div className={styles.messages}>
        {messages.map(m => {
          const mine = m.sender_id === currentUserId
          const msgAttachments = attachments.filter(a => a.message_id === m.id)
          return (
            <div key={m.id} className={`${styles.bubbleRow} ${mine ? styles.own : ''}`}>
              <div className={styles.bubble}>
                {m.body && <div className={styles.bubbleText}>{m.body}</div>}
                {msgAttachments.map(a => (
                  <div key={a.id} className={styles.attachment}>
                    {IMAGE_TYPES.includes(a.mime_type) && signedUrls[a.storage_path] ? (
                      <a href={signedUrls[a.storage_path]} target="_blank" rel="noreferrer">
                        <img src={signedUrls[a.storage_path]} alt={a.file_name} className={styles.attachmentImg} />
                      </a>
                    ) : (
                      <button
                        className={styles.attachmentDoc}
                        onClick={() => db.getAttachmentSignedUrl(a.storage_path).then(url => window.open(url, '_blank'))}
                      >
                        📄 {a.file_name}
                      </button>
                    )}
                  </div>
                ))}
                <div className={styles.bubbleTime}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              {mine && m.id === lastMineId && seen && <div className={styles.seen}>Seen</div>}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className={styles.errorRow}>{error}</div>}

      {pendingFiles.length > 0 && (
        <div className={styles.pendingRow}>
          {pendingFiles.map((f, i) => (
            <span key={i} className={styles.pendingChip}>
              {f.name}
              <button onClick={() => removePendingFile(i)} aria-label="Remove attachment">✕</button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.composer}>
        <button className={styles.attachBtn} onClick={() => fileInputRef.current?.click()} aria-label="Add attachment">📎</button>
        <input
          ref={fileInputRef} type="file" multiple hidden
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
        />
        <input
          className={styles.textInput}
          placeholder="Type a message…"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
        />
        <button className={styles.sendBtn} onClick={handleSend} disabled={sending}>Send</button>
      </div>
    </div>
  )
}
