import type {
  CalendarCategoryRuleItem,
  CalendarLogItem,
  ReprocessLogsResult,
  UpsertCategoryRulePayload,
} from '../types/categoryRule'
import { requestJson } from './calendarsApi'

export async function listCategoryRules(
  baseUrl: string,
  token: string | null,
  account?: string,
): Promise<CalendarCategoryRuleItem[]> {
  const qs = account ? `?account=${encodeURIComponent(account)}` : ''
  return requestJson<CalendarCategoryRuleItem[]>(baseUrl, `/api/category-rules${qs}`, token)
}

export async function createCategoryRule(
  baseUrl: string,
  token: string | null,
  payload: UpsertCategoryRulePayload,
): Promise<CalendarCategoryRuleItem> {
  return requestJson<CalendarCategoryRuleItem>(baseUrl, '/api/category-rules', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateCategoryRule(
  baseUrl: string,
  token: string | null,
  id: number,
  payload: UpsertCategoryRulePayload,
): Promise<CalendarCategoryRuleItem> {
  return requestJson<CalendarCategoryRuleItem>(baseUrl, `/api/category-rules/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteCategoryRule(
  baseUrl: string,
  token: string | null,
  id: number,
): Promise<void> {
  return requestJson<void>(baseUrl, `/api/category-rules/${id}`, token, {
    method: 'DELETE',
  })
}

export async function listCalendarLogs(
  baseUrl: string,
  token: string | null,
  limit = 500,
): Promise<CalendarLogItem[]> {
  return requestJson<CalendarLogItem[]>(baseUrl, `/api/calendar-logs?limit=${limit}`, token)
}

export async function reprocessCalendarLogs(
  baseUrl: string,
  token: string | null,
  account?: string,
): Promise<ReprocessLogsResult> {
  const qs = account ? `?account=${encodeURIComponent(account)}` : ''
  return requestJson<ReprocessLogsResult>(
    baseUrl,
    `/api/calendar-logs/reprocess${qs}`,
    token,
    { method: 'POST' },
  )
}
