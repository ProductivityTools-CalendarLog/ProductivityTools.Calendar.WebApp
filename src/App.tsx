import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createCalendar,
  deleteCalendar,
  fetchServerStatus,
  listCalendars,
  setCalendarActive,
  updateCalendar,
} from './api/calendarsApi'
import { useAuth } from './auth/useAuth'
import { AddCalendarForm } from './components/AddCalendarForm'
import { CalendarList } from './components/CalendarList'
import { LoginView } from './components/LoginView'
import { MutationsPage } from './components/MutationsPage'
import { RawEventsPage } from './components/RawEventsPage'
import { TopBar, type AppPage } from './components/TopBar'
import { getApiBaseUrl, setApiBaseUrl, SYNC_TRIGGERS } from './config/apiConfig'
import type {
  CalendarItem,
  CreateCalendarPayload,
  ServerDebugStatus,
  UpdateCalendarPayload,
} from './types/calendar'

function resolvePageFromPath(pathname: string): AppPage {
  if (pathname.startsWith('/events')) return 'events'
  if (pathname.startsWith('/mutations')) return 'mutations'
  return 'calendars'
}

export function App() {
  const { user, loading: authLoading, signOut, getIdToken } = useAuth()
  const [activePage, setActivePage] = useState<AppPage>(() =>
    resolvePageFromPath(window.location.pathname),
  )
  const [apiUrl, setApiUrlState] = useState<string>(getApiBaseUrl)
  const [serverStatus, setServerStatus] = useState<ServerDebugStatus | null>(null)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [loadingCalendars, setLoadingCalendars] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const onPopState = () => {
      setActivePage(resolvePageFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleNavigate = (page: AppPage) => {
    const nextPath =
      page === 'events' ? '/events' : page === 'mutations' ? '/mutations' : '/calendars'
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }
    setActivePage(page)
  }

  const handleApiUrlChange = (nextUrl: string) => {
    setApiBaseUrl(nextUrl)
    setServerStatus(null)
    setApiUrlState(nextUrl)
  }

  useEffect(() => {
    let cancelled = false
    fetchServerStatus(apiUrl).then((status) => {
      if (!cancelled) {
        setServerStatus(status)
      }
    })
    return () => {
      cancelled = true
    }
  }, [apiUrl])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoadingCalendars(true)
    setLoadError(null)
    try {
      const token = await getIdToken()
      const data = await listCalendars(apiUrl, token)
      setCalendars(data)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setLoadError((err as Error)?.message || 'Nie udało się pobrać listy kalendarzy.')
    } finally {
      setLoadingCalendars(false)
    }
  }, [apiUrl, getIdToken, signOut, user])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchInitial = async () => {
      setLoadingCalendars(true)
      setLoadError(null)
      try {
        const token = await getIdToken()
        const data = await listCalendars(apiUrl, token)
        if (!cancelled) {
          setCalendars(data)
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setLoadError((err as Error)?.message || 'Nie udało się pobrać listy kalendarzy.')
      } finally {
        if (!cancelled) {
          setLoadingCalendars(false)
        }
      }
    }

    void fetchInitial()
    return () => {
      cancelled = true
    }
  }, [apiUrl, getIdToken, signOut, user])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => {
      setToast((current) => (current === msg ? null : current))
    }, 3200)
  }

  const handleSignOut = async () => {
    setCalendars([])
    await signOut()
  }

  const handleAdd = async (payload: CreateCalendarPayload) => {
    const token = await getIdToken()
    const created = await createCalendar(apiUrl, token, payload)
    setCalendars((prev) =>
      [...prev, created].sort(
        (a, b) =>
          a.account.localeCompare(b.account) ||
          (a.calendarName ?? a.calendarId).localeCompare(b.calendarName ?? b.calendarId),
      ),
    )
    showToast(`Dodano kalendarz ${created.calendarName || created.calendarId}`)
  }

  const handleToggleActive = async (id: number, nextActive: boolean) => {
    const token = await getIdToken()
    const updated = await setCalendarActive(apiUrl, token, id, nextActive)
    setCalendars((prev) => prev.map((c) => (c.calendarSyncStateId === id ? updated : c)))
  }

  const handleUpdate = async (id: number, payload: UpdateCalendarPayload) => {
    const token = await getIdToken()
    const updated = await updateCalendar(apiUrl, token, id, payload)
    setCalendars((prev) => prev.map((c) => (c.calendarSyncStateId === id ? updated : c)))
    showToast('Zapisano zmiany kalendarza.')
  }

  const handleDelete = async (id: number) => {
    const token = await getIdToken()
    await deleteCalendar(apiUrl, token, id)
    setCalendars((prev) => prev.filter((c) => c.calendarSyncStateId !== id))
    showToast('Usunięto kalendarz z konfiguracji.')
  }

  if (authLoading) {
    return (
      <div className="login-screen">
        <span style={{ color: 'var(--text-secondary)' }}>Sprawdzanie sesji…</span>
      </div>
    )
  }

  if (!user) {
    return <LoginView />
  }

  const existingAccounts = Array.from(new Set(calendars.map((c) => c.account)))

  return (
    <div className="app-shell">
      <TopBar
        activePage={activePage}
        onNavigate={handleNavigate}
        userEmail={user.email}
        apiUrl={apiUrl}
        onChangeApiUrl={handleApiUrlChange}
        serverStatus={serverStatus}
        onSignOut={() => void handleSignOut()}
      />

      <main className="main-container">
        {activePage === 'events' ? (
          <RawEventsPage apiUrl={apiUrl} />
        ) : activePage === 'mutations' ? (
          <MutationsPage
            apiUrl={apiUrl}
            calendars={calendars}
            signedInEmail={user.email}
          />
        ) : (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Kalendarze</h1>
                <p className="page-description">
                  Dodaj identyfikatory kalendarzy Google przypisane do poszczególnych kont — skrypt
                  Apps Script automatycznie pobiera aktywne pozycje przez{' '}
                  <code>GET /api/sync/plan</code>.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                {SYNC_TRIGGERS.map((trigger) => (
                  <a
                    key={trigger.account}
                    id={`calendars-trigger-sync-${trigger.account}`}
                    href={trigger.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none' }}
                    title={`Uruchamia Apps Script doGet() dla ${trigger.account} w nowej karcie`}
                  >
                    Importuj {trigger.account} ↗
                  </a>
                ))}
              </div>
            </div>

            {toast && (
              <div className="alert alert-success" role="status">
                <span>{toast}</span>
              </div>
            )}

            {loadError && (
              <div className="alert alert-error" role="alert">
                <span>{loadError}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void loadAll()}
                >
                  Spróbuj ponownie
                </button>
              </div>
            )}

            <AddCalendarForm
              existingAccounts={existingAccounts}
              signedInEmail={user.email}
              onAdd={handleAdd}
            />

            <CalendarList
              items={calendars}
              loading={loadingCalendars}
              onRefresh={() => void loadAll()}
              onToggleActive={handleToggleActive}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App
