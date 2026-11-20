import { useEffect, useMemo, useRef, useState } from 'react'
import { queryCalendarLogs } from '../api/categoryRulesApi'
import { useAuth } from '../auth/useAuth'
import type {
  CalendarCategoryConfigItem,
  CalendarLogItem,
} from '../types/categoryRule'
import {
  UNCATEGORIZED_KEY,
  computeNiceHoursScale,
  formatCategoryLabel,
  formatTimeRange,
  getCategoryColor,
  normalizeLooseCategoryKey,
  resolveCanonicalCategoryName,
  type ChartBucketInput,
} from '../utils/chartCategories'

export type StackedChartMode = 'hours' | 'percent'
export type StackedChartGranularity = 'day' | 'week'

interface StackedCategoryChartCardProps {
  chartId: string
  title: string
  subtitle: string
  mode: StackedChartMode
  granularity: StackedChartGranularity
  apiUrl: string
  accountFilter: string
  effectiveFromDay?: string
  effectiveToDay?: string
  includeUncategorized: boolean
  refreshGeneration: number
  buckets: readonly ChartBucketInput[]
  legendCategoriesTopDown: readonly string[]
  categoryConfigs?: readonly CalendarCategoryConfigItem[]
  hiddenCategories: ReadonlySet<string>
  onToggleCategory: (category: string) => void
  onResetHiddenCategories: () => void
}

interface HoveredBucketState {
  key: string
  clientX: number
  clientY: number
}

const PERCENT_TICKS: ReadonlyArray<number> = [0, 25, 50, 75, 100]

export function StackedCategoryChartCard({
  chartId,
  title,
  subtitle,
  mode,
  granularity,
  apiUrl,
  accountFilter,
  effectiveFromDay,
  effectiveToDay,
  includeUncategorized,
  refreshGeneration,
  buckets,
  legendCategoriesTopDown,
  categoryConfigs,
  hiddenCategories,
  onToggleCategory,
  onResetHiddenCategories,
}: StackedCategoryChartCardProps) {
  const { getIdToken } = useAuth()

  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(880)
  const [hovered, setHovered] = useState<HoveredBucketState | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [tableCategoryFilter, setTableCategoryFilter] = useState<string>('ALL')
  const [rawSelectedLogs, setRawSelectedLogs] = useState<CalendarLogItem[]>([])
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false)

  const hasBars = buckets.length > 0

  useEffect(() => {
    if (!hasBars) return
    const el = scrollAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.floor(entry.contentRect.width)
        if (nextWidth > 0) {
          setContainerWidth((prev) => (prev === nextWidth ? prev : nextWidth))
        }
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasBars])

  const hiddenLooseKeys = useMemo(() => {
    const set = new Set<string>()
    for (const c of hiddenCategories) {
      set.add(normalizeLooseCategoryKey(c))
    }
    return set
  }, [hiddenCategories])

  const stackOrderBottomUp = useMemo(
    () => [...legendCategoriesTopDown].reverse(),
    [legendCategoriesTopDown],
  )

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const b of buckets) {
      for (const [cat, hrs] of Object.entries(b.byCategory)) {
        totals.set(cat, (totals.get(cat) ?? 0) + hrs)
      }
    }
    return totals
  }, [buckets])

  const grandTotalVisibleHours = useMemo(() => {
    let sum = 0
    for (const [cat, hrs] of categoryTotals.entries()) {
      if (!hiddenLooseKeys.has(normalizeLooseCategoryKey(cat))) {
        sum += hrs
      }
    }
    return sum
  }, [categoryTotals, hiddenLooseKeys])

  const computedBars = useMemo(() => {
    return buckets.map((b) => {
      let visibleTotal = 0
      const rawSegments: Array<{
        category: string
        hours: number
        color: string
        yStartHours: number
        yEndHours: number
      }> = []

      for (const cat of stackOrderBottomUp) {
        if (hiddenLooseKeys.has(normalizeLooseCategoryKey(cat))) continue
        const hours = b.byCategory[cat] ?? 0
        if (hours <= 0) continue
        const nextTotal = visibleTotal + hours
        rawSegments.push({
          category: cat,
          hours,
          color: getCategoryColor(cat, categoryConfigs),
          yStartHours: visibleTotal,
          yEndHours: nextTotal,
        })
        visibleTotal = nextTotal
      }

      const segments = rawSegments.map((seg) => ({
        ...seg,
        yStartPercent: visibleTotal > 0 ? (seg.yStartHours / visibleTotal) * 100 : 0,
        yEndPercent: visibleTotal > 0 ? (seg.yEndHours / visibleTotal) * 100 : 0,
        sharePercent: visibleTotal > 0 ? (seg.hours / visibleTotal) * 100 : 0,
      }))

      return {
        key: b.key,
        xLabel: b.xLabel,
        tooltipTitle: b.tooltipTitle,
        visibleTotalHours: Math.round(visibleTotal * 100) / 100,
        segments,
      }
    })
  }, [buckets, categoryConfigs, hiddenLooseKeys, stackOrderBottomUp])

  const selectedBarData = useMemo(() => {
    if (!selectedKey) return null
    return computedBars.find((b) => b.key === selectedKey) ?? null
  }, [computedBars, selectedKey])

  const activeSelectedKey = selectedBarData ? selectedBarData.key : null

  // Fetch events for this chart's independently selected bar
  useEffect(() => {
    if (!activeSelectedKey) return
    let cancelled = false

    const run = async () => {
      setLoadingLogs(true)
      try {
        const token = await getIdToken()
        const accountParam = accountFilter === 'ALL' ? undefined : accountFilter
        const items =
          granularity === 'day'
            ? await queryCalendarLogs(apiUrl, token, {
                account: accountParam,
                fromDay: activeSelectedKey,
                toDay: activeSelectedKey,
                limit: 500,
              })
            : await queryCalendarLogs(apiUrl, token, {
                account: accountParam,
                weekNumber: Number.parseInt(activeSelectedKey, 10),
                fromDay: effectiveFromDay,
                toDay: effectiveToDay,
                limit: 1500,
              })
        if (!cancelled) {
          setRawSelectedLogs(
            [...items].sort((a, b) => a.startTime.localeCompare(b.startTime)),
          )
        }
      } catch {
        if (!cancelled) {
          setRawSelectedLogs([])
        }
      } finally {
        if (!cancelled) {
          setLoadingLogs(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    accountFilter,
    activeSelectedKey,
    apiUrl,
    effectiveFromDay,
    effectiveToDay,
    getIdToken,
    granularity,
    refreshGeneration,
  ])

  const handleToggleBarSelection = (key: string) => {
    if (activeSelectedKey === key) {
      setSelectedKey(null)
      setRawSelectedLogs([])
      setTableCategoryFilter('ALL')
    } else {
      setSelectedKey(key)
      setTableCategoryFilter('ALL')
    }
  }

  const maxVisibleHours = useMemo(
    () => computedBars.reduce((max, b) => Math.max(max, b.visibleTotalHours), 0),
    [computedBars],
  )

  const averageVisibleHours = useMemo(() => {
    if (computedBars.length === 0) return 0
    const sum = computedBars.reduce((acc, b) => acc + b.visibleTotalHours, 0)
    return sum / computedBars.length
  }, [computedBars])

  const showAverageLine =
    granularity === 'week' && mode === 'hours' && averageVisibleHours > 0

  const hoursScale = useMemo(
    () => computeNiceHoursScale(maxVisibleHours),
    [maxVisibleHours],
  )

  const yMax = mode === 'percent' ? 100 : hoursScale.yMax
  const ticks = mode === 'percent' ? PERCENT_TICKS : hoursScale.ticks

  const plotHeight = 310
  const fitToContainer = computedBars.length > 0 && computedBars.length <= 32
  const leftAxisWidth = 44
  const slotOffset = 6
  const rightPadding = showAverageLine ? 72 : 14
  const availableBarsWidth = Math.max(
    300,
    containerWidth - leftAxisWidth - slotOffset - rightPadding,
  )
  const barPitch = fitToContainer
    ? Math.min(42, Math.max(16, Math.floor(availableBarsWidth / computedBars.length)))
    : computedBars.length <= 40
      ? 28
      : 24
  const barWidth = Math.max(11, Math.round(barPitch * 0.68))
  const compactTopLabels = barPitch < 25
  const topMargin = mode === 'percent' && compactTopLabels ? 42 : 30
  const bottomMargin = 84

  const naturalSvgWidth =
    leftAxisWidth + slotOffset + computedBars.length * barPitch + rightPadding
  const svgWidth = fitToContainer
    ? Math.max(naturalSvgWidth, containerWidth)
    : Math.max(660, naturalSvgWidth)
  const plotRightX = svgWidth - rightPadding
  const svgHeight = topMargin + plotHeight + bottomMargin
  const baselineY = topMargin + plotHeight

  const yForValue = (val: number): number => {
    if (yMax <= 0) return baselineY
    return baselineY - (val / yMax) * plotHeight
  }

  const hoveredBarData = useMemo(() => {
    if (!hovered) return null
    return computedBars.find((b) => b.key === hovered.key) ?? null
  }, [computedBars, hovered])

  // Filter raw logs to ONLY the events actually included in the clicked bar
  // (respecting includeUncategorized and hiddenCategories in the legend!)
  const barIncludedLogs = useMemo(() => {
    return rawSelectedLogs
      .map((log) => ({
        log,
        canonicalCategory: resolveCanonicalCategoryName(log.category, categoryConfigs),
      }))
      .filter(({ canonicalCategory }) => {
        if (!includeUncategorized && canonicalCategory === UNCATEGORIZED_KEY) {
          return false
        }
        if (hiddenLooseKeys.has(normalizeLooseCategoryKey(canonicalCategory))) {
          return false
        }
        return true
      })
  }, [categoryConfigs, hiddenLooseKeys, includeUncategorized, rawSelectedLogs])

  const barCategoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of barIncludedLogs) {
      map.set(
        item.canonicalCategory,
        (map.get(item.canonicalCategory) ?? 0) + item.log.durationHours,
      )
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [barIncludedLogs])

  const barTotalHours = useMemo(
    () => barIncludedLogs.reduce((acc, item) => acc + item.log.durationHours, 0),
    [barIncludedLogs],
  )

  const effectiveTableCategoryFilter = useMemo(() => {
    if (tableCategoryFilter === 'ALL') return 'ALL'
    return barCategoryBreakdown.some(([cat]) => cat === tableCategoryFilter)
      ? tableCategoryFilter
      : 'ALL'
  }, [barCategoryBreakdown, tableCategoryFilter])

  const displayedTableLogs = useMemo(() => {
    if (effectiveTableCategoryFilter === 'ALL') {
      return barIncludedLogs
    }
    return barIncludedLogs.filter(
      (item) => item.canonicalCategory === effectiveTableCategoryFilter,
    )
  }, [barIncludedLogs, effectiveTableCategoryFilter])

  const clickHintLabel =
    granularity === 'day'
      ? 'Kliknij słupek, aby rozwinąć pod wykresem listę wydarzeń z tego dnia'
      : 'Kliknij słupek, aby rozwinąć pod wykresem listę wydarzeń z tego tygodnia'

  return (
    <section className="panel" aria-labelledby={`${chartId}-heading`}>
      <div className="panel-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <h2 id={`${chartId}-heading`} className="panel-title">
              {title}
            </h2>
            <span className={`badge ${mode === 'percent' ? 'badge-synced' : 'badge-neutral'}`}>
              {mode === 'percent' ? '100% Skumulowany' : 'Godziny (h)'}
            </span>
            <span className="badge badge-neutral">{computedBars.length} słupków</span>
            {granularity === 'week' && computedBars.length > 0 && (
              <span
                className="badge"
                style={{
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                }}
              >
                Average ({computedBars.length} tyg.): {Math.round(averageVisibleHours)} h
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {subtitle}
          </p>
        </div>
      </div>

      {computedBars.length === 0 ? (
        <div className="empty-state">Brak danych w wybranym zakresie.</div>
      ) : (
        <div className="chart-workspace">
          {/* Left Legend */}
          <aside className="chart-legend" aria-label={`Legenda — ${title}`}>
            <div className="chart-legend-header">
              <span className="chart-legend-title">Kategorie</span>
              {hiddenCategories.size > 0 && (
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: '0.73rem' }}
                  onClick={onResetHiddenCategories}
                >
                  Pokaż wszystkie
                </button>
              )}
            </div>

            <ul className="chart-legend-list">
              {legendCategoriesTopDown.map((cat) => {
                const isHidden = hiddenLooseKeys.has(normalizeLooseCategoryKey(cat))
                const totalHrs = categoryTotals.get(cat) ?? 0
                const pct =
                  !isHidden && grandTotalVisibleHours > 0
                    ? Math.round((totalHrs / grandTotalVisibleHours) * 100)
                    : 0
                return (
                  <li key={cat}>
                    <button
                      type="button"
                      className={`chart-legend-item ${isHidden ? 'muted' : ''}`}
                      onClick={() => onToggleCategory(cat)}
                      title="Kliknij, aby ukryć lub pokazać kategorię na wszystkich wykresach"
                    >
                      <span
                        className="chart-swatch"
                        style={{ backgroundColor: getCategoryColor(cat, categoryConfigs) }}
                      />
                      <span className="chart-legend-name">{formatCategoryLabel(cat)}</span>
                      {totalHrs > 0 && (
                        <span className="chart-legend-hours">
                          {mode === 'percent'
                            ? `${pct}%`
                            : granularity === 'week'
                              ? `${Math.round(totalHrs)}h`
                              : `${totalHrs.toFixed(1)}h`}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* Right SVG Stacked Bar Chart */}
          <div
            ref={scrollAreaRef}
            className="chart-scroll-area"
            style={fitToContainer ? { overflowX: 'hidden', paddingBottom: 0 } : undefined}
          >
            <svg
              className="daily-bar-svg"
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={
                fitToContainer
                  ? { width: '100%', maxWidth: '100%', height: 'auto' }
                  : undefined
              }
              role="img"
              aria-label={title}
            >
              {/* Horizontal Gridlines & Y-Axis Labels */}
              {ticks.map((tick) => {
                const y = yForValue(tick)
                const isZero = tick === 0
                return (
                  <g key={tick}>
                    <line
                      x1={leftAxisWidth}
                      y1={y}
                      x2={plotRightX}
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
                      {mode === 'percent'
                        ? `${tick}%`
                        : granularity === 'week'
                          ? `${Math.round(tick)}`
                          : tick.toFixed(2)}
                    </text>
                  </g>
                )
              })}

              {/* Stacked Bars */}
              {computedBars.map((bar, index) => {
                const slotX = leftAxisWidth + index * barPitch + slotOffset
                const barX = slotX + Math.round((barPitch - barWidth) / 2)
                const isHovered = hovered?.key === bar.key
                const isSelected = activeSelectedKey === bar.key

                return (
                  <g
                    key={bar.key}
                    className="chart-bar-group"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) =>
                      setHovered({
                        key: bar.key,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setHovered({
                        key: bar.key,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleToggleBarSelection(bar.key)}
                  >
                    {/* Hover / Selection Column Highlight */}
                    <rect
                      x={slotX}
                      y={topMargin - 14}
                      width={barPitch}
                      height={plotHeight + bottomMargin}
                      rx={4}
                      fill={
                        isSelected
                          ? 'hsla(219, 79%, 46%, 0.12)'
                          : isHovered
                            ? 'hsla(215, 25%, 27%, 0.05)'
                            : 'transparent'
                      }
                    />

                    {/* Stacked Segments */}
                    {bar.segments.map((seg) => {
                      const yTop = yForValue(
                        mode === 'percent' ? seg.yEndPercent : seg.yEndHours,
                      )
                      const yBottom = yForValue(
                        mode === 'percent' ? seg.yStartPercent : seg.yStartHours,
                      )
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

                    {/* Vertical -90deg X-Axis Label */}
                    <text
                      transform={`translate(${barX + barWidth / 2 + 4}, ${baselineY + 10}) rotate(-90)`}
                      textAnchor="end"
                      fill={isSelected ? '#1d4ed8' : '#0f172a'}
                      fontSize="11.5"
                      fontWeight={isSelected ? '700' : '500'}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {bar.xLabel}
                    </text>
                  </g>
                )
              })}

              {/* Horizontal Average Line across the 26 Weekly Bars */}
              {showAverageLine && (() => {
                const avgY = yForValue(averageVisibleHours)
                const labelText = `Avg: ${Math.round(averageVisibleHours)}h`
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line
                      x1={leftAxisWidth}
                      y1={avgY}
                      x2={plotRightX}
                      y2={avgY}
                      stroke="#ffffff"
                      strokeWidth={3.5}
                      strokeOpacity={0.8}
                    />
                    <line
                      x1={leftAxisWidth}
                      y1={avgY}
                      x2={plotRightX}
                      y2={avgY}
                      stroke="#dc2626"
                      strokeWidth={1.75}
                      strokeDasharray="6 4"
                    />
                    <rect
                      x={plotRightX + 4}
                      y={avgY - 10}
                      width={64}
                      height={20}
                      rx={5}
                      fill="#fef2f2"
                      stroke="#fca5a5"
                      strokeWidth={1}
                    />
                    <text
                      x={plotRightX + 36}
                      y={avgY + 4}
                      textAnchor="middle"
                      fill="#b91c1c"
                      fontSize="11"
                      fontWeight="700"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {labelText}
                    </text>
                  </g>
                )
              })()}

              {/* Top Hours Labels Above Bars (drawn above Average line with crisp white halo) */}
              <g style={{ pointerEvents: 'none' }}>
                {computedBars.map((bar, index) => {
                  if (bar.visibleTotalHours <= 0) return null
                  const slotX = leftAxisWidth + index * barPitch + slotOffset
                  const barX = slotX + Math.round((barPitch - barWidth) / 2)
                  const topVal =
                    mode === 'percent' ? 100 : bar.visibleTotalHours
                  const topBarY = yForValue(topVal)
                  const labelVal =
                    granularity === 'week'
                      ? Math.round(bar.visibleTotalHours)
                      : bar.visibleTotalHours.toFixed(2)

                  return compactTopLabels && mode === 'percent' ? (
                    <text
                      key={bar.key}
                      transform={`translate(${barX + barWidth / 2 + 3}, ${topBarY - 5}) rotate(-55)`}
                      textAnchor="start"
                      fill="#475569"
                      stroke="#ffffff"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      fontSize="10"
                      fontWeight="600"
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        paintOrder: 'stroke',
                      }}
                    >
                      {labelVal}
                    </text>
                  ) : (
                    <text
                      key={bar.key}
                      x={barX + barWidth / 2}
                      y={Math.max(13, topBarY - 6)}
                      textAnchor="middle"
                      fill="#475569"
                      stroke="#ffffff"
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                      fontSize={compactTopLabels ? '10' : '11'}
                      fontWeight="600"
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        paintOrder: 'stroke',
                      }}
                    >
                      {labelVal}
                    </text>
                  )
                })}
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* Independent Per-Chart Drill-Down Table Rendered Directly Underneath This Chart */}
      {activeSelectedKey && selectedBarData && (
        <div
          className="chart-inline-drilldown"
          aria-labelledby={`${chartId}-drilldown-heading`}
        >
          <div className="chart-inline-drilldown-header">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  flexWrap: 'wrap',
                }}
              >
                <h3
                  id={`${chartId}-drilldown-heading`}
                  className="panel-title"
                  style={{ fontSize: '0.9rem' }}
                >
                  Uwzględnione wydarzenia: {selectedBarData.tooltipTitle}
                </h3>
                <span className="badge badge-neutral">
                  {barIncludedLogs.length} pozycji
                </span>
                <span className="badge badge-synced">
                  Suma słupka: {barTotalHours.toFixed(2)} h
                  {mode === 'percent' && barTotalHours > 0 ? ' (100%)' : ''}
                </span>
              </div>

              {barCategoryBreakdown.length > 1 && (
                <div className="filter-bar" role="group" aria-label="Filtr kategorii w słupku">
                  <button
                    type="button"
                    className={`filter-pill ${effectiveTableCategoryFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setTableCategoryFilter('ALL')}
                  >
                    Wszystkie ({barIncludedLogs.length})
                  </button>
                  {barCategoryBreakdown.map(([cat, hrs]) => {
                    const pct =
                      barTotalHours > 0 ? Math.round((hrs / barTotalHours) * 100) : 0
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`filter-pill ${effectiveTableCategoryFilter === cat ? 'active' : ''}`}
                        onClick={() => setTableCategoryFilter(cat)}
                      >
                        <span
                          className="chart-swatch"
                          style={{
                            width: 10,
                            height: 10,
                            backgroundColor: getCategoryColor(cat, categoryConfigs),
                          }}
                        />
                        <span>
                          {formatCategoryLabel(cat)} ·{' '}
                          {mode === 'percent' ? `${pct}%` : `${hrs.toFixed(2)}h`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSelectedKey(null)
                setRawSelectedLogs([])
                setTableCategoryFilter('ALL')
              }}
            >
              Zamknij ✕
            </button>
          </div>

          {loadingLogs ? (
            <div className="empty-state" style={{ padding: '1.75rem 1rem' }}>
              Ładowanie wydarzeń uwzględnionych w słupku {activeSelectedKey}…
            </div>
          ) : displayedTableLogs.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.75rem 1rem' }}>
              Brak wydarzeń uwzględnionych w tym słupku.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="cal-table">
                <thead>
                  <tr>
                    {granularity === 'week' && <th>Dzień</th>}
                    <th>Godziny</th>
                    <th>Czas (h)</th>
                    {mode === 'percent' && <th>Udział (%)</th>}
                    <th>Kategoria</th>
                    <th>Tytuł / Wartość</th>
                    <th>Kalendarz</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTableLogs.map(({ log, canonicalCategory }) => {
                    const sharePct =
                      barTotalHours > 0
                        ? ((log.durationHours / barTotalHours) * 100).toFixed(1)
                        : '0.0'
                    return (
                      <tr key={log.calendarLogId}>
                        {granularity === 'week' && (
                          <td
                            style={{
                              whiteSpace: 'nowrap',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.8rem',
                            }}
                          >
                            {log.day}
                          </td>
                        )}
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {formatTimeRange(log.startTime, log.endTime)}
                        </td>
                        <td
                          style={{
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {log.durationHours.toFixed(2)}
                        </td>
                        {mode === 'percent' && (
                          <td
                            style={{
                              fontVariantNumeric: 'tabular-nums',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {sharePct}%
                          </td>
                        )}
                        <td>
                          <span className="chart-cat-pill">
                            <span
                              className="chart-swatch"
                              style={{
                                backgroundColor: getCategoryColor(
                                  canonicalCategory,
                                  categoryConfigs,
                                ),
                              }}
                            />
                            <span>{formatCategoryLabel(canonicalCategory)}</span>
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {log.title || '(bez tytułu)'}
                          </div>
                          {log.value && (
                            <div
                              style={{
                                fontSize: '0.76rem',
                                color: 'var(--text-muted)',
                              }}
                            >
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
        </div>
      )}

      {/* Hover Tooltip */}
      {hovered && hoveredBarData && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(window.innerWidth - 295, hovered.clientX + 16),
            top: Math.max(16, hovered.clientY - 24),
          }}
        >
          <div className="chart-tooltip-header">
            <div className="chart-tooltip-date">{hoveredBarData.tooltipTitle}</div>
            <div className="chart-tooltip-total">
              Suma: <strong>{hoveredBarData.visibleTotalHours.toFixed(2)} h</strong>
              {mode === 'percent' && hoveredBarData.visibleTotalHours > 0 ? ' (100%)' : ''}
            </div>
          </div>
          {hoveredBarData.segments.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Brak zarejestrowanych godzin
            </div>
          ) : (
            <ul className="chart-tooltip-list">
              {[...hoveredBarData.segments].reverse().map((seg) => (
                <li key={seg.category} className="chart-tooltip-row">
                  <span className="chart-tooltip-cat">
                    <span
                      className="chart-swatch"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span>{formatCategoryLabel(seg.category)}</span>
                  </span>
                  <span className="chart-tooltip-val">
                    {mode === 'percent' ? (
                      <>
                        <strong>{seg.sharePercent.toFixed(1)}%</strong>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          ({seg.hours.toFixed(2)} h)
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>{seg.hours.toFixed(2)} h</strong>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          ({Math.round(seg.sharePercent)}%)
                        </span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="chart-tooltip-hint">{clickHintLabel}</div>
        </div>
      )}
    </section>
  )
}
