import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './MinViewportGuard.module.css'

interface MinViewportGuardProps {
  minWidth?: number
  children: ReactNode
}

export function MinViewportGuard({ minWidth = 1280, children }: MinViewportGuardProps) {
  const { t } = useTranslation('common')
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (width < minWidth) {
    return (
      <div className={styles.overlay}>
        <section className={styles.card}>
          <h1 className={styles.title}>{t('desktop_only_title')}</h1>
          <p className={styles.description}>{t('desktop_only_description', { width: minWidth })}</p>
        </section>
      </div>
    )
  }

  return <>{children}</>
}
