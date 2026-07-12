// Days in a given month a medication is scheduled, based on its start date and interval.
export function getDoseDays(med, yr, mo) {
  if (!med.startDate) return []
  const f = med.frequency.toLowerCase()
  if (f.includes('one-time') || f.includes('single')) {
    const sd = new Date(med.startDate)
    return (sd.getFullYear() === yr && sd.getMonth() === mo) ? [sd.getDate()] : []
  }
  const interval = med.customInterval || Math.round((med.intervalHrs || 72) / 24)
  const days = [], mStart = new Date(yr, mo, 1), mEnd = new Date(yr, mo + 1, 0)
  let cur = new Date(new Date(med.startDate).setHours(0, 0, 0, 0))
  if (cur > mEnd) return []
  while (cur < mStart) cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + interval)
  while (cur <= mEnd) {
    if (cur >= mStart) days.push(cur.getDate())
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + interval)
  }
  return days
}

export function isDoseDueToday(med, today = new Date()) {
  return getDoseDays(med, today.getFullYear(), today.getMonth()).includes(today.getDate())
}

const pad = n => n < 10 ? `0${n}` : `${n}`

// Format/parse date-only values without going through UTC (new Date(dateString) and
// toISOString() both cross the UTC boundary, which can silently shift the calendar day).
export function toLocalISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}
