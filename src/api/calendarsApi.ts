import type {
  CalendarItem,
  CreateCalendarPayload,
  ServerDebugStatus,
  UpdateCalendarPayload,
} from '../types/calendar'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) {
      return `HTTP ${response.status}`
    }
    try {
      const parsed = JSON.parse(text) as { message?: string; title?: string }
      if (parsed.message) return parsed.message
      if (parsed.title) return parsed.title
    } catch {
      // Plain text error body
    }
    return text
  } catch {
    return `HTTP ${response.status}`
  }
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(401, 'Sesja wygasła lub brak autoryzacji (401). Zaloguj się ponownie.')
    }
    if (response.status === 403) {
      throw new ApiError(
        403,
        'Brak dostępu (403). Upewnij się, że logujesz się kontem z listy Security:AllowedEmails.',
      )
    }
    const details = await readErrorMessage(response)
    throw new ApiError(response.status, details)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function listCalendars(
  baseUrl: string,
  token: string | null,
  account?: string,
): Promise<CalendarItem[]> {
  const query = account ? `?account=${encodeURIComponent(account)}` : ''
  return requestJson<CalendarItem[]>(baseUrl, `/api/calendars${query}`, token)
}

export async function createCalendar(
  baseUrl: string,
  token: string | null,
  payload: CreateCalendarPayload,
): Promise<CalendarItem> {
  return requestJson<CalendarItem>(baseUrl, '/api/calendars', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateCalendar(
  baseUrl: string,
  token: string | null,
  id: number,
  payload: UpdateCalendarPayload,
): Promise<CalendarItem> {
  return requestJson<CalendarItem>(baseUrl, `/api/calendars/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function setCalendarActive(
  baseUrl: string,
  token: string | null,
  id: number,
  isActive: boolean,
): Promise<CalendarItem> {
  return requestJson<CalendarItem>(baseUrl, `/api/calendars/${id}/active`, token, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
}

export async function deleteCalendar(
  baseUrl: string,
  token: string | null,
  id: number,
): Promise<void> {
  return requestJson<void>(baseUrl, `/api/calendars/${id}`, token, {
    method: 'DELETE',
  })
}

export async function fetchServerStatus(baseUrl: string): Promise<ServerDebugStatus> {
  try {
    const [appResp, serverResp] = await Promise.all([
      fetch(`${baseUrl}/api/debug/appname`),
      fetch(`${baseUrl}/api/debug/servername`),
    ])

    if (!appResp.ok) {
      return { online: false }
    }

    const appName = (await appResp.text()).replace(/^"|"$/g, '').trim()
    const serverName = serverResp.ok
      ? (await serverResp.text()).replace(/^"|"$/g, '').trim()
      : undefined

    return { online: true, appName, serverName }
  } catch {
    return { online: false }
  }
}
