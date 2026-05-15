import * as Sentry from '@sentry/react'
import { TriangleAlert } from 'lucide-react'
import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import i18n from '@/shared/lib/i18n'
import { Button } from '@/shared/ui/Button/Button'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

function ErrorFallback() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.icon} aria-hidden>
          <TriangleAlert size={28} />
        </span>
        <h1 className={styles.title}>{i18n.t('errors:boundary_title')}</h1>
        <p className={styles.description}>{i18n.t('errors:boundary_description')}</p>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => {
              window.location.reload()
            }}
          >
            {i18n.t('errors:boundary_reload_action')}
          </Button>
          <Button
            onClick={() => {
              window.location.assign('/tasks')
            }}
          >
            {i18n.t('errors:boundary_home_action')}
          </Button>
        </div>
      </section>
    </main>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    })
  }

  public render() {
    if (this.state.hasError) {
      return <ErrorFallback />
    }

    return this.props.children
  }
}
