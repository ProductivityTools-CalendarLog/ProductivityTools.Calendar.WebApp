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

export function TopBar({ activePage, onNavigate, onSignOut }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              CL
            </span>
            <div>
              <div className="brand-title">PT Calendar</div>
            </div>
          </div>

          <nav className="topnav" aria-label="Główna nawigacja">
            <button
              id="nav-charts-tab"
              type="button"
              className={`topnav-link ${activePage === 'charts' ? 'active' : ''}`}
              onClick={() => onNavigate('charts')}
            >
              Wykresy DataLog
            </button>
            <button
              id="nav-datapoints-tab"
              type="button"
              className={`topnav-link ${activePage === 'datapoints' ? 'active' : ''}`}
              onClick={() => onNavigate('datapoints')}
            >
              Wykresy DataPoint
            </button>
            <button
              id="nav-calendars-tab"
              type="button"
              className={`topnav-link ${activePage === 'calendars' ? 'active' : ''}`}
              onClick={() => onNavigate('calendars')}
            >
              Kalendarze
            </button>
            <button
              id="nav-mutations-tab"
              type="button"
              className={`topnav-link ${activePage === 'mutations' ? 'active' : ''}`}
              onClick={() => onNavigate('mutations')}
            >
              Mutacje
            </button>
            <button
              id="nav-categories-tab"
              type="button"
              className={`topnav-link ${activePage === 'categories' ? 'active' : ''}`}
              onClick={() => onNavigate('categories')}
            >
              Kategorie
            </button>
            <button
              id="nav-events-tab"
              type="button"
              className={`topnav-link ${activePage === 'events' ? 'active' : ''}`}
              onClick={() => onNavigate('events')}
            >
              Pobrane eventy
            </button>
          </nav>
        </div>

        <div className="topbar-right">
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
    </header>
  )
}
