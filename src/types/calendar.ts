export type CalendarType = 'DataPoint' | 'DataLog'

export interface CalendarItem {
  calendarSyncStateId: number
  account: string
  calendarId: string
  calendarName: string | null
  type: CalendarType
  isActive: boolean
  defaultLookbackDays: number
  lastSyncedDate: string | null
  lastSyncedAtUtc: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

export interface CreateCalendarPayload {
  account: string
  calendarId: string
  calendarName?: string | null
  type?: CalendarType
  isActive?: boolean
  defaultLookbackDays?: number
}

export interface UpdateCalendarPayload {
  account: string
  calendarId: string
  calendarName: string | null
  type: CalendarType
  isActive: boolean
  defaultLookbackDays: number
}

export interface ServerDebugStatus {
  online: boolean
  appName?: string
  serverName?: string
  databaseName?: string
}
