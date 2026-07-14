import { useEffect, useMemo, useState } from 'react'
import { toLocalISODate } from '../lib/schedule'
import { REASONS } from '../lib/reasons'
import styles from './LogDoseModal.module.css'

const nowTimeStr = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const DUPLICATE_WINDOW_MS = 6 * 3600000
const PICKABLE_REASONS = REASONS.filter(r => r.key !== 'bleed' && r.key !== 'bleed_followup')

export default function LogDoseModal({
  med, myMeds = [], doseLogs = [], defaultReason = 'prophylaxis',
  linkedBleedEventId = null, linkedBleedSummary = '',
  onConfirm, onClose,
}) {
  const todayStr = toLocalISODate(new Date())
  const [medId,   setMedId]   = useState(med?.id || myMeds[0]?.id || '')
  const [date,    setDate]    = useState(todayStr)
  const [time,    setTime]    = useState(nowTimeStr())
  const [dosage,  setDosage]  = useState('')
  const [reason,  setReason]  = useState(linkedBleedEventId ? 'bleed_followup' : defaultReason)
  const [note,    setNote]    = useState('')
  const [products,setProducts] = useState(1)
  const [ackDuplicate, setAckDuplicate] = useState(false)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const activeMed = med || myMeds.find(m => m.id === medId)
  const tracksStock = activeMed?.stockCount != null

  const takenAtMs = useMemo(() => {
    if (!date || !time) return null
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm]  = time.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm).getTime()
  }, [date, time])

  const conflict = useMemo(() => {
    if (!activeMed || takenAtMs == null) return null
    return doseLogs.find(l => l.med_id === activeMed.id && Math.abs(takenAtMs - new Date(l.taken_at).getTime()) <= DUPLICATE_WINDOW_MS) || null
  }, [activeMed, takenAtMs, doseLogs])

  useEffect(() => { setAckDuplicate(false) }, [conflict?.id])

  function confirm() {
    if (!activeMed || takenAtMs == null) return
    if (conflict && !ackDuplicate) return
    onConfirm({
      med_id: activeMed.id,
      med_name: activeMed.name,
      taken_at: new Date(takenAtMs).toISOString(),
      dosage,
      reason,
      note,
      products_used: tracksStock ? Number(products) || 0 : null,
      bleed_event_id: linkedBleedEventId || null,
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>✕</button>
        <h4 className={styles.title}>Log a dose</h4>

        {linkedBleedSummary && (
          <p className={styles.note}>Linked to bleed: {linkedBleedSummary}</p>
        )}

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

        {!linkedBleedEventId && (
          <div className={styles.field}>
            <label>Reason</label>
            <div className={styles.reasonGroup} role="group" aria-label="Reason">
              {PICKABLE_REASONS.map(r => (
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
        )}

        {conflict && (
          <div className={styles.bleedSection}>
            <p className={styles.bleedHeading}>Possible duplicate</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text)', marginBottom: '0.7rem' }}>
              You already logged {conflict.med_name}{conflict.dosage ? ` (${conflict.dosage})` : ''} at{' '}
              {new Date(conflict.taken_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Is this a separate dose?
            </p>
            {!ackDuplicate ? (
              <div className={styles.actions} style={{ marginTop: 0 }}>
                <button type="button" className={styles.btnPrimary} onClick={() => setAckDuplicate(true)}>Yes, this is separate</button>
                <button type="button" className={styles.btnGhost} onClick={onClose}>Never mind</button>
              </div>
            ) : (
              <p style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>Confirmed as a separate dose.</p>
            )}
          </div>
        )}

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
          <button className={styles.btnPrimary} onClick={confirm} disabled={!activeMed || (conflict && !ackDuplicate)}>Confirm dose</button>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
