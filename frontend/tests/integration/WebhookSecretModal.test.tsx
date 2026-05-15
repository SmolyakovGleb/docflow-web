import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WebhookSecretModal } from '@/features/projects/ui/WebhookSecretModal'
import { toast } from '@/shared/ui/Toast/toast'
import { renderWithProviders } from '../utils/renderWithProviders'

vi.mock('@/shared/ui/Toast/toast', () => ({
  toast: {
    success: vi.fn(),
  },
}))

describe('WebhookSecretModal', () => {
  it('copies secret and webhook url and shows toast', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderWithProviders(
      <WebhookSecretModal
        open
        webhookSecret="secret-123"
        webhookUrl="https://example.com/webhook/1"
        onDone={() => {}}
      />,
    )

    const [copyUrlButton] = screen.getAllByRole('button', { name: 'Скопировать URL' })

    await user.click(screen.getByRole('button', { name: 'Скопировать secret' }))
    await user.click(copyUrlButton!)

    expect(writeText).toHaveBeenNthCalledWith(1, 'secret-123')
    expect(writeText).toHaveBeenNthCalledWith(2, 'https://example.com/webhook/1')
    expect(toast.success).toHaveBeenCalledWith('Secret скопирован')
    expect(toast.success).toHaveBeenCalledWith('URL скопирован')
  })

  it('does not close on overlay click', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <WebhookSecretModal
        open
        webhookSecret="secret-123"
        webhookUrl="https://example.com/webhook/1"
        onDone={() => {}}
      />,
    )

    await user.click(screen.getByTestId('webhook-secret-overlay'))

    expect(screen.getByText('Сохраните webhook secret')).toBeInTheDocument()
  })
})
