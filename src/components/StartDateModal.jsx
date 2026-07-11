import { useState, useEffect } from 'react'
import styles from './StartDateModal.module.css'

function getDefaults(med) {
  const f = med.frequency.toLowerCase()
  if (f.includes('once weekly') || f.includes('weekly')) return { times: 1, period: 'week' }
  if (f.includes('every 3') || f.includes('every 4'))    return { times: 2, period: 'week' }
  if (f.includes('every 5') || f.includes('every 6'))    return { times: 1, period: 'week' }
  if (f.includes('2x/week'))                             return { times: 2, period: 'week' }
  if (f.includes('2–3x') || f.includes('2-3x'))          return { times: 3, period: 'week' }
  if (f.includes('1–2 week'))                            return { times: 1, period: '2weeks' }
  if (f.includes('monthly'))                             return { times: 1, period: 'month' }
  if (f.includes('daily'))                               return { times: 7, period: 'week' }
  return { times: 3, period: 'week' }
}

export default function StartDateModal({ med, onConfirm, onClose }) {
  const def = getDefaults(med)
  const [date,   setDate]   = useState(new Date().toISOString().slice(0,10))
  const [times,  setTimes]  = useState(def.times)
  const [period, setPeriod] = useState(def.period)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  function confirm() {
    if (!date) return
    const [y, m, d] = date.split('-').map(Number)
    const periodDays = period === 'week' ? 7 : period === '2weeks' ? 14 : 30
    const interval   = Math.max(1, Math.round(periodDays / times))
    onConfirm({
      ...med,
      startDate:       new Date(y, m - 1, d),
      customInterval:  interval,
      customFreqLabel: `${times}× per ${period.replace('2weeks','2 weeks')}`,
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>✕</button>
        <h4 className={styles.title}>{med.name}</h4>
        <p className={styles.defFreq}>Default: {med.frequency}</p>
        <p className={styles.note}>
          Set your personal start date and how often you actually infuse —
          the calendar will schedule doses forward from here.
        </p>
        <div className={styles.field}>
          <label>Start date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}/>
        </div>
        <div className={styles.freqRow}>
          <div className={styles.field}>
            <label>Times per</label>
            <input type="number" min="1" max="14" value={times} onChange={e => setTimes(Number(e.target.value))}/>
          </div>
          <div className={styles.field}>
            <label>Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="week">Week</option>
              <option value="2weeks">2 Weeks</option>
              <option value="month">Month</option>
            </select>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={confirm}>Add to Calendar</button>
          <button className={styles.btnGhost}   onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
