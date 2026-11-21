import { useEffect, useMemo, useRef, useState } from 'react'
import { queryDataPointEvents } from '../api/dataPointsApi'
import { useAuth } from '../auth/useAuth'
import type {
  DataPointCategoryChart,
  DataPointEventItem,
  DataPointMonthBucket,
} from '../types/dataPoint'
import { formatTimeRange } from '../utils/chartCategories'

const VALUE_COLOR_PALETTE: ReadonlyArray<string> = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#eab308',
]

function computeNiceIntegerCountScale(maxCount: number): {
  yMax: number
  ticks: number[]
} {
  const safeMax = Math.max(1, Math.ceil(maxCount))
  const padded = Math.ceil(safeMax * 1.15)

  let step = 1
  if (padded <= 6) step = 1
  else if (padded <= 14) step = 2
  else if (padded <= 30) step = 5
  else if (padded <= 60) step = 10
  else step = 20

  const yMax = Math.max(step * 2, Math.ceil(padded / step) * step)
  const ticks: number[] = []
  for (let v = 0; v <= yMax; v += step) {
    ticks.push(v)
  }
  return { yMax, ticks }
}

function formatMonthTitle(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  if (!year || !month || month < 1 || month > 12) {
    return yyyyMm
  }
  const dt = new Date(Date.UTC(year, month - 1, 15))
  const label = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(dt)
  return `${label} (${yyyyMm})`
}

function expandMonthRange(
  months: readonly DataPointMonthBucket[],
  fillEmptyMonths: boolean,
  maxMonths: number,
  sortDirection: 'desc' | 'asc',
): DataPointMonthBucket[] {
  if (months.length === 0) return []

  let base: DataPointMonthBucket[]
  if (!fillEmptyMonths) {
    base = [...months]
  } else {
    const sortedIso = months.map((m) => m.month).sort()
    const minMonth = sortedIso[0]
    const maxMonth = sortedIso[sortedIso.length - 1]
    const byMonth = new Map<string, DataPointMonthBucket>(
      months.map((m) => [m.month, m]),
    )
    const [sy, sm] = minMonth.split('-').map(Number)
    const [ey, em] = maxMonth.split('-').map(Number)

    base = []
    let curY = sy
    let curM = sm
    let safety = 0
    while ((curY < ey || (curY === ey && curM <= em)) && safety < 240) {
      const iso = `${curY}-${String(curM).padStart(2, '0')}`
      base.push(
        byMonth.get(iso) ?? {
          month: iso,
          totalCount: 0,
          byValue: {},
        },
      )
      curM += 1
      if (curM > 12) {
        curM = 1
        curY += 1
      }
      safety += 1
    }
  }

  const latest = [...base]
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, maxMonths)

  return sortDirection === 'desc' ? latest : [...latest].reverse()
}

interface HoveredMonthState {
  month: string
  clientX: number
  clientY: number
}

interface DataPointCategoryChartCardProps {
  chart: DataPointCategoryChart
  chartIndex: number
  apiUrl: string
  accountFilter: string
  effectiveFromDay?: string
  effectiveToDay?: string
  fillEmptyMonths: boolean
  maxMonths: number
  sortDirection: 'desc' | 'asc'
  refreshGeneration: number
}

export function DataPointCategoryChartCard({
  chart,
  chartIndex,
  apiUrl,
  accountFilter,
  effectiveFromDay,
  effectiveToDay,
  fillEmptyMonths,
  maxMonths,
  sortDirection,
  refreshGeneration,
}: DataPointCategoryChartCardProps) {
  const { getIdToken } = useAuth()

  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(880)
  const [hiddenValues, setHiddenValues] = useState<Set<string>>(() => new Set())
  const [hovered, setHovered] = useState<HoveredMonthState | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [tableValueFilter, setTableValueFilter] = useState<string>('ALL')
  const [rawSelectedEvents, setRawSelectedEvents] = useState<DataPointEventItem[]>([])
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false)

  const colorByValue = useMemo(() => {
    const map = new Map<string, string>()
    chart.values.forEach((val, idx) => {
      map.set(val, VALUE_COLOR_PALETTE[idx % VALUE_COLOR_PALETTE.length])
    })
    return map
  }, [chart.values])

  const displayedMonths = useMemo(
    () =>
      expandMonthRange(chart.months, fillEmptyMonths, maxMonths, sortDirection),
    [chart.months, fillEmptyMonths, maxMonths, sortDirection],
  )

  const hasBars = displayedMonths.length > 0

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

  // Bottom-to-top stacking order: largest total value at bottom, smallest on top;
  // legend top-to-bottom matches bar top-to-bottom!
  const legendValuesTopDown = useMemo(
    () => [...chart.values].reverse(),
    [chart.values],
  )

  const valueTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of displayedMonths) {
      for (const [val, cnt] of Object.entries(m.byValue)) {
        map.set(val, (map.get(val) ?? 0) + cnt)
      }
    }
    return map
  }, [displayedMonths])

  const computedBars = useMemo(() => {
    return displayedMonths.map((m) => {
      let visibleTotal = 0
      const segments: Array<{
        value: string
        count: number
        color: string
        yStart: number
        yEnd: number
      }> = []

      for (const val of chart.values) {
        if (hiddenValues.has(val)) continue
        const cnt = m.byValue[val] ?? 0
        if (cnt <= 0) continue
        const nextTotal = visibleTotal + cnt
        segments.push({
          value: val,
          count: cnt,
          color: colorByValue.get(val) ?? '#3b82f6',
          yStart: visibleTotal,
          yEnd: nextTotal,
        })
        visibleTotal = nextTotal
      }

      return {
        month: m.month,
        tooltipTitle: formatMonthTitle(m.month),
        visibleTotalCount: visibleTotal,
        segments,
      }
    })
  }, [chart.values, colorByValue, displayedMonths, hiddenValues])

  const visibleGrandTotal = useMemo(
    () => computedBars.reduce((acc, b) => acc + b.visibleTotalCount, 0),
    [computedBars],
  )

  const selectedBarData = useMemo(() => {
    if (!selectedMonth) return null
    return computedBars.find((b) => b.month === selectedMonth) ?? null
  }, [computedBars, selectedMonth])

  const activeSelectedMonth = selectedBarData ? selectedBarData.month : null

  useEffect(() => {
    if (!activeSelectedMonth) return
    let cancelled = false

    const run = async () => {
      setLoadingEvents(true)
      try {
        const token = await getIdToken()
        const items = await queryDataPointEvents(apiUrl, token, {
          account: accountFilter === 'ALL' ? undefined : accountFilter,
          category: chart.category,
          month: activeSelectedMonth,
          fromDay: effectiveFromDay,
          toDay: effectiveToDay,
        })
        if (!cancelled) {
          setRawSelectedEvents(items)
        }
      } catch {
        if (!cancelled) {
          setRawSelectedEvents([])
        }
      } finally {
        if (!cancelled) {
          setLoadingEvents(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    accountFilter,
    activeSelectedMonth,
    apiUrl,
    chart.category,
    effectiveFromDay,
    effectiveToDay,
    getIdToken,
    refreshGeneration,
  ])

  const toggleValueVisibility = (val: string) => {
    setHiddenValues((prev) => {
      const next = new Set(prev)
      if (next.has(val)) {
        next.delete(val)
      } else {
        next.add(val)
      }
      return next
    })
  }

  const handleToggleMonthBar = (month: string) => {
    if (activeSelectedMonth === month) {
      setSelectedMonth(null)
      setRawSelectedEvents([])
      setTableValueFilter('ALL')
    } else {
      setSelectedMonth(month)
      setTableValueFilter('ALL')
    }
  }

  const maxVisibleCount = useMemo(
    () => computedBars.reduce((max, b) => Math.max(max, b.visibleTotalCount), 0),
    [computedBars],
  )

  const countScale = useMemo(
    () => computeNiceIntegerCountScale(maxVisibleCount),
    [maxVisibleCount],
  )

  const plotHeight = 270
  const fitToContainer = computedBars.length > 0 && computedBars.length <= 32
  const leftAxisWidth = 42
  const slotOffset = 6
  const rightPadding = 16
  const availableBarsWidth = Math.max(
    300,
    containerWidth - leftAxisWidth - slotOffset - rightPadding,
  )
  const barPitch = fitToContainer
    ? Math.min(48, Math.max(18, Math.floor(availableBarsWidth / computedBars.length)))
    : 28
  const barWidth = Math.max(12, Math.round(barPitch * 0.66))
  const topMargin = 28
  const bottomMargin = 72

  const naturalSvgWidth =
    leftAxisWidth + slotOffset + computedBars.length * barPitch + rightPadding
  const svgWidth = fitToContainer
    ? Math.max(naturalSvgWidth, containerWidth)
    : Math.max(620, naturalSvgWidth)
  const plotRightX = svgWidth - rightPadding
  const svgHeight = topMargin + plotHeight + bottomMargin
  const baselineY = topMargin + plotHeight

  const yForCount = (val: number): number => {
    if (countScale.yMax <= 0) return baselineY
    return baselineY - (val / countScale.yMax) * plotHeight
  }

  const hoveredBarData = useMemo(() => {
    if (!hovered) return null
    return computedBars.find((b) => b.month === hovered.month) ?? null
  }, [computedBars, hovered])

  const barIncludedEvents = useMemo(
    () => rawSelectedEvents.filter((ev) => !hiddenValues.has(ev.value)),
    [hiddenValues, rawSelectedEvents],
  )

  const barValueBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of barIncludedEvents) {
      map.set(ev.value, (map.get(ev.value) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [barIncludedEvents])

  const effectiveTableValueFilter = useMemo(() => {
    if (tableValueFilter === 'ALL') return 'ALL'
    return barValueBreakdown.some(([v]) => v === tableValueFilter)
      ? tableValueFilter
      : 'ALL'
  }, [barValueBreakdown, tableValueFilter])

  const displayedTableEvents = useMemo(() => {
    if (effectiveTableValueFilter === 'ALL') return barIncludedEvents
    return barIncludedEvents.filter((ev) => ev.value === effectiveTableValueFilter)
  }, [barIncludedEvents, effectiveTableValueFilter])

  const headingId = `dp-chart-${chartIndex}-heading`

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="panel-header">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 id={headingId} className="panel-title">
              {chart.category}
            </h2>
            <span className="badge badge-synced">
              Suma: {visibleGrandTotal} wyst.
            </span>
            <span className="badge badge-neutral">
              {chart.values.length}{' '}
              {chart.values.length === 1 ? 'wartość' : 'wartości'}
            </span>
            <span className="badge badge-neutral">
              {computedBars.length} mies.
            </span>
          </div>
          <p
            style={{
              fontSize: '0.79rem',
              color: 'var(--text-muted)',
              marginTop: '0.15rem',
            }}
          >
            Liczba wystąpień (Count) w każdym miesiącu z podziałem na wartości — kliknij
            słupek miesiąca, aby wyświetlić poniżej listę wydarzeń.
          </p>
        </div>
      </div>

      {computedBars.length === 0 ? (
        <div className="empty-state">Brak danych dla tej kategorii.</div>
      ) : (
        <div className="chart-workspace">
          {/* Left Legend: Distinct Values within this Category */}
          <aside className="chart-legend" aria-label={`Wartości — ${chart.category}`}>
            <div className="chart-legend-header">
              <span className="chart-legend-title">Wartości</span>
              {hiddenValues.size > 0 && (
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: '0.73rem' }}
                  onClick={() => setHiddenValues(new Set())}
                >
                  Pokaż wszystkie
                </button>
              )}
            </div>

            <ul className="chart-legend-list">
              {legendValuesTopDown.map((val) => {
                const isHidden = hiddenValues.has(val)
                const cnt = valueTotals.get(val) ?? 0
                return (
                  <li key={val}>
                    <button
                      type="button"
                      className={`chart-legend-item ${isHidden ? 'muted' : ''}`}
                      onClick={() => toggleValueVisibility(val)}
                      title="Kliknij, aby ukryć lub pokazać tę wartość na wykresie"
                    >
                      <span
                        className="chart-swatch"
                        style={{ backgroundColor: colorByValue.get(val) ?? '#3b82f6' }}
                      />
                      <span className="chart-legend-name">{val}</span>
                      <span className="chart-legend-hours">{cnt}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* Right Stacked Monthly Count Bar Chart */}
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
              aria-label={`Wykres miesięczny kategorii ${chart.category}`}
            >
              {/* Horizontal Gridlines & Integer Y-Axis Ticks */}
              {countScale.ticks.map((tick) => {
                const y = yForCount(tick)
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
                      {tick}
                    </text>
                  </g>
                )
              })}

              {/* Monthly Stacked Bars */}
              {computedBars.map((bar, index) => {
                const slotX = leftAxisWidth + index * barPitch + slotOffset
                const barX = slotX + Math.round((barPitch - barWidth) / 2)
                const isHovered = hovered?.month === bar.month
                const isSelected = activeSelectedMonth === bar.month

                return (
                  <g
                    key={bar.month}
                    className="chart-bar-group"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) =>
                      setHovered({
                        month: bar.month,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setHovered({
                        month: bar.month,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleToggleMonthBar(bar.month)}
                  >
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

                    {bar.segments.map((seg) => {
                      const yTop = yForCount(seg.yEnd)
                      const yBottom = yForCount(seg.yStart)
                      const rectHeight = Math.max(1, yBottom - yTop)
                      return (
                        <rect
                          key={seg.value}
                          x={barX}
                          y={yTop}
                          width={barWidth}
                          height={rectHeight}
                          fill={seg.color}
                        />
                      )
                    })}

                    <text
                      transform={`translate(${barX + barWidth / 2 + 4}, ${baselineY + 10}) rotate(-90)`}
                      textAnchor="end"
                      fill={isSelected ? '#1d4ed8' : '#0f172a'}
                      fontSize="11.5"
                      fontWeight={isSelected ? '700' : '500'}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {bar.month}
                    </text>
                  </g>
                )
              })}

              {/* Top Integer Count Labels */}
              <g style={{ pointerEvents: 'none' }}>
                {computedBars.map((bar, index) => {
                  if (bar.visibleTotalCount <= 0) return null
                  const slotX = leftAxisWidth + index * barPitch + slotOffset
                  const barX = slotX + Math.round((barPitch - barWidth) / 2)
                  const topBarY = yForCount(bar.visibleTotalCount)
                  return (
                    <text
                      key={bar.month}
                      x={barX + barWidth / 2}
                      y={Math.max(13, topBarY - 6)}
                      textAnchor="middle"
                      fill="#475569"
                      stroke="#ffffff"
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                      fontSize="11"
                      fontWeight="600"
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        paintOrder: 'stroke',
                      }}
                    >
                      {bar.visibleTotalCount}
                    </text>
                  )
                })}
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* Independent Per-Category Drill-Down Table Rendered Directly Underneath */}
      {activeSelectedMonth && selectedBarData && (
        <div
          className="chart-inline-drilldown"
          aria-labelledby={`dp-drilldown-${chartIndex}`}
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
                  id={`dp-drilldown-${chartIndex}`}
                  className="panel-title"
                  style={{ fontSize: '0.9rem' }}
                >
                  Wydarzenia {chart.category} — {selectedBarData.tooltipTitle}
                </h3>
                <span className="badge badge-synced">
                  Count: {barIncludedEvents.length}
                </span>
              </div>

              {barValueBreakdown.length > 1 && (
                <div className="filter-bar" role="group" aria-label="Filtr wartości w słupku">
                  <button
                    type="button"
                    className={`filter-pill ${effectiveTableValueFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setTableValueFilter('ALL')}
                  >
                    Wszystkie ({barIncludedEvents.length})
                  </button>
                  {barValueBreakdown.map(([val, cnt]) => (
                    <button
                      key={val}
                      type="button"
                      className={`filter-pill ${effectiveTableValueFilter === val ? 'active' : ''}`}
                      onClick={() => setTableValueFilter(val)}
                    >
                      <span
                        className="chart-swatch"
                        style={{
                          width: 10,
                          height: 10,
                          backgroundColor: colorByValue.get(val) ?? '#3b82f6',
                        }}
                      />
                      <span>
                        {val} · {cnt}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSelectedMonth(null)
                setRawSelectedEvents([])
                setTableValueFilter('ALL')
              }}
            >
              Zamknij ✕
            </button>
          </div>

          {loadingEvents ? (
            <div className="empty-state" style={{ padding: '1.75rem 1rem' }}>
              Ładowanie wydarzeń z miesiąca {activeSelectedMonth}…
            </div>
          ) : displayedTableEvents.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.75rem 1rem' }}>
              Brak wydarzeń uwzględnionych w tym słupku.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="cal-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Czas</th>
                    <th>Wartość</th>
                    <th>Pełny tytuł</th>
                    <th>Kalendarz</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTableEvents.map((ev) => (
                    <tr key={ev.rawCalendarEventId}>
                      <td
                        style={{
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                        }}
                      >
                        {ev.day}
                      </td>
                      <td
                        style={{
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                        }}
                      >
                        {ev.isAllDay
                          ? 'Cały dzień'
                          : formatTimeRange(ev.startTime, ev.endTime)}
                      </td>
                      <td>
                        <span className="chart-cat-pill">
                          <span
                            className="chart-swatch"
                            style={{
                              backgroundColor: colorByValue.get(ev.value) ?? '#3b82f6',
                            }}
                          />
                          <span>{ev.value}</span>
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{ev.title || '(bez tytułu)'}</td>
                      <td>
                        <span className="account-badge">{ev.calendarName}</span>
                      </td>
                    </tr>
                  ))}
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
              Suma wystąpień: <strong>{hoveredBarData.visibleTotalCount}</strong>
            </div>
          </div>
          {hoveredBarData.segments.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Brak wystąpień w tym miesiącu
            </div>
          ) : (
            <ul className="chart-tooltip-list">
              {[...hoveredBarData.segments].reverse().map((seg) => (
                <li key={seg.value} className="chart-tooltip-row">
                  <span className="chart-tooltip-cat">
                    <span
                      className="chart-swatch"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span>{seg.value}</span>
                  </span>
                  <span className="chart-tooltip-val">
                    <strong>{seg.count}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="chart-tooltip-hint">
            Kliknij słupek, aby rozwinąć pod wykresem listę wydarzeń z tego miesiąca
          </div>
        </div>
      )}
    </section>
  )
}
