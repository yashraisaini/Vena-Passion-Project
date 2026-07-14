import { useEffect, useState } from 'react'
import { toLocalISODate } from '../lib/schedule'
import { BLEED_LOCATIONS, BLEED_SIDES, SEVERITIES } from '../lib/bleeds'
import styles from './LogDoseModal.module.css'

const nowTimeStr = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function BleedReportModal({ onConfirm, onClose }) {
  const todayStr = toLocalISODate(new Date())
  const [date,          setDate]          = useState(todayStr)
  const [time,          setTime]          = useState(nowTimeStr())
  const [location,      setLocation]      = useState(BLEED_LOCATIONS[0])
  const [side,          setSide]          = useState(BLEED_SIDES[0])
  const [severity,      setSeverity]      = useState('mild')
  const [painLevel,     setPainLevel]     = useState(3)
  const [swelling,      setSwelling]      = useState(false)
  const [bruising,      setBruising]      = useState(false)
  const [discoloration, setDiscoloration] = useState(false)
  const [note,          setNote]          = useState('')
  const [error,         setError]         = useState('')

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  function confirm() {
    if (!date || !time) return
    const [y, m, d]  = date.split('-').map(Number)
    const [hh, mm]   = time.split(':').map(Number)
    const occurredAt = new Date(y, m - 1, d, hh, mm)
    if (occurredAt.getTime() > Date.now()) {
      setError("That hasn't happened yet — pick a time that's already passed, or now.")
      return
    }
    setError('')
    onConfirm({
      occurred_at: occurredAt.toISOString(),
      location, side, severity,
      pain_level: Number(painLevel),
      symptom_swelling: swelling,
      symptom_bruising: bruising,
      symptom_discoloration: discoloration,
      note,
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>✕</button>
        <h4 className={styles.title}>Log a bleed</h4>
        <p className={styles.note}>Report what happened — you can decide what to do about treatment next.</p>

        <div className={styles.freqRow}>
          <div className={styles.field}>
            <label>Date</label>
            <input type="date" max={todayStr} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Time of injury</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        <div className={styles.freqRow}>
          <div className={styles.field}>
            <label>Joint/location</label>
            <select value={location} onChange={e => setLocation(e.target.value)}>
              {BLEED_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Side</label>
            <select value={side} onChange={e => setSide(e.target.value)}>
              {BLEED_SIDES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label>Severity</label>
          <div className={styles.reasonGroup} role="group" aria-label="Severity">
            {SEVERITIES.map(s => (
              <button
                key={s.key}
                type="button"
                className={`${styles.reasonBtn} ${severity === s.key ? styles.active : ''}`}
                onClick={() => setSeverity(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Pain level: {painLevel} / 10</label>
          <input type="range" min="0" max="10" value={painLevel} onChange={e => setPainLevel(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>What do you notice?</label>
          <div className={styles.checkGroup}>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={swelling} onChange={e => setSwelling(e.target.checked)} /> Swelling
            </label>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={bruising} onChange={e => setBruising(e.target.checked)} /> Bruising
            </label>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={discoloration} onChange={e => setDiscoloration(e.target.checked)} /> Discoloration
            </label>
          </div>
        </div>

        <div className={styles.field}>
          <label>Note (optional)</label>
          <textarea
            rows={3}
            placeholder="Anything else worth noting..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.9rem' }}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={confirm}>Save bleed report</button>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
