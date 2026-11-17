export type CategoryMatchField = 'TitlePrefix' | 'Title' | 'Color' | 'CalendarName'

export interface CalendarCategoryRuleItem {
  calendarCategoryRuleId: number
  account: string
  calendarId: string
  priority: number
  matchField: CategoryMatchField
  matchValue: string
  category: string
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

export interface UpsertCategoryRulePayload {
  account: string
  calendarId: string
  priority: number
  matchField: CategoryMatchField
  matchValue: string
  category: string
  isActive: boolean
}

export interface CalendarLogItem {
  calendarLogId: number
  rawCalendarEventId: number | null
  source: string
  account: string
  calendarId: string | null
  calendarName: string
  startTime: string
  endTime: string
  day: string
  weekNumber: number
  month: string
  durationHours: number
  title: string | null
  myStatus: string | null
  eventType: string | null
  color: string | null
  category: string | null
  value: string | null
}

export interface ReprocessLogsResult {
  rawEventsEvaluated: number
  logsUpserted: number
  logsRemovedOrSkipped: number
}
