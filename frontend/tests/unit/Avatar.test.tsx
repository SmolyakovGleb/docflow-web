import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from '@/shared/ui/Avatar/Avatar'

describe('Avatar', () => {
  it('renders initials from display name', () => {
    render(<Avatar name="Anna Kuznetsova" />)
    expect(screen.getByText('AK')).toBeInTheDocument()
  })

  it('falls back to question mark for empty name', () => {
    render(<Avatar name="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
