import type {
  CalendarCategoryConfigItem,
  CalendarCategoryRuleItem,
  CalendarLogItem,
  CalendarLogsQuery,
  DailyCategorySummary,
  DailySummaryQuery,
  ReprocessLogsResult,
  UpsertCalendarCategoryPayload,
  UpsertCategoryRulePayload,
  WeeklyCategorySummary,
  WeeklySummaryQuery,
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

export async function listCategoryConfigs(
  baseUrl: string,
  token: string | null,
): Promise<CalendarCategoryConfigItem[]> {
  return requestJson<CalendarCategoryConfigItem[]>(baseUrl, '/api/categories', token)
}

export async function createCategoryConfig(
  baseUrl: string,
  token: string | null,
  payload: UpsertCalendarCategoryPayload,
): Promise<CalendarCategoryConfigItem> {
  return requestJson<CalendarCategoryConfigItem>(baseUrl, '/api/categories', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateCategoryConfig(
  baseUrl: string,
  token: string | null,
  id: number,
  payload: UpsertCalendarCategoryPayload,
): Promise<CalendarCategoryConfigItem> {
  return requestJson<CalendarCategoryConfigItem>(baseUrl, `/api/categories/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function reorderCategoryConfigs(
  baseUrl: string,
  token: string | null,
  orderedCategoryIds: number[],
): Promise<CalendarCategoryConfigItem[]> {
  return requestJson<CalendarCategoryConfigItem[]>(
    baseUrl,
    '/api/categories/reorder',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ orderedCategoryIds }),
    },
  )
}

export async function resetDefaultCategoryConfigs(
  baseUrl: string,
  token: string | null,
): Promise<CalendarCategoryConfigItem[]> {
  return requestJson<CalendarCategoryConfigItem[]>(
    baseUrl,
    '/api/categories/reset-defaults',
    token,
    { method: 'POST' },
  )
}

export async function deleteCategoryConfig(
  baseUrl: string,
  token: string | null,
  id: number,
): Promise<void> {
  return requestJson<void>(baseUrl, `/api/categories/${id}`, token, {
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

export async function queryCalendarLogs(
  baseUrl: string,
  token: string | null,
  query: CalendarLogsQuery,
): Promise<CalendarLogItem[]> {
  const params = new URLSearchParams()
  if (query.account) params.set('account', query.account)
  if (query.fromDay) params.set('fromDay', query.fromDay)
  if (query.toDay) params.set('toDay', query.toDay)
  if (query.weekNumber !== undefined) params.set('weekNumber', String(query.weekNumber))
  if (query.category) params.set('category', query.category)
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return requestJson<CalendarLogItem[]>(
    baseUrl,
    `/api/calendar-logs${qs ? `?${qs}` : ''}`,
    token,
  )
}

export async function fetchDailySummary(
  baseUrl: string,
  token: string | null,
  query: DailySummaryQuery = {},
): Promise<DailyCategorySummary> {
  const params = new URLSearchParams()
  if (query.account) params.set('account', query.account)
  if (query.fromDay) params.set('fromDay', query.fromDay)
  if (query.toDay) params.set('toDay', query.toDay)
  if (query.includeUncategorized !== undefined) {
    params.set('includeUncategorized', String(query.includeUncategorized))
  }
  const qs = params.toString()
  return requestJson<DailyCategorySummary>(
    baseUrl,
    `/api/calendar-logs/daily-summary${qs ? `?${qs}` : ''}`,
    token,
  )
}

export async function fetchWeeklySummary(
  baseUrl: string,
  token: string | null,
  query: WeeklySummaryQuery = {},
): Promise<WeeklyCategorySummary> {
  const params = new URLSearchParams()
  if (query.account) params.set('account', query.account)
  if (query.fromDay) params.set('fromDay', query.fromDay)
  if (query.toDay) params.set('toDay', query.toDay)
  if (query.fromWeek !== undefined) params.set('fromWeek', String(query.fromWeek))
  if (query.toWeek !== undefined) params.set('toWeek', String(query.toWeek))
  if (query.includeUncategorized !== undefined) {
    params.set('includeUncategorized', String(query.includeUncategorized))
  }
  const qs = params.toString()
  return requestJson<WeeklyCategorySummary>(
    baseUrl,
    `/api/calendar-logs/weekly-summary${qs ? `?${qs}` : ''}`,
    token,
  )
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
