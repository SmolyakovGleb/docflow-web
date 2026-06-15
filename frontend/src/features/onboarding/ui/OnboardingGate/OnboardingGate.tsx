import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { redirectToGithubConnect } from '@/features/auth/lib/redirectToGithubConnect'
import { selectUser } from '@/features/auth/model/authSlice'
import { useGetProjectsQuery } from '@/features/projects/api/projectsApi'
import { useAppSelector } from '@/shared/store/hooks'
import {
  markOnboardingDismissed,
  readOnboardingStatus,
  subscribeToOnboardingStatus,
} from '../../lib/onboardingStorage'
import { OnboardingDialog } from '../OnboardingDialog/OnboardingDialog'

export function OnboardingGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAppSelector(selectUser)
  const { data: projects = [], isLoading, isError } = useGetProjectsQuery()
  const [, setStatusVersion] = useState(0)

  useEffect(() => {
    return subscribeToOnboardingStatus(() => {
      setStatusVersion((version) => version + 1)
    })
  }, [])

  const status = readOnboardingStatus(user?.id)

  const isSuppressedRoute = location.pathname === '/repositories/new'

  const step = useMemo(() => {
    if (!user || user.github_linked) {
      return 2 as const
    }

    return 1 as const
  }, [user])

  if (!user || isLoading || isError || isSuppressedRoute || status !== 'idle') {
    return null
  }

  if (user.github_linked && projects.length > 0) {
    return null
  }

  return (
    <OnboardingDialog
      open
      step={step}
      onSkip={() => {
        markOnboardingDismissed(user.id)
      }}
      onConnectGithub={() => {
        redirectToGithubConnect()
      }}
      onCreateProject={() => {
        void navigate('/repositories/new?onboarding=1')
      }}
      onTranslateManually={() => {
        markOnboardingDismissed(user.id)
        void navigate('/tasks?translate=upload')
      }}
    />
  )
}
