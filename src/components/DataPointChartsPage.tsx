import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/calendarsApi'
import { fetchDataPointMonthlySummary } from '../api/dataPointsApi'
import { useAuth } from '../auth/useAuth'
import { SYNC_TRIGGERS } from '../config/apiConfig'
import type { CalendarItem } from '../types/calendar'
import type { DataPointMonthlySummary } from '../types/dataPoint'
import { DataPointCategoryChartCard } from './DataPointCategoryChartCard'

type MonthsPreset = '12m' | '24m' | 'all'
type SortDirection = 'desc' | 'asc'

interface DataPointChartsPageProps {
  apiUrl: string
  calendars: CalendarItem[]
  signedInEmail: string | null
  onNavigateToCalendars: () => void
}

export function DataPointChartsPage({
  apiUrl,
  calendars,
  signedInEmail,
  onNavigateToCalendars,
}: DataPointChartsPageProps) {
  const { getIdToken, signOut } = useAuth()

  const [accountFilter, setAccountFilter] = useState<string>('ALL')
  const [monthsPreset, setMonthsPreset] = useState<MonthsPreset>('24m')
  const [fillEmptyMonths, setFillEmptyMonths] = useState<boolean>(true)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [refreshGeneration, setRefreshGeneration] = useState<number>(0)

  const [summary, setSummary] = useState<DataPointMonthlySummary>({
    dataPointCalendars: [],
    totalEvents: 0,
    categories: [],
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const data = await fetchDataPointMonthlySummary(apiUrl, token, {
        account: accountFilter === 'ALL' ? undefined : accountFilter,
      })
      setSummary(data)
      setRefreshGeneration((prev) => prev + 1)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się pobrać danych wykresów DataPoint.')
    } finally {
      setLoading(false)
    }
  }, [accountFilter, apiUrl, getIdToken, signOut])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getIdToken()
        const data = await fetchDataPointMonthlySummary(apiUrl, token, {
          account: accountFilter === 'ALL' ? undefined : accountFilter,
        })
        if (!cancelled) {
          setSummary(data)
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setError(
          (err as Error)?.message || 'Nie udało się pobrać danych wykresów DataPoint.',
        )
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
  }, [accountFilter, apiUrl, getIdToken, signOut])

  const dataPointCalendarsConfigured = useMemo(
    () => calendars.filter((c) => c.type === 'DataPoint'),
    [calendars],
  )

  const knownAccounts = useMemo(() => {
    const set = new Set<string>()
    if (signedInEmail) set.add(signedInEmail)
    for (const c of calendars) set.add(c.account)
    return Array.from(set).sort()
  }, [calendars, signedInEmail])

  const distinctMonthsCount = useMemo(() => {
    const set = new Set<string>()
    for (const cat of summary.categories) {
      for (const m of cat.months) {
        set.add(m.month)
      }
    }
    return set.size
  }, [summary.categories])

  const effectiveSelectedCategory = useMemo(() => {
    if (selectedCategory === 'ALL') return 'ALL'
    return summary.categories.some((c) => c.category === selectedCategory)
      ? selectedCategory
      : 'ALL'
  }, [selectedCategory, summary.categories])

  const filteredCategories = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return summary.categories.filter((c) => {
      if (effectiveSelectedCategory !== 'ALL' && c.category !== effectiveSelectedCategory) {
        return false
      }
      if (!needle) return true
      if (c.category.toLowerCase().includes(needle)) return true
      return c.values.some((v) => v.toLowerCase().includes(needle))
    })
  }, [effectiveSelectedCategory, searchQuery, summary.categories])

  const maxMonths =
    monthsPreset === '12m' ? 12 : monthsPreset === '24m' ? 24 : 240

  const calendarLabelList =
    summary.dataPointCalendars.length > 0
      ? summary.dataPointCalendars.join(', ')
      : dataPointCalendarsConfigured
          .map((c) => c.calendarName || c.calendarId)
          .join(', ') || 'Brak (ustaw Type = DataPoint)'

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wykresy DataPoint — miesięczna liczba wystąpień</h1>
          <p className="page-description">
            Dla każdej kategorii z kalendarzy typu <code>DataPoint</code> prezentowany jest
            osobny wykres słupkowy z sumą wystąpień (Count) w każdym miesiącu i podziałem na
            wartości (<code>Kategoria:Wartość</code>).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {SYNC_TRIGGERS.map((trigger) => (
            <a
              key={trigger.account}
              href={trigger.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: 'none' }}
              title={`Uruchamia Apps Script doGet() dla ${trigger.account} w nowej karcie`}
            >
              Importuj {trigger.account} ↗
            </a>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onNavigateToCalendars}
          >
            Kalendarze ({dataPointCalendarsConfigured.length} DataPoint)
          </button>
          <button
            id="datapoints-refresh-btn"
            type="button"
            className="btn btn-primary btn-sm"
            disabled={loading}
            onClick={() => void loadSummary()}
          >
            {loading ? 'Odświeżanie…' : 'Odśwież wykresy'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadSummary()}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="chart-kpi-grid">
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Kategorie DataPoint</span>
          <span className="chart-kpi-value">{summary.categories.length}</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Suma wystąpień (Count)</span>
          <span className="chart-kpi-value">{summary.totalEvents}</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Aktywne miesiące</span>
          <span className="chart-kpi-value">{distinctMonthsCount} mies.</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Kalendarze DataPoint</span>
          <span
            className="chart-kpi-value"
            style={{ fontSize: '0.95rem', fontWeight: 600 }}
          >
            {calendarLabelList}
          </span>
        </div>
      </div>

      {/* Controls Toolbar */}
      <section className="panel" aria-label="Filtry wykresów DataPoint">
        <div className="panel-header chart-controls-bar" style={{ borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <input
              type="search"
              aria-label="Szukaj kategorii lub wartości"
              className="input events-search"
              placeholder="Szukaj kategorii lub wartości…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <span style={{ color: 'var(--border-strong)' }}>|</span>

            <div className="filter-bar" role="group" aria-label="Zakres miesięcy">
              {(
                [
                  { id: '12m', label: 'Ostatnie 12 mies.' },
                  { id: '24m', label: 'Ostatnie 24 mies.' },
                  { id: 'all', label: 'Cała historia' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`filter-pill ${monthsPreset === opt.id ? 'active' : ''}`}
                  onClick={() => setMonthsPreset(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {knownAccounts.length > 0 && (
              <select
                aria-label="Konto"
                className="input chart-compact-select"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <option value="ALL">Wszystkie konta</option>
                {knownAccounts.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
              }
              title="Przełącz kolejność miesięcy na osi X"
            >
              {sortDirection === 'desc' ? '← Najnowsze z lewej' : 'Chronologicznie →'}
            </button>

            <label
              className="switch"
              title="Wypełnij puste miesiące pomiędzy pierwszym a ostatnim wystąpieniem danej kategorii"
            >
              <input
                type="checkbox"
                checked={fillEmptyMonths}
                onChange={(e) => setFillEmptyMonths(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-label">Puste miesiące</span>
            </label>
          </div>
        </div>

        {summary.categories.length > 1 && (
          <div
            style={{
              padding: '0 1.35rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className={`filter-pill ${effectiveSelectedCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              Wszystkie kategorie ({summary.categories.length})
            </button>
            {summary.categories.map((cat) => (
              <button
                key={cat.category}
                type="button"
                className={`filter-pill ${
                  effectiveSelectedCategory === cat.category ? 'active' : ''
                }`}
                onClick={() => setSelectedCategory(cat.category)}
              >
                <span>{cat.category}</span>
                <span className="filter-count">{cat.totalCount}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {loading && summary.categories.length === 0 ? (
        <section className="panel">
          <div className="empty-state">Ładowanie wykresów DataPoint…</div>
        </section>
      ) : summary.dataPointCalendars.length === 0 &&
        dataPointCalendarsConfigured.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <div className="empty-state-title">
              Brak kalendarza skonfigurowanego jako Type = DataPoint
            </div>
            <p style={{ maxWidth: 520, margin: '0.35rem auto 1rem' }}>
              Przejdź do zakładki <strong>Kalendarze</strong> i ustaw przełącznik{' '}
              <code>DataPoint</code> przy kalendarzu przechowującym zdarzenia punktowe
              (np. <code>DataPoints</code>).
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onNavigateToCalendars}
            >
              Przejdź do Kalendarzy
            </button>
          </div>
        </section>
      ) : filteredCategories.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <div className="empty-state-title">Brak wydarzeń DataPoint w wybranym widoku</div>
            <p style={{ maxWidth: 520, margin: '0.35rem auto 0' }}>
              Dodaj wydarzenia w formacie <code>Kategoria:Wartość</code> do kalendarza typu{' '}
              <code>DataPoint</code> i uruchom synchronizację.
            </p>
          </div>
        </section>
      ) : (
        filteredCategories.map((chart, idx) => (
          <DataPointCategoryChartCard
            key={chart.category}
            chart={chart}
            chartIndex={idx}
            apiUrl={apiUrl}
            accountFilter={accountFilter}
            fillEmptyMonths={fillEmptyMonths}
            maxMonths={maxMonths}
            sortDirection={sortDirection}
            refreshGeneration={refreshGeneration}
          />
        ))
      )}
    </>
  )
}
