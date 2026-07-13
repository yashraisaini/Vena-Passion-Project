import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import styles from './HeroPreviewCard.module.css'

export default function HeroPreviewCard() {
  const cardRef = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !cardRef.current) return
    const tw = gsap.to(cardRef.current, {
      y: -5, duration: 4.2, ease: 'sine.inOut', repeat: -1, yoyo: true,
    })
    return () => tw.kill()
  }, [])

  return (
    <div className={styles.wrap} ref={cardRef} aria-hidden="true">
      <div className={styles.header}>
        <div className={styles.avatar}>
          J
        </div>
        <div>
          <div className={styles.name}>James</div>
          <div className={styles.sub}>Factor VIII · Advate</div>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowTop}>
          <span className={styles.label}>Supply remaining</span>
          <span className={styles.valueLow}>15%</span>
        </div>
        <div className={styles.track}>
          <div className={styles.fillLow} style={{ width: '15%' }} />
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.nextDose}>
        <span className={styles.label}>Next dose</span>
        <span className={styles.nextDoseValue}>in 3 days</span>
      </div>

      <div className={styles.caption}>A preview of your dashboard</div>
    </div>
  )
}
