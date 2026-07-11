import { useState } from 'react'
import { getFactorStatus } from '../data/medications'
import styles from './Calendar.module.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const EV_COLORS = ['125,211,252','201,169,110','167,139,250','74,222,128','244,63,94','251,146,60']
const pad = n => n < 10 ? `0${n}` : `${n}`

function getMedColor(myMeds, name) {
  const i = myMeds.findIndex(m => m.name === name)
  return EV_COLORS[i % EV_COLORS.length]
}

function getDoseDays(med, yr, mo) {
  if (!med.startDate) return []
  const f = med.frequency.toLowerCase()
  const dim = new Date(yr, mo + 1, 0).getDate()
  if (f.includes('one-time') || f.includes('single')) {
    const sd = new Date(med.startDate)
    return (sd.getFullYear() === yr && sd.getMonth() === mo) ? [sd.getDate()] : []
  }
  const interval = med.customInterval || Math.round((med.intervalHrs || 72) / 24)
  const days = [], mStart = new Date(yr, mo, 1), mEnd = new Date(yr, mo + 1, 0)
  let cur = new Date(new Date(med.startDate).setHours(0,0,0,0))
  if (cur > mEnd) return []
  while (cur < mStart) cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + interval)
  while (cur <= mEnd) {
    if (cur >= mStart) days.push(cur.getDate())
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + interval)
  }
  return days
}

function nowICS() {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export default function Calendar({ myMeds, showToast }) {
  const now = new Date()
  const [yr,  setYr]  = useState(now.getFullYear())
  const [mo,  setMo]  = useState(now.getMonth())
  const [overrides, setOverrides] = useState({})
  const [icsTooltip, setIcsTooltip] = useState(false)

  const oKey = (n, y, m, d) => `${n}|${y}|${m}|${d}`

  function prevMonth() { if (mo === 0) { setMo(11); setYr(y => y-1) } else setMo(m => m-1) }
  function nextMonth() { if (mo === 11) { setMo(0); setYr(y => y+1) } else setMo(m => m+1) }

  const firstDay   = new Date(yr, mo, 1).getDay()
  const dim        = new Date(yr, mo + 1, 0).getDate()
  const prevDays   = new Date(yr, mo, 0).getDate()
  const today      = new Date(); today.setHours(0,0,0,0)

  // Build schedule
  const sched = {}
  myMeds.forEach(med => {
    getDoseDays(med, yr, mo).forEach(d => {
      const key = oKey(med.name, yr, mo, d)
      const fd  = overrides[key] !== undefined ? overrides[key] : d
      if (fd < 1 || fd > dim) return
      sched[fd] = sched[fd] || []
      sched[fd].push({ name: med.name, origDay: d, col: getMedColor(myMeds, med.name), med })
    })
  })

  function handleDrop(e, day) {
    e.preventDefault()
    const data = JSON.parse(e.dataTransfer.getData('text/plain'))
    setOverrides(prev => ({ ...prev, [oKey(data.name, yr, mo, data.origDay)]: day }))
    showToast(`${data.name} moved to ${MONTHS[mo]} ${day}`)
  }

  function exportICS() {
    if (!myMeds.length) { showToast('Add medications first'); return }
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VENA//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:VENA Medication Schedule']
    for (let m = 0; m < 3; m++) {
      const curYr = mo + m > 11 ? yr + 1 : yr
      const curMo = (mo + m) % 12
      myMeds.forEach(med => {
        getDoseDays(med, curYr, curMo).forEach(d => {
          const key = oKey(med.name, curYr, curMo, d)
          const fd  = overrides[key] !== undefined ? overrides[key] : d
          const ds  = `${curYr}${pad(curMo+1)}${pad(fd)}`
          lines.push(
            'BEGIN:VEVENT',
            `UID:${med.name.replace(/\s/g,'')}-${ds}@vena`,
            `DTSTAMP:${nowICS()}`,
            `DTSTART:${ds}T090000`,
            `DTEND:${ds}T093000`,
            `SUMMARY:VENA — ${med.name} infusion`,
            `DESCRIPTION:${med.generic} | ${med.route} | Every ${med.customInterval || Math.round((med.intervalHrs||72)/24)} days`,
            'BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY',
            `DESCRIPTION:${med.name} infusion in 30 minutes`,
            'END:VALARM','END:VEVENT'
          )
        })
      })
    }
    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = 'vena-schedule.ics'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    showToast('Calendar exported!')
  }

  // Build cells
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ day: prevDays - i, other: true })
  for (let d = 1; d <= dim; d++)
    cells.push({ day: d, other: false })
  const tail = (7 - (firstDay + dim) % 7) % 7
  for (let i = 1; i <= tail; i++)
    cells.push({ day: i, other: true })

  return (
    <div>
      {/* Header */}
      <div className={styles.calHeader}>
        <div className={styles.calTitle}>Infusion Calendar</div>
        <div className={styles.calNav}>
          <button className={styles.navBtn} onClick={prevMonth}>&#8249;</button>
          <div className={styles.monthLbl}>{MONTHS[mo]} {yr}</div>
          <button className={styles.navBtn} onClick={nextMonth}>&#8250;</button>
        </div>
      </div>
      <p className={styles.calHint}>Drag any dose to reschedule it. Colour strip shows estimated factor protection.</p>

      <div className={styles.calWrap}>
        {/* Day labels */}
        <div className={styles.dayHdr}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className={styles.dayLbl}>{d}</div>
          ))}
        </div>
        {/* Grid */}
        <div className={styles.grid}>
          {cells.map((cell, i) => {
            if (cell.other) return (
              <div key={`o${i}`} className={`${styles.cell} ${styles.other}`}>
                <div className={styles.dateNum}>{cell.day}</div>
              </div>
            )
            const d    = cell.day
            const isT  = (d === today.getDate() && mo === today.getMonth() && yr === today.getFullYear())
            const evs  = sched[d] || []
            return (
              <div
                key={d}
                className={`${styles.cell} ${isT ? styles.today : ''}`}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add(styles.dropOver) }}
                onDragLeave={e => e.currentTarget.classList.remove(styles.dropOver)}
                onDrop={e => { e.currentTarget.classList.remove(styles.dropOver); handleDrop(e, d) }}
              >
                <div className={styles.dateNum}>{d}</div>
                {evs.map((ev, ei) => (
                  <div
                    key={ei}
                    className={styles.ev}
                    style={{ background:`rgba(${ev.col},0.12)`, color:`rgba(${ev.col},1)`, borderColor:`rgba(${ev.col},0.6)` }}
                    draggable
                    title="Drag to reschedule"
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', JSON.stringify({ name: ev.name, origDay: ev.origDay }))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    {ev.name}
                  </div>
                ))}
                {evs.length > 0 && (() => {
                  let minPct = 100
                  evs.forEach(ev => {
                    const st = getFactorStatus(ev.med, 0)
                    if (st) minPct = Math.min(minPct, st.pct)
                  })
                  const col = minPct >= 50 ? '#22c55e' : minPct >= 5 ? '#c9a96e' : '#ef4444'
                  return <div className={styles.strip} style={{ background: col, width:`${Math.min(minPct,100)}%` }}/>
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {/* Export bar */}
      <div className={styles.exportBar}>
        <div>
          <strong className={styles.exportTitle}>Export to Google Calendar</strong>
          <p className={styles.exportDesc}>Download an .ics file with all scheduled infusions and 30-min reminders.</p>
        </div>
        <div className={styles.exportRight}>
          <div className={styles.infoWrap}>
            <button className={styles.infoBtn} onClick={() => setIcsTooltip(t => !t)} aria-label="How to import">i</button>
            {icsTooltip && (
              <div className={styles.tooltip}>
                <strong>How to import:</strong>
                <ol>
                  <li>Click "Download .ics" below</li>
                  <li>Open the downloaded file</li>
                  <li>Google / Apple Calendar opens automatically</li>
                  <li>Click <strong>Import</strong> or <strong>Add</strong></li>
                  <li>All doses appear with 30-min reminders</li>
                </ol>
              </div>
            )}
          </div>
          <button className={styles.exportBtn} onClick={exportICS}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download .ics
          </button>
        </div>
      </div>
    </div>
  )
}
