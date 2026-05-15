export type CmdkGroupKey = 'tasks' | 'projects' | 'actions'

export type CmdkIconKey =
  | 'task'
  | 'project'
  | 'tasks'
  | 'newProject'
  | 'repositories'
  | 'history'
  | 'analytics'
  | 'dictionaries'
  | 'settings'

export interface CmdkItem {
  id: string
  type: 'task' | 'project' | 'action'
  group: CmdkGroupKey
  icon: CmdkIconKey
  title: string
  subtitle?: string
  keywords: string[]
  to: string
}

export interface CmdkGroup {
  key: CmdkGroupKey
  items: CmdkItem[]
}
