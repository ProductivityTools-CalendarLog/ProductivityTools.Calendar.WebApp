import { useEffect, useRef, useState } from 'react'

export type AppPage =
  | 'charts'
  | 'datapoints'
  | 'calendars'
  | 'mutations'
  | 'categories'
  | 'events'

interface TopBarProps {
  activePage: AppPage
  onNavigate: (page: AppPage) => void
  onSignOut: () => void
}

interface NavItem {
  id: AppPage
  domId: string
  label: string
  description?: string
}

const BROWSE_ITEMS: readonly NavItem[] = [
  { id: 'charts', domId: 'nav-charts-tab', label: 'Wykresy DataLog' },
  { id: 'datapoints', domId: 'nav-datapoints-tab', label: 'Wykresy DataPoint' },
  { id: 'events', domId: 'nav-events-tab', label: 'Pobrane eventy' },
]

const CONFIG_ITEMS: readonly NavItem[] = [
  {
    id: 'calendars',
    domId: 'nav-calendars-tab',
    label: 'Kalendarze',
    description: 'Lista kont, aktywność i typ (DataLog / DataPoint)',
  },
  {
    id: 'mutations',
    domId: 'nav-mutations-tab',
    label: 'Mutacje',
    description: 'Przenoszenie #klucz oraz skróty przed : i po :',
  },
  {
    id: 'categories',
    domId: 'nav-categories-tab',
    label: 'Kategorie',
    description: 'Reguły kategoryzacji, kolory i kolejność sortowania',
  },
]

export function TopBar({ activePage, onNavigate, onSignOut }: TopBarProps) {
  const [configOpen, setConfigOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const activeConfigItem = CONFIG_ITEMS.find((item) => item.id === activePage) ?? null
  const isConfigActive = activeConfigItem !== null

  useEffect(() => {
    if (!configOpen) return

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setConfigOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfigOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [configOpen])

  const handleSelectPage = (page: AppPage) => {
    setConfigOpen(false)
    onNavigate(page)
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <button
            type="button"
            className="brand brand-btn"
            onClick={() => handleSelectPage('charts')}
            title="Przejdź do Wykresy DataLog"
          >
            <span className="brand-mark" aria-hidden="true">
              CL
            </span>
            <span className="brand-title">PT Calendar</span>
          </button>

          <nav className="topnav" aria-label="Przeglądanie">
            {BROWSE_ITEMS.map((item) => (
              <button
                key={item.id}
                id={item.domId}
                type="button"
                className={`topnav-link ${activePage === item.id ? 'active' : ''}`}
                onClick={() => handleSelectPage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="topbar-right">
          <div className="config-menu" ref={menuRef}>
            <button
              id="nav-config-dropdown-button"
              type="button"
              className={`config-trigger ${isConfigActive ? 'active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen((prev) => !prev)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z" />
              </svg>
              <span>
                {activeConfigItem ? `Konfiguracja · ${activeConfigItem.label}` : 'Konfiguracja'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                className={`config-chevron ${configOpen ? 'open' : ''}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {configOpen && (
              <div className="config-dropdown" role="menu" aria-label="Konfiguracja">
                <div className="config-dropdown-header">Konfiguracja</div>
                {CONFIG_ITEMS.map((item) => {
                  const isItemActive = activePage === item.id
                  return (
                    <button
                      key={item.id}
                      id={`${item.domId}-menu`}
                      type="button"
                      role="menuitem"
                      className={`config-dropdown-item ${isItemActive ? 'active' : ''}`}
                      onClick={() => handleSelectPage(item.id)}
                    >
                      <div className="config-dropdown-item-row">
                        <span className="config-dropdown-item-title">{item.label}</span>
                        {isItemActive && <span className="config-active-dot" aria-hidden="true" />}
                      </div>
                      {item.description && (
                        <span className="config-dropdown-item-desc">{item.description}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <button
            id="sign-out-button"
            type="button"
            className="btn btn-ghost"
            onClick={onSignOut}
          >
            Wyloguj
          </button>
        </div>
      </div>

      {isConfigActive && (
        <div className="config-subbar">
          <div className="config-subbar-inner">
            <span className="config-subbar-label">Konfiguracja</span>
            <nav className="config-subnav" aria-label="Podzakładki konfiguracji">
              {CONFIG_ITEMS.map((item) => (
                <button
                  key={item.id}
                  id={item.domId}
                  type="button"
                  className={`config-subnav-link ${activePage === item.id ? 'active' : ''}`}
                  onClick={() => handleSelectPage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
