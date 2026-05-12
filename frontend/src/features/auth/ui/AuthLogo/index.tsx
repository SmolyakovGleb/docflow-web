import styles from './index.module.css'

export function AuthLogo() {
  return (
    <div className={styles.wordmark}>
      <span className={styles.glyph} aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span>DocFlow</span>
    </div>
  )
}
