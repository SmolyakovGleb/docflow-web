import type { ComponentProps } from 'react'
import { Input } from '@/shared/ui/Input/Input'

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'>

export function PasswordInput(props: PasswordInputProps) {
  return <Input type="password" {...props} />
}
