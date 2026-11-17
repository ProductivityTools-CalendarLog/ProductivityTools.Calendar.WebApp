const STORAGE_KEY = 'pt_calendar_api_url'

export interface ApiTargetOption {
  label: string
  url: string
}

export const API_TARGETS: readonly ApiTargetOption[] = [
  { label: 'Prod (calendarlog-api)', url: 'https://calendarlog-api.productivitytools.top' },
  { label: 'm900', url: 'https://calendarlog-api-m900.productivitytools.top' },
  { label: 'm710q', url: 'https://calendarlog-api-m710q.productivitytools.top' },
  { label: 'Local (:5188)', url: 'http://localhost:5188' },
]

const defaultApiUrl = (
  import.meta.env.VITE_API_URL || 'https://calendarlog-api.productivitytools.top'
).replace(/\/+$/, '')

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved.trim() !== '') {
      return saved.trim().replace(/\/+$/, '')
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return defaultApiUrl
}

export function setApiBaseUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''))
  } catch {
    // Ignore storage errors
  }
}
