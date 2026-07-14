import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { medications } from '../data/medications'
import { hydrateMedRow } from '../lib/schedule'
import { computeMedStatus } from '../lib/factorStatus'
import { REASON_LABELS } from '../lib/reasons'
import { SEVERITY_META, symptomList } from '../lib/bleeds'
import PkTimelineChart from '../components/PkTimelineChart'
import * as db from '../lib/db'
import styles from './Provider.module.css'

function csvEscape(val) {
  const s = String(val ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const SUB_TABS = [['history', 'History'], ['bleeds', 'Bleeds'], ['pk', 'PK Charts']]

export default function Provider() {
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading]     = useState(true)
  const [patients, setPatients]   = useState([]) // [{ profile, meds, logs, bleeds }]
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [subTabs, setSubTabs] = useState({}) // { [patientId]: 'history'|'bleeds'|'pk' }
  const [confirmId, setConfirmId]   = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [reminderSent, setReminderSent] = useState({}) // { [patientId]: true }
  const [highlightKey, setHighlightKey] = useState(null) // 'bleed-<id>' | 'dose-<id>', from a clicked notification
  const writeTimers = useRef({})
  const rowRefs = useRef({})

  useEffect(() => { load() }, [])

  // Deep-link from NotificationBell: expand the named patient's card, switch
  // to whichever sub-tab has the event, and highlight/scroll to that exact
  // row -- state.nonce forces this to re-run even for a repeat click.
  useEffect(() => {
    const st = location.state
    if (!st?.nonce || patients.length === 0) return
    const patient = patients.find(p => p.profile.id === st.focusPatientId)
    if (!patient) return
    setExpandedIds(prev => new Set(prev).add(st.focusPatientId))
    if (st.focusBleedId) {
      setSubTabs(prev => ({ ...prev, [st.focusPatientId]: 'bleeds' }))
      setHighlightKey(`bleed-${st.focusBleedId}`)
    } else if (st.focusDoseId) {
      setSubTabs(prev => ({ ...prev, [st.focusPatientId]: 'history' }))
      setHighlightKey(`dose-${st.focusDoseId}`)
    }
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.nonce, patients])

  useEffect(() => {
    if (!highlightKey) return
    rowRefs.current[highlightKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightKey(null), 2500)
    return () => clearTimeout(t)
  }, [highlightKey])

  function load() {
    setLoading(true)
    return Promise.all([
      db.listAllPatientProfiles(),
      db.listAllMedicationsForProviders(),
      db.listAllDoseLogsForProviders(),
      db.listAllBleedEventsForProviders(),
    ]).then(([profiles, allMeds, allLogs, allBleeds]) => {
      const grouped = profiles
        .filter(p => p.role === 'patient')
        .map(p => ({
          profile: p,
          meds: allMeds.filter(m => m.user_id === p.id).map(row => hydrateMedRow(row, medications)).filter(Boolean),
          logs: allLogs.filter(l => l.user_id === p.id),
          bleeds: allBleeds.filter(b => b.user_id === p.id),
        }))
        .sort((a, b) => (a.profile.last_name || '').localeCompare(b.profile.last_name || ''))
      setPatients(grouped)
    }).finally(() => setLoading(false))
  }

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleArchive(profile, archived) {
    setConfirmId(null)
    try {
      await db.setPatientArchived(profile.id, archived)
      setPatients(prev => prev.map(p => p.profile.id === profile.id ? { ...p, profile: { ...p.profile, archived } } : p))
    } catch {
      // no-op — the card just won't move; user can retry
    }
  }

  function updateStockField(patientId, medId, field, value) {
    const num = value === '' ? null : Math.max(0, Number(value))
    setPatients(prev => prev.map(p => {
      if (p.profile.id !== patientId) return p
      const meds = p.meds.map(m => m.id === medId ? { ...m, [field]: num } : m)
      const updated = meds.find(m => m.id === medId)
      if (updated) {
        const timerKey = `${patientId}:${medId}`
        clearTimeout(writeTimers.current[timerKey])
        writeTimers.current[timerKey] = setTimeout(() => {
          db.updateMedicationStock(patientId, medId, {
            unit_size: updated.unitSize,
            stock_count: updated.stockCount,
          }).catch(() => {})
        }, 600)
      }
      return { ...p, meds }
    }))
  }

  async function handleSendReminder(profile) {
    try {
      await db.sendReminder(profile.id, `Reminder from your care team: don't forget to take your medication.`)
      setReminderSent(prev => ({ ...prev, [profile.id]: true }))
      setTimeout(() => setReminderSent(prev => ({ ...prev, [profile.id]: false })), 2500)
    } catch {
      // no-op — button label just won't confirm; provider can retry
    }
  }

  function exportCSV() {
    const rows = [['Patient Name','Patient ID','Medication','Date','Time','Dosage','Reason','Products Used','Note','Legacy Bleed Location','Legacy Bleed Side','Legacy Severity','Legacy Pain Level']]
    patients.forEach(({ profile, logs }) => {
      const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      logs.forEach(log => {
        const d = new Date(log.taken_at)
        rows.push([
          name, profile.patient_id, log.med_name,
          d.toLocaleDateString('en-CA'), d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          log.dosage || '', REASON_LABELS[log.reason] || log.reason,
          log.products_used ?? '', log.note || '',
          log.bleed_location || '', log.bleed_side || '', log.severity || '', log.pain_level ?? '',
        ])
      })
    })
    const bleedRows = [[''],['Patient Name','Patient ID','Date','Time','Location','Side','Severity','Pain Level','Symptoms','Treated','Note']]
    patients.forEach(({ profile, bleeds, logs }) => {
      const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      bleeds.forEach(b => {
        const d = new Date(b.occurred_at)
        const treated = logs.some(l => l.bleed_event_id === b.id)
        bleedRows.push([
          name, profile.patient_id,
          d.toLocaleDateString('en-CA'), d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          b.location || '', b.side || '', b.severity || '', b.pain_level ?? '', symptomList(b).join(', '),
          treated ? 'Yes' : 'No', b.note || '',
        ])
      })
    })
    const csv = [...rows, ...bleedRows].map(r => r.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'vena-patient-data.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const visible = patients.filter(p => showArchived ? p.profile.archived : !p.profile.archived)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.brand}>VENA — Provider View</div>
          <h1 className={styles.title}>Patients</h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnGhost} onClick={() => setShowArchived(s => !s)}>
            {showArchived ? 'Show active patients' : 'Show archived'}
          </button>
          <button className={styles.btnPrimary} onClick={exportCSV} disabled={!patients.length}>Export to CSV</button>
          <button className={styles.btnGhost} onClick={signOut}>Sign out</button>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Loading patients…</p>
      ) : visible.length === 0 ? (
        <p className={styles.empty}>{showArchived ? 'No archived patients.' : 'No patients yet.'}</p>
      ) : (
        <div className={styles.grid}>
          {visible.map(({ profile, meds, logs, bleeds }) => {
            const isOpen = expandedIds.has(profile.id)
            const isConfirming = confirmId === profile.id
            const activeSubTab = subTabs[profile.id] || 'history'
            const lastLog = logs[0]
            return (
              <div key={profile.id} className={styles.card} style={isOpen ? { gridColumn: '1 / -1' } : undefined}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.patientName}>{profile.first_name} {profile.last_name}</div>
                    <div className={styles.patientIdCell}>ID {profile.patient_id}</div>
                  </div>
                  {!isConfirming && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {!showArchived && (
                        <button
                          className={styles.reminderBtn}
                          onClick={() => handleSendReminder(profile)}
                          disabled={!!reminderSent[profile.id]}
                        >
                          {reminderSent[profile.id] ? 'Sent ✓' : 'Send reminder'}
                        </button>
                      )}
                      <button
                        className={styles.removeBtn}
                        onClick={() => setConfirmId(profile.id)}
                        aria-label={showArchived ? 'Restore patient' : 'Remove patient from list'}
                      >
                        {showArchived ? '↩' : '✕'}
                      </button>
                    </div>
                  )}
                </div>

                {isConfirming && (
                  <div className={styles.confirmBar}>
                    <p>
                      {showArchived
                        ? `Restore ${profile.first_name} to your active patient list?`
                        : `Remove ${profile.first_name} from your patient list? Their account and full medical history stay completely untouched — this only hides them from your view, and you can restore them anytime from "Show archived."`}
                    </p>
                    <div className={styles.confirmActions}>
                      <button className={styles.btnPrimary} onClick={() => handleArchive(profile, !showArchived)}>
                        {showArchived ? 'Restore' : 'Remove'}
                      </button>
                      <button className={styles.btnGhost} onClick={() => setConfirmId(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {meds.length === 0 ? (
                  <p className={styles.emptySmall}>No medications on file.</p>
                ) : (
                  <div className={styles.medList}>
                    {meds.map(med => {
                      const status = computeMedStatus(med, logs)
                      return (
                        <div key={med.id} className={styles.medRow}>
                          <div className={styles.medRowTop}>
                            <span className={styles.medName}>{med.name}</span>
                            {status && <span className={styles.medPct} style={{ color: status.color }}>{status.label}</span>}
                          </div>
                          {status && (
                            <div className={styles.chartTrack}>
                              <div className={styles.chartFill} style={{ width: `${Math.min(status.pct, 100)}%`, background: status.color }} />
                            </div>
                          )}
                          <div className={styles.stockRow}>
                            <div className={styles.stockField}>
                              <label>Units/product</label>
                              <input
                                type="number" min="0" placeholder="e.g. 1000"
                                value={med.unitSize ?? ''}
                                onChange={e => updateStockField(profile.id, med.id, 'unitSize', e.target.value)}
                              />
                            </div>
                            <div className={styles.stockField}>
                              <label>Products in stock</label>
                              <input
                                type="number" min="0" placeholder="Not tracked"
                                value={med.stockCount ?? ''}
                                onChange={e => updateStockField(profile.id, med.id, 'stockCount', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className={styles.lastDose}>
                  <span className={styles.lastDoseLabel}>Last dose</span>
                  {lastLog ? (
                    <span>
                      {new Date(lastLog.taken_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} — {lastLog.med_name}
                      {lastLog.dosage ? ` (${lastLog.dosage})` : ''} · {REASON_LABELS[lastLog.reason] || lastLog.reason}
                    </span>
                  ) : (
                    <span className={styles.emptySmall}>No doses logged</span>
                  )}
                </div>

                <button className={styles.showMoreBtn} onClick={() => toggleExpand(profile.id)}>
                  {isOpen ? 'Collapse' : 'Expand'}
                </button>

                {isOpen && (
                  <div className={styles.expanded}>
                    <div className={styles.subTabs}>
                      {SUB_TABS.map(([key, label]) => (
                        <button
                          key={key}
                          className={`${styles.subTab} ${activeSubTab === key ? styles.subTabActive : ''}`}
                          onClick={() => setSubTabs(prev => ({ ...prev, [profile.id]: key }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {activeSubTab === 'history' && (
                      logs.length === 0 ? <p className={styles.emptySmall}>No doses logged.</p> : (
                        <div className={styles.logList}>
                          {logs.map(log => {
                            // Legacy rows logged before bleed reporting moved to its own
                            // table (see 008_bleed_events.sql) still carry bleed detail
                            // directly on dose_logs -- keep showing it for those old rows.
                            const legacySymptoms = symptomList(log)
                            const rowKey = `dose-${log.id}`
                            return (
                            <div
                              key={log.id}
                              ref={el => { rowRefs.current[rowKey] = el }}
                              className={`${styles.logRow} ${highlightKey === rowKey ? styles.rowHighlight : ''}`}
                            >
                              <span className={styles.logDate}>
                                {new Date(log.taken_at).toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' })}{' '}
                                {new Date(log.taken_at).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}
                              </span>
                              <span className={styles.logMed}>
                                {log.med_name}{log.dosage ? ` — ${log.dosage}` : ''}
                                {log.bleed_location ? ` (${log.bleed_location}${log.bleed_side && log.bleed_side !== 'N/A' ? `, ${log.bleed_side}` : ''})` : ''}
                                {log.severity ? ` · ${log.severity[0].toUpperCase()}${log.severity.slice(1)}` : ''}
                                {log.pain_level != null ? ` · Pain ${log.pain_level}/10` : ''}
                                {legacySymptoms.length > 0 ? ` · ${legacySymptoms.join(', ')}` : ''}
                                {log.note ? ` — ${log.note}` : ''}
                              </span>
                              <span className={styles.logReason}>{REASON_LABELS[log.reason] || log.reason}</span>
                            </div>
                            )
                          })}
                        </div>
                      )
                    )}

                    {activeSubTab === 'bleeds' && (
                      bleeds.length === 0 ? <p className={styles.emptySmall}>No bleeds reported.</p> : (
                        <div className={styles.logList}>
                          {bleeds.map(b => {
                            const meta = SEVERITY_META[b.severity] || SEVERITY_META.mild
                            const treated = logs.some(l => l.bleed_event_id === b.id)
                            const symptoms = symptomList(b)
                            const rowKey = `bleed-${b.id}`
                            return (
                              <div
                                key={b.id}
                                ref={el => { rowRefs.current[rowKey] = el }}
                                className={`${styles.logRow} ${highlightKey === rowKey ? styles.rowHighlight : ''}`}
                                style={{ borderLeft: `${meta.border} rgba(${meta.color},1)`, paddingLeft: '0.6rem' }}
                              >
                                <span className={styles.logDate}>
                                  {new Date(b.occurred_at).toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' })}{' '}
                                  {new Date(b.occurred_at).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}
                                </span>
                                <span className={styles.logMed}>
                                  {b.location || 'Bleed'}{b.side && b.side !== 'N/A' ? ` (${b.side})` : ''}
                                  {b.pain_level != null ? ` · Pain ${b.pain_level}/10` : ''}
                                  {symptoms.length > 0 ? ` · ${symptoms.join(', ')}` : ''}
                                  {b.note ? ` — ${b.note}` : ''}
                                  {' · '}<span style={{ color: treated ? '#22c55e' : 'var(--dimmer)' }}>{treated ? 'Treated' : 'Untreated'}</span>
                                </span>
                                <span className={styles.logReason} style={{ color: `rgba(${meta.color},1)` }}>{meta.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}

                    {activeSubTab === 'pk' && (
                      meds.length === 0 ? <p className={styles.emptySmall}>No medications on file.</p> : (
                        <div>
                          {meds.map(med => (
                            <PkTimelineChart
                              key={med.id}
                              med={med}
                              doses={logs.filter(l => l.med_id === med.id)}
                              bleedEvents={bleeds}
                              allDoses={logs}
                            />
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
