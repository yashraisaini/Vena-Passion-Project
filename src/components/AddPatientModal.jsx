import { useState } from 'react'
import { CONDITIONS, severityPlaceholder } from '../lib/diagnosis'
import styles from './AddPatientModal.module.css'

export default function AddPatientModal({ onConfirm, onClose }) {
  const [email, setEmail]         = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [condition, setCondition] = useState('')
  const [severity, setSeverity]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)

  const valid = email.trim() && firstName.trim() && lastName.trim()

  async function confirm() {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await onConfirm({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        condition: condition || null,
        severity_detail: severity.trim() || null,
      })
      setDone(true)
    } catch (err) {
      setError(err?.message || 'Failed to add patient — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {done ? (
          <>
            <h4 className={styles.title}>Invite sent</h4>
            <p className={styles.note}>
              An invite email was sent to <strong>{email}</strong>. Tell the patient to use the
              link emailed to them — not the "Continue with Google" button — to activate this
              account.
            </p>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <h4 className={styles.title}>Add a patient</h4>
            <p className={styles.note}>
              This creates the patient's account and emails them an invite link to sign in.
            </p>

            <div className={styles.field}>
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>First name</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Last name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className={styles.field}>
              <label>Condition (optional)</label>
              <select value={condition} onChange={e => setCondition(e.target.value)}>
                <option value="">Not specified</option>
                {CONDITIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Severity / type (optional)</label>
              <input
                type="text" value={severity} onChange={e => setSeverity(e.target.value)}
                placeholder={severityPlaceholder(condition)}
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={confirm} disabled={saving || !valid}>
                {saving ? 'Sending invite…' : 'Add patient'}
              </button>
              <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
