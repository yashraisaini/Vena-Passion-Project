import { useEffect } from 'react'
import { catMeta } from '../data/medications'
import styles from './MedModal.module.css'

function FactorChart({ med }) {
  if (med.category === 'supportive') return null
  const W = 400, H = 80, pad = 28
  const innerW = W - pad * 2, innerH = H - 14

  const elements = []

  // Zone fills
  elements.push(<rect key="z1" x={pad} y={0} width={innerW} height={(1-0.5)*innerH} fill="rgba(34,197,94,0.07)"/>)
  elements.push(<rect key="z2" x={pad} y={(1-0.5)*innerH} width={innerW} height={(0.5-0.05)*innerH} fill="rgba(201,169,110,0.07)"/>)
  elements.push(<rect key="z3" x={pad} y={(1-0.05)*innerH} width={innerW} height={0.05*innerH} fill="rgba(239,68,68,0.07)"/>)

  // Threshold lines
  elements.push(<line key="l1" x1={pad} x2={W-pad} y1={(1-0.5)*innerH} y2={(1-0.5)*innerH} stroke="#22c55e" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.5"/>)
  elements.push(<line key="l2" x1={pad} x2={W-pad} y1={(1-0.05)*innerH} y2={(1-0.05)*innerH} stroke="#c9a96e" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.5"/>)

  if (med.steadyState != null && med.peakPct == null) {
    const y = (1 - med.steadyState / 100) * innerH
    elements.push(<line key="ss" x1={pad} x2={W-pad} y1={y} y2={y} stroke="rgba(200,16,46,0.85)" strokeWidth="2.5"/>)
    elements.push(<text key="sst" x={W-pad+3} y={y+4} fill="rgba(200,16,46,0.8)" fontFamily="Space Mono" fontSize="8">~{med.steadyState}%</text>)
  } else if (med.peakPct) {
    const peak   = med.peakPct / 100
    const trough = Math.max((med.troughPct || 1) / 100, 0.001)
    const pts = Array.from({ length: 41 }, (_, i) => {
      const t = i / 40
      return `${pad + t * innerW},${(1 - Math.min(peak * Math.pow(trough / peak, t), 1)) * innerH}`
    })
    const d = `M${pts.join(' L')}`
    elements.push(<path key="fill" d={`${d} L${W-pad},${innerH} L${pad},${innerH} Z`} fill="rgba(200,16,46,0.07)"/>)
    elements.push(<path key="line" d={d} fill="none" stroke="rgba(200,16,46,0.85)" strokeWidth="2" strokeLinecap="round"/>)
  }

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartTitle}>
        Estimated factor activity
        <span>{med.halfLife ? `Half-life ${med.halfLife}` : (med.steadyState ? `Steady state ~${med.steadyState}%` : '')}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:'100%', height:'80px' }}>
        {elements}
      </svg>
      <div className={styles.legend}>
        <span><b style={{background:'#22c55e'}}/>Normal (&gt;50%)</span>
        <span><b style={{background:'#c9a96e'}}/>Mild (5–50%)</span>
        <span><b style={{background:'#ef4444'}}/>At risk (&lt;5%)</span>
      </div>
      <p className={styles.chartNote}>
        Population averages from published clinical trials. Your levels depend on weight, dose, and individual pharmacokinetics. Follow your care team's guidance.
      </p>
    </div>
  )
}

export default function MedModal({ med, onClose, onAdd, isAdded }) {
  const m = catMeta[med.category]

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>✕</button>
        <span className={styles.tag} style={{ color: `rgba(${m.color},1)`, borderColor: `rgba(${m.color},0.2)`, background: `rgba(${m.color},0.08)` }}>
          {m.label}
        </span>
        <h3 className={styles.title}>{med.name}</h3>
        <p className={styles.generic}>{med.generic}</p>
        <div className={styles.meta}>
          <div>Route<span>{med.route}</span></div>
          <div>Frequency<span>{med.frequency}</span></div>
          <div>Half-life<span>{med.halfLife || 'N/A'}</span></div>
        </div>
        <p className={styles.desc}>{med.desc}</p>
        <FactorChart med={med} />
        <div className={styles.actions}>
          {onAdd && (
            <button className={styles.btnPrimary} onClick={onAdd} disabled={isAdded}>
              {isAdded ? '✓ Already added' : '+ Add to Schedule'}
            </button>
          )}
          <button className={styles.btnGhost} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
