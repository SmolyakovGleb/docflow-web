import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { setUser } from '@/features/auth/model/authSlice'
import type { UserRead } from '@/features/auth/model/types'
import { SettingsLayout } from '@/features/settings/ui/SettingsLayout/SettingsLayout'
import type { TeamDetail, TeamInviteRead } from '@/features/teams/model/types'
import { TeamSettingsPage } from '@/features/teams/ui/TeamSettingsPage/TeamSettingsPage'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

const ownerUser: UserRead = {
  id: 'user-owner',
  email: 'owner@example.com',
  display_name: 'Owner User',
  github_linked: true,
  github_login: 'owner-user',
  is_admin: false,
}

const memberUser: UserRead = {
  id: 'user-member',
  email: 'member@example.com',
  display_name: 'Member User',
  github_linked: false,
  github_login: null,
  is_admin: false,
}

function makeTeam({ name, members }: { name: string; members: TeamDetail['members'] }): TeamDetail {
  return {
    id: 'team-1',
    name,
    owner_id: ownerUser.id,
    created_at: '2026-05-18T10:00:00Z',
    member_count: members.length,
    members,
  }
}

function renderTeamSettingsPage(user: UserRead) {
  const store = createAppStore()
  store.dispatch(setUser(user))

  return renderWithProviders(<TeamSettingsPage />, { store })
}

function renderTeamSettingsRoute(user: UserRead) {
  const store = createAppStore()
  store.dispatch(setUser(user))

  return renderWithProviders(
    <MemoryRouter initialEntries={['/settings/team']}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route path="team" element={<TeamSettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { store },
  )
}

describe('TeamSettingsPage', () => {
  it('shows create form on 404 and creates a team', async () => {
    let currentTeam: TeamDetail | null = null

    server.use(
      http.get('/api/teams/me', () => {
        if (!currentTeam) {
          return HttpResponse.json({ detail: 'Not in a team' }, { status: 404 })
        }

        return HttpResponse.json(currentTeam)
      }),
      http.post('/api/teams', async ({ request }) => {
        const body = (await request.json()) as { name: string }

        currentTeam = makeTeam({
          name: body.name,
          members: [
            {
              user_id: ownerUser.id,
              email: ownerUser.email,
              display_name: ownerUser.display_name,
              github_linked: ownerUser.github_linked,
              joined_at: '2026-05-18T10:00:00Z',
              role: 'owner',
            },
          ],
        })

        return HttpResponse.json(currentTeam, { status: 201 })
      }),
    )

    const user = userEvent.setup()
    renderTeamSettingsRoute(ownerUser)

    expect(await screen.findByText('Вы пока не состоите в команде')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Команда' })).toHaveAttribute('href', '/settings/team')

    await user.type(screen.getByLabelText(/Название команды/i), 'Alpha Team')
    await user.click(screen.getByRole('button', { name: 'Создать команду' }))

    expect(await screen.findByText('Alpha Team')).toBeInTheDocument()
    expect(await screen.findByText('Общая информация')).toBeInTheDocument()
  })

  it('renders owner state and manages invites', async () => {
    const team = makeTeam({
      name: 'Docs Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
        {
          user_id: memberUser.id,
          email: memberUser.email,
          display_name: memberUser.display_name,
          github_linked: memberUser.github_linked,
          joined_at: '2026-05-18T10:10:00Z',
          role: 'member',
        },
      ],
    })
    let invites: TeamInviteRead[] = []

    server.use(
      http.get('/api/teams/me', () => HttpResponse.json(team)),
      http.get('/api/teams/me/invites', () => HttpResponse.json(invites)),
      http.post('/api/teams/me/invites', async ({ request }) => {
        const body = (await request.json()) as { expires_in_days: number | null }
        const invite: TeamInviteRead = {
          id: 'invite-1',
          token: '11111111-1111-1111-1111-111111111111',
          created_by_email: ownerUser.email,
          used_by_email: null,
          created_at: '2026-05-18T10:20:00Z',
          expires_at: body.expires_in_days === null ? null : '2026-05-25T10:20:00Z',
          status: 'active',
        }

        invites = [invite]
        return HttpResponse.json(invite, { status: 201 })
      }),
      http.delete('/api/teams/me/invites/:inviteId', ({ params }) => {
        invites = invites.map((invite) =>
          invite.id === params.inviteId ? { ...invite, status: 'expired' } : invite,
        )
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(ownerUser)

    expect(await screen.findByText('member@example.com')).toBeInTheDocument()
    expect(screen.getByText('Приглашения')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Срок действия (дней)'), '7')
    await user.click(screen.getByRole('button', { name: 'Создать приглашение' }))

    expect(
      await screen.findByDisplayValue(/\/teams\/join\?token=11111111-1111-1111-1111-111111111111/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отозвать' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Отозвать' }))

    expect(await screen.findByText('Истекло')).toBeInTheDocument()
  })

  it('renames a team for the owner', async () => {
    let currentTeam = makeTeam({
      name: 'Docs Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
      ],
    })

    server.use(
      http.get('/api/teams/me', () => HttpResponse.json(currentTeam)),
      http.get('/api/teams/me/invites', () => HttpResponse.json([])),
      http.patch('/api/teams/me', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        currentTeam = {
          ...currentTeam,
          name: body.name,
        }

        return HttpResponse.json(currentTeam)
      }),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(ownerUser)

    const renameInput = await screen.findByLabelText('Переименовать команду')
    await user.clear(renameInput)
    await user.type(renameInput, 'Docs Team 2')
    await user.click(screen.getByRole('button', { name: 'Сохранить название' }))

    expect(await screen.findByText('Docs Team 2')).toBeInTheDocument()
  })

  it('removes a member for the owner', async () => {
    let currentTeam = makeTeam({
      name: 'Docs Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
        {
          user_id: memberUser.id,
          email: memberUser.email,
          display_name: memberUser.display_name,
          github_linked: memberUser.github_linked,
          joined_at: '2026-05-18T10:10:00Z',
          role: 'member',
        },
      ],
    })

    server.use(
      http.get('/api/teams/me', () => HttpResponse.json(currentTeam)),
      http.get('/api/teams/me/invites', () => HttpResponse.json([])),
      http.delete('/api/teams/me/members/:memberId', ({ params }) => {
        currentTeam = {
          ...currentTeam,
          members: currentTeam.members.filter((member) => member.user_id !== params.memberId),
          member_count: currentTeam.member_count - 1,
        }

        return new HttpResponse(null, { status: 204 })
      }),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(ownerUser)

    expect(await screen.findByText('member@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Исключить' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Исключить' }))

    await waitFor(() => {
      expect(screen.queryByText('member@example.com')).not.toBeInTheDocument()
    })
  })

  it('renders member state and leaves a team', async () => {
    let currentTeam: TeamDetail | null = makeTeam({
      name: 'Docs Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
        {
          user_id: memberUser.id,
          email: memberUser.email,
          display_name: memberUser.display_name,
          github_linked: memberUser.github_linked,
          joined_at: '2026-05-18T10:10:00Z',
          role: 'member',
        },
      ],
    })

    server.use(
      http.get('/api/teams/me', () => {
        if (!currentTeam) {
          return HttpResponse.json({ detail: 'Not in a team' }, { status: 404 })
        }

        return HttpResponse.json(currentTeam)
      }),
      http.post('/api/teams/me/leave', () => {
        currentTeam = null
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(memberUser)

    expect(await screen.findByRole('button', { name: 'Покинуть команду' })).toBeInTheDocument()
    expect(screen.queryByText('Приглашения')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Покинуть команду' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Покинуть команду' }))

    expect(await screen.findByText('Вы пока не состоите в команде')).toBeInTheDocument()
  })

  it('requires typed team name before deleting a team', async () => {
    let currentTeam: TeamDetail | null = makeTeam({
      name: 'Delete Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
      ],
    })

    server.use(
      http.get('/api/teams/me', () => {
        if (!currentTeam) {
          return HttpResponse.json({ detail: 'Not in a team' }, { status: 404 })
        }

        return HttpResponse.json(currentTeam)
      }),
      http.get('/api/teams/me/invites', () => HttpResponse.json([])),
      http.delete('/api/teams/me', () => {
        currentTeam = null
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(ownerUser)

    await screen.findByText('Delete Team')
    await user.click(screen.getByRole('button', { name: 'Удалить команду' }))

    const dialog = await screen.findByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', { name: 'Удалить команду' })

    expect(confirmButton).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Подтверждение'), 'Delete Team')
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText('Вы пока не состоите в команде')).toBeInTheDocument()
    })
  })

  it('shows load error instead of create form for unexpected 404', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Team not found' }, { status: 404 }),
      ),
    )

    renderTeamSettingsPage(ownerUser)

    expect(await screen.findByRole('alert')).toHaveTextContent('Команда не найдена.')
    expect(screen.queryByRole('button', { name: 'Создать команду' })).not.toBeInTheDocument()
  })

  it('shows validation error when creating team with empty name', async () => {
    server.use(
      http.get('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(ownerUser)

    expect(await screen.findByText('Вы пока не состоите в команде')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Создать команду' }))

    expect(screen.getByText('Укажите название команды')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows delete error inside the dialog on server failure', async () => {
    const team = makeTeam({
      name: 'Docs Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
      ],
    })

    server.use(
      http.get('/api/teams/me', () => HttpResponse.json(team)),
      http.get('/api/teams/me/invites', () => HttpResponse.json([])),
      http.delete('/api/teams/me', () =>
        HttpResponse.json({ detail: 'Team not found' }, { status: 404 }),
      ),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(ownerUser)

    await screen.findByText('Docs Team')
    await user.click(screen.getByRole('button', { name: 'Удалить команду' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Подтверждение'), 'Docs Team')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить команду' }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows leave error inside the dialog on server failure', async () => {
    const team = makeTeam({
      name: 'Docs Team',
      members: [
        {
          user_id: ownerUser.id,
          email: ownerUser.email,
          display_name: ownerUser.display_name,
          github_linked: ownerUser.github_linked,
          joined_at: '2026-05-18T10:00:00Z',
          role: 'owner',
        },
        {
          user_id: memberUser.id,
          email: memberUser.email,
          display_name: memberUser.display_name,
          github_linked: memberUser.github_linked,
          joined_at: '2026-05-18T10:10:00Z',
          role: 'member',
        },
      ],
    })

    server.use(
      http.get('/api/teams/me', () => HttpResponse.json(team)),
      http.post('/api/teams/me/leave', () =>
        HttpResponse.json({ detail: 'Not in a team' }, { status: 404 }),
      ),
    )

    const user = userEvent.setup()
    renderTeamSettingsPage(memberUser)

    await user.click(await screen.findByRole('button', { name: 'Покинуть команду' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Покинуть команду' }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
