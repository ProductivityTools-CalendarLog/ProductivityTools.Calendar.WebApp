export interface CalendarConvertRuleItem {
  calendarConvertRuleId: number
  account: string
  keyPrefix: string
  targetCalendarId: string
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

export interface UpsertConvertRulePayload {
  account: string
  keyPrefix: string
  targetCalendarId: string
  isActive: boolean
}

export interface CalendarTitleRenameRuleItem {
  calendarTitleRenameRuleId: number
  account: string
  calendarId: string
  keyPrefix: string
  targetPrefix: string
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

export interface UpsertTitleRenameRulePayload {
  account: string
  calendarId: string
  keyPrefix: string
  targetPrefix: string
  isActive: boolean
}
