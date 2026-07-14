import { buildPkTimeline } from '../lib/pkTimeline'
import styles from './PkTimelineChart.module.css'

const W = 620, H = 230
const PAD_LEFT = 44, PAD_RIGHT = 16, PAD_TOP = 14, PAD_BOTTOM = 40
const innerW = W - PAD_LEFT - PAD_RIGHT
const innerH = H - PAD_TOP - PAD_BOTTOM

const Y_TICKS = [0, 5, 25, 50, 75, 100]
const AXIS = 'rgba(36,20,18,0.55)'
const GRID = 'rgba(36,20,18,0.09)'
const INK  = 'rgba(36,20,18,0.65)'

function fmtDate(d) {
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function PkTimelineChart({ med, doses, bleedEvents }) {
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

  const { segments, doseMarkers, bleedMarkers, nextExpected } = timeline
  const allPoints = segments.flatMap(s => s.points)
  const tMin = allPoints[0].t.getTime()
  const tMax = allPoints[allPoints.length - 1].t.getTime()
  const span = Math.max(tMax - tMin, 1)

  const x = t => PAD_LEFT + ((t - tMin) / span) * innerW
  const y = pct => PAD_TOP + (1 - Math.min(Math.max(pct, 0), 100) / 100) * innerH

  const now = Date.now()
  const showNowLine = now > tMin && now < tMax

  const X_TICK_COUNT = 6
  const xTicks = Array.from({ length: X_TICK_COUNT }, (_, i) => tMin + (span * i) / (X_TICK_COUNT - 1))

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        {med.name}
        {nextExpected && <span className={styles.nextDose}>Next dose ~{fmtDate(nextExpected)} {fmtTime(nextExpected)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
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
            <text x={x(t)} y={H - PAD_BOTTOM + 23} textAnchor="middle" fontFamily="Space Mono" fontSize="7" fill="rgba(36,20,18,0.4)">{fmtTime(new Date(t))}</text>
          </g>
        ))}

        {/* axis lines */}
        <line x1={PAD_LEFT} x2={PAD_LEFT} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke={AXIS} strokeWidth="1.2" />
        <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} stroke={AXIS} strokeWidth="1.2" />

        {showNowLine && (
          <line x1={x(now)} x2={x(now)} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="rgba(36,20,18,0.3)" strokeWidth="1" strokeDasharray="2 2" />
        )}

        {/* bleed drop-lines (event-marker style, drawn under the curve) */}
        {bleedMarkers.map((b, i) => (
          <line key={`dl${i}`} x1={x(b.t.getTime())} x2={x(b.t.getTime())} y1={y(b.pct)} y2={H - PAD_BOTTOM} stroke="rgba(153,27,27,0.35)" strokeWidth="1" strokeDasharray="2 2" />
        ))}

        {/* curve segments */}
        {segments.map((seg, i) => {
          const d = `M${seg.points.map(p => `${x(p.t.getTime())},${y(p.pct)}`).join(' L')}`
          return (
            <path
              key={i} d={d} fill="none"
              stroke="#9f1239" strokeWidth="1.6" strokeLinecap="round"
              strokeDasharray={seg.projected ? '5 4' : undefined}
              opacity={seg.projected ? 0.55 : 1}
            />
          )
        })}

        {/* dose markers */}
        {doseMarkers.map((d, i) => (
          <circle key={i} cx={x(d.t.getTime())} cy={y(d.pct)} r="2.6" fill="#9f1239">
            <title>{d.dose.med_name}{d.dose.dosage ? ` — ${d.dose.dosage}` : ''} — {fmtDate(d.t)} {fmtTime(d.t)} — ~{d.pct}%</title>
          </circle>
        ))}

        {/* bleed markers */}
        {bleedMarkers.map((b, i) => (
          <g key={i} transform={`translate(${x(b.t.getTime())},${y(b.pct)})`}>
            <path d="M0,-5.5 L5,4.5 L-5,4.5 Z" fill="#7f1d1d" stroke="#fff" strokeWidth="0.8">
              <title>Bleed ({b.bleed.severity || 'unspecified'}) — {fmtDate(b.t)} {fmtTime(b.t)} — factor ~{b.pct}% at time of bleed</title>
            </path>
          </g>
        ))}
      </svg>
      <div className={styles.legend}>
        <span><b className={styles.dotDose} /> Dose</span>
        <span><b className={styles.dotBleed} /> Bleed</span>
        <span><b className={styles.dotProjected} /> Projected</span>
      </div>
    </div>
  )
}
