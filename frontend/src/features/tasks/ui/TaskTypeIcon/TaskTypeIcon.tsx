import { FileUp, GitCommitHorizontal, Terminal } from 'lucide-react'
import type { TaskSummary } from '@/features/tasks/model/types'

interface TaskTypeIconProps {
  task: TaskSummary
  size?: number
}

export function TaskTypeIcon({ task, size = 15 }: TaskTypeIconProps) {
  if (task.github_sha) {
    return <GitCommitHorizontal size={size} />
  }
  if (task.commit_message === 'manual') {
    return <Terminal size={size} />
  }
  return <FileUp size={size} />
}
