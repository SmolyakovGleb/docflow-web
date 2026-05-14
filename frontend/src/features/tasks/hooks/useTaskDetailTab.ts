import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getAvailableTaskDetailTabs,
  getDefaultTaskDetailTab,
  isTaskDetailTab,
  type TaskDetailTab,
  type TaskStatus,
} from '../model/types'

export function useTaskDetailTab(status?: TaskStatus | null) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')

  const activeTab = useMemo(
    () =>
      status && isTaskDetailTab(tabParam, status)
        ? tabParam
        : status
          ? getDefaultTaskDetailTab(status)
          : 'diff',
    [status, tabParam],
  )

  useEffect(() => {
    if (!status || tabParam === activeTab) {
      return
    }

    const params = new URLSearchParams(searchParams)
    params.set('tab', activeTab)
    setSearchParams(params, { replace: true })
  }, [activeTab, searchParams, setSearchParams, status, tabParam])

  const setActiveTab = useCallback(
    (tab: TaskDetailTab) => {
      const resolvedTab = status
        ? getAvailableTaskDetailTabs(status).includes(tab)
          ? tab
          : getDefaultTaskDetailTab(status)
        : isTaskDetailTab(tab)
          ? tab
          : 'diff'
      const params = new URLSearchParams(searchParams)
      params.set('tab', resolvedTab)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams, status],
  )

  return {
    activeTab,
    setActiveTab,
  }
}
