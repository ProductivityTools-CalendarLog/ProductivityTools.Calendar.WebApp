import type {
  CalendarConvertRuleItem,
  CalendarTitleRenameRuleItem,
  CalendarValueRenameRuleItem,
  UpsertConvertRulePayload,
  UpsertTitleRenameRulePayload,
  UpsertValueRenameRulePayload,
} from '../types/mutationRule'
import { requestJson } from './calendarsApi'

export async function listConvertRules(
  baseUrl: string,
  token: string | null,
  account?: string,
): Promise<CalendarConvertRuleItem[]> {
  const qs = account ? `?account=${encodeURIComponent(account)}` : ''
  return requestJson<CalendarConvertRuleItem[]>(
    baseUrl,
    `/api/mutation-rules/convert${qs}`,
    token,
  )
}

export async function upsertConvertRule(
  baseUrl: string,
  token: string | null,
  payload: UpsertConvertRulePayload,
): Promise<CalendarConvertRuleItem> {
  return requestJson<CalendarConvertRuleItem>(baseUrl, '/api/mutation-rules/convert', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateConvertRule(
  baseUrl: string,
  token: string | null,
  id: number,
  payload: UpsertConvertRulePayload,
): Promise<CalendarConvertRuleItem> {
  return requestJson<CalendarConvertRuleItem>(
    baseUrl,
    `/api/mutation-rules/convert/${id}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteConvertRule(
  baseUrl: string,
  token: string | null,
  id: number,
): Promise<void> {
  return requestJson<void>(baseUrl, `/api/mutation-rules/convert/${id}`, token, {
    method: 'DELETE',
  })
}

export async function listTitleRenameRules(
  baseUrl: string,
  token: string | null,
  account?: string,
  calendarId?: string,
): Promise<CalendarTitleRenameRuleItem[]> {
  const params = new URLSearchParams()
  if (account) params.set('account', account)
  if (calendarId) params.set('calendarId', calendarId)
  const qs = params.toString()

  return requestJson<CalendarTitleRenameRuleItem[]>(
    baseUrl,
    `/api/mutation-rules/title-rename${qs ? `?${qs}` : ''}`,
    token,
  )
}

export async function upsertTitleRenameRule(
  baseUrl: string,
  token: string | null,
  payload: UpsertTitleRenameRulePayload,
): Promise<CalendarTitleRenameRuleItem> {
  return requestJson<CalendarTitleRenameRuleItem>(
    baseUrl,
    '/api/mutation-rules/title-rename',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export async function updateTitleRenameRule(
  baseUrl: string,
  token: string | null,
  id: number,
  payload: UpsertTitleRenameRulePayload,
): Promise<CalendarTitleRenameRuleItem> {
  return requestJson<CalendarTitleRenameRuleItem>(
    baseUrl,
    `/api/mutation-rules/title-rename/${id}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteTitleRenameRule(
  baseUrl: string,
  token: string | null,
  id: number,
): Promise<void> {
  return requestJson<void>(baseUrl, `/api/mutation-rules/title-rename/${id}`, token, {
    method: 'DELETE',
  })
}

export async function listValueRenameRules(
  baseUrl: string,
  token: string | null,
  account?: string,
  calendarId?: string,
): Promise<CalendarValueRenameRuleItem[]> {
  const params = new URLSearchParams()
  if (account) params.set('account', account)
  if (calendarId) params.set('calendarId', calendarId)
  const qs = params.toString()

  return requestJson<CalendarValueRenameRuleItem[]>(
    baseUrl,
    `/api/mutation-rules/value-rename${qs ? `?${qs}` : ''}`,
    token,
  )
}

export async function upsertValueRenameRule(
  baseUrl: string,
  token: string | null,
  payload: UpsertValueRenameRulePayload,
): Promise<CalendarValueRenameRuleItem> {
  return requestJson<CalendarValueRenameRuleItem>(
    baseUrl,
    '/api/mutation-rules/value-rename',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export async function updateValueRenameRule(
  baseUrl: string,
  token: string | null,
  id: number,
  payload: UpsertValueRenameRulePayload,
): Promise<CalendarValueRenameRuleItem> {
  return requestJson<CalendarValueRenameRuleItem>(
    baseUrl,
    `/api/mutation-rules/value-rename/${id}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteValueRenameRule(
  baseUrl: string,
  token: string | null,
  id: number,
): Promise<void> {
  return requestJson<void>(baseUrl, `/api/mutation-rules/value-rename/${id}`, token, {
    method: 'DELETE',
  })
}
