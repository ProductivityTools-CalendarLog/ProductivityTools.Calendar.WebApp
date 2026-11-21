export interface DataPointMonthBucket {
  month: string
  totalCount: number
  byValue: Record<string, number>
}

export interface DataPointCategoryChart {
  category: string
  totalCount: number
  values: string[]
  months: DataPointMonthBucket[]
}

export interface DataPointMonthlySummary {
  dataPointCalendars: string[]
  totalEvents: number
  categories: DataPointCategoryChart[]
}

export interface DataPointEventItem {
  rawCalendarEventId: number
  account: string
  calendarId: string
  calendarName: string
  day: string
  month: string
  startTime: string
  endTime: string
  isAllDay: boolean
  title: string | null
  category: string
  value: string
}
