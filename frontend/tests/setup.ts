import '@testing-library/jest-dom/vitest'
import '@/shared/lib/i18n'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server'

// jsdom stubs required by Radix UI primitives (Select, Popover, etc.)
HTMLElement.prototype.hasPointerCapture = () => false
HTMLElement.prototype.setPointerCapture = () => undefined
HTMLElement.prototype.releasePointerCapture = () => undefined
Element.prototype.scrollIntoView = () => undefined

class ResizeObserverMock {
  constructor(_callback?: ResizeObserverCallback) {}

  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
