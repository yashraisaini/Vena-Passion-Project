import { factorPctAt } from '../data/medications'
import { getProjectedNextDose } from './schedule'

// Builds a piecewise estimated-factor-level timeline for one medication from
// real dose history: one decay segment per dose (restarting near peak% at
// each dose -- correct behavior, not an artifact, even for closely-spaced
// doses), plus a dashed projected tail from the last dose to the next
// expected one. Bleed events are slotted onto whichever segment's time range
// contains them, reading that segment's estimated % at that moment.
//
// Returns null if this medication has no pharmacokinetic profile to plot
// (e.g. supportive meds with neither peakPct nor steadyState) or no doses
// have ever been logged -- callers should show an empty state, not a
// fabricated curve.
export function buildPkTimeline(med, dosesForMed, bleedEvents, { stepHours = 4 } = {}) {
  if (med.peakPct == null && med.steadyState == null) return null
  const doses = [...dosesForMed].sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at))
  if (doses.length === 0) return null

  const segments = []
  for (let i = 0; i < doses.length; i++) {
    const start = new Date(doses[i].taken_at)
    const end = doses[i + 1] ? new Date(doses[i + 1].taken_at) : new Date()
    const points = []
    for (let ms = start.getTime(); ms < end.getTime(); ms += stepHours * 3600000) {
      points.push({ t: new Date(ms), pct: factorPctAt(med, (ms - start.getTime()) / 86400000) })
    }
    points.push({ t: end, pct: factorPctAt(med, (end.getTime() - start.getTime()) / 86400000) })
    segments.push({ points, projected: false, doseTime: start })
  }

  const lastDoseTime = new Date(doses[doses.length - 1].taken_at)
  const nextExpected = getProjectedNextDose(med, lastDoseTime)
  if (nextExpected && nextExpected.getTime() > Date.now()) {
    const tailStart = Math.max(Date.now(), lastDoseTime.getTime())
    const points = []
    for (let ms = tailStart; ms < nextExpected.getTime(); ms += stepHours * 3600000) {
      points.push({ t: new Date(ms), pct: factorPctAt(med, (ms - lastDoseTime.getTime()) / 86400000) })
    }
    points.push({ t: nextExpected, pct: factorPctAt(med, (nextExpected.getTime() - lastDoseTime.getTime()) / 86400000) })
    if (points.length > 1) segments.push({ points, projected: true })
  }

  const doseMarkers = doses.map((d, i) => ({
    t: new Date(d.taken_at), pct: segments[i].points[0].pct, dose: d,
  }))

  const bleedMarkers = bleedEvents
    .map(b => {
      const occurredAt = new Date(b.occurred_at)
      const seg = segments.find(s => !s.projected && occurredAt >= s.points[0].t && occurredAt <= s.points[s.points.length - 1].t)
      if (!seg) return null
      const pct = factorPctAt(med, (occurredAt - seg.doseTime.getTime()) / 86400000)
      return { t: occurredAt, pct, bleed: b }
    })
    .filter(Boolean)

  return { segments, doseMarkers, bleedMarkers, nextExpected }
}
