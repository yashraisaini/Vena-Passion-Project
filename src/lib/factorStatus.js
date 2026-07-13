import { getFactorStatus } from '../data/medications'

// Estimates a medication's current factor-level status for one patient.
// `doseLogsForPatient` must already be scoped to a single patient — this
// function does not filter by user, only by medication id.
export function computeMedStatus(med, doseLogsForPatient, today = new Date()) {
  const day = new Date(today); day.setHours(0, 0, 0, 0)
  const interval = med.customInterval || Math.round((med.intervalHrs || 72) / 24)

  const lastLog = doseLogsForPatient.find(l => l.med_id === med.id)
  let daysSinceLast = null
  if (lastLog) {
    const takenDay = new Date(lastLog.taken_at); takenDay.setHours(0, 0, 0, 0)
    daysSinceLast = Math.max(0, Math.floor((day - takenDay) / 86400000))
  } else if (med.startDate) {
    const startDay = new Date(med.startDate); startDay.setHours(0, 0, 0, 0)
    const diff = Math.max(0, Math.floor((day - startDay) / 86400000))
    daysSinceLast = diff % interval
  }

  return daysSinceLast != null ? getFactorStatus(med, daysSinceLast) : null
}
