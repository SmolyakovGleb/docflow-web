import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './AuthStagePlaceholder.module.css'

interface AuthStagePlaceholderProps {
  title: string
  subtitle: string
  notice: string
  footer: ReactNode
}

export function AuthStagePlaceholder({
  title,
  subtitle,
  notice,
  footer,
}: AuthStagePlaceholderProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.wordmark}>
          <span className={styles.glyph} aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span>DocFlow</span>
        </div>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.notice}>{notice}</div>
        <div className={styles.footer}>{footer}</div>
      </section>
    </main>
  )
}

export function AuthStageFooter({
  prefix,
  linkText,
  to,
}: {
  prefix: string
  linkText: string
  to: string
}) {
  return (
    <>
      {prefix} <Link to={to}>{linkText}</Link>
    </>
  )
}
