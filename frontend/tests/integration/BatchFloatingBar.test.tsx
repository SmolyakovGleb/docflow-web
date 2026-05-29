import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BatchFloatingBar } from '@/features/tasks/ui/BatchFloatingBar'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('BatchFloatingBar', () => {
  it('does not apply barVisible class when selectedCount is 0', () => {
    renderWithProviders(
      <BatchFloatingBar
        selectedCount={0}
        selectedDoneCount={0}
        hasGithubLinked={true}
        onDownload={() => {}}
        onPublish={() => {}}
        onClose={() => {}}
      />,
    )

    const barEl = document.querySelector('[class*="bar"]') as HTMLElement | null
    expect(barEl?.className).not.toContain('barVisible')
  })

  it('applies barVisible class when selectedCount > 0', () => {
    renderWithProviders(
      <BatchFloatingBar
        selectedCount={3}
        selectedDoneCount={1}
        hasGithubLinked={true}
        onDownload={() => {}}
        onPublish={() => {}}
        onClose={() => {}}
      />,
    )

    const countEl = screen.getByText(
      (_, element) => element?.tagName === 'SPAN' && element.textContent === '3 задач выбрано',
    )
    const bar = countEl.parentElement
    expect(bar?.className).toContain('barVisible')
  })

  it('shows selected count in label', () => {
    renderWithProviders(
      <BatchFloatingBar
        selectedCount={5}
        selectedDoneCount={2}
        hasGithubLinked={true}
        onDownload={() => {}}
        onPublish={() => {}}
        onClose={() => {}}
      />,
    )

    expect(
      screen.getByText((_, element) => element?.textContent === '5 задач выбрано'),
    ).toBeInTheDocument()
  })

  it('disables publish button when selectedDoneCount is 0', () => {
    renderWithProviders(
      <BatchFloatingBar
        selectedCount={3}
        selectedDoneCount={0}
        hasGithubLinked={true}
        onDownload={() => {}}
        onPublish={() => {}}
        onClose={() => {}}
      />,
    )

    const publishBtn = screen.getByRole('button', { name: /опубликовать готовые/i })
    expect(publishBtn).toBeDisabled()
  })

  it('enables publish button when selectedDoneCount > 0', () => {
    renderWithProviders(
      <BatchFloatingBar
        selectedCount={3}
        selectedDoneCount={2}
        hasGithubLinked={true}
        onDownload={() => {}}
        onPublish={() => {}}
        onClose={() => {}}
      />,
    )

    const publishBtn = screen.getByRole('button', { name: /опубликовать готовые/i })
    expect(publishBtn).not.toBeDisabled()
  })

  it('calls onDownload when download button is clicked', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn()

    renderWithProviders(
      <BatchFloatingBar
        selectedCount={2}
        selectedDoneCount={1}
        hasGithubLinked={true}
        onDownload={onDownload}
        onPublish={() => {}}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /скачать/i }))
    expect(onDownload).toHaveBeenCalledOnce()
  })

  it('calls onPublish when publish button is clicked', async () => {
    const user = userEvent.setup()
    const onPublish = vi.fn()

    renderWithProviders(
      <BatchFloatingBar
        selectedCount={2}
        selectedDoneCount={2}
        hasGithubLinked={true}
        onDownload={() => {}}
        onPublish={onPublish}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /опубликовать готовые/i }))
    expect(onPublish).toHaveBeenCalledOnce()
  })
})
