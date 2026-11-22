import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { API_TARGETS } from '../config/apiConfig'
import {
  statusService,
  type StatusEntryType,
  type StatusState,
} from '../services/statusService'
import type { ServerDebugStatus } from '../types/calendar'

interface TechnicalBarProps {
  userEmail: string | null
  apiUrl: string
  onChangeApiUrl: (nextUrl: string) => void
  serverStatus: ServerDebugStatus | null
  onRefreshServerStatus: () => void
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateTime(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return 'pending...'
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatTime(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function StatusIcon({ type }: { type?: StatusEntryType }) {
  switch (type) {
    case 'pending':
      return <span className="techbar-spinner" aria-hidden="true" />
    case 'success':
      return (
        <svg className="techbar-icon" viewBox="0 0 24 24" fill="none" stroke="#777" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.5l2.3 2.3 4.7-4.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'error':
      return (
        <svg className="techbar-icon" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4.5M12 16h.01" strokeLinecap="round" />
        </svg>
      )
    case 'warn':
      return (
        <svg className="techbar-icon" viewBox="0 0 24 24" fill="none" stroke="#ed6c02" strokeWidth="2" aria-hidden="true">
          <path d="M12 4L3 20h18L12 4z" strokeLinejoin="round" />
          <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
        </svg>
      )
    case 'info':
      return (
        <svg className="techbar-icon" viewBox="0 0 24 24" fill="none" stroke="#777" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
        </svg>
      )
    default:
      return <span className="techbar-dot techbar-dot-neutral" aria-hidden="true" />
  }
}

export function TechnicalBar({
  userEmail,
  apiUrl,
  onChangeApiUrl,
  serverStatus,
  onRefreshServerStatus,
}: TechnicalBarProps) {
  const { tokenRefreshTime, refreshToken } = useAuth()
  const [isRefreshingToken, setIsRefreshingToken] = useState(false)
  const [statusState, setStatusState] = useState<StatusState>(() => statusService.getState())
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return statusService.subscribe((next) => {
      setStatusState(next)
    })
  }, [])

  useEffect(() => {
    if (!popoverOpen) return

    const handleMouseDown = (e: MouseEvent) => {
      if (popoverWrapRef.current && !popoverWrapRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [popoverOpen])

  const handleForceTokenRefresh = async () => {
    try {
      setIsRefreshingToken(true)
      statusService.info('Forced token refresh requested')
      await refreshToken()
      statusService.success('Token refreshed successfully')
    } catch {
      statusService.error('Token refresh failed')
    } finally {
      setIsRefreshingToken(false)
    }
  }

  const handleEnvChange = (nextUrl: string) => {
    const label = API_TARGETS.find((t) => t.url === nextUrl)?.label ?? nextUrl
    statusService.info(`Switched environment to ${label}`)
    onChangeApiUrl(nextUrl)
  }

  const current = statusState.current
  const history = statusState.history

  const statusText = current
    ? `[${formatTime(current.timestamp)}] ${current.message}${
        current.durationMs != null ? ` (${current.durationMs}ms)` : ''
      }`
    : 'Ready'

  const statusColorClass =
    current?.type === 'pending'
      ? 'techbar-msg-pending'
      : current?.type === 'error'
        ? 'techbar-msg-error'
        : current?.type === 'warn'
          ? 'techbar-msg-warn'
          : 'techbar-msg-default'

  const dbLabel = (() => {
    if (serverStatus === null) return 'Łączenie…'
    if (!serverStatus.online) return 'API Offline'
    const parts: string[] = []
    if (serverStatus.serverName) parts.push(serverStatus.serverName)
    if (serverStatus.databaseName) parts.push(serverStatus.databaseName)
    if (parts.length > 0) return parts.join(' / ')
    return serverStatus.appName || 'Online'
  })()

  const dbTooltip =
    serverStatus === null
      ? `Sprawdzanie połączenia z ${apiUrl}`
      : serverStatus.online
        ? [
            `API: ${apiUrl}`,
            serverStatus.appName ? `App: ${serverStatus.appName}` : null,
            serverStatus.serverName ? `SQL Server: ${serverStatus.serverName}` : null,
            serverStatus.databaseName ? `Database: ${serverStatus.databaseName}` : null,
          ]
            .filter(Boolean)
            .join(' • ')
        : `Brak połączenia z API (${apiUrl})`

  return (
    <div className="techbar" role="region" aria-label="Pasek techniczny">
      {/* Left: Session + Environment selector + Database / SQL Server */}
      <div className="techbar-group">
        {userEmail && (
          <>
            <span
              className={`techbar-dot ${
                serverStatus === null
                  ? 'techbar-dot-neutral'
                  : serverStatus.online
                    ? 'techbar-dot-online'
                    : 'techbar-dot-offline'
              }`}
              aria-hidden="true"
            />
            <span>
              Session: <strong className="techbar-strong">{userEmail}</strong>
            </span>
            <span className="techbar-divider" aria-hidden="true" />
          </>
        )}

        <label htmlFor="techbar-env-select" className="techbar-inline-field">
          <span className="techbar-muted">Env:</span>
          <select
            id="techbar-env-select"
            aria-label="Wybór środowiska API"
            className="techbar-select"
            value={apiUrl}
            onChange={(e) => handleEnvChange(e.target.value)}
          >
            {API_TARGETS.map((opt) => (
              <option key={opt.url} value={opt.url}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <span className="techbar-divider" aria-hidden="true" />

        <div className="techbar-db" title={dbTooltip}>
          <span
            className={`techbar-dot ${
              serverStatus === null
                ? 'techbar-dot-neutral'
                : serverStatus.online
                  ? 'techbar-dot-online'
                  : 'techbar-dot-offline'
            }`}
            aria-hidden="true"
          />
          <span className="techbar-muted">DB:</span>
          <strong
            className={
              serverStatus && !serverStatus.online ? 'techbar-db-offline' : 'techbar-strong mono'
            }
          >
            {dbLabel}
          </strong>
          <button
            type="button"
            className="techbar-icon-btn"
            onClick={onRefreshServerStatus}
            title="Odśwież status serwera i bazy danych"
            aria-label="Odśwież status serwera i bazy danych"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Right: Activity Status + Debug Log Popover + Token Refresh */}
      <div className="techbar-group">
        <div className="techbar-popover-anchor" ref={popoverWrapRef}>
          <button
            type="button"
            className="techbar-status-trigger"
            onClick={() => setPopoverOpen((prev) => !prev)}
            title="Kliknij, aby zobaczyć historię zapytań i zdarzeń (Debug Activity Log)"
          >
            <StatusIcon type={current?.type} />
            <span className={`techbar-status-text ${statusColorClass}`}>{statusText}</span>
          </button>

          {popoverOpen && (
            <div className="techbar-popover" role="dialog" aria-label="Debug Activity Log">
              <div className="techbar-popover-header">
                <div className="techbar-popover-title-row">
                  <span className="techbar-popover-title">Debug Activity Log</span>
                  <span className="techbar-popover-count">
                    ({history.length} {history.length === 1 ? 'entry' : 'entries'})
                  </span>
                </div>
                <div className="techbar-popover-actions">
                  {history.length > 0 && (
                    <button
                      type="button"
                      className="techbar-icon-btn"
                      onClick={() => statusService.clearHistory()}
                      title="Clear log"
                      aria-label="Clear log"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path
                          d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    className="techbar-icon-btn"
                    onClick={() => setPopoverOpen(false)}
                    title="Close"
                    aria-label="Close"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="techbar-popover-body">
                {history.length === 0 ? (
                  <div className="techbar-popover-empty">No activity recorded yet</div>
                ) : (
                  history.map((entry) => (
                    <div key={entry.id} className="techbar-log-item">
                      <div className="techbar-log-left">
                        <StatusIcon type={entry.type} />
                        <span className="techbar-log-time">{formatTime(entry.timestamp)}</span>
                        <span
                          className={`techbar-log-msg ${
                            entry.type === 'error' ? 'techbar-msg-error' : ''
                          }`}
                        >
                          {entry.message}
                        </span>
                      </div>
                      {entry.durationMs != null && (
                        <span className="techbar-log-dur">{entry.durationMs}ms</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <span className="techbar-divider" aria-hidden="true" />

        <span className="techbar-muted">
          Token refreshed: <span className="techbar-strong">{formatDateTime(tokenRefreshTime)}</span>
        </span>
        <button
          type="button"
          className="techbar-icon-btn"
          onClick={() => void handleForceTokenRefresh()}
          disabled={isRefreshingToken}
          title="Force token refresh"
          aria-label="Force token refresh"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={isRefreshingToken ? 'techbar-spin' : undefined}
          >
            <path
              d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
