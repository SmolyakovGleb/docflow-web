import { describe, expect, it } from 'vitest'
import { projectCreateSchema, projectUpdateSchema } from '@/features/projects/lib/schemas'

describe('project schemas', () => {
  it('accepts valid create payload', () => {
    expect(
      projectCreateSchema.safeParse({
        name: 'Docs EN',
        source_repo: 'team/docs-ru',
        source_branch: 'main',
        target_repo: 'team/docs-en',
        target_branch: 'release',
        exclude_patterns: ['docs/drafts/**'],
      }).success,
    ).toBe(true)
  })

  it('rejects invalid repo format', () => {
    expect(
      projectCreateSchema.safeParse({
        name: 'Docs EN',
        source_repo: 'team-docs-ru',
        source_branch: 'main',
        target_repo: 'team/docs-en',
        target_branch: 'main',
        exclude_patterns: [],
      }).success,
    ).toBe(false)
  })

  it('rejects empty branch', () => {
    expect(
      projectCreateSchema.safeParse({
        name: 'Docs EN',
        source_repo: 'team/docs-ru',
        source_branch: '',
        target_repo: 'team/docs-en',
        target_branch: 'main',
        exclude_patterns: [],
      }).success,
    ).toBe(false)
  })

  it('accepts update payload with partial fields', () => {
    expect(
      projectUpdateSchema.safeParse({
        source_branch: 'develop',
        exclude_patterns: ['**/README.md'],
      }).success,
    ).toBe(true)
  })
})
