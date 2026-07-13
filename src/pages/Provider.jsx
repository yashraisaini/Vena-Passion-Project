import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { medications } from '../data/medications'
import { hydrateMedRow } from '../lib/schedule'
import { computeMedStatus } from '../lib/factorStatus'
import { REASON_LABELS } from '../lib/reasons'
import * as db from '../lib/db'
import styles from './Provider.module.css'

function csvEscape(val) {
  const s = String(val ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function Provider() {
  const { signOut } = useAuth()
  const [loading, setLoading]     = useState(true)
  const [patients, setPatients]   = useState([]) // [{ profile, meds, logs }]
  const [expandedId, setExpandedId] = useState(null)
  const [confirmId, setConfirmId]   = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    return Promise.all([
      db.listAllPatientProfiles(),
      db.listAllMedicationsForProviders(),
      db.listAllDoseLogsForProviders(),
    ]).then(([profiles, allMeds, allLogs]) => {
      const grouped = profiles
        .filter(p => p.role === 'patient')
        .map(p => ({
          profile: p,
          meds: allMeds.filter(m => m.user_id === p.id).map(row => hydrateMedRow(row, medications)).filter(Boolean),
          logs: allLogs.filter(l => l.user_id === p.id),
        }))
        .sort((a, b) => (a.profile.last_name || '').localeCompare(b.profile.last_name || ''))
      setPatients(grouped)
    }).finally(() => setLoading(false))
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
    const rows = [['Patient Name','Patient ID','Medication','Date','Time','Dosage','Reason','Bleed Location','Bleed Side','Products Used','Note']]
    patients.forEach(({ profile, logs }) => {
      const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      logs.forEach(log => {
        const d = new Date(log.taken_at)
        rows.push([
          name, profile.patient_id, log.med_name,
          d.toLocaleDateString('en-CA'), d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          log.dosage || '', REASON_LABELS[log.reason] || log.reason,
          log.bleed_location || '', log.bleed_side || '', log.products_used ?? '', log.note || '',
        ])
      })
    })
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n')
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
          {visible.map(({ profile, meds, logs }) => {
            const isOpen = expandedId === profile.id
            const isConfirming = confirmId === profile.id
            const lastLog = logs[0]
            return (
              <div key={profile.id} className={styles.card}>
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

                {logs.length > 1 && (
                  <button className={styles.showMoreBtn} onClick={() => setExpandedId(isOpen ? null : profile.id)}>
                    {isOpen ? 'Hide history' : `Show all ${logs.length} doses`}
                  </button>
                )}

                {isOpen && (
                  <div className={styles.logList}>
                    {logs.map(log => (
                      <div key={log.id} className={styles.logRow}>
                        <span className={styles.logDate}>
                          {new Date(log.taken_at).toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' })}{' '}
                          {new Date(log.taken_at).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}
                        </span>
                        <span className={styles.logMed}>
                          {log.med_name}{log.dosage ? ` — ${log.dosage}` : ''}
                          {log.bleed_location ? ` (${log.bleed_location}${log.bleed_side && log.bleed_side !== 'N/A' ? `, ${log.bleed_side}` : ''})` : ''}
                          {log.note ? ` — ${log.note}` : ''}
                        </span>
                        <span className={styles.logReason}>{REASON_LABELS[log.reason] || log.reason}</span>
                      </div>
                    ))}
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
