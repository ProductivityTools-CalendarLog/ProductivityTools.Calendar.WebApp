import { useMemo, useState, type FormEvent } from 'react'
import type { CalendarType, CreateCalendarPayload } from '../types/calendar'

const LAST_ACCOUNT_KEY = 'pt_calendar_last_account'

interface AddCalendarFormProps {
  existingAccounts: string[]
  signedInEmail: string | null
  onAdd: (payload: CreateCalendarPayload) => Promise<void>
}

export function AddCalendarForm({
  existingAccounts,
  signedInEmail,
  onAdd,
}: AddCalendarFormProps) {
  const initialAccount = () => {
    try {
      return localStorage.getItem(LAST_ACCOUNT_KEY) || signedInEmail || ''
    } catch {
      return signedInEmail || ''
    }
  }

  const [account, setAccount] = useState<string>(initialAccount)
  const [calendarId, setCalendarId] = useState<string>('')
  const [calendarName, setCalendarName] = useState<string>('')
  const [calendarType, setCalendarType] = useState<CalendarType>('DataLog')
  const [defaultLookbackDays, setDefaultLookbackDays] = useState<string>('14')
  const [pendingBackfillFrom, setPendingBackfillFrom] = useState<string>('')
  const [showOptions, setShowOptions] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  const suggestedAccounts = useMemo(() => {
    const set = new Set<string>()
    for (const acc of existingAccounts) {
      if (acc.trim()) set.add(acc.trim())
    }
    if (signedInEmail) set.add(signedInEmail)
    set.add('pwujczyk@google.com')
    set.add('pwujczyk@gmail.com')
    return Array.from(set)
  }, [existingAccounts, signedInEmail])

  const selectAccountChip = (value: string) => {
    setAccount(value)
    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, value)
    } catch {
      // Ignore storage error
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const trimmedAccount = account.trim()
    const trimmedCalId = calendarId.trim()

    if (!trimmedAccount) {
      setFormError('Podaj adres e-mail konta Google (Account), z którego Apps Script pobiera kalendarz.')
      return
    }
    if (!trimmedCalId) {
      setFormError('Podaj identyfikator kalendarza (Calendar ID).')
      return
    }

    const parsedLookback = Number.parseInt(defaultLookbackDays, 10)
    if (Number.isNaN(parsedLookback) || parsedLookback < 0 || parsedLookback > 3650) {
      setFormError('Domyślne okno synchronizacji musi wynosić od 0 do 3650 dni (0 = tylko dzisiaj).')
      return
    }

    setSubmitting(true)
    try {
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, trimmedAccount)
      } catch {
        // Ignore storage error
      }

      await onAdd({
        account: trimmedAccount,
        calendarId: trimmedCalId,
        calendarName: calendarName.trim() || null,
        type: calendarType,
        isActive: true,
        defaultLookbackDays: parsedLookback,
        pendingBackfillFrom: pendingBackfillFrom.trim() || null,
      })

      // Keep `account` so adding multiple calendars for the same account is instant
      setCalendarId('')
      setCalendarName('')
      setPendingBackfillFrom('')
    } catch (err: unknown) {
      setFormError((err as Error)?.message || 'Nie udało się dodać kalendarza.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="add-calendar-heading">
      <div className="panel-header">
        <h2 id="add-calendar-heading" className="panel-title">
          Dodaj kalendarz do synchronizacji
        </h2>
        <button
          id="toggle-advanced-options-button"
          type="button"
          className="link-btn"
          onClick={() => setShowOptions((prev) => !prev)}
        >
          {showOptions ? 'Ukryj opcje dodatkowe' : 'Opcje dodatkowe (nazwa, okno dni, backfill)'}
        </button>
      </div>

      <form className="panel-body" onSubmit={handleSubmit}>
        {formError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
            <span>{formError}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="account-input" className="field-label">
              <span>Konto Google (Account)</span>
            </label>
            <input
              id="account-input"
              type="email"
              className="input mono"
              placeholder="np. pwujczyk@google.com"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            />
            <div className="quick-chips" aria-label="Podpowiedzi kont">
              {suggestedAccounts.map((acc) => (
                <button
                  key={acc}
                  type="button"
                  className={`chip ${account.trim() === acc ? 'active' : ''}`}
                  onClick={() => selectAccountChip(acc)}
                >
                  {acc}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="calendar-id-input" className="field-label">
              <span>Calendar ID</span>
              <span className="field-hint">Ustawienia kalendarza → Zintegruj kalendarz</span>
            </label>
            <input
              id="calendar-id-input"
              type="text"
              className="input mono"
              placeholder="np. c_123456...@group.calendar.google.com lub adres e-mail"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="calendar-type-select" className="field-label">
              <span>Type</span>
            </label>
            <select
              id="calendar-type-select"
              className="input mono"
              value={calendarType}
              onChange={(e) => setCalendarType(e.target.value as CalendarType)}
            >
              <option value="DataLog">DataLog</option>
              <option value="DataPoint">DataPoint</option>
            </select>
          </div>

          <div className="field" style={{ paddingTop: '1.42rem' }}>
            <button
              id="submit-add-calendar-button"
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Dodawanie…' : '+ Dodaj kalendarz'}
            </button>
          </div>
        </div>

        {showOptions && (
          <div className="form-grid-advanced">
            <div className="field">
              <label htmlFor="calendar-name-input" className="field-label">
                <span>Nazwa pomocnicza (opcjonalnie)</span>
              </label>
              <input
                id="calendar-name-input"
                type="text"
                className="input"
                placeholder="np. DailyLog (nadpisze się przy syncu)"
                value={calendarName}
                onChange={(e) => setCalendarName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="lookback-days-input" className="field-label">
                <span>Domyślne okno (dni wstecz, 0 = dziś)</span>
              </label>
              <input
                id="lookback-days-input"
                type="number"
                min={0}
                max={3650}
                className="input mono"
                value={defaultLookbackDays}
                onChange={(e) => setDefaultLookbackDays(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="backfill-from-input" className="field-label">
                <span>Jednorazowy backfill od daty</span>
              </label>
              <input
                id="backfill-from-input"
                type="date"
                className="input mono"
                value={pendingBackfillFrom}
                onChange={(e) => setPendingBackfillFrom(e.target.value)}
              />
            </div>
          </div>
        )}
      </form>
    </section>
  )
}
