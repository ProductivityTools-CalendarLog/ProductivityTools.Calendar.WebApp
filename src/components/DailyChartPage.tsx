import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/calendarsApi'
import {
  fetchDailySummary,
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
} from '../types/categoryRule'

const CANONICAL_CATEGORIES_TOP_DOWN: ReadonlyArray<{
  name: string
  color: string
}> = [
  { name: 'SelfDevelopment', color: '#38761d' },
  { name: 'Coding', color: '#6aa84f' },
  { name: 'Journal', color: '#93c47d' },
  { name: 'FocusedWork', color: '#b6d7a8' },
  { name: 'IndividualProjectWork', color: '#d9ead3' },
  { name: 'Operations', color: '#ffe599' },
  { name: 'Emails', color: '#f9cb9c' },
  { name: 'TopDown', color: '#ff6d01' },
  { name: 'Hanging-out', color: '#ea9999' },
  { name: 'One2One', color: '#c9daf8' },
  { name: 'Meetings', color: '#a4c2f4' },
  { name: 'OOO', color: '#4285f4' },
]

const EXTRA_CATEGORY_PALETTE: ReadonlyArray<string> = [
  '#c27ba0',
  '#76a5af',
  '#b4a7d6',
  '#f6b26b',
  '#8e7cc3',
  '#e06666',
  '#6fa8dc',
  '#ffd966',
]

const UNCATEGORIZED_KEY = 'Uncategorized'
const UNCATEGORIZED_COLOR = '#cbd5e1'

type RangePreset = '14d' | '30d' | '60d' | 'all' | 'custom'
type SortDirection = 'desc' | 'asc'

function getCategoryColor(category: string): string {
  if (category === UNCATEGORIZED_KEY) {
    return UNCATEGORIZED_COLOR
  }
  const canonical = CANONICAL_CATEGORIES_TOP_DOWN.find(
    (c) => c.name.toLowerCase() === category.toLowerCase(),
  )
  if (canonical) {
    return canonical.color
  }
  let hash = 0
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % EXTRA_CATEGORY_PALETTE.length
  return EXTRA_CATEGORY_PALETTE[idx]
}

function formatCategoryLabel(category: string): string {
  return category === UNCATEGORIZED_KEY ? 'Brak kategorii' : category
}

function toIsoDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computePresetDates(preset: Exclude<RangePreset, 'all' | 'custom'>): {
  fromDay: string
  toDay: string
} {
  const days = preset === '14d' ? 14 : preset === '30d' ? 30 : 60
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

function computeNiceYScale(maxVal: number): { yMax: number; ticks: number[] } {
  const safeMax = maxVal > 0 ? maxVal : 8
  const padded = safeMax * 1.14

  let step = 2
  if (padded <= 5) step = 1
  else if (padded <= 14) step = 2
  else if (padded <= 22) step = 4
  else if (padded <= 35) step = 5
  else if (padded <= 70) step = 10
  else step = 20

  const yMax = Math.max(step * 4, Math.ceil(padded / step) * step)
  const ticks: number[] = []
  for (let v = 0; v <= yMax + 0.0001; v += step) {
    ticks.push(Math.round(v * 100) / 100)
  }
  return { yMax, ticks }
}

function formatDayWithWeekday(isoDay: string): string {
  const parsed = new Date(`${isoDay}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return isoDay
  }
  return parsed.toLocaleDateString('pl-PL', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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

interface HoveredBarState {
  day: string
  clientX: number
  clientY: number
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

  const [accountFilter, setAccountFilter] = useState<string>('ALL')
  const [rangePreset, setRangePreset] = useState<RangePreset>('all')
  const [customFrom, setCustomFrom] = useState<string>(
    () => computePresetDates('30d').fromDay,
  )
  const [customTo, setCustomTo] = useState<string>(() => computePresetDates('30d').toDay)
  const [includeUncategorized, setIncludeUncategorized] = useState<boolean>(true)
  const [fillEmptyDays, setFillEmptyDays] = useState<boolean>(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => new Set())

  const [summary, setSummary] = useState<DailyCategorySummary>({
    categories: [],
    days: [],
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [reprocessing, setReprocessing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [hoveredBar, setHoveredBar] = useState<HoveredBarState | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedDayLogs, setSelectedDayLogs] = useState<CalendarLogItem[]>([])
  const [loadingDayLogs, setLoadingDayLogs] = useState<boolean>(false)

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

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const data = await fetchDailySummary(apiUrl, token, {
        account: accountFilter === 'ALL' ? undefined : accountFilter,
        fromDay: effectiveDates.fromDay,
        toDay: effectiveDates.toDay,
        includeUncategorized,
      })
      setSummary(data)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się pobrać danych do wykresu.')
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
        const data = await fetchDailySummary(apiUrl, token, {
          account: accountFilter === 'ALL' ? undefined : accountFilter,
          fromDay: effectiveDates.fromDay,
          toDay: effectiveDates.toDay,
          includeUncategorized,
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
        setError((err as Error)?.message || 'Nie udało się pobrać danych do wykresu.')
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
    if (!selectedDay) return
    let cancelled = false
    const run = async () => {
      setLoadingDayLogs(true)
      try {
        const token = await getIdToken()
        const items = await queryCalendarLogs(apiUrl, token, {
          account: accountFilter === 'ALL' ? undefined : accountFilter,
          fromDay: selectedDay,
          toDay: selectedDay,
          limit: 250,
        })
        if (!cancelled) {
          setSelectedDayLogs(
            [...items].sort((a, b) => a.startTime.localeCompare(b.startTime)),
          )
        }
      } catch {
        if (!cancelled) {
          setSelectedDayLogs([])
        }
      } finally {
        if (!cancelled) {
          setLoadingDayLogs(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [accountFilter, apiUrl, getIdToken, selectedDay])

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
      await loadSummary()
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

  // Build ordered legend categories top-to-bottom matching screenshot:
  // [Uncategorized (if present), ...customCategories, SelfDevelopment, Coding, ..., Meetings, OOO]
  const legendCategoriesTopDown = useMemo(() => {
    const canonicalLowerToActual = new Map<string, string>()
    const extraCategories: string[] = []
    let hasUncategorized = false

    for (const cat of summary.categories) {
      if (cat === UNCATEGORIZED_KEY) {
        hasUncategorized = true
        continue
      }
      const canonicalMatch = CANONICAL_CATEGORIES_TOP_DOWN.find(
        (c) => c.name.toLowerCase() === cat.toLowerCase(),
      )
      if (canonicalMatch) {
        canonicalLowerToActual.set(canonicalMatch.name.toLowerCase(), cat)
      } else {
        extraCategories.push(cat)
      }
    }

    extraCategories.sort((a, b) => a.localeCompare(b))

    const ordered: string[] = []
    if (includeUncategorized && hasUncategorized) {
      ordered.push(UNCATEGORIZED_KEY)
    }
    for (const extra of extraCategories) {
      ordered.push(extra)
    }
    for (const canonical of CANONICAL_CATEGORIES_TOP_DOWN) {
      const actualName =
        canonicalLowerToActual.get(canonical.name.toLowerCase()) ?? canonical.name
      ordered.push(actualName)
    }
    return ordered
  }, [includeUncategorized, summary.categories])

  // Bottom-to-top stacking order so bottom of bar = OOO, top of bar = SelfDevelopment / extra / Uncategorized
  const stackOrderBottomUp = useMemo(
    () => [...legendCategoriesTopDown].reverse(),
    [legendCategoriesTopDown],
  )

  const displayedDays = useMemo(() => {
    const base = fillEmptyDays
      ? fillMissingCalendarDays(summary.days, effectiveDates.fromDay, effectiveDates.toDay)
      : summary.days

    const sorted = [...base].sort((a, b) =>
      sortDirection === 'desc'
        ? b.day.localeCompare(a.day)
        : a.day.localeCompare(b.day),
    )

    return sorted.map((d) => {
      let visibleTotal = 0
      const segments: Array<{
        category: string
        hours: number
        color: string
        yStartHours: number
        yEndHours: number
      }> = []

      for (const cat of stackOrderBottomUp) {
        if (hiddenCategories.has(cat)) continue
        const hours = d.byCategory[cat] ?? 0
        if (hours <= 0) continue
        const nextTotal = visibleTotal + hours
        segments.push({
          category: cat,
          hours,
          color: getCategoryColor(cat),
          yStartHours: visibleTotal,
          yEndHours: nextTotal,
        })
        visibleTotal = nextTotal
      }

      return {
        day: d.day,
        rawByCategory: d.byCategory,
        visibleTotalHours: Math.round(visibleTotal * 100) / 100,
        segments,
      }
    })
  }, [
    effectiveDates.fromDay,
    effectiveDates.toDay,
    fillEmptyDays,
    hiddenCategories,
    sortDirection,
    stackOrderBottomUp,
    summary.days,
  ])

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const d of summary.days) {
      for (const [cat, hrs] of Object.entries(d.byCategory)) {
        totals.set(cat, (totals.get(cat) ?? 0) + hrs)
      }
    }
    return totals
  }, [summary.days])

  const kpiStats = useMemo(() => {
    const count = displayedDays.length
    const totalHours = displayedDays.reduce((acc, d) => acc + d.visibleTotalHours, 0)
    const avgHours = count > 0 ? totalHours / count : 0

    let topCategory: { name: string; hours: number } | null = null
    for (const [cat, hrs] of categoryTotals.entries()) {
      if (hiddenCategories.has(cat)) continue
      if (!topCategory || hrs > topCategory.hours) {
        topCategory = { name: cat, hours: hrs }
      }
    }

    return {
      daysCount: count,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHours: Math.round(avgHours * 100) / 100,
      topCategory,
    }
  }, [categoryTotals, displayedDays, hiddenCategories])

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

  // SVG Chart Geometry
  const maxVisibleDayHours = useMemo(
    () => displayedDays.reduce((max, d) => Math.max(max, d.visibleTotalHours), 0),
    [displayedDays],
  )
  const { yMax, ticks } = useMemo(
    () => computeNiceYScale(maxVisibleDayHours),
    [maxVisibleDayHours],
  )

  const plotHeight = 340
  const topMargin = 28
  const bottomMargin = 92
  const leftAxisWidth = 54
  const rightPadding = 20
  const barPitch = displayedDays.length <= 18 ? 38 : displayedDays.length <= 32 ? 30 : 25
  const barWidth = Math.max(14, Math.round(barPitch * 0.68))
  const svgWidth = Math.max(
    680,
    leftAxisWidth + displayedDays.length * barPitch + rightPadding,
  )
  const svgHeight = topMargin + plotHeight + bottomMargin
  const baselineY = topMargin + plotHeight

  const yForHours = (hrs: number): number => {
    if (yMax <= 0) return baselineY
    return baselineY - (hrs / yMax) * plotHeight
  }

  const hoveredDayData = useMemo(() => {
    if (!hoveredBar) return null
    return displayedDays.find((d) => d.day === hoveredBar.day) ?? null
  }, [displayedDays, hoveredBar])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wykres dzienny kategorii</h1>
          <p className="page-description">
            Każdy słupek przedstawia osobny dzień z tabeli <code>dbo.CalendarLog</code>, a
            kolory odpowiadają godzinom w poszczególnych kategoriach.
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
            onClick={() => void loadSummary()}
          >
            {loading ? 'Odświeżanie…' : 'Odśwież wykres'}
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
            onClick={() => void loadSummary()}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="chart-kpi-grid">
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Dni na wykresie</span>
          <span className="chart-kpi-value">{kpiStats.daysCount}</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Suma godzin</span>
          <span className="chart-kpi-value">{kpiStats.totalHours.toFixed(2)} h</span>
        </div>
        <div className="chart-kpi-card">
          <span className="chart-kpi-label">Średnio dziennie</span>
          <span className="chart-kpi-value">{kpiStats.avgHours.toFixed(2)} h</span>
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

      {/* Main Chart Card */}
      <section className="panel" aria-labelledby="daily-chart-heading">
        <div className="panel-header chart-controls-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h2 id="daily-chart-heading" className="panel-title">
              Godziny wg dnia i kategorii
            </h2>

            {/* Range Preset Pills */}
            <div className="filter-bar" role="group" aria-label="Zakres dat">
              {(
                [
                  { id: '14d', label: '14 dni' },
                  { id: '30d', label: '30 dni' },
                  { id: '60d', label: '60 dni' },
                  { id: 'all', label: 'Wszystkie' },
                  { id: 'custom', label: 'Zakres dat' },
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
              title="Przełącz kolejność dni na osi X"
            >
              {sortDirection === 'desc' ? '← Najnowsze z lewej' : 'Chronologicznie →'}
            </button>

            <label className="switch" title="Uwzględnij na wykresie eventy bez przypisanej kategorii">
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

            <label className="switch" title="Wypełnij dni bez eventów słupkami 0.00">
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

        {loading && summary.days.length === 0 ? (
          <div className="empty-state">Ładowanie wykresu z dbo.CalendarLog…</div>
        ) : displayedDays.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Brak danych do wyświetlenia na wykresie</div>
            <p style={{ maxWidth: 520, margin: '0.35rem auto 1rem' }}>
              Zaimportuj eventy przyciskiem powyżej lub sprawdź reguły kategoryzacji w zakładce
              Kategorie.
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
        ) : (
          <div className="chart-workspace">
            {/* Left Legend matching Google Sheets layout */}
            <aside className="chart-legend" aria-label="Legenda kategorii">
              <div className="chart-legend-header">
                <span className="chart-legend-title">Kategorie</span>
                {hiddenCategories.size > 0 && (
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: '0.73rem' }}
                    onClick={() => setHiddenCategories(new Set())}
                  >
                    Pokaż wszystkie
                  </button>
                )}
              </div>

              <ul className="chart-legend-list">
                {legendCategoriesTopDown.map((cat) => {
                  const isHidden = hiddenCategories.has(cat)
                  const totalHrs = categoryTotals.get(cat) ?? 0
                  return (
                    <li key={cat}>
                      <button
                        type="button"
                        className={`chart-legend-item ${isHidden ? 'muted' : ''}`}
                        onClick={() => toggleCategoryVisibility(cat)}
                        title="Kliknij, aby ukryć lub pokazać kategorię na wykresie"
                      >
                        <span
                          className="chart-swatch"
                          style={{ backgroundColor: getCategoryColor(cat) }}
                        />
                        <span className="chart-legend-name">{formatCategoryLabel(cat)}</span>
                        {totalHrs > 0 && (
                          <span className="chart-legend-hours">{totalHrs.toFixed(1)}h</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {/* Right Scrollable SVG Stacked Column Chart */}
            <div className="chart-scroll-area">
              <svg
                className="daily-bar-svg"
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                role="img"
                aria-label="Wykres słupkowy godzin dziennych z podziałem na kategorie"
              >
                {/* Horizontal Gridlines & Y-Axis Labels */}
                {ticks.map((tick) => {
                  const y = yForHours(tick)
                  const isZero = tick === 0
                  return (
                    <g key={tick}>
                      <line
                        x1={leftAxisWidth}
                        y1={y}
                        x2={svgWidth - rightPadding / 2}
                        y2={y}
                        stroke={isZero ? '#334155' : '#cbd5e1'}
                        strokeWidth={isZero ? 1.25 : 1}
                      />
                      <text
                        x={leftAxisWidth - 10}
                        y={y + 4}
                        textAnchor="end"
                        fill="#334155"
                        fontSize="12"
                      >
                        {tick.toFixed(2)}
                      </text>
                    </g>
                  )
                })}

                {/* Daily Stacked Bars */}
                {displayedDays.map((dayItem, index) => {
                  const slotX = leftAxisWidth + index * barPitch + 6
                  const barX = slotX + Math.round((barPitch - barWidth) / 2)
                  const isHovered = hoveredBar?.day === dayItem.day
                  const isSelected = selectedDay === dayItem.day
                  const topBarY = yForHours(dayItem.visibleTotalHours)

                  return (
                    <g
                      key={dayItem.day}
                      className="chart-bar-group"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) =>
                        setHoveredBar({
                          day: dayItem.day,
                          clientX: e.clientX,
                          clientY: e.clientY,
                        })
                      }
                      onMouseMove={(e) =>
                        setHoveredBar({
                          day: dayItem.day,
                          clientX: e.clientX,
                          clientY: e.clientY,
                        })
                      }
                      onMouseLeave={() => setHoveredBar(null)}
                      onClick={() =>
                        setSelectedDay((prev) => (prev === dayItem.day ? null : dayItem.day))
                      }
                    >
                      {/* Invisible full-height hit rect + subtle hover/selected highlight */}
                      <rect
                        x={slotX}
                        y={topMargin - 12}
                        width={barPitch}
                        height={plotHeight + bottomMargin}
                        rx={4}
                        fill={
                          isSelected
                            ? 'hsla(219, 79%, 46%, 0.10)'
                            : isHovered
                              ? 'hsla(215, 25%, 27%, 0.05)'
                              : 'transparent'
                        }
                      />

                      {/* Stacked Category Segments (bottom-up) */}
                      {dayItem.segments.map((seg) => {
                        const yTop = yForHours(seg.yEndHours)
                        const yBottom = yForHours(seg.yStartHours)
                        const rectHeight = Math.max(0.5, yBottom - yTop)
                        return (
                          <rect
                            key={seg.category}
                            x={barX}
                            y={yTop}
                            width={barWidth}
                            height={rectHeight}
                            fill={seg.color}
                          />
                        )
                      })}

                      {/* Total Hours Label Above Bar */}
                      {dayItem.visibleTotalHours > 0 && (
                        <text
                          x={barX + barWidth / 2}
                          y={Math.max(14, topBarY - 6)}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="11"
                          fontWeight="500"
                        >
                          {dayItem.visibleTotalHours.toFixed(2)}
                        </text>
                      )}

                      {/* Rotated -90deg X-Axis Date Label */}
                      <text
                        transform={`translate(${barX + barWidth / 2 + 4}, ${baselineY + 10}) rotate(-90)`}
                        textAnchor="end"
                        fill={isSelected ? '#1d4ed8' : '#0f172a'}
                        fontSize="11.5"
                        fontWeight={isSelected ? '700' : '500'}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {dayItem.day}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        )}
      </section>

      {/* Floating Hover Tooltip */}
      {hoveredBar && hoveredDayData && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(window.innerWidth - 290, hoveredBar.clientX + 16),
            top: Math.max(16, hoveredBar.clientY - 24),
          }}
        >
          <div className="chart-tooltip-header">
            <div className="chart-tooltip-date">{formatDayWithWeekday(hoveredDayData.day)}</div>
            <div className="chart-tooltip-total">
              Suma: <strong>{hoveredDayData.visibleTotalHours.toFixed(2)} h</strong>
            </div>
          </div>
          {hoveredDayData.segments.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Brak zarejestrowanych godzin
            </div>
          ) : (
            <ul className="chart-tooltip-list">
              {[...hoveredDayData.segments].reverse().map((seg) => {
                const pct =
                  hoveredDayData.visibleTotalHours > 0
                    ? Math.round((seg.hours / hoveredDayData.visibleTotalHours) * 100)
                    : 0
                return (
                  <li key={seg.category} className="chart-tooltip-row">
                    <span className="chart-tooltip-cat">
                      <span
                        className="chart-swatch"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span>{formatCategoryLabel(seg.category)}</span>
                    </span>
                    <span className="chart-tooltip-val">
                      <strong>{seg.hours.toFixed(2)} h</strong>{' '}
                      <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="chart-tooltip-hint">Kliknij słupek, aby zobaczyć listę eventów z tego dnia</div>
        </div>
      )}

      {/* Selected Day Drill-Down Panel */}
      {selectedDay && (
        <section className="panel" aria-labelledby="selected-day-heading">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <h2 id="selected-day-heading" className="panel-title">
                Wydarzenia dnia: {formatDayWithWeekday(selectedDay)}
              </h2>
              <span className="badge badge-neutral">{selectedDayLogs.length} pozycji</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedDay(null)}
            >
              Zamknij szczegóły ✕
            </button>
          </div>

          {loadingDayLogs ? (
            <div className="empty-state">Ładowanie wydarzeń z dnia {selectedDay}…</div>
          ) : selectedDayLogs.length === 0 ? (
            <div className="empty-state">Brak wydarzeń w dbo.CalendarLog dla tego dnia.</div>
          ) : (
            <div className="table-wrap">
              <table className="cal-table">
                <thead>
                  <tr>
                    <th>Godziny</th>
                    <th>Czas (h)</th>
                    <th>Kategoria</th>
                    <th>Tytuł / Wartość</th>
                    <th>Kalendarz</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDayLogs.map((log) => {
                    const catKey = log.category || UNCATEGORIZED_KEY
                    return (
                      <tr key={log.calendarLogId}>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
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
