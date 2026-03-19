export function getInitials(name: string | undefined | null, maxChars = 2): string {
  if (!name || !name.trim()) return '?'
  return name.trim().split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, maxChars)
}

export function formatDate(dateStr: string, locale = 'en-US'): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string, locale = 'en-US'): string {
  try {
    return new Date(dateStr).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}
