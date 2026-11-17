import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/calendarsApi'
import { deleteAllRawEvents, listRawEvents } from '../api/rawEventsApi'
import { useAuth } from '../auth/useAuth'
import type { RawCalendarEventItem } from '../types/rawEvent'

interface RawEventsPageProps {
  apiUrl: string
}

const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit',
  minute: '2-digit',
})

function formatEventWindow(item: RawCalendarEventItem): { dateLabel: string; timeLabel: string; durationLabel: string } {
  const start = new Date(item.startTime)
  const end = new Date(item.endTime)
  const diffMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))

  if (item.isAllDay) {
    const days = Math.max(1, Math.round(diffMinutes / 1440))
    return {
      dateLabel: dateFormatter.format(start),
      timeLabel: 'Cały dzień',
      durationLabel: days === 1 ? '1 dzień' : `${days} dni`,
    }
  }

  const hours = Math.floor(diffMinutes / 60)
  const mins = diffMinutes % 60
  const durationLabel =
    hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`

  return {
    dateLabel: dateFormatter.format(start),
    timeLabel: `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`,
    durationLabel,
  }
}

function formatPrettyJson(raw: string | null): string {
  if (!raw) return '(brak RawJson)'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function RawEventsPage({ apiUrl }: RawEventsPageProps) {
  const { getIdToken, signOut } = useAuth()
  const [events, setEvents] = useState<RawCalendarEventItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false)
  const [clearingAll, setClearingAll] = useState<boolean>(false)

  const [accountFilter, setAccountFilter] = useState<string>('ALL')
  const [calendarFilter, setCalendarFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(false)
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null)

  const reloadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const items = await listRawEvents(apiUrl, token, {
        includeDeleted,
        limit: 5000,
      })
      setEvents(items)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się pobrać listy eventów.')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, getIdToken, includeDeleted, signOut])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getIdToken()
        const items = await listRawEvents(apiUrl, token, {
          includeDeleted,
          limit: 5000,
        })
        if (!cancelled) {
          setEvents(items)
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setError((err as Error)?.message || 'Nie udało się pobrać listy eventów.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [apiUrl, getIdToken, includeDeleted, signOut])

  const accounts = useMemo(
    () => Array.from(new Set(events.map((e) => e.account))).sort(),
    [events],
  )

  const calendars = useMemo(() => {
    const base = accountFilter === 'ALL' ? events : events.filter((e) => e.account === accountFilter)
    const map = new Map<string, string>()
    for (const ev of base) {
      if (!map.has(ev.calendarId)) {
        map.set(ev.calendarId, ev.calendarName || ev.calendarId)
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [accountFilter, events])

  const filteredEvents = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return events.filter((ev) => {
      if (accountFilter !== 'ALL' && ev.account !== accountFilter) return false
      if (calendarFilter !== 'ALL' && ev.calendarId !== calendarFilter) return false
      if (!needle) return true
      return (
        (ev.title ?? '').toLowerCase().includes(needle) ||
        ev.calendarName.toLowerCase().includes(needle) ||
        ev.externalEventId.toLowerCase().includes(needle) ||
        (ev.eventType ?? '').toLowerCase().includes(needle)
      )
    })
  }, [accountFilter, calendarFilter, events, searchQuery])

  const handleDeleteAll = async () => {
    setClearingAll(true)
    setError(null)
    try {
      const token = await getIdToken()
      const res = await deleteAllRawEvents(apiUrl, token)
      setEvents([])
      setExpandedEventId(null)
      setConfirmClearAll(false)
      setNotice(`Usunięto ${res.deletedCount} eventów z tabeli RawCalendarEvent.`)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się wyczyścić tabeli eventów.')
    } finally {
      setClearingAll(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pobrane eventy</h1>
          <p className="page-description">
            Surowe wpisy z tabeli <code>dbo.RawCalendarEvent</code> pobrane z Google Calendar API v3
            (widoczne {filteredEvents.length} z {events.length}).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {confirmClearAll ? (
            <>
              <button
                id="confirm-clear-raw-events-button"
                type="button"
                className="btn btn-danger"
                style={{ height: '38px', padding: '0 1rem', fontSize: '0.86rem' }}
                onClick={() => void handleDeleteAll()}
                disabled={clearingAll}
              >
                {clearingAll ? 'Kasowanie…' : `Potwierdź usunięcie wszystkich (${events.length})`}
              </button>
              <button
                id="cancel-clear-raw-events-button"
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmClearAll(false)}
                disabled={clearingAll}
              >
                Anuluj
              </button>
            </>
          ) : (
            <button
              id="clear-raw-events-button"
              type="button"
              className="btn btn-danger"
              style={{ height: '38px', padding: '0 1rem', fontSize: '0.86rem' }}
              onClick={() => {
                setNotice(null)
                setConfirmClearAll(true)
              }}
              disabled={loading || clearingAll || events.length === 0}
            >
              Wyczyść tabelę eventów
            </button>
          )}

          <button
            id="refresh-raw-events-button"
            type="button"
            className="btn btn-secondary"
            onClick={() => void reloadEvents()}
            disabled={loading || clearingAll}
          >
            {loading ? 'Pobieranie…' : 'Odśwież'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success" role="status">
          <span>{notice}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setNotice(null)}>
            Zamknij
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void reloadEvents()}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      <section className="panel" aria-label="Filtry i lista pobranych eventów">
        <div className="panel-header">
          <div className="events-toolbar">
            <input
              id="raw-events-search-input"
              type="search"
              className="input events-search"
              placeholder="Szukaj po tytule, kalendarzu lub ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              id="raw-events-calendar-filter"
              className="input events-select"
              value={calendarFilter}
              onChange={(e) => setCalendarFilter(e.target.value)}
            >
              <option value="ALL">Wszystkie kalendarze ({calendars.length})</option>
              {calendars.map(([calId, calName]) => (
                <option key={calId} value={calId}>
                  {calName}
                </option>
              ))}
            </select>

            <label className="switch" style={{ marginLeft: '0.25rem' }}>
              <input
                id="include-deleted-checkbox"
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-label">Pokaż soft-deleted</span>
            </label>
          </div>

          {accounts.length > 0 && (
            <div className="filter-bar">
              <button
                type="button"
                className={`filter-pill ${accountFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setAccountFilter('ALL')
                  setCalendarFilter('ALL')
                }}
              >
                <span>Wszystkie konta</span>
                <span className="filter-count">{events.length}</span>
              </button>
              {accounts.map((acc) => {
                const count = events.filter((e) => e.account === acc).length
                return (
                  <button
                    key={acc}
                    type="button"
                    className={`filter-pill ${accountFilter === acc ? 'active' : ''}`}
                    onClick={() => {
                      setAccountFilter(acc)
                      setCalendarFilter('ALL')
                    }}
                  >
                    <span>{acc}</span>
                    <span className="filter-count">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {loading && events.length === 0 ? (
          <div className="empty-state">Ładowanie pobranych eventów…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Brak eventów do wyświetlenia</div>
            <p>
              {events.length === 0
                ? 'Tabela RawCalendarEvent jest obecnie pusta — uruchom synchronizację w Apps Script.'
                : 'Żaden event nie pasuje do wybranych filtrów.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="cal-table">
              <thead>
                <tr>
                  <th>Data i czas</th>
                  <th>Tytuł</th>
                  <th>Kalendarz / Konto</th>
                  <th>Typ / Status</th>
                  <th>Przetwarzanie</th>
                  <th style={{ textAlign: 'right' }}>Szczegóły</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((ev) => {
                  const win = formatEventWindow(ev)
                  const isExpanded = expandedEventId === ev.rawCalendarEventId

                  return (
                    <Fragment key={ev.rawCalendarEventId}>
                      <tr className={ev.isDeleted ? 'cal-row-inactive' : undefined}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600 }}>{win.dateLabel}</div>
                          <div className="field-hint" style={{ fontFamily: 'var(--font-mono)' }}>
                            {win.timeLabel} · {win.durationLabel}
                          </div>
                        </td>

                        <td>
                          <div className="cal-name">
                            {ev.title ? (
                              ev.title
                            ) : (
                              <span className="cal-name-placeholder">(Bez tytułu)</span>
                            )}
                          </div>
                          <div className="cal-id-row">
                            <code className="cal-id-code">{ev.externalEventId}</code>
                            {ev.isAllDay && <span className="badge badge-neutral">Całodniowy</span>}
                            {ev.isRecurring && <span className="badge badge-neutral">Cykliczny</span>}
                            {ev.isDeleted && <span className="badge badge-danger">Usunięty</span>}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 500 }}>{ev.calendarName}</div>
                          <div style={{ marginTop: '0.2rem' }}>
                            <span className="account-badge">{ev.account}</span>
                          </div>
                        </td>

                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '0.82rem' }}>{ev.eventType || 'default'}</div>
                          <div className="field-hint">
                            {ev.myStatus || '—'}
                            {ev.color ? ` · color:${ev.color}` : ''}
                          </div>
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              ev.processingStatus === 'PROCESSED'
                                ? 'badge-synced'
                                : ev.processingStatus === 'ERROR'
                                  ? 'badge-danger'
                                  : 'badge-pending'
                            }`}
                          >
                            {ev.processingStatus}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            id={`toggle-json-${ev.rawCalendarEventId}`}
                            type="button"
                            className="btn btn-ghost"
                            onClick={() =>
                              setExpandedEventId(isExpanded ? null : ev.rawCalendarEventId)
                            }
                          >
                            {isExpanded ? 'Ukryj JSON' : 'Raw JSON'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="json-drawer">
                              <pre className="json-pre">{formatPrettyJson(ev.rawJson)}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
