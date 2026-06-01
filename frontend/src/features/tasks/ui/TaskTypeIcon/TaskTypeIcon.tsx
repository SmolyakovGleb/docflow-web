import { FileCode2, FileUp, GitCommitHorizontal, Terminal } from 'lucide-react'
import type { TaskSummary } from '@/features/tasks/model/types'

interface TaskTypeIconProps {
  task: TaskSummary
  size?: number
}

export function TaskTypeIcon({ task, size = 15 }: TaskTypeIconProps) {
  const filePath = task.file_path.toLowerCase()
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return <FileCode2 size={size} />
  }

  if (task.github_sha) {
    return <GitCommitHorizontal size={size} />
  }
  if (task.commit_message === 'manual') {
    return <Terminal size={size} />
  }
  return <FileUp size={size} />
}
