import { useEffect, useState } from 'react'
import { toLocalISODate } from '../lib/schedule'
import { REASONS } from '../lib/reasons'
import styles from './LogDoseModal.module.css'

const nowTimeStr = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function LogDoseModal({ med, myMeds = [], defaultReason = 'prophylaxis', onConfirm, onClose }) {
  const todayStr = toLocalISODate(new Date())
  const [medId,   setMedId]   = useState(med?.id || myMeds[0]?.id || '')
  const [date,    setDate]    = useState(todayStr)
  const [time,    setTime]    = useState(nowTimeStr())
  const [dosage,  setDosage]  = useState('')
  const [reason,  setReason]  = useState(defaultReason)
  const [note,    setNote]    = useState('')
  const [products,setProducts] = useState(1)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const activeMed = med || myMeds.find(m => m.id === medId)
  const tracksStock = activeMed?.stockCount != null

  function confirm() {
    if (!activeMed || !date || !time) return
    const [y, m, d]   = date.split('-').map(Number)
    const [hh, mm]    = time.split(':').map(Number)
    const takenAt = new Date(y, m - 1, d, hh, mm)
    onConfirm({
      med_id: activeMed.id,
      med_name: activeMed.name,
      taken_at: takenAt.toISOString(),
      dosage,
      reason,
      note,
      products_used: tracksStock ? Number(products) || 0 : null,
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>✕</button>
        <h4 className={styles.title}>Log a dose</h4>

        {med ? (
          <p className={styles.note}>{med.name}</p>
        ) : (
          <div className={styles.field}>
            <label>Medication</label>
            <select value={medId} onChange={e => setMedId(e.target.value)}>
              {myMeds.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div className={styles.freqRow}>
          <div className={styles.field}>
            <label>Date taken</label>
            <input type="date" max={todayStr} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Time taken</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        <div className={styles.field}>
          <label>Dosage</label>
          <input
            type="text"
            placeholder="e.g. 1500 IU or 40 IU/kg"
            value={dosage}
            onChange={e => setDosage(e.target.value)}
          />
        </div>

        {tracksStock && (
          <div className={styles.field}>
            <label>Products used (from stock)</label>
            <input
              type="number"
              min="0"
              value={products}
              onChange={e => setProducts(e.target.value)}
            />
          </div>
        )}

        <div className={styles.field}>
          <label>Reason</label>
          <div className={styles.reasonGroup} role="group" aria-label="Reason">
            {REASONS.map(r => (
              <button
                key={r.key}
                type="button"
                className={`${styles.reasonBtn} ${reason === r.key ? styles.active : ''}`}
                onClick={() => setReason(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Note (optional)</label>
          <textarea
            rows={3}
            placeholder="Anything worth remembering about this dose..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={confirm} disabled={!activeMed}>Confirm dose</button>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
