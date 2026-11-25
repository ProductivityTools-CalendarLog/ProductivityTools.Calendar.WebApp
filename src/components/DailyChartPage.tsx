import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/calendarsApi'
import {
  fetchDailySummary,
  fetchWeeklySummary,
  reprocessCalendarLogs,
} from '../api/categoryRulesApi'
import { useAuth } from '../auth/useAuth'
import { SYNC_TRIGGERS } from '../config/apiConfig'
import type { CalendarItem } from '../types/calendar'
import type {
  DailyCategoryBucket,
  DailyCategorySummary,
  WeeklyCategorySummary,
} from '../types/categoryRule'
import {
  buildOrderedLegendCategories,
  formatDayWithWeekday,
  formatWeekTooltipTitle,
  toIsoDateString,
  type ChartBucketInput,
} from '../utils/chartCategories'
import {
  loadDataLogFilters,
  saveDataLogFilters,
  type ChartSortDirection,
  type DataLogRangePreset,
} from '../utils/filterStorage'
import { StackedCategoryChartCard } from './StackedCategoryChartCard'

type RangePreset = DataLogRangePreset
type SortDirection = ChartSortDirection

const DAILY_CHART_MAX_DAYS = 21
const WEEKLY_CHART_MAX_WEEKS = 26

function computePresetDates(preset: Exclude<RangePreset, 'all' | 'custom'>): {
  fromDay: string
  toDay: string
} {
  const days =
    preset === '14d'
      ? 14
      : preset === '21d'
        ? 21
        : preset === '30d'
          ? 30
          : preset === '60d'
            ? 60
            : 180
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - (days - 1))
  return {
    fromDay: toIsoDateString(start),
    toDay: toIsoDateString(today),
  }
}

function fillMissingCalendarDays(
  days: DailyCategoryBucket[],
  explicitFrom?: string,
  explicitTo?: string,
): DailyCategoryBucket[] {
  if (days.length === 0 && (!explicitFrom || !explicitTo)) {
    return days
  }
  const sortedIso = days.map((d) => d.day).sort()
  const minDay = explicitFrom || sortedIso[0]
  const maxDay = explicitTo || sortedIso[sortedIso.length - 1]
  if (!minDay || !maxDay || minDay > maxDay) {
    return days
  }

  const byDay = new Map<string, DailyCategoryBucket>(days.map((d) => [d.day, d]))
  const result: DailyCategoryBucket[] = []
  const cursor = new Date(`${minDay}T00:00:00`)
  const end = new Date(`${maxDay}T00:00:00`)

  let safety = 0
  while (cursor <= end && safety < 730) {
    const iso = toIsoDateString(cursor)
    result.push(
      byDay.get(iso) ?? {
        day: iso,
        totalHours: 0,
        byCategory: {},
      },
    )
    cursor.setDate(cursor.getDate() + 1)
    safety += 1
  }

  return result
}

interface DailyChartPageProps {
  apiUrl: string
  calendars: CalendarItem[]
  signedInEmail: string | null
  onNavigateToCategories?: () => void
}

export function DailyChartPage({
  apiUrl,
  calendars,
  signedInEmail,
  onNavigateToCategories,
}: DailyChartPageProps) {
  const { getIdToken, signOut } = useAuth()

  const [initialFilters] = useState(() => {
    const defaultCustom = computePresetDates('30d')
    return loadDataLogFilters({
      accountFilter: 'ALL',
      rangePreset: 'all',
      customFrom: defaultCustom.fromDay,
      customTo: defaultCustom.toDay,
      includeUncategorized: true,
      fillEmptyDays: false,
      sortDirection: 'desc',
      hiddenCategories: [],
    })
  })

  const [accountFilter, setAccountFilter] = useState<string>(initialFilters.accountFilter)
  const [rangePreset, setRangePreset] = useState<RangePreset>(initialFilters.rangePreset)
  const [customFrom, setCustomFrom] = useState<string>(initialFilters.customFrom)
  const [customTo, setCustomTo] = useState<string>(initialFilters.customTo)
  const [includeUncategorized, setIncludeUncategorized] = useState<boolean>(
    initialFilters.includeUncategorized,
  )
  const [fillEmptyDays, setFillEmptyDays] = useState<boolean>(initialFilters.fillEmptyDays)
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialFilters.sortDirection)
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set(initialFilters.hiddenCategories),
  )
  const [refreshGeneration, setRefreshGeneration] = useState<number>(0)

  useEffect(() => {
    saveDataLogFilters({
      accountFilter,
      rangePreset,
      customFrom,
      customTo,
      includeUncategorized,
      fillEmptyDays,
      sortDirection,
      hiddenCategories: Array.from(hiddenCategories),
    })
  }, [
    accountFilter,
    customFrom,
    customTo,
    fillEmptyDays,
    hiddenCategories,
    includeUncategorized,
    rangePreset,
    sortDirection,
  ])

  const [dailySummary, setDailySummary] = useState<DailyCategorySummary>({
    categories: [],
    days: [],
  })
  const [weeklySummary, setWeeklySummary] = useState<WeeklyCategorySummary>({
    categories: [],
    weeks: [],
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [reprocessing, setReprocessing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const effectiveDates = useMemo((): { fromDay?: string; toDay?: string } => {
    if (rangePreset === 'all') {
      return {}
    }
    if (rangePreset === 'custom') {
      return {
        fromDay: customFrom || undefined,
        toDay: customTo || undefined,
      }
    }
    return computePresetDates(rangePreset)
  }, [customFrom, customTo, rangePreset])

  const loadSummaries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const accountParam = accountFilter === 'ALL' ? undefined : accountFilter
      const [daily, weekly] = await Promise.all([
        fetchDailySummary(apiUrl, token, {
          account: accountParam,
          fromDay: effectiveDates.fromDay,
          toDay: effectiveDates.toDay,
          includeUncategorized,
        }),
        fetchWeeklySummary(apiUrl, token, {
          account: accountParam,
          fromDay: effectiveDates.fromDay,
          toDay: effectiveDates.toDay,
          includeUncategorized,
        }),
      ])
      setDailySummary(daily)
      setWeeklySummary(weekly)
      setRefreshGeneration((prev) => prev + 1)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się pobrać danych do wykresów.')
    } finally {
      setLoading(false)
    }
  }, [
    accountFilter,
    apiUrl,
    effectiveDates.fromDay,
    effectiveDates.toDay,
    getIdToken,
    includeUncategorized,
    signOut,
  ])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getIdToken()
        const accountParam = accountFilter === 'ALL' ? undefined : accountFilter
        const [daily, weekly] = await Promise.all([
          fetchDailySummary(apiUrl, token, {
            account: accountParam,
            fromDay: effectiveDates.fromDay,
            toDay: effectiveDates.toDay,
            includeUncategorized,
          }),
          fetchWeeklySummary(apiUrl, token, {
            account: accountParam,
            fromDay: effectiveDates.fromDay,
            toDay: effectiveDates.toDay,
            includeUncategorized,
          }),
        ])
        if (!cancelled) {
          setDailySummary(daily)
          setWeeklySummary(weekly)
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setError((err as Error)?.message || 'Nie udało się pobrać danych do wykresów.')
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
  }, [
    accountFilter,
    apiUrl,
    effectiveDates.fromDay,
    effectiveDates.toDay,
    getIdToken,
    includeUncategorized,
    signOut,
  ])

  const handleReprocessAndRefresh = async () => {
    setReprocessing(true)
    setError(null)
    setNotice(null)
    try {
      const token = await getIdToken()
      const res = await reprocessCalendarLogs(
        apiUrl,
        token,
        accountFilter === 'ALL' ? undefined : accountFilter,
      )
      await loadSummaries()
      setNotice(
        `Przeliczono ${res.rawEventsEvaluated} eventów → zapisano ${res.logsUpserted} pozycji w CalendarLog.`,
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się przeliczyć logów.')
    } finally {
      setReprocessing(false)
    }
  }

  const knownAccounts = useMemo(() => {
    const set = new Set<string>()
    if (signedInEmail) set.add(signedInEmail)
    for (const c of calendars) set.add(c.account)
    if (accountFilter !== 'ALL' && accountFilter.trim() !== '') set.add(accountFilter)
    return Array.from(set).sort()
  }, [accountFilter, calendars, signedInEmail])

  const categoryConfigs = useMemo(
    () => dailySummary.categoryConfigs ?? weeklySummary.categoryConfigs ?? [],
    [dailySummary.categoryConfigs, weeklySummary.categoryConfigs],
  )

  const legendCategoriesTopDown = useMemo(() => {
    const merged = Array.from(
      new Set([...dailySummary.categories, ...weeklySummary.categories]),
    )
    return buildOrderedLegendCategories(merged, includeUncategorized, categoryConfigs)
  }, [
    categoryConfigs,
    dailySummary.categories,
    includeUncategorized,
    weeklySummary.categories,
  ])

  const dailyBuckets = useMemo((): ChartBucketInput[] => {
    const base = fillEmptyDays
      ? fillMissingCalendarDays(
          dailySummary.days,
          effectiveDates.fromDay,
          effectiveDates.toDay,
        )
      : dailySummary.days

    const latestDays = [...base]
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, DAILY_CHART_MAX_DAYS)

    const sorted =
      sortDirection === 'desc' ? latestDays : [...latestDays].reverse()

    return sorted.map((d) => ({
      key: d.day,
      xLabel: d.day,
      tooltipTitle: formatDayWithWeekday(d.day),
      byCategory: d.byCategory,
    }))
  }, [
    dailySummary.days,
    effectiveDates.fromDay,
    effectiveDates.toDay,
    fillEmptyDays,
    sortDirection,
  ])

  const weeklyBuckets = useMemo((): ChartBucketInput[] => {
    const latestWeeks = [...weeklySummary.weeks]
      .sort((a, b) => b.weekNumber - a.weekNumber)
      .slice(0, WEEKLY_CHART_MAX_WEEKS)

    const sorted =
      sortDirection === 'desc' ? latestWeeks : [...latestWeeks].reverse()

    return sorted.map((w) => ({
      key: String(w.weekNumber),
      xLabel: String(w.weekNumber),
      tooltipTitle: formatWeekTooltipTitle(w.weekNumber, w.weekStartDay, w.weekEndDay),
      byCategory: w.byCategory,
    }))
  }, [sortDirection, weeklySummary.weeks])

  const toggleCategoryVisibility = (category: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const hasAnyData = dailySummary.days.length > 0 || weeklySummary.weeks.length > 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wykresy DataLog — czas i kategorie</h1>
          <p className="page-description">
            Zestawienie dzienne oraz tygodniowe (ISO <code>YYYYWW</code>) w godzinach i
            w ujęciu 100% dla kalendarzy typu <code>DataLog</code>. Kliknij dowolny słupek,
            aby rozwinąć tabelę wydarzeń bezpośrednio pod danym wykresem.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {SYNC_TRIGGERS.map((trigger) => (
            <a
              key={trigger.account}
              id={`charts-trigger-sync-${trigger.account}`}
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
          {onNavigateToCategories && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onNavigateToCategories}
              title="Edytuj kolejność sortowania kategorii i kolory na wykresach"
            >
              Kolejność sortowania
            </button>
          )}
          <button
            id="charts-reprocess-btn"
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={reprocessing}
            onClick={() => void handleReprocessAndRefresh()}
          >
            {reprocessing ? 'Przeliczanie…' : 'Przelicz reguły'}
          </button>
          <button
            id="charts-refresh-btn"
            type="button"
            className="btn btn-primary btn-sm"
            disabled={loading}
            onClick={() => void loadSummaries()}
          >
            {loading ? 'Odświeżanie…' : 'Odśwież wykresy'}
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
            onClick={() => void loadSummaries()}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* Global Controls Toolbar */}
      <section className="panel" aria-label="Filtry wykresów">
        <div className="panel-header chart-controls-bar" style={{ borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <div className="filter-bar" role="group" aria-label="Zakres dat">
              {(
                [
                  { id: '14d', label: '14 dni' },
                  { id: '21d', label: '21 dni' },
                  { id: '30d', label: '30 dni' },
                  { id: '60d', label: '60 dni' },
                  { id: '180d', label: '180 dni' },
                  { id: 'all', label: 'Cała historia' },
                  { id: 'custom', label: 'Od–Do' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`filter-pill ${rangePreset === opt.id ? 'active' : ''}`}
                  onClick={() => setRangePreset(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {rangePreset === 'custom' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="date"
                  aria-label="Data początkowa"
                  className="input chart-date-input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span style={{ color: 'var(--text-muted)' }}>–</span>
                <input
                  type="date"
                  aria-label="Data końcowa"
                  className="input chart-date-input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {knownAccounts.length > 0 && (
              <select
                id="chart-account-filter"
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
              title="Przełącz kolejność słupków na osi X"
            >
              {sortDirection === 'desc' ? '← Najnowsze z lewej' : 'Chronologicznie →'}
            </button>

            <label className="switch" title="Uwzględnij eventy bez przypisanej kategorii">
              <input
                type="checkbox"
                checked={includeUncategorized}
                onChange={(e) => setIncludeUncategorized(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-label">Bez kategorii</span>
            </label>

            <label className="switch" title="Wypełnij dni bez eventów słupkami 0.00 na wykresach dziennych">
              <input
                type="checkbox"
                checked={fillEmptyDays}
                onChange={(e) => setFillEmptyDays(e.target.checked)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-label">Puste dni</span>
            </label>
          </div>
        </div>
      </section>

      {loading && !hasAnyData ? (
        <section className="panel">
          <div className="empty-state">Ładowanie wykresów z dbo.CalendarLog…</div>
        </section>
      ) : !hasAnyData ? (
        <section className="panel">
          <div className="empty-state">
            <div className="empty-state-title">Brak danych w tabeli dbo.CalendarLog</div>
            <p style={{ maxWidth: 520, margin: '0.35rem auto 1rem' }}>
              Zaimportuj eventy przyciskiem powyżej lub skonfiguruj reguły kategoryzacji w
              zakładce Kategorie.
            </p>
            {onNavigateToCategories && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onNavigateToCategories}
              >
                Przejdź do reguł kategorii
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* 1. Daily Hours Stacked Bar Chart */}
          <StackedCategoryChartCard
            chartId="daily-hours-chart"
            title="1. Wykres dzienny — Godziny wg kategorii"
            subtitle="Ostatnie 21 dni (YYYY-MM-DD); kliknij słupek, aby wyświetlić pod wykresem wydarzenia z tego dnia."
            mode="hours"
            granularity="day"
            apiUrl={apiUrl}
            accountFilter={accountFilter}
            effectiveFromDay={effectiveDates.fromDay}
            effectiveToDay={effectiveDates.toDay}
            includeUncategorized={includeUncategorized}
            refreshGeneration={refreshGeneration}
            buckets={dailyBuckets}
            legendCategoriesTopDown={legendCategoriesTopDown}
            categoryConfigs={categoryConfigs}
            hiddenCategories={hiddenCategories}
            onToggleCategory={toggleCategoryVisibility}
            onResetHiddenCategories={() => setHiddenCategories(new Set())}
          />

          {/* 2. Weekly Hours Stacked Bar Chart */}
          <StackedCategoryChartCard
            chartId="weekly-hours-chart"
            title="2. Wykres tygodniowy — Godziny wg kategorii"
            subtitle="Ostatnie 26 tygodni ISO (RRRRTT, np. 202647); kliknij słupek, aby wyświetlić pod wykresem wydarzenia z tego tygodnia."
            mode="hours"
            granularity="week"
            apiUrl={apiUrl}
            accountFilter={accountFilter}
            effectiveFromDay={effectiveDates.fromDay}
            effectiveToDay={effectiveDates.toDay}
            includeUncategorized={includeUncategorized}
            refreshGeneration={refreshGeneration}
            buckets={weeklyBuckets}
            legendCategoriesTopDown={legendCategoriesTopDown}
            categoryConfigs={categoryConfigs}
            hiddenCategories={hiddenCategories}
            onToggleCategory={toggleCategoryVisibility}
            onResetHiddenCategories={() => setHiddenCategories(new Set())}
          />

          {/* 3. Daily 100% Stacked Bar Chart */}
          <StackedCategoryChartCard
            chartId="daily-percent-chart"
            title="3. Wykres dzienny — Udział procentowy kategorii (100%)"
            subtitle="Ostatnie 21 dni znormalizowanych do 100% czasu; kliknij słupek, aby wyświetlić pod wykresem wydarzenia i ich udział procentowy."
            mode="percent"
            granularity="day"
            apiUrl={apiUrl}
            accountFilter={accountFilter}
            effectiveFromDay={effectiveDates.fromDay}
            effectiveToDay={effectiveDates.toDay}
            includeUncategorized={includeUncategorized}
            refreshGeneration={refreshGeneration}
            buckets={dailyBuckets}
            legendCategoriesTopDown={legendCategoriesTopDown}
            categoryConfigs={categoryConfigs}
            hiddenCategories={hiddenCategories}
            onToggleCategory={toggleCategoryVisibility}
            onResetHiddenCategories={() => setHiddenCategories(new Set())}
          />

          {/* 4. Weekly 100% Stacked Bar Chart */}
          <StackedCategoryChartCard
            chartId="weekly-percent-chart"
            title="4. Wykres tygodniowy — Udział procentowy kategorii (100%)"
            subtitle="Ostatnie 26 tygodni ISO (RRRRTT) znormalizowanych do 100% czasu; kliknij słupek, aby wyświetlić pod wykresem wydarzenia z tego tygodnia."
            mode="percent"
            granularity="week"
            apiUrl={apiUrl}
            accountFilter={accountFilter}
            effectiveFromDay={effectiveDates.fromDay}
            effectiveToDay={effectiveDates.toDay}
            includeUncategorized={includeUncategorized}
            refreshGeneration={refreshGeneration}
            buckets={weeklyBuckets}
            legendCategoriesTopDown={legendCategoriesTopDown}
            categoryConfigs={categoryConfigs}
            hiddenCategories={hiddenCategories}
            onToggleCategory={toggleCategoryVisibility}
            onResetHiddenCategories={() => setHiddenCategories(new Set())}
          />
        </>
      )}
    </>
  )
}
