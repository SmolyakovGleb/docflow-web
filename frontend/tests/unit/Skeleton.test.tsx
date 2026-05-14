import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'

describe('Skeleton', () => {
  it('uses full width by default for line and rect variants', () => {
    const { container } = render(
      <>
        <Skeleton />
        <Skeleton variant="rect" />
      </>,
    )

    const [line, rect] = container.querySelectorAll('span')

    expect(line).toHaveStyle({ width: '100%', height: '12px' })
    expect(rect).toHaveStyle({ width: '100%', height: '40px' })
  })

  it('keeps compact default size for circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />)

    expect(container.querySelector('span')).toHaveStyle({
      width: '40px',
      height: '40px',
    })
  })
})
