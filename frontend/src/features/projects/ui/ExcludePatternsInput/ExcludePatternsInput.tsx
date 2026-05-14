import { TagInput } from '@/shared/ui/TagInput/TagInput'

interface ExcludePatternsInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  error?: boolean
}

export function ExcludePatternsInput({
  value,
  onChange,
  placeholder,
  error = false,
}: ExcludePatternsInputProps) {
  return <TagInput value={value} onChange={onChange} placeholder={placeholder} error={error} />
}
