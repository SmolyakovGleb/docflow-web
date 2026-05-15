export type OnboardingStatus = 'idle' | 'dismissed' | 'completed'

const STORAGE_KEY_PREFIX = 'docflow.onboarding.status'
const STATUS_EVENT = 'docflow:onboarding-status'

function getStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`
}

export function readOnboardingStatus(userId?: string | null): OnboardingStatus {
  if (typeof window === 'undefined') {
    return 'idle'
  }

  if (!userId) {
    return 'idle'
  }

  const value = window.localStorage.getItem(getStorageKey(userId))
  return value === 'dismissed' || value === 'completed' ? value : 'idle'
}

function notifyStatusChange() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(STATUS_EVENT))
}

export function setOnboardingStatus(
  userId: string | null | undefined,
  status: Exclude<OnboardingStatus, 'idle'>,
) {
  if (typeof window === 'undefined') {
    return
  }

  if (!userId) {
    return
  }

  window.localStorage.setItem(getStorageKey(userId), status)
  notifyStatusChange()
}

export function markOnboardingDismissed(userId: string | null | undefined) {
  setOnboardingStatus(userId, 'dismissed')
}

export function markOnboardingCompleted(userId: string | null | undefined) {
  setOnboardingStatus(userId, 'completed')
}

export function clearOnboardingStatus(userId?: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (userId) {
    window.localStorage.removeItem(getStorageKey(userId))
    notifyStatusChange()
    return
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(`${STORAGE_KEY_PREFIX}:`)) {
      window.localStorage.removeItem(key)
    }
  }

  notifyStatusChange()
}

export function subscribeToOnboardingStatus(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleStatusChange = () => listener()

  window.addEventListener(STATUS_EVENT, handleStatusChange)

  return () => {
    window.removeEventListener(STATUS_EVENT, handleStatusChange)
  }
}
