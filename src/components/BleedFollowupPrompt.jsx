import { useEffect } from 'react'
import styles from './LogDoseModal.module.css'

const HOURS = 12

export default function BleedFollowupPrompt({ bleedEvent, doseLogs, onLinkExisting, onLogNewDose, onSkip, onClose }) {
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const occurredAt = new Date(bleedEvent.occurred_at)
  const candidates = doseLogs
    .filter(l => !l.bleed_event_id && Math.abs(new Date(l.taken_at) - occurredAt) <= HOURS * 3600000)
    .slice(0, 5)

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>✕</button>
        <h4 className={styles.title}>Have you dosed for this yet?</h4>
        <p className={styles.note}>Bleed reported — let's connect it to treatment if there is any.</p>

        {candidates.length > 0 && (
          <div className={styles.field}>
            <label>Link an existing recent dose</label>
            <div className={styles.checkGroup} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
              {candidates.map(log => (
                <button
                  key={log.id}
                  type="button"
                  className={styles.btnGhost}
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => onLinkExisting(log.id)}
                >
                  {log.med_name}{log.dosage ? ` — ${log.dosage}` : ''} · {new Date(log.taken_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.actions} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <button className={styles.btnPrimary} onClick={onLogNewDose}>Log a new dose for this</button>
          <button className={styles.btnGhost} onClick={onSkip}>Not yet — skip for now</button>
        </div>
      </div>
    </div>
  )
}
