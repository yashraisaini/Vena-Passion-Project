import { useEffect, useRef, useState } from 'react'
import { buildPkTimeline, buildExpectedTimeline } from '../lib/pkTimeline'
import { getExpectedDoseTimesInRange } from '../lib/schedule'
import { REASON_LABELS } from '../lib/reasons'
import { symptomList } from '../lib/bleeds'
import styles from './PkTimelineChart.module.css'

const W = 620, H = 230
const PAD_LEFT = 44, PAD_RIGHT = 16, PAD_TOP = 14, PAD_BOTTOM = 40
const innerW = W - PAD_LEFT - PAD_RIGHT
const innerH = H - PAD_TOP - PAD_BOTTOM

const Y_TICKS = [0, 5, 25, 50, 75, 100]
const AXIS = 'rgba(36,20,18,0.55)'
const GRID = 'rgba(36,20,18,0.09)'
const INK  = 'rgba(36,20,18,0.65)'
const MERGE_WINDOW_MS = 60 * 60000 // dose + bleed within an hour show as one combined highlight
const WINDOW_MS = 7 * 86400000     // weekly view
const FUTURE_BIAS_MS = 3 * 86400000 // default view: 4 days back, 3 days ahead of now
const CLOSE_DELAY_MS = 150

const POPUP_W = 148, POPUP_H = 96

function fmtDate(d) {
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDT(d) {
  return `${fmtDate(d)}, ${fmtTime(d)}`
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

const WHEEL_THRESHOLD = 450  // higher = less sensitive; ~1 mouse-wheel notch is ~100-120
const WHEEL_MIN_GAP_MS = 350

export default function PkTimelineChart({ med, doses, bleedEvents, allDoses = [] }) {
  const [hovered, setHovered] = useState(null)
  const [offsetDays, setOffsetDays] = useState(0)
  const [searchDate, setSearchDate] = useState('')
  const closeTimer = useRef(null)
  const svgRef = useRef(null)
  const wheelAccum = useRef(0)
  const lastShiftAt = useRef(0)

  function shiftWindow(days) {
    setHovered(null)
    setOffsetDays(o => o + days)
  }

  // Real scroll support: wheel over the chart pans it. Needs a native
  // (non-passive) listener so preventDefault actually stops the page from
  // also scrolling -- React's onWheel is passive by default. Deltas are
  // accumulated and throttled so a light trackpad flick (many tiny events)
  // doesn't fling the view across many days at once.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      wheelAccum.current += e.deltaY
      const now = Date.now()
      if (Math.abs(wheelAccum.current) >= WHEEL_THRESHOLD && now - lastShiftAt.current >= WHEEL_MIN_GAP_MS) {
        shiftWindow(wheelAccum.current > 0 ? 1 : -1)
        wheelAccum.current = 0
        lastShiftAt.current = now
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function openHover(payload) {
    clearTimeout(closeTimer.current)
    setHovered(payload)
  }
  function scheduleClose() {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHovered(null), CLOSE_DELAY_MS)
  }
  function cancelClose() {
    clearTimeout(closeTimer.current)
  }

  const timeline = buildPkTimeline(med, doses, bleedEvents)

  if (!timeline) {
    return (
      <div className={styles.wrap}>
        <div className={styles.heading}>{med.name}</div>
        <p className={styles.empty}>
          {doses.length === 0
            ? 'Chart will appear after the first logged dose for this medication.'
            : 'No pharmacokinetic profile available for this medication.'}
        </p>
      </div>
    )
  }

  const { segments: fullSegments, doseMarkers: fullDoseMarkers, bleedMarkers: fullBleedMarkers, nextExpected } = timeline

  const now = Date.now()
  const windowEnd = now + FUTURE_BIAS_MS + offsetDays * 86400000
  const windowStart = windowEnd - WINDOW_MS

  function jumpToDate(dateStr) {
    if (!dateStr) return
    const [y, m, d] = dateStr.split('-').map(Number)
    const target = new Date(y, m - 1, d).getTime()
    setHovered(null)
    setOffsetDays(Math.round((target + WINDOW_MS / 2 - now - FUTURE_BIAS_MS) / 86400000))
  }

  // Bounded total range the scrollbar thumb represents: from just before the
  // earliest known dose/bleed/start date, out to a fixed 90 days ahead.
  const earliestKnown = Math.min(
    now,
    ...fullDoseMarkers.map(d => d.t.getTime()),
    ...fullBleedMarkers.map(b => b.t.getTime()),
    med.startDate ? new Date(med.startDate).getTime() : now,
  )
  const totalStart = earliestKnown - 3 * 86400000
  const totalEnd = now + 90 * 86400000
  const totalSpan = Math.max(totalEnd - totalStart, WINDOW_MS)

  function onScrollbarDrag(clientX, trackRect) {
    const pct = Math.min(Math.max((clientX - trackRect.left) / trackRect.width, 0), 1)
    const newWindowStart = totalStart + pct * totalSpan
    setHovered(null)
    setOffsetDays(Math.round((newWindowStart + WINDOW_MS - now - FUTURE_BIAS_MS) / 86400000))
  }

  const x = t => PAD_LEFT + ((t - windowStart) / WINDOW_MS) * innerW
  const y = pct => PAD_TOP + (1 - Math.min(Math.max(pct, 0), 100) / 100) * innerH

  // Clip segments to the visible week -- decay math already accounts for the
  // real dose time, this just trims which part of it we draw.
  const segments = fullSegments
    .map(seg => ({ ...seg, points: seg.points.filter(p => p.t.getTime() >= windowStart && p.t.getTime() <= windowEnd) }))
    .filter(seg => seg.points.length >= 2)
  const doseMarkers = fullDoseMarkers.filter(d => d.t.getTime() >= windowStart && d.t.getTime() <= windowEnd)
  const bleedMarkers = fullBleedMarkers.filter(b => b.t.getTime() >= windowStart && b.t.getTime() <= windowEnd)

  // Curve for "if every dose were taken exactly on schedule" -- fetch one
  // extra interval before the window so the line has continuity entering it.
  const scheduleLookback = (med.customInterval || Math.round((med.intervalHrs || 72) / 24)) * 86400000
  const expectedTimesRaw = getExpectedDoseTimesInRange(med, windowStart - scheduleLookback, windowEnd)
  const expectedTimeline = buildExpectedTimeline(med, expectedTimesRaw, new Date(windowEnd))
  const expectedSegments = (expectedTimeline?.segments || [])
    .map(seg => ({ ...seg, points: seg.points.filter(p => p.t.getTime() >= windowStart && p.t.getTime() <= windowEnd) }))
    .filter(seg => seg.points.length >= 2)

  const X_TICK_COUNT = 7
  const xTicks = Array.from({ length: X_TICK_COUNT }, (_, i) => windowStart + (WINDOW_MS * i) / (X_TICK_COUNT - 1))
  const showNowLine = now > windowStart && now < windowEnd

  // Merge a dose and bleed within an hour of each other into one combined event.
  const usedDose = new Set()
  const events = []
  bleedMarkers.forEach(b => {
    let matchIdx = -1
    doseMarkers.forEach((d, i) => {
      if (usedDose.has(i)) return
      if (Math.abs(d.t.getTime() - b.t.getTime()) <= MERGE_WINDOW_MS) matchIdx = i
    })
    if (matchIdx !== -1) {
      usedDose.add(matchIdx)
      events.push({ kind: 'combined', t: b.t, pct: b.pct, bleed: b, dose: doseMarkers[matchIdx] })
    } else {
      events.push({ kind: 'bleed', t: b.t, pct: b.pct, bleed: b })
    }
  })
  doseMarkers.forEach((d, i) => {
    if (!usedDose.has(i)) events.push({ kind: 'dose', t: d.t, pct: d.pct, dose: d })
  })

  function treatedByText(bleedId) {
    const linked = allDoses.filter(l => l.bleed_event_id === bleedId)
    if (linked.length === 0) return 'Not yet treated'
    return truncate(linked.map(l => `${l.med_name} @ ${fmtTime(new Date(l.taken_at))}`).join('; '), 34)
  }

  function popupContent(ev) {
    if (ev.kind === 'dose') {
      const d = ev.dose
      return (
        <>
          <div className={styles.popTitle}>{truncate(d.dose.med_name, 20)}</div>
          <div className={styles.popLine}>{fmtDT(d.t)}</div>
          <div className={styles.popLine}>~{d.pct}% · {REASON_LABELS[d.dose.reason] || d.dose.reason}</div>
        </>
      )
    }
    const b = ev.bleed
    return (
      <>
        <div className={styles.popTitle}>{ev.kind === 'combined' ? 'Bleed + dose' : 'Bleed'}</div>
        <div className={styles.popLine}>{fmtDT(b.t)}</div>
        <div className={styles.popLine}>
          {truncate(b.bleed.location || '—', 12)} · {b.bleed.severity || '—'} · Pain {b.bleed.pain_level ?? '—'}/10
        </div>
        <div className={styles.popLine}>~{b.peakPct}%→{b.pct}% ({b.hoursSinceLastDose.toFixed(1)}h since dose)</div>
        <div className={styles.popLine}>
          {ev.kind === 'combined'
            ? `Treated: ${truncate(ev.dose.dose.med_name, 18)}`
            : truncate(treatedByText(b.bleed.id), 30)}
        </div>
      </>
    )
  }

  const hasVisibleData = segments.length > 0 || events.length > 0

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        {med.name}
        {nextExpected && <span className={styles.nextDose}>Next dose ~{fmtDate(nextExpected)} {fmtTime(nextExpected)}</span>}
      </div>
      <div className={styles.navRow}>
        <button className={styles.navBtn} onClick={() => shiftWindow(-7)}>‹ Earlier</button>
        <span className={styles.navRange}>{fmtDate(new Date(windowStart))} – {fmtDate(new Date(windowEnd))}</span>
        {offsetDays !== 0 && <button className={styles.navBtn} onClick={() => { setHovered(null); setOffsetDays(0) }}>Today</button>}
        <button className={styles.navBtn} onClick={() => shiftWindow(7)}>Later ›</button>
        <input
          type="date" className={styles.dateSearch} value={searchDate}
          onChange={e => setSearchDate(e.target.value)}
        />
        <button className={styles.navBtn} onClick={() => jumpToDate(searchDate)}>Go to date</button>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={styles.svg} style={{ overflow: 'visible' }}>
        {/* y gridlines + ticks */}
        {Y_TICKS.map(pct => (
          <g key={pct}>
            <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y(pct)} y2={y(pct)} stroke={GRID} strokeWidth="1" />
            <text x={PAD_LEFT - 7} y={y(pct) + 3} textAnchor="end" fontFamily="Space Mono" fontSize="8" fill={INK}>{pct}%</text>
          </g>
        ))}

        {/* x gridlines + ticks */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke={GRID} strokeWidth="1" />
            <text x={x(t)} y={H - PAD_BOTTOM + 13} textAnchor="middle" fontFamily="Space Mono" fontSize="7.5" fill={INK}>{fmtDate(new Date(t))}</text>
          </g>
        ))}

        {/* axis lines */}
        <line x1={PAD_LEFT} x2={PAD_LEFT} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke={AXIS} strokeWidth="1.2" />
        <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} stroke={AXIS} strokeWidth="1.2" />

        {showNowLine && (
          <line x1={x(now)} x2={x(now)} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="rgba(36,20,18,0.3)" strokeWidth="1" strokeDasharray="2 2" />
        )}

        {/* bleed/combined drop-lines */}
        {events.filter(e => e.kind !== 'dose').map((e, i) => (
          <line key={`dl${i}`} x1={x(e.t.getTime())} x2={x(e.t.getTime())} y1={y(e.pct)} y2={H - PAD_BOTTOM} stroke="rgba(153,27,27,0.35)" strokeWidth="1" strokeDasharray="2 2" />
        ))}

        {/* expected curve -- same shape as the actual line, if doses were taken exactly on schedule */}
        {expectedSegments.map((seg, i) => (
          <path
            key={`exp${i}`}
            d={`M${seg.points.map(p => `${x(p.t.getTime())},${y(p.pct)}`).join(' L')}`}
            fill="none" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="4 3" opacity="0.75"
          />
        ))}

        {/* curve: filled area for real segments, dashed line only for projected */}
        {segments.map((seg, i) => {
          const line = `M${seg.points.map(p => `${x(p.t.getTime())},${y(p.pct)}`).join(' L')}`
          if (seg.projected) {
            return <path key={i} d={line} fill="none" stroke="#9f1239" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="5 4" opacity="0.55" />
          }
          const firstX = x(seg.points[0].t.getTime()), lastX = x(seg.points[seg.points.length - 1].t.getTime())
          const area = `${line} L${lastX},${y(0)} L${firstX},${y(0)} Z`
          return (
            <g key={i}>
              <path d={area} fill="rgba(159,18,57,0.18)" stroke="none" />
              <path d={line} fill="none" stroke="#9f1239" strokeWidth="1.8" strokeLinecap="round" />
            </g>
          )
        })}

        {/* event markers */}
        {events.map((ev, i) => {
          const cx = x(ev.t.getTime()), cy = y(ev.pct)
          const isBleedish = ev.kind !== 'dose'
          return (
            <g
              key={i}
              onMouseEnter={() => openHover({ ev, cx, cy })}
              onMouseLeave={scheduleClose}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={cx} cy={cy} r="9" fill="transparent" />
              {isBleedish ? (
                <path transform={`translate(${cx},${cy})`} d="M0,-6 L5.5,5 L-5.5,5 Z" fill="#7f1d1d" stroke="#fff" strokeWidth="1" />
              ) : (
                <circle cx={cx} cy={cy} r="3" fill="#9f1239" />
              )}
              {ev.kind === 'combined' && (
                <circle cx={cx} cy={cy} r="9" fill="none" stroke="#7f1d1d" strokeWidth="1" opacity="0.5" />
              )}
            </g>
          )
        })}

        {!hasVisibleData && (
          <text x={W / 2} y={PAD_TOP + innerH / 2} textAnchor="middle" fontFamily="var(--fb)" fontSize="10" fill={INK}>
            No activity in the past week
          </text>
        )}

        {hovered && (() => {
          const flipX = hovered.cx > W / 2
          const flipY = hovered.cy > H / 2
          const px = Math.min(Math.max(flipX ? hovered.cx - POPUP_W - 8 : hovered.cx + 8, 0), W - POPUP_W)
          const py = Math.min(Math.max(flipY ? hovered.cy - POPUP_H - 8 : hovered.cy + 8, 0), H - POPUP_H)
          return (
            <foreignObject x={px} y={py} width={POPUP_W} height={POPUP_H}>
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                className={styles.popup}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                {popupContent(hovered.ev)}
              </div>
            </foreignObject>
          )
        })()}
      </svg>

      <div
        className={styles.scrollTrack}
        onMouseDown={e => {
          const trackRect = e.currentTarget.getBoundingClientRect()
          onScrollbarDrag(e.clientX, trackRect)
          function onMove(moveEvent) { onScrollbarDrag(moveEvent.clientX, trackRect) }
          function onUp() {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        }}
      >
        <div
          className={styles.scrollThumb}
          style={{
            left: `${((windowStart - totalStart) / totalSpan) * 100}%`,
            width: `${(WINDOW_MS / totalSpan) * 100}%`,
          }}
        />
      </div>

      <div className={styles.legend}>
        <span><b className={styles.dotDose} /> Dose taken</span>
        <span><b className={styles.dotBleed} /> Bleed reported</span>
        <span><b className={styles.dotExpected} /> Expected schedule</span>
        <span><b className={styles.dotProjected} /> Projected (not yet happened)</span>
      </div>
    </div>
  )
}
