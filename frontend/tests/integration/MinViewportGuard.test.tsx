import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MinViewportGuard } from '@/shared/ui/MinViewportGuard/MinViewportGuard'

describe('MinViewportGuard', () => {
  it('shows fallback on narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1100 })

    render(
      <MinViewportGuard>
        <div>content</div>
      </MinViewportGuard>,
    )

    expect(screen.getByText('DocFlow оптимизирован для desktop')).toBeInTheDocument()
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })
})
