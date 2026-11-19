import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/calendarsApi'
import {
  createCategoryConfig,
  deleteCategoryConfig,
  listCategoryConfigs,
  reorderCategoryConfigs,
  resetDefaultCategoryConfigs,
  updateCategoryConfig,
} from '../api/categoryRulesApi'
import { useAuth } from '../auth/useAuth'
import type { CalendarCategoryConfigItem } from '../types/categoryRule'

interface CategorySortingPanelProps {
  apiUrl: string
  onCategoriesChanged?: (items: CalendarCategoryConfigItem[]) => void
}

export function CategorySortingPanel({
  apiUrl,
  onCategoriesChanged,
}: CategorySortingPanelProps) {
  const { getIdToken, signOut } = useAuth()

  const [items, setItems] = useState<CalendarCategoryConfigItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newName, setNewName] = useState<string>('')
  const [newColor, setNewColor] = useState<string>('#6aa84f')
  const [newSortOrder, setNewSortOrder] = useState<string>('130')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editSortOrder, setEditSortOrder] = useState<string>('')
  const [editColor, setEditColor] = useState<string>('#64748b')

  const applyItems = useCallback(
    (next: CalendarCategoryConfigItem[]) => {
      setItems(next)
      onCategoriesChanged?.(next)
    },
    [onCategoriesChanged],
  )

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getIdToken()
        const data = await listCategoryConfigs(apiUrl, token)
        if (!cancelled) {
          applyItems(data)
          const maxOrder = data.reduce((m, c) => Math.max(m, c.sortOrder), 0)
          setNewSortOrder(String(maxOrder + 10))
        }
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await signOut()
          return
        }
        setError((err as Error)?.message || 'Nie udało się pobrać konfiguracji sortowania kategorii.')
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
  }, [apiUrl, applyItems, getIdToken, signOut])

  const showNotice = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr))
    }, 3200)
  }

  const handleMove = async (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta
    if (targetIndex < 0 || targetIndex >= items.length) return

    const reordered = [...items]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    setBusy(true)
    setError(null)
    try {
      const token = await getIdToken()
      const saved = await reorderCategoryConfigs(
        apiUrl,
        token,
        reordered.map((c) => c.calendarCategoryId),
      )
      applyItems(saved)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zapisać nowej kolejności.')
    } finally {
      setBusy(false)
    }
  }

  const handleQuickColorChange = async (
    item: CalendarCategoryConfigItem,
    nextColor: string,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const token = await getIdToken()
      const updated = await updateCategoryConfig(apiUrl, token, item.calendarCategoryId, {
        category: item.category,
        sortOrder: item.sortOrder,
        color: nextColor,
        isActive: item.isActive,
      })
      applyItems(
        items.map((c) =>
          c.calendarCategoryId === item.calendarCategoryId ? updated : c,
        ),
      )
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zmienić koloru kategorii.')
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      setError('Podaj nazwę kategorii.')
      return
    }
    const parsedOrder = Number.parseInt(newSortOrder.trim(), 10)
    if (Number.isNaN(parsedOrder)) {
      setError('Kolejność (SortOrder) musi być liczbą całkowitą.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const token = await getIdToken()
      await createCategoryConfig(apiUrl, token, {
        category: newName.trim(),
        sortOrder: parsedOrder,
        color: newColor,
        isActive: true,
      })
      const refreshed = await listCategoryConfigs(apiUrl, token)
      applyItems(refreshed)
      setNewName('')
      const maxOrder = refreshed.reduce((m, c) => Math.max(m, c.sortOrder), 0)
      setNewSortOrder(String(maxOrder + 10))
      showNotice(`Dodano kategorię "${newName.trim()}" do konfiguracji sortowania.`)
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się dodać kategorii.')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (item: CalendarCategoryConfigItem) => {
    setEditingId(item.calendarCategoryId)
    setEditName(item.category)
    setEditSortOrder(String(item.sortOrder))
    setEditColor(item.color)
  }

  const handleSaveEdit = async (item: CalendarCategoryConfigItem) => {
    const parsedOrder = Number.parseInt(editSortOrder.trim(), 10)
    if (!editName.trim() || Number.isNaN(parsedOrder)) {
      setError('Podaj poprawną nazwę oraz liczbę kolejności.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const token = await getIdToken()
      await updateCategoryConfig(apiUrl, token, item.calendarCategoryId, {
        category: editName.trim(),
        sortOrder: parsedOrder,
        color: editColor,
        isActive: item.isActive,
      })
      const refreshed = await listCategoryConfigs(apiUrl, token)
      applyItems(refreshed)
      setEditingId(null)
      showNotice('Zapisano zmiany kategorii.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się zapisać zmian kategorii.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: number) => {
    setBusy(true)
    setError(null)
    try {
      const token = await getIdToken()
      await deleteCategoryConfig(apiUrl, token, id)
      const next = items.filter((c) => c.calendarCategoryId !== id)
      applyItems(next)
      showNotice('Usunięto kategorię z konfiguracji sortowania.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się usunąć kategorii.')
    } finally {
      setBusy(false)
    }
  }

  const handleResetDefaults = async () => {
    setBusy(true)
    setError(null)
    try {
      const token = await getIdToken()
      const refreshed = await resetDefaultCategoryConfigs(apiUrl, token)
      applyItems(refreshed)
      showNotice('Przywrócono domyślną kolejność i kolory z arkusza PT.Calendar.')
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Nie udało się przywrócić ustawień z arkusza.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="category-sorting-heading">
      <div className="panel-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <h2 id="category-sorting-heading" className="panel-title">
              Kolejność sortowania i kolory kategorii na wykresach
            </h2>
            <span className="badge badge-neutral">{items.length} kategorii</span>
          </div>
          <p style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            Zastępuje sztuczne wiersze <code>Sorting</code> z arkusza{' '}
            <code>PT.Calendar</code>. Niższe <code>SortOrder</code> znajduje się na dole
            słupka wykresu (<code>10: OOO</code> → dół słupka,{' '}
            <code>120: SelfDevelopment</code> → szczyt słupka).
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || loading}
          onClick={() => void handleResetDefaults()}
          title="Ustawia kolejność 10..120 oraz kolory dokładnie tak jak w arkuszu PT.Calendar"
        >
          Przywróć układ z arkusza
        </button>
      </div>

      <div className="panel-body" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {notice && (
          <div className="alert alert-success" style={{ marginBottom: '0.9rem' }} role="status">
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '0.9rem' }} role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
              Zamknij
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => void handleAdd(e)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1.4fr) 120px 140px auto',
            gap: '0.8rem',
            alignItems: 'end',
          }}
        >
          <div className="field">
            <label className="field-label" htmlFor="new-cat-sort-name">
              Nowa kategoria
            </label>
            <input
              id="new-cat-sort-name"
              type="text"
              className="input"
              placeholder="np. Break"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="new-cat-sort-order">
              SortOrder
            </label>
            <input
              id="new-cat-sort-order"
              type="number"
              className="input mono"
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="new-cat-sort-color">
              Kolor
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <input
                id="new-cat-sort-color"
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                style={{
                  width: 38,
                  height: 38,
                  padding: 2,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              />
              <span className="cal-id-code">{newColor}</span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            Dodaj kategorię
          </button>
        </form>
      </div>

      {loading ? (
        <div className="empty-state">Ładowanie konfiguracji sortowania…</div>
      ) : (
        <div className="table-wrap">
          <table className="cal-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Pozycja</th>
                <th style={{ width: 110 }}>SortOrder</th>
                <th>Kategoria</th>
                <th style={{ width: 180 }}>Kolor wykresu</th>
                <th style={{ textAlign: 'right' }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const isEditing = editingId === item.calendarCategoryId
                const posHint =
                  idx === 0
                    ? 'dół słupka'
                    : idx === items.length - 1
                      ? 'góra słupka'
                      : `#${idx + 1}`

                return (
                  <tr key={item.calendarCategoryId}>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0 0.45rem', height: 26 }}
                          disabled={busy || idx === 0}
                          onClick={() => void handleMove(idx, -1)}
                          title="Przesuń niżej w słupku (mniejszy SortOrder)"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0 0.45rem', height: 26 }}
                          disabled={busy || idx === items.length - 1}
                          onClick={() => void handleMove(idx, 1)}
                          title="Przesuń wyżej w słupku (większy SortOrder)"
                        >
                          ↓
                        </button>
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                          {posHint}
                        </span>
                      </div>
                    </td>

                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {isEditing ? (
                        <input
                          type="number"
                          className="input mono"
                          style={{ height: 32, width: 88 }}
                          value={editSortOrder}
                          onChange={(e) => setEditSortOrder(e.target.value)}
                        />
                      ) : (
                        item.sortOrder
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="input"
                          style={{ height: 32, maxWidth: 260 }}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        <span style={{ fontWeight: 600 }}>{item.category}</span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="color"
                          aria-label={`Kolor kategorii ${item.category}`}
                          value={isEditing ? editColor : item.color}
                          disabled={busy && !isEditing}
                          onChange={(e) => {
                            if (isEditing) {
                              setEditColor(e.target.value)
                            } else {
                              void handleQuickColorChange(item, e.target.value)
                            }
                          }}
                          style={{
                            width: 28,
                            height: 28,
                            padding: 1,
                            border: '1px solid var(--border-strong)',
                            borderRadius: 5,
                            background: '#fff',
                            cursor: 'pointer',
                          }}
                        />
                        <code className="cal-id-code">
                          {isEditing ? editColor : item.color}
                        </code>
                      </div>
                    </td>

                    <td>
                      <div className="row-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy}
                              onClick={() => void handleSaveEdit(item)}
                            >
                              Zapisz
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setEditingId(null)}
                            >
                              Anuluj
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy}
                              onClick={() => startEdit(item)}
                            >
                              Edytuj
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ color: 'var(--danger)' }}
                              disabled={busy}
                              onClick={() => void handleDelete(item.calendarCategoryId)}
                            >
                              Usuń
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
