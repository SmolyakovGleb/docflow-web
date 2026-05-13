import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConflictView } from '@/features/tasks/ui/ConflictView/ConflictView'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('ConflictView', () => {
  it('rewrites editor value when user switches between ours and theirs presets', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let value = '# Theirs'

    const { rerender } = renderWithProviders(
      <ConflictView
        base="# Base"
        ours="# Ours"
        theirs="# Theirs"
        value={value}
        onChange={(next) => {
          value = next
          onChange(next)
        }}
        onUseOurs={() => {
          value = '# Ours'
          onChange(value)
        }}
        onUseTheirs={() => {
          value = '# Theirs'
          onChange(value)
        }}
        onPublish={() => {}}
      />,
    )

    await user.click(screen.getByLabelText('Использовать наш перевод'))
    rerender(
      <ConflictView
        base="# Base"
        ours="# Ours"
        theirs="# Theirs"
        value={value}
        onChange={(next) => {
          value = next
          onChange(next)
        }}
        onUseOurs={() => {
          value = '# Ours'
          onChange(value)
        }}
        onUseTheirs={() => {
          value = '# Theirs'
          onChange(value)
        }}
        onPublish={() => {}}
      />,
    )

    expect(screen.getByLabelText('Conflict editor')).toHaveValue('# Ours')

    await user.click(screen.getByLabelText('Использовать текущий EN'))
    rerender(
      <ConflictView
        base="# Base"
        ours="# Ours"
        theirs="# Theirs"
        value={value}
        onChange={(next) => {
          value = next
          onChange(next)
        }}
        onUseOurs={() => {
          value = '# Ours'
          onChange(value)
        }}
        onUseTheirs={() => {
          value = '# Theirs'
          onChange(value)
        }}
        onPublish={() => {}}
      />,
    )

    expect(screen.getByLabelText('Conflict editor')).toHaveValue('# Theirs')
  })
})
