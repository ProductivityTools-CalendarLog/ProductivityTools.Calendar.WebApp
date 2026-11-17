export interface RawCalendarEventItem {
  rawCalendarEventId: number
  account: string
  calendarId: string
  calendarName: string
  externalEventId: string
  iCalUid: string | null
  startTime: string
  endTime: string
  isAllDay: boolean
  isRecurring: boolean
  title: string | null
  description: string | null
  location: string | null
  myStatus: string | null
  eventStatus: string | null
  eventType: string | null
  color: string | null
  isOwnedByMe: boolean | null
  guestCount: number
  guestsJson: string | null
  eventCreatedAt: string | null
  eventUpdatedAt: string | null
  rawJson: string | null
  isDeleted: boolean
  processingStatus: string
  errorMessage: string | null
  createdAtUtc: string
  updatedAtUtc: string
  processedAtUtc: string | null
}
