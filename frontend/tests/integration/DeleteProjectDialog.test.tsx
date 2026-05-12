import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteProjectDialog } from '@/features/projects/ui/DeleteProjectDialog'
import i18n from '@/shared/lib/i18n'

describe('DeleteProjectDialog', () => {
  it('requires exact project name before enabling destructive action', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <DeleteProjectDialog
        open
        projectName="Docs EN"
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: i18n.t('repositories:delete_project') }))

    const confirmButton = screen.getByRole('button', {
      name: i18n.t('repositories:delete_project'),
    })
    const input = screen.getByLabelText(new RegExp(i18n.t('repositories:delete_type_name_label')))

    expect(confirmButton).toBeDisabled()

    await user.type(input, 'Docs')
    expect(confirmButton).toBeDisabled()

    await user.clear(input)
    await user.type(input, 'Docs EN')
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
