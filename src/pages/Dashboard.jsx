import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Library from '../components/Library'
import Calendar from '../components/Calendar'
import StartDateModal from '../components/StartDateModal'
import LogDoseModal from '../components/LogDoseModal'
import BleedReportModal from '../components/BleedReportModal'
import BleedFollowupPrompt from '../components/BleedFollowupPrompt'
import CompleteProfileModal from '../components/CompleteProfileModal'
import { catMeta, medications } from '../data/medications'
import { computeMedStatus } from '../lib/factorStatus'
import { isDoseDueToday, toLocalISODate, hydrateMedRow } from '../lib/schedule'
import { REASON_LABELS } from '../lib/reasons'
import { SEVERITY_META, symptomList } from '../lib/bleeds'
import * as db from '../lib/db'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [myMeds,      setMyMeds]      = useState([])
  const [doseLogs,    setDoseLogs]    = useState([])
  const [bleedEvents, setBleedEvents] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [pendingMed,setPending]   = useState(null)  // med waiting for start date
  const [logModal,  setLogModal]  = useState(null)  // { med?, defaultReason?, linkedBleedEventId?, linkedBleedSummary? } while a LogDoseModal is open
  const [bleedReportOpen, setBleedReportOpen] = useState(false)
  const [followupBleed,   setFollowupBleed]   = useState(null) // bleed_event awaiting "have you dosed for this?" decision
  const [tab,       setTab]       = useState('meds') // meds | library | calendar | history
  const [toast,     setToast]     = useState('')
  const [toastShow, setToastShow] = useState(false)

  const writeTimers = useRef({})

  // A provider's "send reminder" notification deep-links here to prompt an
  // immediate dose log -- state.openLogDose is a nonce so re-clicking the
  // same notification always re-opens it, even without leaving this page.
  useEffect(() => {
    if (!location.state?.openLogDose) return
    setTab('meds')
    setLogModal({})
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openLogDose])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    Promise.all([db.listUserMedications(user.id), db.listDoseLogs(user.id), db.listBleedEvents(user.id)])
      .then(([rows, logs, bleeds]) => {
        if (cancelled) return
        const hydrated = rows.map(row => hydrateMedRow(row, medications)).filter(Boolean)
        setMyMeds(hydrated)
        setDoseLogs(logs)
        setBleedEvents(bleeds)
      })
      .catch(() => showToast('Failed to load your data'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  function showToast(msg) {
    setToast(msg); setToastShow(true)
    setTimeout(() => setToastShow(false), 3200)
  }

  function handleAdd(med) {
    if (myMeds.some(m => m.id === med.id)) { showToast(`${med.name} already added`); return }
    setPending(med)
  }

  async function confirmAdd(med) {
    try {
      await db.upsertUserMedication(user.id, {
        med_id:        med.id,
        med_name:      med.name,
        start_date:    toLocalISODate(med.startDate),
        interval_days: med.customInterval,
        freq_label:    med.customFreqLabel,
      })
      setMyMeds(prev => [...prev, med])
      setPending(null)
      showToast(`${med.name} added — every ${med.customInterval} days`)
    } catch {
      showToast('Failed to save medication — try again')
    }
  }

  async function removeMed(id, name) {
    try {
      await db.deleteUserMedication(user.id, id)
      setMyMeds(prev => prev.filter(m => m.id !== id))
      showToast(`${name} removed`)
    } catch {
      showToast('Failed to remove medication — try again')
    }
  }

  function schedulePersist(med, errorMsg) {
    clearTimeout(writeTimers.current[med.id])
    writeTimers.current[med.id] = setTimeout(() => {
      db.upsertUserMedication(user.id, {
        med_id:        med.id,
        med_name:      med.name,
        start_date:    toLocalISODate(med.startDate),
        interval_days: med.customInterval,
        freq_label:    med.customFreqLabel,
        unit_size:     med.unitSize,
        stock_count:   med.stockCount,
      }).catch(() => showToast(errorMsg))
    }, 600)
  }

  function updateInterval(id, delta) {
    setMyMeds(prev => {
      const next = prev.map(m =>
        m.id === id
          ? { ...m, customInterval: Math.min(365, Math.max(1, (m.customInterval || 3) + delta)), customFreqLabel: null }
          : m
      )
      const updated = next.find(m => m.id === id)
      if (updated) schedulePersist(updated, 'Failed to save interval change')
      return next
    })
  }

  function updateStockField(id, field, value) {
    const num = value === '' ? null : Math.max(0, Number(value))
    setMyMeds(prev => {
      const next = prev.map(m => m.id === id ? { ...m, [field]: num } : m)
      const updated = next.find(m => m.id === id)
      if (updated) schedulePersist(updated, 'Failed to save stock change')
      return next
    })
  }

  async function confirmLog(entry) {
    try {
      const saved = await db.insertDoseLog(user.id, entry)
      setDoseLogs(prev => [...prev, saved].sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at)))
      setLogModal(null)
      showToast(`${entry.med_name} dose logged`)

      if (entry.products_used) {
        setMyMeds(prev => {
          const next = prev.map(m =>
            m.id === entry.med_id && m.stockCount != null
              ? { ...m, stockCount: Math.max(0, m.stockCount - entry.products_used) }
              : m
          )
          const updated = next.find(m => m.id === entry.med_id)
          if (updated && updated.stockCount != null) schedulePersist(updated, 'Failed to update stock count')
          return next
        })
      }
    } catch {
      showToast('Failed to log dose — try again')
    }
  }

  async function removeDoseLog(id) {
    try {
      await db.deleteDoseLog(user.id, id)
      setDoseLogs(prev => prev.filter(l => l.id !== id))
      showToast('Dose log removed')
    } catch {
      showToast('Failed to remove dose log — try again')
    }
  }

  async function confirmBleedReport(entry) {
    try {
      const saved = await db.insertBleedEvent(user.id, entry)
      setBleedEvents(prev => [saved, ...prev])
      setBleedReportOpen(false)
      setFollowupBleed(saved)
      showToast('Bleed reported')
    } catch {
      showToast('Failed to save bleed report — try again')
    }
  }

  async function handleLinkExisting(doseLogId) {
    const bleed = followupBleed
    try {
      await db.linkDoseToBleedEvent(user.id, doseLogId, bleed.id)
      setDoseLogs(prev => prev.map(l => l.id === doseLogId ? { ...l, bleed_event_id: bleed.id } : l))
      setFollowupBleed(null)
      showToast('Dose linked to bleed')
    } catch {
      showToast('Failed to link dose — try again')
    }
  }

  function handleLogNewDoseForBleed() {
    const bleed = followupBleed
    setFollowupBleed(null)
    setLogModal({
      linkedBleedEventId: bleed.id,
      linkedBleedSummary: `${bleed.location || 'Bleed'} — ${new Date(bleed.occurred_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
    })
  }

  async function removeBleedEvent(id) {
    try {
      await db.deleteBleedEvent(user.id, id)
      setBleedEvents(prev => prev.filter(b => b.id !== id))
      showToast('Bleed report removed')
    } catch {
      showToast('Failed to remove bleed report — try again')
    }
  }

  async function handleCompleteProfile({ first_name, last_name }) {
    await db.updateProfileName(user.id, { first_name, last_name })
    await refreshProfile()
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dueToday = myMeds.filter(m => isDoseDueToday(m))

  if (profile && profile.role !== 'provider' && (!profile.first_name || !profile.last_name)) {
    return <CompleteProfileModal onConfirm={handleCompleteProfile} />
  }

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
              {profile?.patient_id && <div className={styles.patientId}>Patient ID: {profile.patient_id}</div>}
            </div>
          </div>
          <button className={styles.signOut} onClick={signOut}>Sign out</button>
        </div>
      </div>

      {/* Needle day banner */}
      {dueToday.length > 0 && (
        <div className={styles.needleBanner}>
          <div className={styles.needleBannerText}>
            <strong>Today is a needle day</strong> for {dueToday.map(m => m.name).join(', ')}.
          </div>
          <div className={styles.needleBannerActions}>
            {dueToday.map(m => (
              <button
                key={m.id}
                className={styles.btnGhost}
                onClick={() => setLogModal({ med: m, defaultReason: 'prophylaxis' })}
              >
                Log {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {[['meds','My Medications'],['library','Browse Treatments'],['calendar','Calendar'],['history','Dose History'],['bleeds','Bleeds']].map(([k,l]) => (
          <button key={k} className={`${styles.tab} ${tab===k?styles.tabActive:''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className={styles.content}>

        {/* ── MY MEDS TAB ── */}
        {tab === 'meds' && (
          <div>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>My Medications</h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {myMeds.length > 0 && (
                  <>
                    <button className={styles.btnGhost} onClick={() => setLogModal({})}>+ Log a dose</button>
                    <button className={styles.btnGhost} onClick={() => setBleedReportOpen(true)}>+ Log a bleed</button>
                  </>
                )}
                <button className={styles.btnGhost} onClick={() => setTab('library')}>Browse treatments →</button>
              </div>
            </div>
            {!loading && myMeds.length === 0 ? (
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

                  const status = computeMedStatus(med, doseLogs, today)
                  const riskLabels = {
                    safe:    'Well protected — safe for sports & activity',
                    caution: 'Mild range — light activity only',
                    risk:    'Low protection — rest, avoid activity',
                  }
                  return (
                    <div key={med.id} className={styles.medCard}>
                      <button className={styles.removeBtn} onClick={() => removeMed(med.id, med.name)} aria-label={`Remove ${med.name}`}>✕</button>
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
                          <button className={styles.stepBtn} onClick={() => updateInterval(med.id, -1)}>−</button>
                          <span className={styles.stepVal}>{interval}</span>
                          <button className={styles.stepBtn} onClick={() => updateInterval(med.id, +1)}>+</button>
                        </div>
                        <span className={styles.freqUnit}>days</span>
                      </div>
                      <div className={styles.stockRow}>
                        <div className={styles.stockField}>
                          <label>Units/product</label>
                          <input
                            type="number" min="0" placeholder="e.g. 1000"
                            value={med.unitSize ?? ''}
                            onChange={e => updateStockField(med.id, 'unitSize', e.target.value)}
                          />
                        </div>
                        <div className={styles.stockField}>
                          <label>Products in stock</label>
                          <input
                            type="number" min="0" placeholder="Not tracked"
                            value={med.stockCount ?? ''}
                            onChange={e => updateStockField(med.id, 'stockCount', e.target.value)}
                          />
                        </div>
                      </div>
                      {med.stockCount != null && (
                        <p className={`${styles.stockNote} ${med.stockCount <= 2 ? styles.stockLow : ''}`}>
                          {med.stockCount} product{med.stockCount === 1 ? '' : 's'} remaining
                          {med.unitSize ? ` (${med.unitSize} units each)` : ''}
                        </p>
                      )}
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
                      <button
                        className={styles.btnGhost}
                        style={{ marginTop: '0.9rem', width: '100%' }}
                        onClick={() => setLogModal({ med })}
                      >
                        Log a dose
                      </button>
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
          <Calendar myMeds={myMeds} doseLogs={doseLogs} showToast={showToast} />
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>Dose History</h2>
            </div>
            {doseLogs.length === 0 ? (
              <div className={styles.empty}>
                <p>No doses logged yet.</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {doseLogs.map(log => {
                  const symptoms = [log.symptom_swelling && 'Swelling', log.symptom_bruising && 'Bruising', log.symptom_discoloration && 'Discoloration'].filter(Boolean)
                  return (
                  <div key={log.id} className={styles.historyRow}>
                    <div className={styles.historyDate}>
                      {new Date(log.taken_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <br/>
                      {new Date(log.taken_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className={styles.historyMain}>
                      <div className={styles.historyMed}>
                        {log.med_name}{log.dosage ? ` — ${log.dosage}` : ''}
                        {log.products_used ? ` (${log.products_used} product${log.products_used === 1 ? '' : 's'})` : ''}
                      </div>
                      {log.bleed_location && (
                        <div className={styles.historyNote}>
                          {log.bleed_location}{log.bleed_side && log.bleed_side !== 'N/A' ? ` (${log.bleed_side})` : ''}
                          {log.severity ? ` · ${log.severity[0].toUpperCase()}${log.severity.slice(1)}` : ''}
                          {log.pain_level != null ? ` · Pain ${log.pain_level}/10` : ''}
                          {symptoms.length > 0 ? ` · ${symptoms.join(', ')}` : ''}
                        </div>
                      )}
                      {log.note && <div className={styles.historyNote}>{log.note}</div>}
                    </div>
                    <span className={`${styles.reasonBadge} ${styles[`reason_${log.reason}`]}`}>{REASON_LABELS[log.reason]}</span>
                    <button className={styles.historyRemoveBtn} onClick={() => removeDoseLog(log.id)} aria-label="Remove this log">✕</button>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BLEEDS TAB ── */}
        {tab === 'bleeds' && (
          <div>
            <div className={styles.tabHeader}>
              <h2 className={styles.tabTitle}>Bleeds</h2>
              <button className={styles.btnGhost} onClick={() => setBleedReportOpen(true)}>+ Log a bleed</button>
            </div>
            {bleedEvents.length === 0 ? (
              <div className={styles.empty}>
                <p>No bleeds reported yet.</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {bleedEvents.map(bleed => {
                  const treated = doseLogs.some(l => l.bleed_event_id === bleed.id)
                  const meta = SEVERITY_META[bleed.severity] || SEVERITY_META.mild
                  const symptoms = symptomList(bleed)
                  return (
                    <div key={bleed.id} className={styles.historyRow} style={{ borderLeft: `${meta.border} rgba(${meta.color},1)` }}>
                      <div className={styles.historyDate}>
                        {new Date(bleed.occurred_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                        <br/>
                        {new Date(bleed.occurred_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </div>
                      <div className={styles.historyMain}>
                        <div className={styles.historyMed}>
                          {bleed.location || 'Bleed'}{bleed.side && bleed.side !== 'N/A' ? ` (${bleed.side})` : ''}
                          {bleed.pain_level != null ? ` · Pain ${bleed.pain_level}/10` : ''}
                        </div>
                        {symptoms.length > 0 && <div className={styles.historyNote}>{symptoms.join(', ')}</div>}
                        {bleed.note && <div className={styles.historyNote}>{bleed.note}</div>}
                        <div className={styles.historyNote} style={{ color: treated ? '#22c55e' : 'var(--dimmer)' }}>
                          {treated ? 'Treated' : 'Not yet treated'}
                        </div>
                      </div>
                      <span className={styles.reasonBadge} style={{ color: `rgba(${meta.color},1)`, borderColor: `rgba(${meta.color},0.4)` }}>{meta.label}</span>
                      {!treated && (
                        <button
                          className={styles.btnGhost}
                          onClick={() => setLogModal({
                            linkedBleedEventId: bleed.id,
                            linkedBleedSummary: `${bleed.location || 'Bleed'} — ${new Date(bleed.occurred_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
                          })}
                        >
                          Log dose
                        </button>
                      )}
                      <button className={styles.historyRemoveBtn} onClick={() => removeBleedEvent(bleed.id)} aria-label="Remove this bleed report">✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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

      {/* Log Dose Modal */}
      {logModal && (
        <LogDoseModal
          med={logModal.med}
          myMeds={myMeds}
          doseLogs={doseLogs}
          defaultReason={logModal.defaultReason || 'prophylaxis'}
          linkedBleedEventId={logModal.linkedBleedEventId || null}
          linkedBleedSummary={logModal.linkedBleedSummary || ''}
          onConfirm={confirmLog}
          onClose={() => setLogModal(null)}
        />
      )}

      {/* Bleed Report Modal */}
      {bleedReportOpen && (
        <BleedReportModal
          onConfirm={confirmBleedReport}
          onClose={() => setBleedReportOpen(false)}
        />
      )}

      {/* Bleed Followup Prompt */}
      {followupBleed && (
        <BleedFollowupPrompt
          bleedEvent={followupBleed}
          doseLogs={doseLogs}
          onLinkExisting={handleLinkExisting}
          onLogNewDose={handleLogNewDoseForBleed}
          onSkip={() => setFollowupBleed(null)}
          onClose={() => setFollowupBleed(null)}
        />
      )}
    </div>
  )
}
