import type { ReactNode } from 'react'
import { toast as sonnerToast } from 'sonner'

type SonnerToast = typeof sonnerToast
type PromiseToastInput<T> = Promise<T> | (() => Promise<T>)
type PromiseToastResolver<T> = ReactNode | ((value: T) => ReactNode | null | undefined) | null

interface PromiseToastMessages<T> {
  loading: ReactNode
  success?: PromiseToastResolver<T>
  error?: PromiseToastResolver<unknown>
}

function resolveToastMessage<T>(
  resolver: PromiseToastResolver<T> | undefined,
  value: T,
): ReactNode | null | undefined {
  if (typeof resolver === 'function') {
    return resolver(value)
  }

  return resolver
}

async function promise<T>(input: PromiseToastInput<T>, messages: PromiseToastMessages<T>) {
  const toastId = sonnerToast.loading(messages.loading)

  try {
    const value = await (typeof input === 'function' ? input() : input)
    const successMessage = resolveToastMessage(messages.success, value)

    if (successMessage == null) {
      sonnerToast.dismiss(toastId)
    } else {
      sonnerToast.success(successMessage, { id: toastId })
    }

    return value
  } catch (error) {
    const errorMessage = resolveToastMessage(messages.error, error)

    if (errorMessage == null) {
      sonnerToast.dismiss(toastId)
    } else {
      sonnerToast.error(errorMessage, { id: toastId })
    }

    throw error
  }
}

export const toast: Omit<SonnerToast, 'promise'> & { promise: typeof promise } = Object.assign(
  sonnerToast,
  { promise },
)
