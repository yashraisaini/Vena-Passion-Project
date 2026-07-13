import { useState } from 'react'
import styles from './CompleteProfileModal.module.css'

export default function CompleteProfileModal({ onConfirm }) {
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [saving,    setSaving]    = useState(false)

  async function confirm() {
    if (!firstName.trim() || !lastName.trim()) return
    setSaving(true)
    await onConfirm({ first_name: firstName.trim(), last_name: lastName.trim() })
    setSaving(false)
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h4 className={styles.title}>Welcome to Vena</h4>
        <p className={styles.note}>
          Tell us your name so your care team can identify you. You'll also be given
          a unique patient ID automatically.
        </p>
        <div className={styles.field}>
          <label>First name</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
        </div>
        <div className={styles.field}>
          <label>Last name</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
        </div>
        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={confirm}
            disabled={saving || !firstName.trim() || !lastName.trim()}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
