import { describe, expect, it } from 'vitest'
import { parseLogs } from '@/features/tasks/lib/parseLogs'

describe('parseLogs', () => {
  it('groups lines by known stage prefixes and keeps order', () => {
    const stages = parseLogs(
      [
        '[prepare] workspace ready',
        'copied source file',
        '[pipeline] chunk 1 translated',
        'fixer applied',
        '[persist] saved output.md',
      ].join('\n'),
    )

    expect(stages).toEqual([
      {
        id: 'prepare',
        lines: ['workspace ready', 'copied source file'],
      },
      {
        id: 'pipeline',
        lines: ['chunk 1 translated', 'fixer applied'],
      },
      {
        id: 'persist',
        lines: ['saved output.md'],
      },
    ])
  })

  it('puts lines without a known prefix into the other group', () => {
    const stages = parseLogs('orphan line\n[persist] saved file')

    expect(stages).toEqual([
      {
        id: 'persist',
        lines: ['saved file'],
      },
      {
        id: 'other',
        lines: ['orphan line'],
      },
    ])
  })

  it('keeps backend logs without stage prefixes in the other group by default', () => {
    const stages = parseLogs(['workspace created', 'chunk translated', 'saved output'].join('\n'))

    expect(stages).toEqual([
      {
        id: 'other',
        lines: ['workspace created', 'chunk translated', 'saved output'],
      },
    ])
  })

  it('groups live lines by the current SSE stage when logs have no prefixes', () => {
    const stages = parseLogs('workspace created', ['chunk translated', 'chunk fixed'], {
      liveStage: 'pipeline',
    })

    expect(stages).toEqual([
      {
        id: 'pipeline',
        lines: ['chunk translated', 'chunk fixed'],
      },
      {
        id: 'other',
        lines: ['workspace created'],
      },
    ])
  })

  it('remaps legacy persisted logs to a fallback stage when no explicit stages are present', () => {
    const stages = parseLogs(
      ['workspace created', 'chunk translated', 'saved output'].join('\n'),
      [],
      { fallbackStage: 'pipeline' },
    )

    expect(stages).toEqual([
      {
        id: 'pipeline',
        lines: ['workspace created', 'chunk translated', 'saved output'],
      },
    ])
  })
})
