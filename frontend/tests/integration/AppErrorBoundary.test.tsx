vi.mock('@sentry/react', async () => {
  const actual = await vi.importActual<typeof import('@sentry/react')>('@sentry/react')

  return {
    ...actual,
    captureException: vi.fn(),
  }
})

import * as Sentry from '@sentry/react'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { renderWithProviders } from '../utils/renderWithProviders'

function CrashComponent(): null {
  throw new Error('Boom')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children when there is no error', () => {
    renderWithProviders(
      <ErrorBoundary>
        <div>healthy content</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('healthy content')).toBeInTheDocument()
  })

  it('renders fallback and reports error to Sentry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithProviders(
      <ErrorBoundary>
        <CrashComponent />
      </ErrorBoundary>,
    )

    expect(await screen.findByText('Не удалось отобразить страницу')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Перезагрузить' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'На главную' })).toBeInTheDocument()
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)

    consoleError.mockRestore()
  })
})
