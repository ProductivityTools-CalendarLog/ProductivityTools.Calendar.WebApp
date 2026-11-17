import { useMemo, useState } from 'react'
import {
  computeNiceHoursScale,
  formatCategoryLabel,
  getCategoryColor,
  type ChartBucketInput,
} from '../utils/chartCategories'

export type StackedChartMode = 'hours' | 'percent'

interface StackedCategoryChartCardProps {
  chartId: string
  title: string
  subtitle: string
  mode: StackedChartMode
  buckets: readonly ChartBucketInput[]
  legendCategoriesTopDown: readonly string[]
  hiddenCategories: ReadonlySet<string>
  onToggleCategory: (category: string) => void
  onResetHiddenCategories: () => void
  selectedKey: string | null
  onSelectBucket: (key: string) => void
  clickHintLabel: string
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
  buckets,
  legendCategoriesTopDown,
  hiddenCategories,
  onToggleCategory,
  onResetHiddenCategories,
  selectedKey,
  onSelectBucket,
  clickHintLabel,
}: StackedCategoryChartCardProps) {
  const [hovered, setHovered] = useState<HoveredBucketState | null>(null)

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
      if (!hiddenCategories.has(cat)) {
        sum += hrs
      }
    }
    return sum
  }, [categoryTotals, hiddenCategories])

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
        if (hiddenCategories.has(cat)) continue
        const hours = b.byCategory[cat] ?? 0
        if (hours <= 0) continue
        const nextTotal = visibleTotal + hours
        rawSegments.push({
          category: cat,
          hours,
          color: getCategoryColor(cat),
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
  }, [buckets, hiddenCategories, stackOrderBottomUp])

  const maxVisibleHours = useMemo(
    () => computedBars.reduce((max, b) => Math.max(max, b.visibleTotalHours), 0),
    [computedBars],
  )

  const hoursScale = useMemo(
    () => computeNiceHoursScale(maxVisibleHours),
    [maxVisibleHours],
  )

  const yMax = mode === 'percent' ? 100 : hoursScale.yMax
  const ticks = mode === 'percent' ? PERCENT_TICKS : hoursScale.ticks

  const plotHeight = 310
  const barPitch = computedBars.length <= 18 ? 38 : computedBars.length <= 34 ? 30 : 24
  const barWidth = Math.max(14, Math.round(barPitch * 0.68))
  const compactTopLabels = barPitch < 34
  const topMargin = mode === 'percent' && compactTopLabels ? 42 : 30
  const bottomMargin = 84
  const leftAxisWidth = 56
  const rightPadding = 20

  const svgWidth = Math.max(
    660,
    leftAxisWidth + computedBars.length * barPitch + rightPadding,
  )
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
                const isHidden = hiddenCategories.has(cat)
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
                        style={{ backgroundColor: getCategoryColor(cat) }}
                      />
                      <span className="chart-legend-name">{formatCategoryLabel(cat)}</span>
                      {totalHrs > 0 && (
                        <span className="chart-legend-hours">
                          {mode === 'percent' ? `${pct}%` : `${totalHrs.toFixed(1)}h`}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* Right Scrollable SVG Stacked Bar Chart */}
          <div className="chart-scroll-area">
            <svg
              className="daily-bar-svg"
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
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
                      {mode === 'percent' ? `${tick}%` : tick.toFixed(2)}
                    </text>
                  </g>
                )
              })}

              {/* Stacked Bars */}
              {computedBars.map((bar, index) => {
                const slotX = leftAxisWidth + index * barPitch + 6
                const barX = slotX + Math.round((barPitch - barWidth) / 2)
                const isHovered = hovered?.key === bar.key
                const isSelected = selectedKey === bar.key
                const topVal =
                  mode === 'percent'
                    ? bar.visibleTotalHours > 0
                      ? 100
                      : 0
                    : bar.visibleTotalHours
                const topBarY = yForValue(topVal)

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
                    onClick={() => onSelectBucket(bar.key)}
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
                          ? 'hsla(219, 79%, 46%, 0.10)'
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

                    {/* Top Hours Label Above Bar */}
                    {bar.visibleTotalHours > 0 &&
                      (compactTopLabels && mode === 'percent' ? (
                        <text
                          transform={`translate(${barX + barWidth / 2 + 3}, ${topBarY - 5}) rotate(-55)`}
                          textAnchor="start"
                          fill="#64748b"
                          fontSize="10"
                          fontWeight="500"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {bar.visibleTotalHours.toFixed(2)}
                        </text>
                      ) : (
                        <text
                          x={barX + barWidth / 2}
                          y={Math.max(13, topBarY - 6)}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize={compactTopLabels ? '10' : '11'}
                          fontWeight="500"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {bar.visibleTotalHours.toFixed(2)}
                        </text>
                      ))}

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
            </svg>
          </div>
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
