import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { OnboardingGate } from '@/features/onboarding'
import {
  clearOnboardingStatus,
  readOnboardingStatus,
} from '@/features/onboarding/lib/onboardingStorage'
import { setUser } from '@/features/auth/model/authSlice'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderGate({
  entry = '/tasks',
  userId = 'user-1',
  githubLinked,
  projects = [],
}: {
  entry?: string
  userId?: string
  githubLinked: boolean
  projects?: Array<{ id: string }>
}) {
  server.use(http.get('/api/projects', () => HttpResponse.json(projects)))

  const store = createAppStore()
  store.dispatch(
    setUser({
      id: userId,
      email: 'anna@example.com',
      display_name: 'Anna',
      github_linked: githubLinked,
      github_login: githubLinked ? 'anna' : null,
    }),
  )

  return renderWithProviders(
    <MemoryRouter initialEntries={[entry]}>
      <OnboardingGate />
      <LocationProbe />
    </MemoryRouter>,
    { store },
  )
}

describe('OnboardingGate', () => {
  afterEach(() => {
    clearOnboardingStatus()
  })

  it('renders github onboarding step for user without linked github', async () => {
    renderGate({
      githubLinked: false,
      projects: [],
    })

    expect(await screen.findByText('Привяжите GitHub')).toBeInTheDocument()
    expect(screen.getByText('Шаг 1 из 3')).toBeInTheDocument()
  })

  it('stores dismissed status after skip and hides the dialog', async () => {
    const user = userEvent.setup()

    renderGate({
      githubLinked: false,
      projects: [],
    })

    await user.click(await screen.findByRole('button', { name: 'Пропустить онбординг' }))

    await waitFor(() => {
      expect(screen.queryByText('Привяжите GitHub')).not.toBeInTheDocument()
    })
    expect(readOnboardingStatus('user-1')).toBe('dismissed')
  })

  it('navigates to project creation step with onboarding flag', async () => {
    const user = userEvent.setup()

    renderGate({
      githubLinked: true,
      projects: [],
    })

    expect(await screen.findByText('Создайте первый проект')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Создать проект' }))

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/repositories/new?onboarding=1')
  })

  it('does not render on repositories new route', async () => {
    renderGate({
      entry: '/repositories/new?onboarding=1',
      githubLinked: false,
      projects: [],
    })

    await waitFor(() => {
      expect(screen.queryByText('Быстрый старт')).not.toBeInTheDocument()
    })
  })

  it('does not reuse onboarding status from another account', async () => {
    clearOnboardingStatus()
    localStorage.setItem('docflow.onboarding.status:user-1', 'dismissed')

    renderGate({
      userId: 'user-2',
      githubLinked: false,
      projects: [],
    })

    expect(await screen.findByText('Привяжите GitHub')).toBeInTheDocument()
    expect(readOnboardingStatus('user-2')).toBe('idle')
  })
})
