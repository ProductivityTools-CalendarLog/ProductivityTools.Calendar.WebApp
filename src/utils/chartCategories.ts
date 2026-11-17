export const CANONICAL_CATEGORIES_TOP_DOWN: ReadonlyArray<{
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

export const UNCATEGORIZED_KEY = 'Uncategorized'
export const UNCATEGORIZED_COLOR = '#cbd5e1'

export interface ChartBucketInput {
  key: string
  xLabel: string
  tooltipTitle: string
  byCategory: Record<string, number>
}

export function getCategoryColor(category: string): string {
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

export function formatCategoryLabel(category: string): string {
  return category === UNCATEGORIZED_KEY ? 'Brak kategorii' : category
}

export function buildOrderedLegendCategories(
  rawCategories: readonly string[],
  includeUncategorized: boolean,
): string[] {
  const canonicalLowerToActual = new Map<string, string>()
  const extraCategories: string[] = []
  let hasUncategorized = false

  for (const cat of rawCategories) {
    if (cat === UNCATEGORIZED_KEY) {
      hasUncategorized = true
      continue
    }
    const canonicalMatch = CANONICAL_CATEGORIES_TOP_DOWN.find(
      (c) => c.name.toLowerCase() === cat.toLowerCase(),
    )
    if (canonicalMatch) {
      canonicalLowerToActual.set(canonicalMatch.name.toLowerCase(), cat)
    } else if (!extraCategories.includes(cat)) {
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
}

export function computeNiceHoursScale(maxVal: number): { yMax: number; ticks: number[] } {
  const safeMax = maxVal > 0 ? maxVal : 8
  const padded = safeMax * 1.14

  let step = 2
  if (padded <= 5) step = 1
  else if (padded <= 14) step = 2
  else if (padded <= 24) step = 4
  else if (padded <= 36) step = 5
  else if (padded <= 70) step = 10
  else step = 20

  const yMax = Math.max(step * 4, Math.ceil(padded / step) * step)
  const ticks: number[] = []
  for (let v = 0; v <= yMax + 0.0001; v += step) {
    ticks.push(Math.round(v * 100) / 100)
  }
  return { yMax, ticks }
}

export function toIsoDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDayWithWeekday(isoDay: string): string {
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

export function formatWeekTooltipTitle(
  weekNumber: number,
  weekStartDay: string,
  weekEndDay: string,
): string {
  const year = Math.floor(weekNumber / 100)
  const week = weekNumber % 100
  const ww = String(week).padStart(2, '0')
  if (weekStartDay && weekEndDay && !weekStartDay.startsWith('0001')) {
    return `Tydzień ${year}-W${ww} (${weekStartDay} – ${weekEndDay})`
  }
  return `Tydzień ${weekNumber}`
}
