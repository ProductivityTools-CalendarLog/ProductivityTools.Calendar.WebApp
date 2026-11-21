import { requestJson } from './calendarsApi'
import type {
  DataPointEventItem,
  DataPointMonthlySummary,
} from '../types/dataPoint'

export async function fetchDataPointMonthlySummary(
  baseUrl: string,
  token: string | null,
  params: {
    account?: string
    fromDay?: string
    toDay?: string
  } = {},
): Promise<DataPointMonthlySummary> {
  const qs = new URLSearchParams()
  if (params.account) qs.set('account', params.account)
  if (params.fromDay) qs.set('fromDay', params.fromDay)
  if (params.toDay) qs.set('toDay', params.toDay)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestJson<DataPointMonthlySummary>(
    baseUrl,
    `/api/data-points/monthly-summary${suffix}`,
    token,
  )
}

export async function queryDataPointEvents(
  baseUrl: string,
  token: string | null,
  params: {
    account?: string
    category?: string
    month?: string
    fromDay?: string
    toDay?: string
  } = {},
): Promise<DataPointEventItem[]> {
  const qs = new URLSearchParams()
  if (params.account) qs.set('account', params.account)
  if (params.category) qs.set('category', params.category)
  if (params.month) qs.set('month', params.month)
  if (params.fromDay) qs.set('fromDay', params.fromDay)
  if (params.toDay) qs.set('toDay', params.toDay)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestJson<DataPointEventItem[]>(
    baseUrl,
    `/api/data-points/events${suffix}`,
    token,
  )
}
