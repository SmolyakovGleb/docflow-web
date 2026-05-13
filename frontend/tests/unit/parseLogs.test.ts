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
})
