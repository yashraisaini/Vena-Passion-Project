import { useEffect, useState } from 'react'
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
  const [loading, setLoading]     = useState(true)
  const [patients, setPatients]   = useState([]) // [{ profile, meds, logs, bleeds }]
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [subTabs, setSubTabs] = useState({}) // { [patientId]: 'history'|'bleeds'|'pk' }
  const [confirmId, setConfirmId]   = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => { load() }, [])

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
                    <button
                      className={styles.removeBtn}
                      onClick={() => setConfirmId(profile.id)}
                      aria-label={showArchived ? 'Restore patient' : 'Remove patient from list'}
                    >
                      {showArchived ? '↩' : '✕'}
                    </button>
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
                            return (
                            <div key={log.id} className={styles.logRow}>
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
                            return (
                              <div key={b.id} className={styles.logRow} style={{ borderLeft: `${meta.border} rgba(${meta.color},1)`, paddingLeft: '0.6rem' }}>
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
