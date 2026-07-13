import styles from './HeroPhoto.module.css'

export default function HeroPhoto() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.imgWrap}>
        <img src="/hero-photo.png" alt="" className={styles.img} />
      </div>
    </div>
  )
}
