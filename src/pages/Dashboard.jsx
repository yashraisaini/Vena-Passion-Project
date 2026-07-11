import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Library from '../components/Library'
import Calendar from '../components/Calendar'
import StartDateModal from '../components/StartDateModal'
import { getFactorStatus, catMeta } from '../data/medications'
import styles from './Dashboard.module.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [myMeds,    setMyMeds]    = useState([])
  const [pendingMed,setPending]   = useState(null)  // med waiting for start date
  const [tab,       setTab]       = useState('meds') // meds | library | calendar
  const [toast,     setToast]     = useState('')
  const [toastShow, setToastShow] = useState(false)

  useEffect(() => { if (!user) navigate('/login') }, [user, navigate])

  function showToast(msg) {
    setToast(msg); setToastShow(true)
    setTimeout(() => setToastShow(false), 3200)
  }

  function handleAdd(med) {
    if (myMeds.some(m => m.name === med.name)) { showToast(`${med.name} already added`); return }
    setPending(med)
  }

  function confirmAdd(med) {
    setMyMeds(prev => [...prev, med])
    setPending(null)
    showToast(`${med.name} added — every ${med.customInterval} days`)
  }

  function removeMed(name) {
    setMyMeds(prev => prev.filter(m => m.name !== name))
    showToast(`${name} removed`)
  }

  function updateInterval(name, delta) {
    setMyMeds(prev => prev.map(m =>
      m.name === name
        ? { ...m, customInterval: Math.min(365, Math.max(1, (m.customInterval || 3) + delta)), customFreqLabel: null }
        : m
    ))
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return (
    <div className={styles.page}>
      {/* Toast */}
      <div className={`${styles.toast} ${toastShow ? styles.toastShow : ''}`}>{toast}</div>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}</div>
            <div>
              <div className={styles.userName}>{user?.user_metadata?.full_name || 'Welcome back'}</div>
              <div className={styles.userEmail}>{user?.email}</div>
            </div>
          </div>
          <button className={styles.signOut} onClick={signOut}>Sign out</button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {[['meds','My Medications'],['library','Browse Treatments'],['calendar','Calendar']].map(([k,l]) => (
          <button key={k} className={`${styles.tab} ${tab===k?styles.tabActive:''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className={styles.content}>

        {/* ── MY MEDS TAB ── */}
        {tab === 'meds' && (
          <div>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>My Medications</h2>
              <button className={styles.btnGhost} onClick={() => setTab('library')}>Browse treatments →</button>
            </div>
            {myMeds.length === 0 ? (
              <div className={styles.empty}>
                <p>No medications added yet.</p>
                <p>Go to <button className={styles.inlineLink} onClick={() => setTab('library')}>Browse Treatments</button> and click + to add.</p>
              </div>
            ) : (
              <div className={styles.medsGrid}>
                {myMeds.map(med => {
                  const m = catMeta[med.category]
                  const interval = med.customInterval || Math.round((med.intervalHrs || 72) / 24)
                  const sd = med.startDate ? med.startDate.toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' }) : '—'
                  const diff = med.startDate ? Math.floor((today - new Date(med.startDate).setHours(0,0,0,0)) / 86400000) : null
                  const daysSinceLast = diff != null ? diff % interval : null
                  const status = daysSinceLast != null ? getFactorStatus(med, daysSinceLast) : null
                  const riskLabels = {
                    safe:    'Well protected — routine activity OK',
                    caution: 'Mild range — limit high-risk activity',
                    risk:    'Low — consider re-dosing or contacting your HTC',
                  }
                  return (
                    <div key={med.id} className={styles.medCard}>
                      <button className={styles.removeBtn} onClick={() => removeMed(med.name)} aria-label={`Remove ${med.name}`}>✕</button>
                      <div className={styles.medName}>{med.name}</div>
                      <div className={styles.medGeneric}>{med.generic}</div>
                      <div className={styles.chips}>
                        <span className={styles.chip} style={{ color:`rgba(${m.color},1)`, background:`rgba(${m.color},0.08)`, borderColor:`rgba(${m.color},0.2)` }}>
                          {med.customFreqLabel || med.frequency}
                        </span>
                        <span className={`${styles.chip} ${styles.chipGold}`}>From {sd}</span>
                      </div>
                      <div className={styles.freqRow}>
                        <span className={styles.freqLabel}>Every</span>
                        <div className={styles.stepper}>
                          <button className={styles.stepBtn} onClick={() => updateInterval(med.name, -1)}>−</button>
                          <span className={styles.stepVal}>{interval}</span>
                          <button className={styles.stepBtn} onClick={() => updateInterval(med.name, +1)}>+</button>
                        </div>
                        <span className={styles.freqUnit}>days</span>
                      </div>
                      {status && (
                        <div className={styles.gauge}>
                          <div className={styles.gaugeLabel}>
                            <span>Est. factor level</span>
                            <span style={{ color: status.color }}>{status.label}</span>
                          </div>
                          <div className={styles.gaugeTrack}>
                            <div className={styles.gaugeFill} style={{ width: `${Math.min(status.pct, 100)}%`, background: status.color }}/>
                          </div>
                          <div className={styles.riskRow}>
                            <span className={`${styles.riskDot} ${styles[status.risk]}`}/>
                            <span className={styles.riskLabel}>{riskLabels[status.risk]}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── LIBRARY TAB ── */}
        {tab === 'library' && (
          <div>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>Browse Treatments</h2>
            </div>
            <Library onAdd={handleAdd} addedNames={myMeds.map(m => m.name)} />
          </div>
        )}

        {/* ── CALENDAR TAB ── */}
        {tab === 'calendar' && (
          <Calendar myMeds={myMeds} showToast={showToast} />
        )}

      </div>

      {/* Start Date Modal */}
      {pendingMed && (
        <StartDateModal
          med={pendingMed}
          onConfirm={confirmAdd}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
