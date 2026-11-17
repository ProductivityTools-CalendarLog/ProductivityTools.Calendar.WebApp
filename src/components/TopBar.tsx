import { API_TARGETS } from '../config/apiConfig'
import type { ServerDebugStatus } from '../types/calendar'

interface TopBarProps {
  userEmail: string | null
  apiUrl: string
  onChangeApiUrl: (nextUrl: string) => void
  serverStatus: ServerDebugStatus | null
  onSignOut: () => void
}

export function TopBar({
  userEmail,
  apiUrl,
  onChangeApiUrl,
  serverStatus,
  onSignOut,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CL
          </span>
          <div>
            <div className="brand-title">PT Calendar</div>
            <div className="brand-subtitle">Konfiguracja synchronizowanych kalendarzy</div>
          </div>
        </div>

        <div className="topbar-right">
          <div className="server-status" title={apiUrl}>
            <span
              className={`status-dot ${
                serverStatus === null ? '' : serverStatus.online ? 'online' : 'offline'
              }`}
            />
            <span>
              {serverStatus === null
                ? 'Łączenie…'
                : serverStatus.online
                  ? serverStatus.serverName || serverStatus.appName || 'API Online'
                  : 'API Offline'}
            </span>
          </div>

          <select
            id="api-target-select"
            aria-label="Adres serwera API"
            className="api-select"
            value={apiUrl}
            onChange={(e) => onChangeApiUrl(e.target.value)}
          >
            {API_TARGETS.map((opt) => (
              <option key={opt.url} value={opt.url}>
                {opt.label}
              </option>
            ))}
          </select>

          {userEmail && (
            <>
              <span className="user-chip">{userEmail}</span>
              <button
                id="sign-out-button"
                type="button"
                className="btn btn-ghost"
                onClick={onSignOut}
              >
                Wyloguj
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
