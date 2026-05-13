import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getDefaultTaskDetailTab,
  isTaskDetailTab,
  type TaskDetailTab,
  type TaskStatus,
} from '../model/types'

export function useTaskDetailTab(status: TaskStatus) {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = useMemo(() => {
    const tabParam = searchParams.get('tab')
    if (isTaskDetailTab(tabParam)) {
      return tabParam
    }

    return getDefaultTaskDetailTab(status)
  }, [searchParams, status])

  const setActiveTab = useCallback(
    (tab: TaskDetailTab) => {
      const params = new URLSearchParams(searchParams)
      params.set('tab', tab)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  return {
    activeTab,
    setActiveTab,
  }
}
