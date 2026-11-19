import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../api/calendarsApi'
import {
  createCategoryRule,
  deleteCategoryRule,
  listCalendarLogs,
  listCategoryRules,
  reprocessCalendarLogs,
  updateCategoryRule,
} from '../api/categoryRulesApi'
import { useAuth } from '../auth/useAuth'
import type { CalendarItem } from '../types/calendar'
import type {
  CalendarCategoryRuleItem,
  CalendarLogItem,
  CategoryMatchField,
  UpsertCategoryRulePayload,
} from '../types/categoryRule'
import { CategorySortingPanel } from './CategorySortingPanel'

const LAST_ACCOUNT_KEY = 'pt_calendar_last_account'

const GOOGLE_EVENT_COLORS: ReadonlyArray<{ id: string; name: string; hex: string }> = [
  { id: '2', name: '2 · Sage', hex: '#33b679' },
  { id: '3', name: '3 · Grape', hex: '#8e24aa' },
  { id: '4', name: '4 · Flamingo', hex: '#e67c73' },
  { id: '5', name: '5 · Banana', hex: '#f6bf26' },
  { id: '6', name: '6 · Tangerine', hex: '#f4511e' },
  { id: '7', name: '7 · Peacock', hex: '#039be5' },
  { id: '8', name: '8 · Graphite', hex: '#616161' },
  { id: '9', name: '9 · Blueberry', hex: '#3f51b5' },
  { id: '10', name: '10 · Basil', hex: '#0b8043' },
  { id: '11', name: '11 · Tomato', hex: '#d50000' },
]

const MATCH_FIELD_OPTIONS: ReadonlyArray<{ value: CategoryMatchField; label: string }> = [
  { value: 'Title', label: 'Title — dokładny tytuł eventu' },
  { value: 'Color', label: 'Color — kolor eventu (ID 2–11)' },
  { value: 'TitlePrefix', label: 'TitlePrefix — prefiks przed : (np. DailyLog)' },
  { value: 'CalendarName', label: 'CalendarName — nazwa/ID kalendarza (domyślna)' },
]

function extractDefaultMatchValueForLog(
  log: CalendarLogItem,
  field: CategoryMatchField,
): string {
  if (field === 'Color') {
    return log.color ?? ''
  }
  if (field === 'CalendarName') {
    return log.calendarName || log.calendarId || ''
  }
  if (field === 'TitlePrefix') {
    const title = (log.title ?? '').trim()
    const colonIdx = title.indexOf(':')
    return colonIdx >= 0 ? title.slice(0, colonIdx).trim() : title
  }
  return (log.title ?? '').trim()
}

function defaultPriorityForField(field: CategoryMatchField): number {
  if (field === 'TitlePrefix') return 10
  if (field === 'Title') return 20
  if (field === 'Color') return 40
  return 100
}

interface CategoriesPageProps {
  apiUrl: string
  calendars: CalendarItem[]
  signedInEmail: string | null
}

export function CategoriesPage({ apiUrl, calendars, signedInEmail }: CategoriesPageProps) {
  const { getIdToken, signOut } = useAuth()

  const initialAccount = () => {
    try {
      return localStorage.getItem(LAST_ACCOUNT_KEY) || signedInEmail || ''
    } catch {
      return signedInEmail || ''
    }
  }

  const [rules, setRules] = useState<CalendarCategoryRuleItem[]>([])
  const [logs, setLogs] = useState<CalendarLogItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [reprocessing, setReprocessing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [accountFilter, setAccountFilter] = useState<string>('ALL')

  // Top create-rule form (primary row: Pole + Wartość + Kategoria; secondary options: Konto, Zakres, Priorytet)
  const [account, setAccount] = useState<string>(initialAccount)
  const [calendarId, setCalendarId] = useState<string>('*')
  const [priorityInput, setPriorityInput] = useState<string>('20')
  const [matchField, setMatchField] = useState<CategoryMatchField>('Title')
  const [matchValue, setMatchValue] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [showScopeOptions, setShowScopeOptions] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Inline edit / delete on rules table
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<UpsertCategoryRulePayload | null>(null)
  const [editPriorityInput, setEditPriorityInput] = useState<string>('100')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [busyRuleId, setBusyRuleId] = useState<number | null>(null)

  // Quick-add rule directly from a CalendarLog row (includes Pole (Column) + Wartość + Kategoria)
  const [quickAddLogId, setQuickAddLogId] = useState<number | null>(null)
  const [quickField, setQuickField] = useState<CategoryMatchField>('Title')
  const [quickValue, setQuickValue] = useState<string>('')
  const [quickCategory, setQuickCategory] = useState<string>('')
  const [quickPriorityInput, setQuickPriorityInput] = useState<string>('20')
  const [quickSaving, setQuickSaving] = useState<boolean>(false)

  const suggestedAccounts = useMemo(() => {
    const set = new Set<string>()
    for (const c of calendars) if (c.account.trim()) set.add(c.account.trim())
    for (const r of rules) if (r.account.trim()) set.add(r.account.trim())
    if (signedInEmail) set.add(signedInEmail)
    set.add('pwujczyk@google.com')
    set.add('pwujczyk@gmail.com')
    return Array.from(set)
  }, [calendars, rules, signedInEmail])

  const existingCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rules) if (r.category.trim()) set.add(r.category.trim())
    for (const l of logs) if (l.category?.trim()) set.add(l.category.trim())
    return Array.from(set).sort()
  }, [logs, rules])

  const calendarsForAccount = useMemo(
    () => calendars.filter((c) => !account.trim() || c.account === account.trim()),
    [account, calendars],
  )

  const showNotice = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr))
    }, 3600)
  }

  const reloadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const [rulesData, logsData] = await Promise.all([
        listCategoryRules(apiUrl, token),
        listCalendarLogs(apiUrl, token, 500),
      ])
      setRules(rulesData)
      setLogs(logsData)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się pobrać reguł kategoryzacji.')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, getIdToken, signOut])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getIdToken()
        const [rulesData, logsData] = await Promise.all([
          listCategoryRules(apiUrl, token),
          listCalendarLogs(apiUrl, token, 500),
        ])
        if (!cancelled) {
          setRules(rulesData)
          setLogs(logsData)
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setError((err as Error)?.message || 'Nie udało się pobrać reguł kategoryzacji.')
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
  }, [apiUrl, getIdToken, signOut])

  const handleTopFieldChange = (nextField: CategoryMatchField) => {
    setMatchField(nextField)
    setPriorityInput(String(defaultPriorityForField(nextField)))
  }

  const handleReprocess = async () => {
    setReprocessing(true)
    setError(null)
    try {
      const token = await getIdToken()
      const res = await reprocessCalendarLogs(
        apiUrl,
        token,
        accountFilter === 'ALL' ? undefined : accountFilter,
      )
      const logsData = await listCalendarLogs(apiUrl, token, 500)
      setLogs(logsData)
      showNotice(
        `Przeliczono ${res.rawEventsEvaluated} raw eventów → zapisano ${res.logsUpserted} wpisów w CalendarLog (odfiltrowano ${res.logsRemovedOrSkipped}).`,
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się przeliczyć kategorii.')
    } finally {
      setReprocessing(false)
    }
  }

  const handleAddRule = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedAccount = account.trim()
    if (!trimmedAccount) {
      setShowScopeOptions(true)
      setError('Wybierz lub wpisz konto Google (Account).')
      return
    }

    const parsedPriority = Number.parseInt(priorityInput.trim(), 10)
    if (Number.isNaN(parsedPriority)) {
      setShowScopeOptions(true)
      setError('Priorytet musi być liczbą całkowitą (niższa liczba = sprawdzana wcześniej).')
      return
    }

    setSubmitting(true)
    try {
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, trimmedAccount)
      } catch {
        // Ignore storage error
      }

      const token = await getIdToken()
      const created = await createCategoryRule(apiUrl, token, {
        account: trimmedAccount,
        calendarId: calendarId.trim() || '*',
        priority: parsedPriority,
        matchField,
        matchValue: matchValue.trim(),
        category: category.trim(),
        isActive: true,
      })

      await reprocessCalendarLogs(apiUrl, token, created.account)
      const [rulesData, logsData] = await Promise.all([
        listCategoryRules(apiUrl, token),
        listCalendarLogs(apiUrl, token, 500),
      ])
      setRules(rulesData)
      setLogs(logsData)
      setMatchValue('')
      showNotice(
        `Dodano regułę "${created.matchField}: ${created.matchValue} → ${created.category}" i przeliczono wpisy.`,
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się dodać reguły.')
    } finally {
      setSubmitting(false)
    }
  }

  const openQuickAdd = (log: CalendarLogItem) => {
    if (quickAddLogId === log.calendarLogId) {
      setQuickAddLogId(null)
      return
    }
    const hasColon = Boolean(log.title && log.title.includes(':'))
    const initialField: CategoryMatchField = hasColon
      ? 'TitlePrefix'
      : log.title
        ? 'Title'
        : log.color
          ? 'Color'
          : 'CalendarName'

    setQuickAddLogId(log.calendarLogId)
    setQuickField(initialField)
    setQuickValue(extractDefaultMatchValueForLog(log, initialField))
    setQuickCategory(log.category ?? '')
    setQuickPriorityInput(String(defaultPriorityForField(initialField)))
  }

  const handleQuickFieldChange = (log: CalendarLogItem, nextField: CategoryMatchField) => {
    setQuickField(nextField)
    setQuickValue(extractDefaultMatchValueForLog(log, nextField))
    setQuickPriorityInput(String(defaultPriorityForField(nextField)))
  }

  const handleSaveQuickAdd = async (log: CalendarLogItem) => {
    if (!quickValue.trim() || !quickCategory.trim()) {
      setError('W szybkim dodawaniu uzupełnij Pole (Column), Wartość oraz Kategorię.')
      return
    }
    const parsedPriority = Number.parseInt(quickPriorityInput.trim(), 10)
    if (Number.isNaN(parsedPriority)) {
      setError('Priorytet musi być liczbą całkowitą.')
      return
    }

    setQuickSaving(true)
    setError(null)
    try {
      const token = await getIdToken()
      const created = await createCategoryRule(apiUrl, token, {
        account: log.account,
        calendarId: '*',
        priority: parsedPriority,
        matchField: quickField,
        matchValue: quickValue.trim(),
        category: quickCategory.trim(),
        isActive: true,
      })
      await reprocessCalendarLogs(apiUrl, token, log.account)
      const [rulesData, logsData] = await Promise.all([
        listCategoryRules(apiUrl, token),
        listCalendarLogs(apiUrl, token, 500),
      ])
      setRules(rulesData)
      setLogs(logsData)
      setQuickAddLogId(null)
      showNotice(
        `Dodano regułę "${created.matchField}: ${created.matchValue} → ${created.category}" i przeliczono wpisy.`,
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się dodać reguły.')
    } finally {
      setQuickSaving(false)
    }
  }

  const handleToggleRule = async (rule: CalendarCategoryRuleItem) => {
    setBusyRuleId(rule.calendarCategoryRuleId)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateCategoryRule(apiUrl, token, rule.calendarCategoryRuleId, {
        account: rule.account,
        calendarId: rule.calendarId,
        priority: rule.priority,
        matchField: rule.matchField,
        matchValue: rule.matchValue,
        category: rule.category,
        isActive: !rule.isActive,
      })
      setRules((prev) =>
        prev.map((r) => (r.calendarCategoryRuleId === updated.calendarCategoryRuleId ? updated : r)),
      )
      await reprocessCalendarLogs(apiUrl, token, rule.account)
      setLogs(await listCalendarLogs(apiUrl, token, 500))
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zmienić statusu reguły.')
    } finally {
      setBusyRuleId(null)
    }
  }

  const handleSaveEdit = async (id: number) => {
    if (!editDraft) return
    const parsedPriority = Number.parseInt(editPriorityInput.trim(), 10)
    if (Number.isNaN(parsedPriority)) {
      setError('Priorytet musi być liczbą całkowitą.')
      return
    }

    setBusyRuleId(id)
    setError(null)
    try {
      const token = await getIdToken()
      await updateCategoryRule(apiUrl, token, id, {
        ...editDraft,
        account: editDraft.account.trim(),
        calendarId: editDraft.calendarId.trim() || '*',
        priority: parsedPriority,
        matchValue: editDraft.matchValue.trim(),
        category: editDraft.category.trim(),
      })
      await reprocessCalendarLogs(apiUrl, token, editDraft.account.trim())
      const [rulesData, logsData] = await Promise.all([
        listCategoryRules(apiUrl, token),
        listCalendarLogs(apiUrl, token, 500),
      ])
      setRules(rulesData)
      setLogs(logsData)
      setEditingId(null)
      setEditDraft(null)
      showNotice('Zapisano regułę i przeliczono CalendarLog.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zapisać zmian reguły.')
    } finally {
      setBusyRuleId(null)
    }
  }

  const handleDeleteRule = async (rule: CalendarCategoryRuleItem) => {
    setBusyRuleId(rule.calendarCategoryRuleId)
    setError(null)
    try {
      const token = await getIdToken()
      await deleteCategoryRule(apiUrl, token, rule.calendarCategoryRuleId)
      await reprocessCalendarLogs(apiUrl, token, rule.account)
      const [rulesData, logsData] = await Promise.all([
        listCategoryRules(apiUrl, token),
        listCalendarLogs(apiUrl, token, 500),
      ])
      setRules(rulesData)
      setLogs(logsData)
      setConfirmDeleteId(null)
      showNotice('Usunięto regułę i przeliczono CalendarLog.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się usunąć reguły.')
    } finally {
      setBusyRuleId(null)
    }
  }

  const allAccounts = useMemo(() => {
    const set = new Set<string>()
    for (const r of rules) set.add(r.account)
    for (const l of logs) set.add(l.account)
    return Array.from(set).sort()
  }, [logs, rules])

  const filteredRules = useMemo(
    () => (accountFilter === 'ALL' ? rules : rules.filter((r) => r.account === accountFilter)),
    [accountFilter, rules],
  )

  const filteredLogs = useMemo(
    () => (accountFilter === 'ALL' ? logs : logs.filter((l) => l.account === accountFilter)),
    [accountFilter, logs],
  )

  const matchValuePlaceholder =
    matchField === 'Color'
      ? 'np. 9 (wybierz kolor poniżej)'
      : matchField === 'TitlePrefix'
        ? 'np. sd (lub * dla dowolnego prefiksu)'
        : matchField === 'CalendarName'
          ? 'np. pwujczyk@google.com'
          : 'np. Lunch'

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Kategorie i CalendarLog</h1>
          <p className="page-description">
            Reguły przypisywania kategorii (odpowiednik <code>Mapping-Caldendars</code> i{' '}
            <code>Mapping-DailyLog</code>) sprawdzane rosnąco według priorytetu — pierwsze
            dopasowanie wygrywa.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {allAccounts.length > 0 && (
            <div className="filter-bar">
              <button
                type="button"
                className={`filter-pill ${accountFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setAccountFilter('ALL')}
              >
                <span>Wszystkie</span>
              </button>
              {allAccounts.map((acc) => (
                <button
                  key={acc}
                  type="button"
                  className={`filter-pill ${accountFilter === acc ? 'active' : ''}`}
                  onClick={() => setAccountFilter(acc)}
                >
                  <span>{acc}</span>
                </button>
              ))}
            </div>
          )}

          <button
            id="reprocess-calendar-logs-button"
            type="button"
            className="btn btn-primary"
            onClick={() => void handleReprocess()}
            disabled={reprocessing || loading}
          >
            {reprocessing ? 'Przeliczanie…' : 'Przelicz eventy teraz'}
          </button>

          <button
            id="refresh-categories-button"
            type="button"
            className="btn btn-secondary"
            onClick={() => void reloadAll()}
            disabled={loading || reprocessing}
          >
            {loading ? 'Ładowanie…' : 'Odśwież'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success" role="status">
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
            Zamknij
          </button>
        </div>
      )}

      {/* PANEL 0: Category Sort Order & Colors Configuration */}
      <CategorySortingPanel apiUrl={apiUrl} />

      {/* PANEL 1: Category Rules */}
      <section className="panel" aria-labelledby="category-rules-heading">
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 id="category-rules-heading" className="panel-title">
              Reguły kategoryzacji ({filteredRules.length})
            </h2>
            <span className="account-badge">
              Konto: {account.trim() || '(wybierz)'} · Zakres: {calendarId} · Priorytet: {priorityInput}
            </span>
          </div>

          <button
            id="toggle-category-scope-options"
            type="button"
            className="link-btn"
            onClick={() => setShowScopeOptions((prev) => !prev)}
          >
            {showScopeOptions ? 'Ukryj konto / zakres / priorytet' : 'Zmień konto, zakres lub priorytet'}
          </button>
        </div>

        <form className="panel-body" onSubmit={handleAddRule}>
          {/* Primary single-row: Pole (Column) + Wartość (Value) + Kategoria (Category) + Dodaj */}
          <div className="category-form-grid">
            <div className="field">
              <label htmlFor="cat-field-select" className="field-label">
                <span>Pole (Column)</span>
              </label>
              <select
                id="cat-field-select"
                className="input"
                value={matchField}
                onChange={(e) => handleTopFieldChange(e.target.value as CategoryMatchField)}
              >
                {MATCH_FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="cat-value-input" className="field-label">
                <span>Wartość (Value)</span>
              </label>
              <input
                id="cat-value-input"
                type="text"
                className="input mono"
                placeholder={matchValuePlaceholder}
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
                required
              />
              {matchField === 'Color' && (
                <div className="quick-chips">
                  {GOOGLE_EVENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip ${matchValue.trim() === c.id ? 'active' : ''}`}
                      onClick={() => setMatchValue(c.id)}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: c.hex,
                          marginRight: 5,
                          display: 'inline-block',
                        }}
                      />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {matchField === 'CalendarName' && calendarsForAccount.length > 0 && (
                <div className="quick-chips">
                  {calendarsForAccount.map((cal) => (
                    <button
                      key={cal.calendarSyncStateId}
                      type="button"
                      className="chip"
                      onClick={() => setMatchValue(cal.calendarName || cal.calendarId)}
                    >
                      {cal.calendarName || cal.calendarId}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="cat-target-input" className="field-label">
                <span>Kategoria (Category)</span>
              </label>
              <input
                id="cat-target-input"
                type="text"
                className="input"
                placeholder="np. Meetings, FocusedWork, Coding"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
              {existingCategories.length > 0 && (
                <div className="quick-chips">
                  {existingCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`chip ${category.trim() === cat ? 'active' : ''}`}
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="field" style={{ paddingTop: '1.42rem' }}>
              <button
                id="submit-category-rule-button"
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Zapisywanie…' : '+ Dodaj regułę'}
              </button>
            </div>
          </div>

          {showScopeOptions && (
            <div className="category-scope-bar">
              <div className="field">
                <label htmlFor="cat-account-input" className="field-label">
                  <span>Konto</span>
                </label>
                <input
                  id="cat-account-input"
                  type="email"
                  className="input mono"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  required
                />
                <div className="quick-chips">
                  {suggestedAccounts.map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      className={`chip ${account.trim() === acc ? 'active' : ''}`}
                      onClick={() => setAccount(acc)}
                    >
                      {acc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="cat-scope-input" className="field-label">
                  <span>Zakres kalendarza (* = wszystkie)</span>
                </label>
                <input
                  id="cat-scope-input"
                  type="text"
                  className="input mono"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  required
                />
                <div className="quick-chips">
                  <button
                    type="button"
                    className={`chip ${calendarId.trim() === '*' ? 'active' : ''}`}
                    onClick={() => setCalendarId('*')}
                  >
                    * (wszystkie)
                  </button>
                  {calendarsForAccount.map((cal) => (
                    <button
                      key={cal.calendarSyncStateId}
                      type="button"
                      className={`chip ${calendarId.trim() === cal.calendarId ? 'active' : ''}`}
                      onClick={() => setCalendarId(cal.calendarId)}
                    >
                      {cal.calendarName || cal.calendarId}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="cat-priority-input" className="field-label">
                  <span>Priorytet</span>
                </label>
                <input
                  id="cat-priority-input"
                  type="number"
                  className="input mono"
                  value={priorityInput}
                  onChange={(e) => setPriorityInput(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
        </form>

        {filteredRules.length === 0 ? (
          <div className="empty-state" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            Brak reguł kategoryzacji — dodaj pierwszą powyżej lub kliknij <strong>+ Reguła</strong>{' '}
            przy wybranym evencie poniżej.
          </div>
        ) : (
          <div className="table-wrap" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <table className="cal-table">
              <thead>
                <tr>
                  <th>Priorytet</th>
                  <th>Warunek (Column = Value)</th>
                  <th>Kategoria</th>
                  <th>Zakres / Konto</th>
                  <th>Aktywna</th>
                  <th style={{ textAlign: 'right' }}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => {
                  const isEditing =
                    editingId === rule.calendarCategoryRuleId && editDraft !== null
                  const isBusy = busyRuleId === rule.calendarCategoryRuleId

                  return (
                    <Fragment key={rule.calendarCategoryRuleId}>
                      <tr className={!rule.isActive ? 'cal-row-inactive' : undefined}>
                        <td>
                          <code className="cal-id-code">{rule.priority}</code>
                        </td>

                        <td>
                          <span className="badge badge-neutral">{rule.matchField}</span>{' '}
                          <code className="cal-id-code">{rule.matchValue}</code>
                        </td>

                        <td>
                          <span className="badge badge-synced">{rule.category}</span>
                        </td>

                        <td>
                          <div style={{ fontSize: '0.8rem' }}>
                            {rule.calendarId === '*' ? 'Wszystkie (*)' : rule.calendarId}
                          </div>
                          <div style={{ marginTop: '0.15rem' }}>
                            <span className="account-badge">{rule.account}</span>
                          </div>
                        </td>

                        <td>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={rule.isActive}
                              disabled={isBusy}
                              onChange={() => void handleToggleRule(rule)}
                            />
                            <span className="switch-track">
                              <span className="switch-thumb" />
                            </span>
                            <span className="switch-label">
                              {rule.isActive ? 'Tak' : 'Wyłączona'}
                            </span>
                          </label>
                        </td>

                        <td>
                          <div className="row-actions">
                            {confirmDeleteId === rule.calendarCategoryRuleId ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={isBusy}
                                  onClick={() => void handleDeleteRule(rule)}
                                >
                                  Potwierdź
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  Anuluj
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={isBusy}
                                  onClick={() => {
                                    if (isEditing) {
                                      setEditingId(null)
                                      setEditDraft(null)
                                    } else {
                                      setConfirmDeleteId(null)
                                      setEditingId(rule.calendarCategoryRuleId)
                                      setEditPriorityInput(String(rule.priority))
                                      setEditDraft({
                                        account: rule.account,
                                        calendarId: rule.calendarId,
                                        priority: rule.priority,
                                        matchField: rule.matchField,
                                        matchValue: rule.matchValue,
                                        category: rule.category,
                                        isActive: rule.isActive,
                                      })
                                    }
                                  }}
                                >
                                  {isEditing ? 'Zamknij' : 'Edytuj'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingId(null)
                                    setConfirmDeleteId(rule.calendarCategoryRuleId)
                                  }}
                                >
                                  Usuń
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditing && editDraft && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="edit-row-box">
                              <div className="edit-grid">
                                <div className="field">
                                  <label className="field-label">Priorytet</label>
                                  <input
                                    type="number"
                                    className="input mono"
                                    value={editPriorityInput}
                                    onChange={(e) => setEditPriorityInput(e.target.value)}
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Pole (Column)</label>
                                  <select
                                    className="input"
                                    value={editDraft.matchField}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        matchField: e.target.value as CategoryMatchField,
                                      })
                                    }
                                  >
                                    {MATCH_FIELD_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.value}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field">
                                  <label className="field-label">Wartość (Value)</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editDraft.matchValue}
                                    onChange={(e) =>
                                      setEditDraft({ ...editDraft, matchValue: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Kategoria</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={editDraft.category}
                                    onChange={(e) =>
                                      setEditDraft({ ...editDraft, category: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Zakres CalendarId</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editDraft.calendarId}
                                    onChange={(e) =>
                                      setEditDraft({ ...editDraft, calendarId: e.target.value })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setEditingId(null)
                                    setEditDraft(null)
                                  }}
                                >
                                  Anuluj
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={isBusy}
                                  onClick={() => void handleSaveEdit(rule.calendarCategoryRuleId)}
                                >
                                  Zapisz zmiany
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PANEL 2: Processed CalendarLog entries + inline Quick Add Rule */}
      <section className="panel" aria-labelledby="calendar-log-preview-heading">
        <div className="panel-header">
          <div>
            <h2 id="calendar-log-preview-heading" className="panel-title">
              Przetworzone wpisy <code>dbo.CalendarLog</code> ({filteredLogs.length})
            </h2>
            <p className="field-hint" style={{ marginTop: '0.15rem' }}>
              Kliknij <strong>+ Reguła</strong> przy wybranym evencie, aby szybko utworzyć regułę z
              wyborem <code>Pole (Column)</code>, <code>Wartość</code> i <code>Kategoria</code>.
            </p>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            Brak wpisów w <code>CalendarLog</code> — pobierz eventy z kalendarza lub kliknij{' '}
            <strong>Przelicz eventy teraz</strong>.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="cal-table">
              <thead>
                <tr>
                  <th>Dzień / Tydzień</th>
                  <th>Czas (h)</th>
                  <th>Kategoria</th>
                  <th>Tytuł / Value</th>
                  <th>Kalendarz / Kolor</th>
                  <th style={{ textAlign: 'right' }}>Szybka reguła</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isQuickOpen = quickAddLogId === log.calendarLogId

                  return (
                    <Fragment key={log.calendarLogId}>
                      <tr>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600 }}>{log.day}</div>
                          <div className="field-hint" style={{ fontFamily: 'var(--font-mono)' }}>
                            W:{log.weekNumber} · {log.month}
                          </div>
                        </td>

                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {Number(log.durationHours).toFixed(2)} h
                        </td>

                        <td>
                          {log.category ? (
                            <span className="badge badge-synced">{log.category}</span>
                          ) : (
                            <span className="badge badge-pending">Brak kategorii</span>
                          )}
                        </td>

                        <td>
                          <div className="cal-name">{log.title || '(Bez tytułu)'}</div>
                          {log.value && (
                            <div className="cal-id-row">
                              <span className="field-hint">Value:</span>
                              <code className="cal-id-code">{log.value}</code>
                            </div>
                          )}
                        </td>

                        <td>
                          <div>{log.calendarName}</div>
                          <div className="field-hint">
                            {log.color ? `color:${log.color} · ` : ''}
                            {log.account}
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            id={`quick-rule-btn-${log.calendarLogId}`}
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => openQuickAdd(log)}
                          >
                            {isQuickOpen ? 'Zamknij' : '+ Reguła'}
                          </button>
                        </td>
                      </tr>

                      {isQuickOpen && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="edit-row-box">
                              <div className="edit-grid">
                                <div className="field">
                                  <label className="field-label">Pole (Column)</label>
                                  <select
                                    className="input"
                                    value={quickField}
                                    onChange={(e) =>
                                      handleQuickFieldChange(
                                        log,
                                        e.target.value as CategoryMatchField,
                                      )
                                    }
                                  >
                                    {MATCH_FIELD_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="field">
                                  <label className="field-label">Wartość (Value)</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={quickValue}
                                    onChange={(e) => setQuickValue(e.target.value)}
                                  />
                                </div>

                                <div className="field">
                                  <label className="field-label">Kategoria (Category)</label>
                                  <input
                                    type="text"
                                    className="input"
                                    placeholder="np. Meetings, Coding, Lunch"
                                    value={quickCategory}
                                    onChange={(e) => setQuickCategory(e.target.value)}
                                  />
                                  {existingCategories.length > 0 && (
                                    <div className="quick-chips">
                                      {existingCategories.map((cat) => (
                                        <button
                                          key={cat}
                                          type="button"
                                          className={`chip ${
                                            quickCategory.trim() === cat ? 'active' : ''
                                          }`}
                                          onClick={() => setQuickCategory(cat)}
                                        >
                                          {cat}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="field">
                                  <label className="field-label">Priorytet</label>
                                  <input
                                    type="number"
                                    className="input mono"
                                    value={quickPriorityInput}
                                    onChange={(e) => setQuickPriorityInput(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={quickSaving}
                                  onClick={() => setQuickAddLogId(null)}
                                >
                                  Anuluj
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={quickSaving}
                                  onClick={() => void handleSaveQuickAdd(log)}
                                >
                                  {quickSaving ? 'Zapisywanie…' : 'Dodaj i przelicz'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
