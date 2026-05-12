export function getInitials(name: string | null | undefined): string {
  const normalized = name?.trim()
  if (!normalized) {
    return '?'
  }

  const compact = normalized.replace(/\s+/g, ' ')
  if (compact.length <= 3 && !compact.includes(' ')) {
    return compact.toUpperCase()
  }

  const parts = compact.split(' ').filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }

  const first = parts[0]?.[0]
  const last = parts.length > 1 ? parts.at(-1)?.[0] : parts[0]?.[1]
  const initials = `${first ?? ''}${last ?? ''}`.trim()

  return initials ? initials.toUpperCase() : '?'
}
