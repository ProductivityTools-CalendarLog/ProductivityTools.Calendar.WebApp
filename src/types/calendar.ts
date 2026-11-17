export interface CalendarItem {
  calendarSyncStateId: number
  account: string
  calendarId: string
  calendarName: string | null
  isActive: boolean
  defaultLookbackDays: number
  lastSyncedDate: string | null
  lastSyncedAtUtc: string | null
  pendingBackfillFrom: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

export interface CreateCalendarPayload {
  account: string
  calendarId: string
  calendarName?: string | null
  isActive?: boolean
  defaultLookbackDays?: number
  pendingBackfillFrom?: string | null
}

export interface UpdateCalendarPayload {
  account: string
  calendarId: string
  calendarName: string | null
  isActive: boolean
  defaultLookbackDays: number
  pendingBackfillFrom: string | null
}

export interface ServerDebugStatus {
  online: boolean
  appName?: string
  serverName?: string
}
