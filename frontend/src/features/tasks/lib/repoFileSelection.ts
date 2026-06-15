export interface TreeLevel {
  folders: string[]
  filesAtLevel: string[]
}

export interface Breadcrumb {
  label: string
  prefix: string
}

export type FolderSelectionState = 'none' | 'partial' | 'all'

/** Folders and files directly at one level under `prefix` (paths are full). */
export function getTreeLevel(allFiles: string[], prefix: string): TreeLevel {
  const foldersSet = new Set<string>()
  const filesAtLevel: string[] = []

  for (const filePath of allFiles) {
    if (!filePath.startsWith(prefix)) continue
    const rel = filePath.slice(prefix.length)
    const slashIdx = rel.indexOf('/')
    if (slashIdx === -1) {
      filesAtLevel.push(filePath)
    } else {
      foldersSet.add(prefix + rel.slice(0, slashIdx + 1))
    }
  }

  return {
    folders: Array.from(foldersSet).sort(),
    filesAtLevel: filesAtLevel.sort(),
  }
}

export function buildBreadcrumbs(path: string): Breadcrumb[] {
  if (!path) return []
  const parts = path.slice(0, -1).split('/')
  return parts.map((part, index) => ({
    label: part,
    prefix: parts.slice(0, index + 1).join('/') + '/',
  }))
}

/** All files (recursively) under `prefix`. */
export function filesUnder(allFiles: string[], prefix: string): string[] {
  return allFiles.filter((filePath) => filePath.startsWith(prefix))
}

/** Whether none / some / all of the files under `prefix` are selected. */
export function folderSelectionState(
  selected: ReadonlySet<string>,
  allFiles: string[],
  prefix: string,
): FolderSelectionState {
  const under = filesUnder(allFiles, prefix)
  if (under.length === 0) return 'none'

  let selectedCount = 0
  for (const filePath of under) {
    if (selected.has(filePath)) selectedCount += 1
  }

  if (selectedCount === 0) return 'none'
  if (selectedCount === under.length) return 'all'
  return 'partial'
}

/** Case-insensitive substring filter over full paths. */
export function filterFiles(allFiles: string[], query: string): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return allFiles
  return allFiles.filter((filePath) => filePath.toLowerCase().includes(normalized))
}
