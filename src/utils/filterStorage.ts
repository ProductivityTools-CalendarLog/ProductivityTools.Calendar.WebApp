export type DataLogRangePreset = '14d' | '21d' | '30d' | '60d' | '180d' | 'all' | 'custom'
export type DataPointMonthsPreset = '12m' | '24m' | 'all'
export type ChartSortDirection = 'desc' | 'asc'

export interface DataLogFilterState {
  accountFilter: string
  rangePreset: DataLogRangePreset
  customFrom: string
  customTo: string
  includeUncategorized: boolean
  fillEmptyDays: boolean
  sortDirection: ChartSortDirection
  hiddenCategories: string[]
}

export interface DataPointFilterState {
  accountFilter: string
  monthsPreset: DataPointMonthsPreset
  fillEmptyMonths: boolean
  sortDirection: ChartSortDirection
  selectedCategory: string
  searchQuery: string
}

const DATALOG_FILTERS_KEY = 'pt_calendar_datalog_filters_v1'
const DATAPOINT_FILTERS_KEY = 'pt_calendar_datapoint_filters_v1'

const VALID_RANGE_PRESETS: ReadonlySet<string> = new Set([
  '14d',
  '21d',
  '30d',
  '60d',
  '180d',
  'all',
  'custom',
])
const VALID_MONTHS_PRESETS: ReadonlySet<string> = new Set(['12m', '24m', 'all'])
const VALID_SORT_DIRECTIONS: ReadonlySet<string> = new Set(['desc', 'asc'])

function isIsoDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)
}

export function loadDataLogFilters(defaults: DataLogFilterState): DataLogFilterState {
  try {
    const raw = localStorage.getItem(DATALOG_FILTERS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return defaults

    return {
      accountFilter:
        typeof parsed.accountFilter === 'string' && parsed.accountFilter.trim() !== ''
          ? parsed.accountFilter
          : defaults.accountFilter,
      rangePreset:
        typeof parsed.rangePreset === 'string' && VALID_RANGE_PRESETS.has(parsed.rangePreset)
          ? (parsed.rangePreset as DataLogRangePreset)
          : defaults.rangePreset,
      customFrom: isIsoDate(parsed.customFrom) ? parsed.customFrom : defaults.customFrom,
      customTo: isIsoDate(parsed.customTo) ? parsed.customTo : defaults.customTo,
      includeUncategorized:
        typeof parsed.includeUncategorized === 'boolean'
          ? parsed.includeUncategorized
          : defaults.includeUncategorized,
      fillEmptyDays:
        typeof parsed.fillEmptyDays === 'boolean'
          ? parsed.fillEmptyDays
          : defaults.fillEmptyDays,
      sortDirection:
        typeof parsed.sortDirection === 'string' &&
        VALID_SORT_DIRECTIONS.has(parsed.sortDirection)
          ? (parsed.sortDirection as ChartSortDirection)
          : defaults.sortDirection,
      hiddenCategories: Array.isArray(parsed.hiddenCategories)
        ? parsed.hiddenCategories.filter((x): x is string => typeof x === 'string')
        : defaults.hiddenCategories,
    }
  } catch {
    return defaults
  }
}

export function saveDataLogFilters(state: DataLogFilterState): void {
  try {
    localStorage.setItem(DATALOG_FILTERS_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota/privacy errors
  }
}

export function loadDataPointFilters(defaults: DataPointFilterState): DataPointFilterState {
  try {
    const raw = localStorage.getItem(DATAPOINT_FILTERS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return defaults

    return {
      accountFilter:
        typeof parsed.accountFilter === 'string' && parsed.accountFilter.trim() !== ''
          ? parsed.accountFilter
          : defaults.accountFilter,
      monthsPreset:
        typeof parsed.monthsPreset === 'string' && VALID_MONTHS_PRESETS.has(parsed.monthsPreset)
          ? (parsed.monthsPreset as DataPointMonthsPreset)
          : defaults.monthsPreset,
      fillEmptyMonths:
        typeof parsed.fillEmptyMonths === 'boolean'
          ? parsed.fillEmptyMonths
          : defaults.fillEmptyMonths,
      sortDirection:
        typeof parsed.sortDirection === 'string' &&
        VALID_SORT_DIRECTIONS.has(parsed.sortDirection)
          ? (parsed.sortDirection as ChartSortDirection)
          : defaults.sortDirection,
      selectedCategory:
        typeof parsed.selectedCategory === 'string' && parsed.selectedCategory.trim() !== ''
          ? parsed.selectedCategory
          : defaults.selectedCategory,
      searchQuery:
        typeof parsed.searchQuery === 'string' ? parsed.searchQuery : defaults.searchQuery,
    }
  } catch {
    return defaults
  }
}

export function saveDataPointFilters(state: DataPointFilterState): void {
  try {
    localStorage.setItem(DATAPOINT_FILTERS_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota/privacy errors
  }
}
