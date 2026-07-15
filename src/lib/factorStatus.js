import { getFactorStatus } from '../data/medications'

// Estimates a medication's current factor-level status for one patient.
// `doseLogsForPatient` must already be scoped to a single patient — this
// function does not filter by user, only by medication id.
export function computeMedStatus(med, doseLogsForPatient, today = new Date()) {
  const day = new Date(today); day.setHours(0, 0, 0, 0)

  const lastLog = doseLogsForPatient.find(l => l.med_id === med.id)
  let daysSinceLast = null
  if (lastLog) {
    const takenDay = new Date(lastLog.taken_at); takenDay.setHours(0, 0, 0, 0)
    daysSinceLast = Math.max(0, Math.floor((day - takenDay) / 86400000))
  } else if (med.startDate) {
    // No real dose logged yet -- count continuously from the start date
    // rather than wrapping to "days into the current cycle." Wrapping
    // silently assumed perfect on-schedule adherence even when nothing has
    // actually been logged, so the level could never drop below whatever a
    // single interval's decay looked like, no matter how many days actually
    // passed without a real dose.
    const startDay = new Date(med.startDate); startDay.setHours(0, 0, 0, 0)
    daysSinceLast = Math.max(0, Math.floor((day - startDay) / 86400000))
  }

  return daysSinceLast != null ? getFactorStatus(med, daysSinceLast) : null
}
