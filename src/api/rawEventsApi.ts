import type { RawCalendarEventItem } from '../types/rawEvent'
import { requestJson } from './calendarsApi'

export interface ListRawEventsOptions {
  account?: string
  calendarId?: string
  includeDeleted?: boolean
  limit?: number
}

export async function listRawEvents(
  baseUrl: string,
  token: string | null,
  options: ListRawEventsOptions = {},
): Promise<RawCalendarEventItem[]> {
  const params = new URLSearchParams()
  if (options.account) {
    params.set('account', options.account)
  }
  if (options.calendarId) {
    params.set('calendarId', options.calendarId)
  }
  if (options.includeDeleted) {
    params.set('includeDeleted', 'true')
  }
  params.set('limit', String(options.limit ?? 5000))

  const qs = params.toString()
  return requestJson<RawCalendarEventItem[]>(
    baseUrl,
    `/api/raw-events${qs ? `?${qs}` : ''}`,
    token,
  )
}
