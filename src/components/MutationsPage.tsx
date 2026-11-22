import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '../api/calendarsApi'
import {
  deleteConvertRule,
  deleteTitleRenameRule,
  deleteValueRenameRule,
  listConvertRules,
  listTitleRenameRules,
  listValueRenameRules,
  updateConvertRule,
  updateTitleRenameRule,
  updateValueRenameRule,
  upsertConvertRule,
  upsertTitleRenameRule,
  upsertValueRenameRule,
} from '../api/mutationRulesApi'
import { useAuth } from '../auth/useAuth'
import type { CalendarItem } from '../types/calendar'
import type {
  CalendarConvertRuleItem,
  CalendarTitleRenameRuleItem,
  CalendarValueRenameRuleItem,
  UpsertConvertRulePayload,
  UpsertTitleRenameRulePayload,
  UpsertValueRenameRulePayload,
} from '../types/mutationRule'

const LAST_ACCOUNT_KEY = 'pt_calendar_last_account'

interface MutationsPageProps {
  apiUrl: string
  calendars: CalendarItem[]
  signedInEmail: string | null
}

export function MutationsPage({ apiUrl, calendars, signedInEmail }: MutationsPageProps) {
  const { getIdToken, signOut } = useAuth()

  const initialAccount = () => {
    try {
      return localStorage.getItem(LAST_ACCOUNT_KEY) || signedInEmail || ''
    } catch {
      return signedInEmail || ''
    }
  }

  const [convertRules, setConvertRules] = useState<CalendarConvertRuleItem[]>([])
  const [renameRules, setRenameRules] = useState<CalendarTitleRenameRuleItem[]>([])
  const [valueRenameRules, setValueRenameRules] = useState<CalendarValueRenameRuleItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [accountFilter, setAccountFilter] = useState<string>('ALL')

  // Convert rule form (#key -> target calendar)
  const [convAccount, setConvAccount] = useState<string>(initialAccount)
  const [convKeyPrefix, setConvKeyPrefix] = useState<string>('')
  const [convTargetCalendarId, setConvTargetCalendarId] = useState<string>('')
  const [convSubmitting, setConvSubmitting] = useState<boolean>(false)

  // Convert rule inline edit / delete
  const [editingConvertId, setEditingConvertId] = useState<number | null>(null)
  const [editConvertDraft, setEditConvertDraft] = useState<UpsertConvertRulePayload | null>(null)
  const [confirmDeleteConvertId, setConfirmDeleteConvertId] = useState<number | null>(null)
  const [busyConvertId, setBusyConvertId] = useState<number | null>(null)

  // Title rename rule form (prefix: -> TargetPrefix:)
  const [renAccount, setRenAccount] = useState<string>(initialAccount)
  const [renCalendarId, setRenCalendarId] = useState<string>('*')
  const [renKeyPrefix, setRenKeyPrefix] = useState<string>('')
  const [renTargetPrefix, setRenTargetPrefix] = useState<string>('')
  const [renSubmitting, setRenSubmitting] = useState<boolean>(false)

  // Title rename inline edit / delete
  const [editingRenameId, setEditingRenameId] = useState<number | null>(null)
  const [editRenameDraft, setEditRenameDraft] =
    useState<UpsertTitleRenameRulePayload | null>(null)
  const [confirmDeleteRenameId, setConfirmDeleteRenameId] = useState<number | null>(null)
  const [busyRenameId, setBusyRenameId] = useState<number | null>(null)

  // Value rename rule form (CategoryPrefix: KeySuffix -> CategoryPrefix: TargetSuffix)
  const [valAccount, setValAccount] = useState<string>(initialAccount)
  const [valCalendarId, setValCalendarId] = useState<string>('*')
  const [valCategoryPrefix, setValCategoryPrefix] = useState<string>('*')
  const [valKeySuffix, setValKeySuffix] = useState<string>('')
  const [valTargetSuffix, setValTargetSuffix] = useState<string>('')
  const [valSubmitting, setValSubmitting] = useState<boolean>(false)

  // Value rename inline edit / delete
  const [editingValueRenameId, setEditingValueRenameId] = useState<number | null>(null)
  const [editValueRenameDraft, setEditValueRenameDraft] =
    useState<UpsertValueRenameRulePayload | null>(null)
  const [confirmDeleteValueRenameId, setConfirmDeleteValueRenameId] = useState<number | null>(null)
  const [busyValueRenameId, setBusyValueRenameId] = useState<number | null>(null)

  const calendarNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const cal of calendars) {
      if (cal.calendarName) {
        map.set(`${cal.account}::${cal.calendarId}`, cal.calendarName)
        if (!map.has(cal.calendarId)) {
          map.set(cal.calendarId, cal.calendarName)
        }
      }
    }
    return map
  }, [calendars])

  const resolveCalendarLabel = (account: string, calendarId: string): string | null => {
    if (calendarId === '*') return 'Wszystkie kalendarze (*)'
    return calendarNameMap.get(`${account}::${calendarId}`) ?? calendarNameMap.get(calendarId) ?? null
  }

  const suggestedAccounts = useMemo(() => {
    const set = new Set<string>()
    for (const c of calendars) if (c.account.trim()) set.add(c.account.trim())
    for (const r of convertRules) if (r.account.trim()) set.add(r.account.trim())
    for (const r of renameRules) if (r.account.trim()) set.add(r.account.trim())
    for (const r of valueRenameRules) if (r.account.trim()) set.add(r.account.trim())
    if (signedInEmail) set.add(signedInEmail)
    set.add('pwujczyk@google.com')
    set.add('pwujczyk@gmail.com')
    return Array.from(set)
  }, [calendars, convertRules, renameRules, valueRenameRules, signedInEmail])

  const calendarsForConvertAccount = useMemo(
    () => calendars.filter((c) => !convAccount.trim() || c.account === convAccount.trim()),
    [calendars, convAccount],
  )

  const calendarsForRenameAccount = useMemo(
    () => calendars.filter((c) => !renAccount.trim() || c.account === renAccount.trim()),
    [calendars, renAccount],
  )

  const calendarsForValueRenameAccount = useMemo(
    () => calendars.filter((c) => !valAccount.trim() || c.account === valAccount.trim()),
    [calendars, valAccount],
  )

  const suggestedCategoryPrefixes = useMemo(() => {
    const set = new Set<string>()
    const trimmedAcc = valAccount.trim()
    for (const r of renameRules) {
      if (!trimmedAcc || r.account === trimmedAcc) {
        if (r.targetPrefix.trim()) set.add(r.targetPrefix.trim())
      }
    }
    for (const r of valueRenameRules) {
      if (!trimmedAcc || r.account === trimmedAcc) {
        if (r.categoryPrefix.trim() && r.categoryPrefix.trim() !== '*') {
          set.add(r.categoryPrefix.trim())
        }
      }
    }
    return Array.from(set).sort()
  }, [renameRules, valueRenameRules, valAccount])

  const showNotice = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr))
    }, 3200)
  }

  const reloadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getIdToken()
      const [conv, ren, valRen] = await Promise.all([
        listConvertRules(apiUrl, token),
        listTitleRenameRules(apiUrl, token),
        listValueRenameRules(apiUrl, token),
      ])
      setConvertRules(conv)
      setRenameRules(ren)
      setValueRenameRules(valRen)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut()
        return
      }
      setError((err as Error)?.message || 'Nie udało się pobrać reguł mutacji.')
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
        const [conv, ren, valRen] = await Promise.all([
          listConvertRules(apiUrl, token),
          listTitleRenameRules(apiUrl, token),
          listValueRenameRules(apiUrl, token),
        ])
        if (!cancelled) {
          setConvertRules(conv)
          setRenameRules(ren)
          setValueRenameRules(valRen)
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setError((err as Error)?.message || 'Nie udało się pobrać reguł mutacji.')
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

  const allRuleAccounts = useMemo(() => {
    const set = new Set<string>()
    for (const r of convertRules) set.add(r.account)
    for (const r of renameRules) set.add(r.account)
    for (const r of valueRenameRules) set.add(r.account)
    return Array.from(set).sort()
  }, [convertRules, renameRules, valueRenameRules])

  const filteredConvertRules = useMemo(
    () =>
      accountFilter === 'ALL'
        ? convertRules
        : convertRules.filter((r) => r.account === accountFilter),
    [accountFilter, convertRules],
  )

  const filteredRenameRules = useMemo(
    () =>
      accountFilter === 'ALL'
        ? renameRules
        : renameRules.filter((r) => r.account === accountFilter),
    [accountFilter, renameRules],
  )

  const filteredValueRenameRules = useMemo(
    () =>
      accountFilter === 'ALL'
        ? valueRenameRules
        : valueRenameRules.filter((r) => r.account === accountFilter),
    [accountFilter, valueRenameRules],
  )

  // --- Convert Rule Handlers ---
  const handleAddConvertRule = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const account = convAccount.trim()
    const keyPrefix = convKeyPrefix.trim().replace(/^#+/, '').trim()
    const targetCalendarId = convTargetCalendarId.trim()

    if (!account || !keyPrefix || !targetCalendarId) {
      setError('Uzupełnij konto, prefiks po # oraz docelowy Calendar ID.')
      return
    }

    setConvSubmitting(true)
    try {
      const token = await getIdToken()
      const saved = await upsertConvertRule(apiUrl, token, {
        account,
        keyPrefix,
        targetCalendarId,
        isActive: true,
      })
      setConvertRules((prev) => {
        const without = prev.filter((r) => r.calendarConvertRuleId !== saved.calendarConvertRuleId)
        return [...without, saved].sort(
          (a, b) => a.account.localeCompare(b.account) || a.keyPrefix.localeCompare(b.keyPrefix),
        )
      })
      setConvKeyPrefix('')
      showNotice(`Zapisano regułę przenoszenia #${saved.keyPrefix}`)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zapisać reguły przenoszenia.')
    } finally {
      setConvSubmitting(false)
    }
  }

  const handleToggleConvert = async (rule: CalendarConvertRuleItem) => {
    setBusyConvertId(rule.calendarConvertRuleId)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateConvertRule(apiUrl, token, rule.calendarConvertRuleId, {
        account: rule.account,
        keyPrefix: rule.keyPrefix,
        targetCalendarId: rule.targetCalendarId,
        isActive: !rule.isActive,
      })
      setConvertRules((prev) =>
        prev.map((r) => (r.calendarConvertRuleId === updated.calendarConvertRuleId ? updated : r)),
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zmienić statusu reguły.')
    } finally {
      setBusyConvertId(null)
    }
  }

  const handleSaveConvertEdit = async (id: number) => {
    if (!editConvertDraft) return
    setBusyConvertId(id)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateConvertRule(apiUrl, token, id, {
        account: editConvertDraft.account.trim(),
        keyPrefix: editConvertDraft.keyPrefix.trim().replace(/^#+/, '').trim(),
        targetCalendarId: editConvertDraft.targetCalendarId.trim(),
        isActive: editConvertDraft.isActive,
      })
      setConvertRules((prev) =>
        prev.map((r) => (r.calendarConvertRuleId === id ? updated : r)),
      )
      setEditingConvertId(null)
      setEditConvertDraft(null)
      showNotice('Zaktualizowano regułę przenoszenia.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zaktualizować reguły.')
    } finally {
      setBusyConvertId(null)
    }
  }

  const handleDeleteConvert = async (id: number) => {
    setBusyConvertId(id)
    setError(null)
    try {
      const token = await getIdToken()
      await deleteConvertRule(apiUrl, token, id)
      setConvertRules((prev) => prev.filter((r) => r.calendarConvertRuleId !== id))
      setConfirmDeleteConvertId(null)
      showNotice('Usunięto regułę przenoszenia.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się usunąć reguły.')
    } finally {
      setBusyConvertId(null)
    }
  }

  // --- Title Rename Rule Handlers ---
  const handleAddRenameRule = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const account = renAccount.trim()
    const calendarId = renCalendarId.trim()
    const keyPrefix = renKeyPrefix.trim().replace(/:+$/, '').trim()
    const targetPrefix = renTargetPrefix.trim().replace(/:+$/, '').trim()

    if (!account || !calendarId || !keyPrefix || !targetPrefix) {
      setError('Uzupełnij konto, kalendarz, skrót oraz pełną nazwę kategorii.')
      return
    }

    setRenSubmitting(true)
    try {
      const token = await getIdToken()
      const saved = await upsertTitleRenameRule(apiUrl, token, {
        account,
        calendarId,
        keyPrefix,
        targetPrefix,
        isActive: true,
      })
      setRenameRules((prev) => {
        const without = prev.filter(
          (r) => r.calendarTitleRenameRuleId !== saved.calendarTitleRenameRuleId,
        )
        return [...without, saved].sort(
          (a, b) =>
            a.account.localeCompare(b.account) ||
            a.calendarId.localeCompare(b.calendarId) ||
            a.keyPrefix.localeCompare(b.keyPrefix),
        )
      })
      setRenKeyPrefix('')
      setRenTargetPrefix('')
      showNotice(`Zapisano regułę nazwy "${saved.keyPrefix}" → "${saved.targetPrefix}"`)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zapisać reguły nazwy.')
    } finally {
      setRenSubmitting(false)
    }
  }

  const handleToggleRename = async (rule: CalendarTitleRenameRuleItem) => {
    setBusyRenameId(rule.calendarTitleRenameRuleId)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateTitleRenameRule(apiUrl, token, rule.calendarTitleRenameRuleId, {
        account: rule.account,
        calendarId: rule.calendarId,
        keyPrefix: rule.keyPrefix,
        targetPrefix: rule.targetPrefix,
        isActive: !rule.isActive,
      })
      setRenameRules((prev) =>
        prev.map((r) =>
          r.calendarTitleRenameRuleId === updated.calendarTitleRenameRuleId ? updated : r,
        ),
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zmienić statusu reguły.')
    } finally {
      setBusyRenameId(null)
    }
  }

  const handleSaveRenameEdit = async (id: number) => {
    if (!editRenameDraft) return
    setBusyRenameId(id)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateTitleRenameRule(apiUrl, token, id, {
        account: editRenameDraft.account.trim(),
        calendarId: editRenameDraft.calendarId.trim(),
        keyPrefix: editRenameDraft.keyPrefix.trim().replace(/:+$/, '').trim(),
        targetPrefix: editRenameDraft.targetPrefix.trim().replace(/:+$/, '').trim(),
        isActive: editRenameDraft.isActive,
      })
      setRenameRules((prev) =>
        prev.map((r) => (r.calendarTitleRenameRuleId === id ? updated : r)),
      )
      setEditingRenameId(null)
      setEditRenameDraft(null)
      showNotice('Zaktualizowano regułę nazwy.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zaktualizować reguły nazwy.')
    } finally {
      setBusyRenameId(null)
    }
  }

  const handleDeleteRename = async (id: number) => {
    setBusyRenameId(id)
    setError(null)
    try {
      const token = await getIdToken()
      await deleteTitleRenameRule(apiUrl, token, id)
      setRenameRules((prev) => prev.filter((r) => r.calendarTitleRenameRuleId !== id))
      setConfirmDeleteRenameId(null)
      showNotice('Usunięto regułę nazwy.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się usunąć reguły nazwy.')
    } finally {
      setBusyRenameId(null)
    }
  }

  // --- Value Rename Rule Handlers (after ':') ---
  const normalizePrefixScope = (raw: string): string => {
    const cleaned = raw.trim().replace(/:+$/, '').trim()
    return cleaned.length === 0 ? '*' : cleaned
  }

  const handleAddValueRenameRule = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const account = valAccount.trim()
    const calendarId = valCalendarId.trim()
    const categoryPrefix = normalizePrefixScope(valCategoryPrefix)
    const keySuffix = valKeySuffix.trim().replace(/^:+/, '').trim()
    const targetSuffix = valTargetSuffix.trim().replace(/^:+/, '').trim()

    if (!account || !calendarId || !keySuffix || !targetSuffix) {
      setError('Uzupełnij konto, kalendarz, skrót po : oraz docelową wartość po :.')
      return
    }

    setValSubmitting(true)
    try {
      const token = await getIdToken()
      const saved = await upsertValueRenameRule(apiUrl, token, {
        account,
        calendarId,
        categoryPrefix,
        keySuffix,
        targetSuffix,
        isActive: true,
      })
      setValueRenameRules((prev) => {
        const without = prev.filter(
          (r) => r.calendarValueRenameRuleId !== saved.calendarValueRenameRuleId,
        )
        return [...without, saved].sort(
          (a, b) =>
            a.account.localeCompare(b.account) ||
            a.calendarId.localeCompare(b.calendarId) ||
            a.categoryPrefix.localeCompare(b.categoryPrefix) ||
            a.keySuffix.localeCompare(b.keySuffix),
        )
      })
      setValKeySuffix('')
      setValTargetSuffix('')
      showNotice(
        `Zapisano regułę wartości po : "${saved.categoryPrefix}: ${saved.keySuffix}" → "${saved.targetSuffix}"`,
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zapisać reguły wartości po :.')
    } finally {
      setValSubmitting(false)
    }
  }

  const handleToggleValueRename = async (rule: CalendarValueRenameRuleItem) => {
    setBusyValueRenameId(rule.calendarValueRenameRuleId)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateValueRenameRule(apiUrl, token, rule.calendarValueRenameRuleId, {
        account: rule.account,
        calendarId: rule.calendarId,
        categoryPrefix: rule.categoryPrefix,
        keySuffix: rule.keySuffix,
        targetSuffix: rule.targetSuffix,
        isActive: !rule.isActive,
      })
      setValueRenameRules((prev) =>
        prev.map((r) =>
          r.calendarValueRenameRuleId === updated.calendarValueRenameRuleId ? updated : r,
        ),
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zmienić statusu reguły.')
    } finally {
      setBusyValueRenameId(null)
    }
  }

  const handleSaveValueRenameEdit = async (id: number) => {
    if (!editValueRenameDraft) return
    setBusyValueRenameId(id)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateValueRenameRule(apiUrl, token, id, {
        account: editValueRenameDraft.account.trim(),
        calendarId: editValueRenameDraft.calendarId.trim(),
        categoryPrefix: normalizePrefixScope(editValueRenameDraft.categoryPrefix),
        keySuffix: editValueRenameDraft.keySuffix.trim().replace(/^:+/, '').trim(),
        targetSuffix: editValueRenameDraft.targetSuffix.trim().replace(/^:+/, '').trim(),
        isActive: editValueRenameDraft.isActive,
      })
      setValueRenameRules((prev) =>
        prev.map((r) => (r.calendarValueRenameRuleId === id ? updated : r)),
      )
      setEditingValueRenameId(null)
      setEditValueRenameDraft(null)
      showNotice('Zaktualizowano regułę wartości po :.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zaktualizować reguły wartości po :.')
    } finally {
      setBusyValueRenameId(null)
    }
  }

  const handleDeleteValueRename = async (id: number) => {
    setBusyValueRenameId(id)
    setError(null)
    try {
      const token = await getIdToken()
      await deleteValueRenameRule(apiUrl, token, id)
      setValueRenameRules((prev) => prev.filter((r) => r.calendarValueRenameRuleId !== id))
      setConfirmDeleteValueRenameId(null)
      showNotice('Usunięto regułę wartości po :.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się usunąć reguły wartości po :.')
    } finally {
      setBusyValueRenameId(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reguły mutacji</h1>
          <p className="page-description">
            Serwer wylicza z tych reguł komendy <code>MOVE</code> i <code>RENAME</code>, a Apps Script
            wykonuje je w Google Calendar API v3 podczas synchronizacji.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {allRuleAccounts.length > 0 && (
            <div className="filter-bar">
              <button
                type="button"
                className={`filter-pill ${accountFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setAccountFilter('ALL')}
              >
                <span>Wszystkie konta</span>
              </button>
              {allRuleAccounts.map((acc) => (
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
            id="refresh-mutation-rules-button"
            type="button"
            className="btn btn-secondary"
            onClick={() => void reloadAll()}
            disabled={loading}
          >
            {loading ? 'Pobieranie…' : 'Odśwież'}
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

      {/* SECTION 1: #key -> MOVE */}
      <section className="panel" aria-labelledby="convert-rules-heading">
        <div className="panel-header">
          <div>
            <h2 id="convert-rules-heading" className="panel-title">
              1. Przenoszenie eventów po <code>#klucz</code> (MOVE — {filteredConvertRules.length})
            </h2>
            <p className="field-hint" style={{ marginTop: '0.15rem' }}>
              Np. wpisanie <code>#DL Spacer</code> w głównym kalendarzu przeniesie event do wybranego
              kalendarza z tytułem <code>Spacer</code>.
            </p>
          </div>
        </div>

        <form className="panel-body" onSubmit={handleAddConvertRule}>
          <div className="mutations-form-convert">
            <div className="field">
              <label htmlFor="conv-account-input" className="field-label">
                <span>Konto Google</span>
              </label>
              <input
                id="conv-account-input"
                type="email"
                className="input mono"
                placeholder="pwujczyk@google.com"
                value={convAccount}
                onChange={(e) => setConvAccount(e.target.value)}
                required
              />
              <div className="quick-chips">
                {suggestedAccounts.map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    className={`chip ${convAccount.trim() === acc ? 'active' : ''}`}
                    onClick={() => setConvAccount(acc)}
                  >
                    {acc}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="conv-prefix-input" className="field-label">
                <span>Klucz po #</span>
              </label>
              <input
                id="conv-prefix-input"
                type="text"
                className="input mono"
                placeholder="np. dl"
                value={convKeyPrefix}
                onChange={(e) => setConvKeyPrefix(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="conv-target-cal-input" className="field-label">
                <span>Docelowy Calendar ID</span>
              </label>
              <input
                id="conv-target-cal-input"
                type="text"
                className="input mono"
                placeholder="c_...@group.calendar.google.com"
                value={convTargetCalendarId}
                onChange={(e) => setConvTargetCalendarId(e.target.value)}
                required
              />
              {calendarsForConvertAccount.length > 0 && (
                <div className="quick-chips">
                  {calendarsForConvertAccount.map((cal) => (
                    <button
                      key={cal.calendarSyncStateId}
                      type="button"
                      className={`chip ${
                        convTargetCalendarId.trim() === cal.calendarId ? 'active' : ''
                      }`}
                      onClick={() => setConvTargetCalendarId(cal.calendarId)}
                    >
                      {cal.calendarName || cal.calendarId}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="field" style={{ paddingTop: '1.42rem' }}>
              <button
                id="submit-convert-rule-button"
                type="submit"
                className="btn btn-primary"
                disabled={convSubmitting}
              >
                {convSubmitting ? 'Zapisywanie…' : '+ Dodaj regułę #'}
              </button>
            </div>
          </div>
        </form>

        {filteredConvertRules.length === 0 ? (
          <div className="empty-state" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            Brak skonfigurowanych reguł przenoszenia po <code>#klucz</code>.
          </div>
        ) : (
          <div className="table-wrap" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <table className="cal-table">
              <thead>
                <tr>
                  <th>Prefiks</th>
                  <th>Docelowy kalendarz</th>
                  <th>Konto</th>
                  <th>Aktywna</th>
                  <th style={{ textAlign: 'right' }}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredConvertRules.map((rule) => {
                  const isEditing =
                    editingConvertId === rule.calendarConvertRuleId && editConvertDraft !== null
                  const isBusy = busyConvertId === rule.calendarConvertRuleId
                  const resolvedName = resolveCalendarLabel(rule.account, rule.targetCalendarId)

                  return (
                    <Fragment key={rule.calendarConvertRuleId}>
                      <tr className={!rule.isActive ? 'cal-row-inactive' : undefined}>
                        <td>
                          <code className="cal-id-code" style={{ fontWeight: 600 }}>
                            #{rule.keyPrefix}
                          </code>
                        </td>

                        <td>
                          {resolvedName && <div className="cal-name">{resolvedName}</div>}
                          <div className="cal-id-row">
                            <code className="cal-id-code">{rule.targetCalendarId}</code>
                          </div>
                        </td>

                        <td>
                          <span className="account-badge">{rule.account}</span>
                        </td>

                        <td>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={rule.isActive}
                              disabled={isBusy}
                              onChange={() => void handleToggleConvert(rule)}
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
                            {confirmDeleteConvertId === rule.calendarConvertRuleId ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={isBusy}
                                  onClick={() => void handleDeleteConvert(rule.calendarConvertRuleId)}
                                >
                                  Potwierdź
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteConvertId(null)}
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
                                      setEditingConvertId(null)
                                      setEditConvertDraft(null)
                                    } else {
                                      setConfirmDeleteConvertId(null)
                                      setEditingConvertId(rule.calendarConvertRuleId)
                                      setEditConvertDraft({
                                        account: rule.account,
                                        keyPrefix: rule.keyPrefix,
                                        targetCalendarId: rule.targetCalendarId,
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
                                    setEditingConvertId(null)
                                    setConfirmDeleteConvertId(rule.calendarConvertRuleId)
                                  }}
                                >
                                  Usuń
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditing && editConvertDraft && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0 }}>
                            <div className="edit-row-box">
                              <div className="edit-grid">
                                <div className="field">
                                  <label className="field-label">Konto</label>
                                  <input
                                    type="email"
                                    className="input mono"
                                    value={editConvertDraft.account}
                                    onChange={(e) =>
                                      setEditConvertDraft({
                                        ...editConvertDraft,
                                        account: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Klucz po #</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editConvertDraft.keyPrefix}
                                    onChange={(e) =>
                                      setEditConvertDraft({
                                        ...editConvertDraft,
                                        keyPrefix: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Docelowy Calendar ID</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editConvertDraft.targetCalendarId}
                                    onChange={(e) =>
                                      setEditConvertDraft({
                                        ...editConvertDraft,
                                        targetCalendarId: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingConvertId(null)
                                    setEditConvertDraft(null)
                                  }}
                                >
                                  Anuluj
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleSaveConvertEdit(rule.calendarConvertRuleId)
                                  }
                                >
                                  {isBusy ? 'Zapisywanie…' : 'Zapisz zmiany'}
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

      {/* SECTION 2: prefix: -> RENAME */}
      <section className="panel" aria-labelledby="rename-rules-heading">
        <div className="panel-header">
          <div>
            <h2 id="rename-rules-heading" className="panel-title">
              2. Normalizacja skrótów w tytule przed <code>:</code> (RENAME —{' '}
              {filteredRenameRules.length})
            </h2>
            <p className="field-hint" style={{ marginTop: '0.15rem' }}>
              Np. <code>sd: czytanie</code> zmieni się na <code>SelfDevelopment: czytanie</code> (a{' '}
              <code>ho</code> bez dwukropka na <code>Hanging-out</code>).
            </p>
          </div>
        </div>

        <form className="panel-body" onSubmit={handleAddRenameRule}>
          <div className="mutations-form-rename">
            <div className="field">
              <label htmlFor="ren-account-input" className="field-label">
                <span>Konto Google</span>
              </label>
              <input
                id="ren-account-input"
                type="email"
                className="input mono"
                placeholder="pwujczyk@google.com"
                value={renAccount}
                onChange={(e) => setRenAccount(e.target.value)}
                required
              />
              <div className="quick-chips">
                {suggestedAccounts.map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    className={`chip ${renAccount.trim() === acc ? 'active' : ''}`}
                    onClick={() => setRenAccount(acc)}
                  >
                    {acc}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="ren-calendar-input" className="field-label">
                <span>Calendar ID (lub * dla wszystkich)</span>
              </label>
              <input
                id="ren-calendar-input"
                type="text"
                className="input mono"
                placeholder="* lub ID kalendarza"
                value={renCalendarId}
                onChange={(e) => setRenCalendarId(e.target.value)}
                required
              />
              <div className="quick-chips">
                <button
                  type="button"
                  className={`chip ${renCalendarId.trim() === '*' ? 'active' : ''}`}
                  onClick={() => setRenCalendarId('*')}
                >
                  * (wszystkie)
                </button>
                {calendarsForRenameAccount.map((cal) => (
                  <button
                    key={cal.calendarSyncStateId}
                    type="button"
                    className={`chip ${renCalendarId.trim() === cal.calendarId ? 'active' : ''}`}
                    onClick={() => setRenCalendarId(cal.calendarId)}
                  >
                    {cal.calendarName || cal.calendarId}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="ren-key-input" className="field-label">
                <span>Skrót przed :</span>
              </label>
              <input
                id="ren-key-input"
                type="text"
                className="input mono"
                placeholder="np. sd"
                value={renKeyPrefix}
                onChange={(e) => setRenKeyPrefix(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="ren-target-input" className="field-label">
                <span>Docelowy prefiks</span>
              </label>
              <input
                id="ren-target-input"
                type="text"
                className="input"
                placeholder="np. SelfDevelopment"
                value={renTargetPrefix}
                onChange={(e) => setRenTargetPrefix(e.target.value)}
                required
              />
            </div>

            <div className="field" style={{ paddingTop: '1.42rem' }}>
              <button
                id="submit-rename-rule-button"
                type="submit"
                className="btn btn-primary"
                disabled={renSubmitting}
              >
                {renSubmitting ? 'Zapisywanie…' : '+ Dodaj regułę nazwy'}
              </button>
            </div>
          </div>
        </form>

        {filteredRenameRules.length === 0 ? (
          <div className="empty-state" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            Brak skonfigurowanych reguł rozwijania skrótów przed <code>:</code>.
          </div>
        ) : (
          <div className="table-wrap" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <table className="cal-table">
              <thead>
                <tr>
                  <th>Mapowanie</th>
                  <th>Kalendarz</th>
                  <th>Konto</th>
                  <th>Aktywna</th>
                  <th style={{ textAlign: 'right' }}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredRenameRules.map((rule) => {
                  const isEditing =
                    editingRenameId === rule.calendarTitleRenameRuleId && editRenameDraft !== null
                  const isBusy = busyRenameId === rule.calendarTitleRenameRuleId
                  const resolvedName = resolveCalendarLabel(rule.account, rule.calendarId)

                  return (
                    <Fragment key={rule.calendarTitleRenameRuleId}>
                      <tr className={!rule.isActive ? 'cal-row-inactive' : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <code className="cal-id-code">{rule.keyPrefix}</code>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span className="cal-name">{rule.targetPrefix}</span>
                          </div>
                        </td>

                        <td>
                          {resolvedName && <div style={{ fontWeight: 500 }}>{resolvedName}</div>}
                          {rule.calendarId !== '*' && (
                            <div className="cal-id-row">
                              <code className="cal-id-code">{rule.calendarId}</code>
                            </div>
                          )}
                        </td>

                        <td>
                          <span className="account-badge">{rule.account}</span>
                        </td>

                        <td>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={rule.isActive}
                              disabled={isBusy}
                              onChange={() => void handleToggleRename(rule)}
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
                            {confirmDeleteRenameId === rule.calendarTitleRenameRuleId ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleDeleteRename(rule.calendarTitleRenameRuleId)
                                  }
                                >
                                  Potwierdź
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteRenameId(null)}
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
                                      setEditingRenameId(null)
                                      setEditRenameDraft(null)
                                    } else {
                                      setConfirmDeleteRenameId(null)
                                      setEditingRenameId(rule.calendarTitleRenameRuleId)
                                      setEditRenameDraft({
                                        account: rule.account,
                                        calendarId: rule.calendarId,
                                        keyPrefix: rule.keyPrefix,
                                        targetPrefix: rule.targetPrefix,
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
                                    setEditingRenameId(null)
                                    setConfirmDeleteRenameId(rule.calendarTitleRenameRuleId)
                                  }}
                                >
                                  Usuń
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditing && editRenameDraft && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0 }}>
                            <div className="edit-row-box">
                              <div className="edit-grid">
                                <div className="field">
                                  <label className="field-label">Konto</label>
                                  <input
                                    type="email"
                                    className="input mono"
                                    value={editRenameDraft.account}
                                    onChange={(e) =>
                                      setEditRenameDraft({
                                        ...editRenameDraft,
                                        account: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Calendar ID (lub *)</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editRenameDraft.calendarId}
                                    onChange={(e) =>
                                      setEditRenameDraft({
                                        ...editRenameDraft,
                                        calendarId: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Skrót przed :</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editRenameDraft.keyPrefix}
                                    onChange={(e) =>
                                      setEditRenameDraft({
                                        ...editRenameDraft,
                                        keyPrefix: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Docelowy prefiks</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={editRenameDraft.targetPrefix}
                                    onChange={(e) =>
                                      setEditRenameDraft({
                                        ...editRenameDraft,
                                        targetPrefix: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingRenameId(null)
                                    setEditRenameDraft(null)
                                  }}
                                >
                                  Anuluj
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleSaveRenameEdit(rule.calendarTitleRenameRuleId)
                                  }
                                >
                                  {isBusy ? 'Zapisywanie…' : 'Zapisz zmiany'}
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

      {/* SECTION 3: after ':' -> RENAME */}
      <section className="panel" aria-labelledby="value-rename-rules-heading">
        <div className="panel-header">
          <div>
            <h2 id="value-rename-rules-heading" className="panel-title">
              3. Normalizacja skrótów / wartości w tytule po <code>:</code> (RENAME —{' '}
              {filteredValueRenameRules.length})
            </h2>
            <p className="field-hint" style={{ marginTop: '0.15rem' }}>
              Np. <code>Sport: b</code> zmieni się na <code>Sport: Basen</code>. Możesz podać
              konkretny prefiks przed <code>:</code> (np. <code>Sport</code>) albo <code>*</code>{' '}
              dla dowolnego prefiksu — reguła działa również łącznie z sekcją 1 i 2.
            </p>
          </div>
        </div>

        <form className="panel-body" onSubmit={handleAddValueRenameRule}>
          <div className="mutations-form-value-rename">
            <div className="field">
              <label htmlFor="val-account-input" className="field-label">
                <span>Konto Google</span>
              </label>
              <input
                id="val-account-input"
                type="email"
                className="input mono"
                placeholder="pwujczyk@google.com"
                value={valAccount}
                onChange={(e) => setValAccount(e.target.value)}
                required
              />
              <div className="quick-chips">
                {suggestedAccounts.map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    className={`chip ${valAccount.trim() === acc ? 'active' : ''}`}
                    onClick={() => setValAccount(acc)}
                  >
                    {acc}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="val-calendar-input" className="field-label">
                <span>Calendar ID (lub * dla wszystkich)</span>
              </label>
              <input
                id="val-calendar-input"
                type="text"
                className="input mono"
                placeholder="* lub ID kalendarza"
                value={valCalendarId}
                onChange={(e) => setValCalendarId(e.target.value)}
                required
              />
              <div className="quick-chips">
                <button
                  type="button"
                  className={`chip ${valCalendarId.trim() === '*' ? 'active' : ''}`}
                  onClick={() => setValCalendarId('*')}
                >
                  * (wszystkie)
                </button>
                {calendarsForValueRenameAccount.map((cal) => (
                  <button
                    key={cal.calendarSyncStateId}
                    type="button"
                    className={`chip ${valCalendarId.trim() === cal.calendarId ? 'active' : ''}`}
                    onClick={() => setValCalendarId(cal.calendarId)}
                  >
                    {cal.calendarName || cal.calendarId}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="val-category-prefix-input" className="field-label">
                <span>Prefiks przed : (* = dowolny)</span>
              </label>
              <input
                id="val-category-prefix-input"
                type="text"
                className="input mono"
                placeholder="* lub np. Sport"
                value={valCategoryPrefix}
                onChange={(e) => setValCategoryPrefix(e.target.value)}
                required
              />
              <div className="quick-chips">
                <button
                  type="button"
                  className={`chip ${normalizePrefixScope(valCategoryPrefix) === '*' ? 'active' : ''}`}
                  onClick={() => setValCategoryPrefix('*')}
                >
                  * (dowolny)
                </button>
                {suggestedCategoryPrefixes.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`chip ${normalizePrefixScope(valCategoryPrefix) === cat ? 'active' : ''}`}
                    onClick={() => setValCategoryPrefix(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="val-key-suffix-input" className="field-label">
                <span>Skrót po :</span>
              </label>
              <input
                id="val-key-suffix-input"
                type="text"
                className="input mono"
                placeholder="np. b"
                value={valKeySuffix}
                onChange={(e) => setValKeySuffix(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="val-target-suffix-input" className="field-label">
                <span>Docelowa wartość po :</span>
              </label>
              <input
                id="val-target-suffix-input"
                type="text"
                className="input"
                placeholder="np. Basen"
                value={valTargetSuffix}
                onChange={(e) => setValTargetSuffix(e.target.value)}
                required
              />
            </div>

            <div className="field" style={{ paddingTop: '1.42rem' }}>
              <button
                id="submit-value-rename-rule-button"
                type="submit"
                className="btn btn-primary"
                disabled={valSubmitting}
              >
                {valSubmitting ? 'Zapisywanie…' : '+ Dodaj regułę po :'}
              </button>
            </div>
          </div>
        </form>

        {filteredValueRenameRules.length === 0 ? (
          <div className="empty-state" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            Brak skonfigurowanych reguł rozwijania skrótów / wartości po <code>:</code>.
          </div>
        ) : (
          <div className="table-wrap" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <table className="cal-table">
              <thead>
                <tr>
                  <th>Mapowanie po :</th>
                  <th>Prefiks przed :</th>
                  <th>Kalendarz</th>
                  <th>Konto</th>
                  <th>Aktywna</th>
                  <th style={{ textAlign: 'right' }}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredValueRenameRules.map((rule) => {
                  const isEditing =
                    editingValueRenameId === rule.calendarValueRenameRuleId &&
                    editValueRenameDraft !== null
                  const isBusy = busyValueRenameId === rule.calendarValueRenameRuleId
                  const resolvedName = resolveCalendarLabel(rule.account, rule.calendarId)

                  return (
                    <Fragment key={rule.calendarValueRenameRuleId}>
                      <tr className={!rule.isActive ? 'cal-row-inactive' : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <code className="cal-id-code">{rule.keySuffix}</code>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span className="cal-name">{rule.targetSuffix}</span>
                          </div>
                        </td>

                        <td>
                          {rule.categoryPrefix === '*' ? (
                            <span className="badge badge-neutral">Dowolny (*)</span>
                          ) : (
                            <code className="cal-id-code" style={{ fontWeight: 600 }}>
                              {rule.categoryPrefix}:
                            </code>
                          )}
                        </td>

                        <td>
                          {resolvedName && <div style={{ fontWeight: 500 }}>{resolvedName}</div>}
                          {rule.calendarId !== '*' && (
                            <div className="cal-id-row">
                              <code className="cal-id-code">{rule.calendarId}</code>
                            </div>
                          )}
                        </td>

                        <td>
                          <span className="account-badge">{rule.account}</span>
                        </td>

                        <td>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={rule.isActive}
                              disabled={isBusy}
                              onChange={() => void handleToggleValueRename(rule)}
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
                            {confirmDeleteValueRenameId === rule.calendarValueRenameRuleId ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleDeleteValueRename(rule.calendarValueRenameRuleId)
                                  }
                                >
                                  Potwierdź
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteValueRenameId(null)}
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
                                      setEditingValueRenameId(null)
                                      setEditValueRenameDraft(null)
                                    } else {
                                      setConfirmDeleteValueRenameId(null)
                                      setEditingValueRenameId(rule.calendarValueRenameRuleId)
                                      setEditValueRenameDraft({
                                        account: rule.account,
                                        calendarId: rule.calendarId,
                                        categoryPrefix: rule.categoryPrefix,
                                        keySuffix: rule.keySuffix,
                                        targetSuffix: rule.targetSuffix,
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
                                    setEditingValueRenameId(null)
                                    setConfirmDeleteValueRenameId(rule.calendarValueRenameRuleId)
                                  }}
                                >
                                  Usuń
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditing && editValueRenameDraft && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="edit-row-box">
                              <div className="edit-grid">
                                <div className="field">
                                  <label className="field-label">Konto</label>
                                  <input
                                    type="email"
                                    className="input mono"
                                    value={editValueRenameDraft.account}
                                    onChange={(e) =>
                                      setEditValueRenameDraft({
                                        ...editValueRenameDraft,
                                        account: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Calendar ID (lub *)</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editValueRenameDraft.calendarId}
                                    onChange={(e) =>
                                      setEditValueRenameDraft({
                                        ...editValueRenameDraft,
                                        calendarId: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Prefiks przed : (lub *)</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editValueRenameDraft.categoryPrefix}
                                    onChange={(e) =>
                                      setEditValueRenameDraft({
                                        ...editValueRenameDraft,
                                        categoryPrefix: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Skrót po :</label>
                                  <input
                                    type="text"
                                    className="input mono"
                                    value={editValueRenameDraft.keySuffix}
                                    onChange={(e) =>
                                      setEditValueRenameDraft({
                                        ...editValueRenameDraft,
                                        keySuffix: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label className="field-label">Docelowa wartość po :</label>
                                  <input
                                    type="text"
                                    className="input"
                                    value={editValueRenameDraft.targetSuffix}
                                    onChange={(e) =>
                                      setEditValueRenameDraft({
                                        ...editValueRenameDraft,
                                        targetSuffix: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingValueRenameId(null)
                                    setEditValueRenameDraft(null)
                                  }}
                                >
                                  Anuluj
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleSaveValueRenameEdit(rule.calendarValueRenameRuleId)
                                  }
                                >
                                  {isBusy ? 'Zapisywanie…' : 'Zapisz zmiany'}
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
