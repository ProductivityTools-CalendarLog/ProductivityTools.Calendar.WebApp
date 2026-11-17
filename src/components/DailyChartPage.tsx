import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api/calendarsApi'
import {
  fetchDailySummary,
  fetchWeeklySummary,
  queryCalendarLogs,
  reprocessCalendarLogs,
} from '../api/categoryRulesApi'
import { useAuth } from '../auth/useAuth'
import { SYNC_TRIGGERS } from '../config/apiConfig'
import type { CalendarItem } from '../types/calendar'
import type {
  CalendarLogItem,
  DailyCategoryBucket,
  DailyCategorySummary,
  WeeklyCategorySummary,
} from '../types/categoryRule'
import {
  UNCATEGORIZED_KEY,
  buildOrderedLegendCategories,
  formatCategoryLabel,
  formatDayWithWeekday,
  formatWeekTooltipTitle,
  getCategoryColor,
  toIsoDateString,
  type ChartBucketInput,
} from '../utils/chartCategories'
import { StackedCategoryChartCard } from './StackedCategoryChartCard'

type RangePreset = '14d' | '30d' | '60d' | '180d' | 'all' | 'custom'
type SortDirection = 'desc' | 'asc'
type ChartVisibilityFilter = 'all' | 'daily' | 'weekly' | 'hours' | 'percent'

type DrilldownSelection =
  | { kind: 'day'; day: string }
  | { kind: 'week'; weekNumber: number; label: string }

function computePresetDates(preset: Exclude<RangePreset, 'all' | 'custom'>): {
  fromDay: string
  toDay: string
} {
  const days =
    preset === '14d' ? 14 : preset === '30d' ? 30 : preset === '60d' ? 60 : 180
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

function formatTimeRange(startIso: string, endIso: string): string {
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return ''
  }
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return `${s.toLocaleTimeString('pl-PL', opts)}–${e.toLocaleTimeString('pl-PL', opts)}`
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
  const drilldownRef = useRef<HTMLElement | null>(null)

  const [accountFilter, setAccountFilter] = useState<string>('ALL')
  const [rangePreset, setRangePreset] = useState<RangePreset>('all')
  const [customFrom, setCustomFrom] = useState<string>(
    () => computePresetDates('30d').fromDay,
  )
  const [customTo, setCustomTo] = useState<string>(() => computePresetDates('30d').toDay)
  const [includeUncategorized, setIncludeUncategorized] = useState<boolean>(true)
  const [fillEmptyDays, setFillEmptyDays] = useState<boolean>(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [chartFilter, setChartFilter] = useState<ChartVisibilityFilter>('all')
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => new Set())

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

  const [selection, setSelection] = useState<DrilldownSelection | null>(null)
  const [drilldownLogs, setDrilldownLogs] = useState<CalendarLogItem[]>([])
  const [loadingDrilldown, setLoadingDrilldown] = useState<boolean>(false)

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

  useEffect(() => {
    if (!selection) return
    let cancelled = false
    const run = async () => {
      setLoadingDrilldown(true)
      try {
        const token = await getIdToken()
        const accountParam = accountFilter === 'ALL' ? undefined : accountFilter
        const items =
          selection.kind === 'day'
            ? await queryCalendarLogs(apiUrl, token, {
                account: accountParam,
                fromDay: selection.day,
                toDay: selection.day,
                limit: 300,
              })
            : await queryCalendarLogs(apiUrl, token, {
                account: accountParam,
                weekNumber: selection.weekNumber,
                limit: 1000,
              })
        if (!cancelled) {
          setDrilldownLogs(
            [...items].sort((a, b) => a.startTime.localeCompare(b.startTime)),
          )
        }
      } catch {
        if (!cancelled) {
          setDrilldownLogs([])
        }
      } finally {
        if (!cancelled) {
          setLoadingDrilldown(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [accountFilter, apiUrl, getIdToken, selection])

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
    return Array.from(set).sort()
  }, [calendars, signedInEmail])

  const legendCategoriesTopDown = useMemo(() => {
    const merged = Array.from(
      new Set([...dailySummary.categories, ...weeklySummary.categories]),
    )
    return buildOrderedLegendCategories(merged, includeUncategorized)
  }, [dailySummary.categories, includeUncategorized, weeklySummary.categories])

  const dailyBuckets = useMemo((): ChartBucketInput[] => {
    const base = fillEmptyDays
      ? fillMissingCalendarDays(
          dailySummary.days,
          effectiveDates.fromDay,
          effectiveDates.toDay,
        )
      : dailySummary.days

    const sorted = [...base].sort((a, b) =>
      sortDirection === 'desc'
        ? b.day.localeCompare(a.day)
        : a.day.localeCompare(b.day),
    )

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
    const sorted = [...weeklySummary.weeks].sort((a, b) =>
      sortDirection === 'desc'
        ? b.weekNumber - a.weekNumber
        : a.weekNumber - b.weekNumber,
    )

    return sorted.map((w) => ({
      key: String(w.weekNumber),
      xLabel: String(w.weekNumber),
      tooltipTitle: formatWeekTooltipTitle(w.weekNumber, w.weekStartDay, w.weekEndDay),
      byCategory: w.byCategory,
    }))
  }, [sortDirection, weeklySummary.weeks])

  const kpiStats = useMemo(() => {
    const daysCount = dailySummary.days.length
    const weeksCount = weeklySummary.weeks.length
    const catTotals = new Map<string, number>()
    let visibleTotalHours = 0

    for (const d of dailySummary.days) {
      for (const [cat, hrs] of Object.entries(d.byCategory)) {
        if (hiddenCategories.has(cat)) continue
        visibleTotalHours += hrs
        catTotals.set(cat, (catTotals.get(cat) ?? 0) + hrs)
      }
    }

    let topCategory: { name: string; hours: number } | null = null
    for (const [cat, hrs] of catTotals.entries()) {
      if (!topCategory || hrs > topCategory.hours) {
        topCategory = { name: cat, hours: hrs }
      }
    }

    return {
      daysCount,
      weeksCount,
      totalHours: Math.round(visibleTotalHours * 100) / 100,
      avgWeeklyHours:
        weeksCount > 0 ? Math.round((visibleTotalHours / weeksCount) * 100) / 100 : 0,
      topCategory,
    }
  }, [dailySummary.days, hiddenCategories, weeklySummary.weeks.length])

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

  const handleSelectDay = (dayKey: string) => {
    setSelection((prev) => {
      if (prev?.kind === 'day' && prev.day === dayKey) {
        return null
      }
      window.setTimeout(() => {
        drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 60)
      return { kind: 'day', day: dayKey }
    })
  }

  const handleSelectWeek = (weekKey: string) => {
    const weekNumber = Number.parseInt(weekKey, 10)
    if (Number.isNaN(weekNumber)) return
    const found = weeklySummary.weeks.find((w) => w.weekNumber === weekNumber)
    const label = found
      ? formatWeekTooltipTitle(found.weekNumber, found.weekStartDay, found.weekEndDay)
      : `Tydzień ${weekNumber}`

    setSelection((prev) => {
      if (prev?.kind === 'week' && prev.weekNumber === weekNumber) {
        return null
      }
      window.setTimeout(() => {
        drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 60)
      return { kind: 'week', weekNumber, label }
    })
  }

  const selectedDayKey = selection?.kind === 'day' ? selection.day : null
  const selectedWeekKey =
    selection?.kind === 'week' ? String(selection.weekNumber) : null

  const showDailyHours =
    chartFilter === 'all' || chartFilter === 'daily' || chartFilter === 'hours'
  const showWeeklyHours =
    chartFilter === 'all' || chartFilter === 'weekly' || chartFilter === 'hours'
  const showDailyPercent =
    chartFilter === 'all' || chartFilter === 'daily' || chartFilter === 'percent'
  const showWeeklyPercent =
    chartFilter === 'all' || chartFilter === 'weekly' || chartFilter === 'percent'

  const hasAnyData = dailySummary.days.length > 0 || weeklySummary.weeks.length > 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wykresy czasu i kategorii</h1>
          <p className="page-description">
            Zestawienie dzienne oraz tygodniowe (ISO <code>YYYYWW</code>) w godzinach i
            w ujęciu 100% na podstawie tabeli <code>dbo.CalendarLog</code>.
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

      {/* KPI Summary Strip */}
      <div className="chart-kpi-grid">
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Zakres danych</span>
          <span className="chart-kpi-value">
            {kpiStats.daysCount} dni · {kpiStats.weeksCount} tyg.
          </span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Suma godzin</span>
          <span className="chart-kpi-value">{kpiStats.totalHours.toFixed(2)} h</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Średnio tygodniowo</span>
          <span className="chart-kpi-value">{kpiStats.avgWeeklyHours.toFixed(2)} h</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Główna kategoria</span>
          <span className="chart-kpi-value chart-kpi-cat">
            {kpiStats.topCategory ? (
              <>
                <span
                  className="chart-swatch"
                  style={{ backgroundColor: getCategoryColor(kpiStats.topCategory.name) }}
                />
                <span>
                  {formatCategoryLabel(kpiStats.topCategory.name)} ·{' '}
                  {kpiStats.topCategory.hours.toFixed(2)} h
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>

      {/* Global Controls Toolbar */}
      <section className="panel" aria-label="Filtry wykresów">
        <div className="panel-header chart-controls-bar" style={{ borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <div className="filter-bar" role="group" aria-label="Widok wykresów">
              {(
                [
                  { id: 'all', label: 'Wszystkie (4)' },
                  { id: 'daily', label: 'Dzienne (2)' },
                  { id: 'weekly', label: 'Tygodniowe (2)' },
                  { id: 'hours', label: 'Godzinowe (2)' },
                  { id: 'percent', label: '100% (2)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`filter-pill ${chartFilter === opt.id ? 'active' : ''}`}
                  onClick={() => setChartFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <span style={{ color: 'var(--border-strong)' }}>|</span>

            <div className="filter-bar" role="group" aria-label="Zakres dat">
              {(
                [
                  { id: '14d', label: '14 dni' },
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
          {showDailyHours && (
            <StackedCategoryChartCard
              chartId="daily-hours-chart"
              title="1. Wykres dzienny — Godziny wg kategorii"
              subtitle="Każdy słupek to osobny dzień (YYYY-MM-DD); wysokość słupka przedstawia sumę przepracowanych godzin."
              mode="hours"
              buckets={dailyBuckets}
              legendCategoriesTopDown={legendCategoriesTopDown}
              hiddenCategories={hiddenCategories}
              onToggleCategory={toggleCategoryVisibility}
              onResetHiddenCategories={() => setHiddenCategories(new Set())}
              selectedKey={selectedDayKey}
              onSelectBucket={handleSelectDay}
              clickHintLabel="Kliknij słupek, aby zobaczyć listę eventów z tego dnia"
            />
          )}

          {/* 2. Weekly Hours Stacked Bar Chart */}
          {showWeeklyHours && (
            <StackedCategoryChartCard
              chartId="weekly-hours-chart"
              title="2. Wykres tygodniowy — Godziny wg kategorii"
              subtitle="Każdy słupek to osobny tydzień ISO (RRRRTT, np. 202647); wysokość słupka przedstawia łączną liczbę godzin w tygodniu."
              mode="hours"
              buckets={weeklyBuckets}
              legendCategoriesTopDown={legendCategoriesTopDown}
              hiddenCategories={hiddenCategories}
              onToggleCategory={toggleCategoryVisibility}
              onResetHiddenCategories={() => setHiddenCategories(new Set())}
              selectedKey={selectedWeekKey}
              onSelectBucket={handleSelectWeek}
              clickHintLabel="Kliknij słupek, aby zobaczyć listę wszystkich eventów z tego tygodnia"
            />
          )}

          {/* 3. Daily 100% Stacked Bar Chart */}
          {showDailyPercent && (
            <StackedCategoryChartCard
              chartId="daily-percent-chart"
              title="3. Wykres dzienny — Udział procentowy kategorii (100%)"
              subtitle="Każdy dzień znormalizowany do 100% czasu; nad słupkiem widoczna łączna suma godzin z danego dnia."
              mode="percent"
              buckets={dailyBuckets}
              legendCategoriesTopDown={legendCategoriesTopDown}
              hiddenCategories={hiddenCategories}
              onToggleCategory={toggleCategoryVisibility}
              onResetHiddenCategories={() => setHiddenCategories(new Set())}
              selectedKey={selectedDayKey}
              onSelectBucket={handleSelectDay}
              clickHintLabel="Kliknij słupek, aby zobaczyć listę eventów z tego dnia"
            />
          )}

          {/* 4. Weekly 100% Stacked Bar Chart */}
          {showWeeklyPercent && (
            <StackedCategoryChartCard
              chartId="weekly-percent-chart"
              title="4. Wykres tygodniowy — Udział procentowy kategorii (100%)"
              subtitle="Każdy tydzień ISO (RRRRTT) znormalizowany do 100% czasu; nad słupkiem widoczna łączna suma godzin w tygodniu."
              mode="percent"
              buckets={weeklyBuckets}
              legendCategoriesTopDown={legendCategoriesTopDown}
              hiddenCategories={hiddenCategories}
              onToggleCategory={toggleCategoryVisibility}
              onResetHiddenCategories={() => setHiddenCategories(new Set())}
              selectedKey={selectedWeekKey}
              onSelectBucket={handleSelectWeek}
              clickHintLabel="Kliknij słupek, aby zobaczyć listę wszystkich eventów z tego tygodnia"
            />
          )}
        </>
      )}

      {/* Drill-Down Panel for Selected Day or Selected Week */}
      {selection && (
        <section
          ref={drilldownRef}
          className="panel"
          aria-labelledby="drilldown-heading"
        >
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <h2 id="drilldown-heading" className="panel-title">
                {selection.kind === 'day'
                  ? `Wydarzenia dnia: ${formatDayWithWeekday(selection.day)}`
                  : `Wydarzenia tygodnia: ${selection.label}`}
              </h2>
              <span className="badge badge-neutral">{drilldownLogs.length} pozycji</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelection(null)}
            >
              Zamknij szczegóły ✕
            </button>
          </div>

          {loadingDrilldown ? (
            <div className="empty-state">Ładowanie szczegółowych wydarzeń…</div>
          ) : drilldownLogs.length === 0 ? (
            <div className="empty-state">Brak wydarzeń w dbo.CalendarLog dla wybranego okresu.</div>
          ) : (
            <div className="table-wrap">
              <table className="cal-table">
                <thead>
                  <tr>
                    <th>Dzień</th>
                    <th>Godziny</th>
                    <th>Czas (h)</th>
                    <th>Kategoria</th>
                    <th>Tytuł / Wartość</th>
                    <th>Kalendarz</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownLogs.map((log) => {
                    const catKey = log.category || UNCATEGORIZED_KEY
                    return (
                      <tr key={log.calendarLogId}>
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {log.day}
                        </td>
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {formatTimeRange(log.startTime, log.endTime)}
                        </td>
                        <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {log.durationHours.toFixed(2)}
                        </td>
                        <td>
                          <span className="chart-cat-pill">
                            <span
                              className="chart-swatch"
                              style={{ backgroundColor: getCategoryColor(catKey) }}
                            />
                            <span>{formatCategoryLabel(catKey)}</span>
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{log.title || '(bez tytułu)'}</div>
                          {log.value && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                              Wartość: {log.value}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="account-badge">{log.calendarName}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
