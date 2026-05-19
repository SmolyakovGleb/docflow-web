import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProtectedRoute } from '@/app/auth/ProtectedRoute'
import { setUser } from '@/features/auth/model/authSlice'
import { JoinTeamPage } from '@/features/teams/ui/JoinTeamPage/JoinTeamPage'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

function buildTeamDetail(name: string) {
  return {
    id: 'team-1',
    name,
    owner_id: 'user-owner',
    created_at: '2026-05-18T10:00:00Z',
    member_count: 2,
    members: [
      {
        user_id: 'user-owner',
        email: 'owner@example.com',
        display_name: 'Owner User',
        github_linked: true,
        joined_at: '2026-05-18T10:00:00Z',
        role: 'owner',
      },
      {
        user_id: 'user-member',
        email: 'member@example.com',
        display_name: 'Member User',
        github_linked: false,
        joined_at: '2026-05-18T10:10:00Z',
        role: 'member',
      },
    ],
  }
}

function renderJoinPage(initialEntry: string) {
  const store = createAppStore()
  store.dispatch(
    setUser({
      id: 'user-member',
      email: 'member@example.com',
      display_name: 'Member User',
      github_linked: false,
      github_login: null,
      is_admin: false,
    }),
  )

  renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/teams/join"
          element={
            <ProtectedRoute>
              <JoinTeamPage />
            </ProtectedRoute>
          }
        />
        <Route path="/settings/team" element={<div>team settings</div>} />
        <Route path="/tasks" element={<div>tasks page</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
    { store },
  )
}

describe('JoinTeamPage', () => {
  it('shows invite preview, joins a team and redirects to settings', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
      http.get('/api/teams/invite-preview', () =>
        HttpResponse.json({
          team_name: 'Docs Team',
          member_count: 5,
        }),
      ),
      http.post('/api/teams/join', () => HttpResponse.json(buildTeamDetail('Docs Team'))),
    )

    const user = userEvent.setup()
    renderJoinPage('/teams/join?token=11111111-1111-1111-1111-111111111111')

    expect(await screen.findByText('Docs Team')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Вступить в команду' }))

    expect(await screen.findByText('team settings')).toBeInTheDocument()
  })

  it('shows missing token state', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
    )

    renderJoinPage('/teams/join')

    expect(await screen.findByText('Ссылка приглашения неполная')).toBeInTheDocument()
    expect(
      screen.getByText(
        'В ссылке отсутствует token приглашения. Попросите владельца команды отправить новую ссылку.',
      ),
    ).toBeInTheDocument()
  })

  it('shows invalid token state', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
      http.get('/api/teams/invite-preview', () =>
        HttpResponse.json({ detail: 'Invalid or expired invite token' }, { status: 404 }),
      ),
    )

    renderJoinPage('/teams/join?token=11111111-1111-1111-1111-111111111111')

    expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Приглашение недействительно, уже использовано или срок его действия истёк.',
      ),
    ).toBeInTheDocument()
  })

  it('shows already-member state and navigates to team settings', async () => {
    server.use(http.get('/api/teams/me', () => HttpResponse.json(buildTeamDetail('Core Team'))))

    const user = userEvent.setup()
    renderJoinPage('/teams/join?token=11111111-1111-1111-1111-111111111111')

    expect(await screen.findByText('Вы уже состоите в команде')).toBeInTheDocument()
    expect(
      screen.getByText('Вы уже состоите в команде «Core Team». Перейдите к настройкам команды.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Перейти к команде' }))

    expect(await screen.findByText('team settings')).toBeInTheDocument()
  })

  it('shows error inline when join request fails', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
      http.get('/api/teams/invite-preview', () =>
        HttpResponse.json({ team_name: 'Docs Team', member_count: 5 }),
      ),
      http.post('/api/teams/join', () =>
        HttpResponse.json({ detail: 'Invalid or expired invite token' }, { status: 400 }),
      ),
    )

    const user = userEvent.setup()
    renderJoinPage('/teams/join?token=11111111-1111-1111-1111-111111111111')

    expect(await screen.findByText('Docs Team')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Вступить в команду' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Вступить в команду' })).toBeInTheDocument()
  })

  it('shows retry on getMyTeam load failure', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 }),
      ),
    )

    renderJoinPage('/teams/join?token=11111111-1111-1111-1111-111111111111')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Вступить в команду' })).not.toBeInTheDocument()
  })

  it('shows retry on invite-preview load failure', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
      http.get('/api/teams/invite-preview', () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 }),
      ),
    )

    renderJoinPage('/teams/join?token=11111111-1111-1111-1111-111111111111')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Вступить в команду' })).not.toBeInTheDocument()
  })

  it('shows invalid invite state immediately for a malformed token without hitting the server', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
    )

    renderJoinPage('/teams/join?token=not-a-valid-uuid')

    expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Вступить в команду' })).not.toBeInTheDocument()
  })
})
