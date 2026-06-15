import { describe, expect, it } from 'vitest'
import {
  buildBreadcrumbs,
  filesUnder,
  filterFiles,
  folderSelectionState,
  getTreeLevel,
} from '@/features/tasks/lib/repoFileSelection'

const FILES = [
  'crm/deal/index.md',
  'crm/deal/get.md',
  'crm/lead/index.md',
  'tasks/index.md',
  'index.md',
]

describe('getTreeLevel', () => {
  it('splits folders and files at the root level', () => {
    const { folders, filesAtLevel } = getTreeLevel(FILES, '')
    expect(folders).toEqual(['crm/', 'tasks/'])
    expect(filesAtLevel).toEqual(['index.md'])
  })

  it('descends into a folder prefix', () => {
    const { folders, filesAtLevel } = getTreeLevel(FILES, 'crm/')
    expect(folders).toEqual(['crm/deal/', 'crm/lead/'])
    expect(filesAtLevel).toEqual([])
  })
})

describe('filesUnder', () => {
  it('returns every file recursively under a prefix', () => {
    expect(filesUnder(FILES, 'crm/')).toEqual([
      'crm/deal/index.md',
      'crm/deal/get.md',
      'crm/lead/index.md',
    ])
  })
})

describe('folderSelectionState', () => {
  it('reports all / partial / none', () => {
    const all = new Set(['crm/deal/index.md', 'crm/deal/get.md'])
    expect(folderSelectionState(all, FILES, 'crm/deal/')).toBe('all')

    const partial = new Set(['crm/deal/index.md'])
    expect(folderSelectionState(partial, FILES, 'crm/deal/')).toBe('partial')

    expect(folderSelectionState(new Set(), FILES, 'crm/deal/')).toBe('none')
  })
})

describe('filterFiles', () => {
  it('matches full paths case-insensitively', () => {
    expect(filterFiles(FILES, 'index')).toHaveLength(4)
    expect(filterFiles(FILES, 'DEAL')).toEqual(['crm/deal/index.md', 'crm/deal/get.md'])
    expect(filterFiles(FILES, '')).toBe(FILES)
  })
})

describe('buildBreadcrumbs', () => {
  it('builds clickable breadcrumb prefixes', () => {
    expect(buildBreadcrumbs('crm/deal/')).toEqual([
      { label: 'crm', prefix: 'crm/' },
      { label: 'deal', prefix: 'crm/deal/' },
    ])
    expect(buildBreadcrumbs('')).toEqual([])
  })
})
