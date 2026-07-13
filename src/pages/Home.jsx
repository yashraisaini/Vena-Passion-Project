import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import VeinCanvas from '../components/VeinCanvas'
import Library from '../components/Library'
import HeroPreviewCard from '../components/HeroPreviewCard'
import HeroPhoto from '../components/HeroPhoto'
import { useAuth } from '../context/AuthContext'
import styles from './Home.module.css'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  { num: '01', title: 'Wash & prepare',       desc: 'Wash hands for at least 20 seconds and lay out all supplies on a clean surface — vial, diluent, transfer device, syringe, alcohol swabs, gauze, bandage, sharps container.' },
  { num: '02', title: 'Reconstitute',          desc: 'Use the transfer device to combine diluent with concentrate. Swirl gently — never shake — until fully dissolved and visually clear.' },
  { num: '03', title: 'Draw & prime',          desc: 'Draw the medication into the syringe and push fluid through the tubing until every air bubble is cleared from the line.' },
  { num: '04', title: 'Prep your site',        desc: 'Choose a vein and rotate sites over time. Apply tourniquet, clean skin with an alcohol swab, and let it fully air dry before inserting.' },
  { num: '05', title: 'Insert & confirm',      desc: 'Bevel up, insert at 15–30°. A blood flash in the tubing confirms vein placement. Release the tourniquet before infusing.' },
  { num: '06', title: 'Infuse & finish',       desc: 'Push steadily at your care team\'s pace, watching for swelling. Remove needle, apply pressure, bandage, and dispose of sharps safely.' },
]

export default function Home() {
  const { user } = useAuth()
  const heroRef   = useRef(null)
  const eyeRef    = useRef(null)
  const wordRef   = useRef(null)
  const tagRef    = useRef(null)
  const actRef    = useRef(null)
  const stepsRef  = useRef([])

  useEffect(() => {
    // Hero entrance
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.fromTo(eyeRef.current,  { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9, delay: 0.2 })
      .fromTo(wordRef.current,  { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 1.1 }, '-=0.55')
      .fromTo(tagRef.current,   { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9 }, '-=0.6')
      .fromTo(actRef.current,   { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.5')

    // Steps reveal
    stepsRef.current.forEach((el, i) => {
      if (!el) return
      gsap.fromTo(el,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.7, delay: i * 0.08,
          scrollTrigger: { trigger: el, start: 'top 85%' } }
      )
    })

    return () => ScrollTrigger.getAll().forEach(t => t.kill())
  }, [])

  return (
    <div className={styles.page}>

      {/* ── HERO ── */}
      <section className={styles.hero} ref={heroRef}>
        <VeinCanvas />

        {/* Radial accent glows */}
        <div className={styles.glow1} aria-hidden="true" />
        <div className={styles.glow2} aria-hidden="true" />

        <div className={styles.heroVisual}>
          <HeroPhoto />
          <HeroPreviewCard />
        </div>

        {/* Text content */}
        <div className={styles.heroContent}>
          <div className={styles.eyebrow} ref={eyeRef}>
            Smart infusion companion
          </div>

          <h1 className={styles.wordmark} ref={wordRef}>
            VE<em>NA</em>
          </h1>

          <p className={styles.tagline} ref={tagRef}>
            Know your shield. Know your dose.
          </p>

          <p className={styles.heroDesc} ref={actRef}>
            A personal guide to hemophilia and von Willebrand disease treatment —
            track medications, visualise your factor protection level in real time,
            and never miss a dose.
          </p>

          <div className={styles.heroActions}>
            <Link to={user ? '/dashboard' : '/login'} className={`${styles.btn} ${styles.btnPrimary}`}>
              {user ? 'Go to dashboard' : 'Create account'}
            </Link>
            <a href="#guide" className={`${styles.btn} ${styles.btnOutline}`}>
              See the guide
            </a>
          </div>
        </div>

        <div className={styles.scrollCue} aria-hidden="true">
          <div className={styles.scrollLine} />
          <span>scroll</span>
        </div>
      </section>

      {/* ── STATS ── */}
      <div className={styles.statsRow}>
        {[['25+','Medications tracked'],['6','Guided steps'],['∞','Calendar reminders']].map(([n,l]) => (
          <div key={l} className={styles.stat}>
            <div className={styles.statNum}>{n}</div>
            <div className={styles.statLabel}>{l}</div>
          </div>
        ))}
      </div>

      <div className={styles.rule} />

      {/* ── STEP GUIDE ── */}
      <section className={styles.section} id="guide">
        <div className={styles.sectionEyebrow}>Step-by-step guide</div>
        <h2 className={styles.sectionH2}>The infusion <em>walkthrough</em></h2>
        <p className={styles.sectionDesc}>
          A visual overview of the self-infusion process. Always follow the specific
          instructions from your hemophilia treatment centre and product packaging.
        </p>

        <div className={styles.stepsGrid}>
          {steps.map((s, i) => (
            <div
              key={s.num}
              className={styles.stepCard}
              ref={el => stepsRef.current[i] = el}
            >
              <div className={styles.stepNumBig}>{s.num}</div>
              <div className={styles.stepNum}>{s.num} / {String(steps.length).padStart(2,'0')}</div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.rule} />

      {/* ── LIBRARY ── */}
      <section className={styles.section} id="library">
        <div className={styles.sectionEyebrow}>Treatment library</div>
        <h2 className={styles.sectionH2}>Know your <em>options</em></h2>
        <p className={styles.sectionDesc}>
          Browse all medications. Click any card to view factor-level data and
          add it to your personal schedule.
        </p>
        <Library />
      </section>

    </div>
  )
}
