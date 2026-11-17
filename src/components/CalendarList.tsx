import { Fragment, useState } from 'react'
import type { CalendarItem, UpdateCalendarPayload } from '../types/calendar'

interface CalendarListProps {
  items: CalendarItem[]
  loading: boolean
  onRefresh: () => void
  onToggleActive: (id: number, nextActive: boolean) => Promise<void>
  onUpdate: (id: number, payload: UpdateCalendarPayload) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function CalendarList({
  items,
  loading,
  onRefresh,
  onToggleActive,
  onUpdate,
  onDelete,
}: CalendarListProps) {
  const [accountFilter, setAccountFilter] = useState<string>('ALL')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [busyRowId, setBusyRowId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  // Draft state for inline editing
  const [editDraft, setEditDraft] = useState<UpdateCalendarPayload | null>(null)

  const accounts = Array.from(new Set(items.map((i) => i.account))).sort()
  const filteredItems =
    accountFilter === 'ALL' ? items : items.filter((i) => i.account === accountFilter)

  const copyToClipboard = async (rowId: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(rowId)
      window.setTimeout(() => {
        setCopiedId((current) => (current === rowId ? null : current))
      }, 1500)
    } catch {
      // Clipboard API unavailable
    }
  }

  const startEditing = (item: CalendarItem) => {
    setRowError(null)
    setConfirmDeleteId(null)
    setEditingId(item.calendarSyncStateId)
    setEditDraft({
      account: item.account,
      calendarId: item.calendarId,
      calendarName: item.calendarName,
      isActive: item.isActive,
      defaultLookbackDays: item.defaultLookbackDays,
      pendingBackfillFrom: item.pendingBackfillFrom,
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditDraft(null)
    setRowError(null)
  }

  const saveEdit = async (id: number) => {
    if (!editDraft) return
    setRowError(null)
    setBusyRowId(id)
    try {
      await onUpdate(id, {
        ...editDraft,
        account: editDraft.account.trim(),
        calendarId: editDraft.calendarId.trim(),
        calendarName: editDraft.calendarName?.trim() || null,
        pendingBackfillFrom: editDraft.pendingBackfillFrom?.trim() || null,
      })
      setEditingId(null)
      setEditDraft(null)
    } catch (err: unknown) {
      setRowError((err as Error)?.message || 'Nie udało się zapisać zmian.')
    } finally {
      setBusyRowId(null)
    }
  }

  const handleToggle = async (item: CalendarItem) => {
    setRowError(null)
    setBusyRowId(item.calendarSyncStateId)
    try {
      await onToggleActive(item.calendarSyncStateId, !item.isActive)
    } catch (err: unknown) {
      setRowError((err as Error)?.message || 'Nie udało się zmienić statusu kalendarza.')
    } finally {
      setBusyRowId(null)
    }
  }

  const handleConfirmDelete = async (id: number) => {
    setRowError(null)
    setBusyRowId(id)
    try {
      await onDelete(id)
      setConfirmDeleteId(null)
    } catch (err: unknown) {
      setRowError((err as Error)?.message || 'Nie udało się usunąć kalendarza.')
    } finally {
      setBusyRowId(null)
    }
  }

  return (
    <section className="panel" aria-labelledby="calendars-list-heading">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <h2 id="calendars-list-heading" className="panel-title">
            Skonfigurowane kalendarze ({filteredItems.length})
          </h2>

          {accounts.length > 0 && (
            <div className="filter-bar" role="tablist" aria-label="Filtruj po koncie">
              <button
                type="button"
                className={`filter-pill ${accountFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setAccountFilter('ALL')}
              >
                <span>Wszystkie</span>
                <span className="filter-count">{items.length}</span>
              </button>
              {accounts.map((acc) => {
                const count = items.filter((i) => i.account === acc).length
                return (
                  <button
                    key={acc}
                    type="button"
                    className={`filter-pill ${accountFilter === acc ? 'active' : ''}`}
                    onClick={() => setAccountFilter(acc)}
                  >
                    <span>{acc}</span>
                    <span className="filter-count">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          id="refresh-calendars-button"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Odświeżanie…' : 'Odśwież'}
        </button>
      </div>

      {rowError && (
        <div style={{ padding: '0.85rem 1.35rem 0' }}>
          <div className="alert alert-error" role="alert">
            <span>{rowError}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setRowError(null)}>
              Zamknij
            </button>
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="empty-state">Ładowanie listy kalendarzy…</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Brak skonfigurowanych kalendarzy</div>
          <p>Dodaj pierwszy Calendar ID powyżej — Apps Script pobierze tę listę przy najbliższym syncu.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="cal-table">
            <thead>
              <tr>
                <th>Kalendarz / ID</th>
                <th>Konto (Account)</th>
                <th>Okno / Status syncu</th>
                <th>Aktywny</th>
                <th style={{ textAlign: 'right' }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isEditing = editingId === item.calendarSyncStateId && editDraft !== null
                const isBusy = busyRowId === item.calendarSyncStateId

                return (
                  <Fragment key={item.calendarSyncStateId}>
                    <tr className={!item.isActive ? 'cal-row-inactive' : undefined}>
                      <td>
                        <div className="cal-name">
                          {item.calendarName ? (
                            item.calendarName
                          ) : (
                            <span className="cal-name-placeholder">
                              (Nazwa uzupełni się przy pierwszym syncu)
                            </span>
                          )}
                        </div>
                        <div className="cal-id-row">
                          <code className="cal-id-code">{item.calendarId}</code>
                          <button
                            type="button"
                            className="copy-btn"
                            onClick={() => copyToClipboard(item.calendarSyncStateId, item.calendarId)}
                          >
                            {copiedId === item.calendarSyncStateId ? 'Skopiowano' : 'Kopiuj'}
                          </button>
                        </div>
                      </td>

                      <td>
                        <span className="account-badge">{item.account}</span>
                      </td>

                      <td>
                        <div className="sync-meta">
                          {item.lastSyncedDate ? (
                            <span className="badge badge-synced">
                              Ostatni sync: {item.lastSyncedDate}
                            </span>
                          ) : (
                            <span className="badge badge-neutral">Oczekuje na pierwszy sync</span>
                          )}
                          <span className="field-hint">
                            Okno: {item.defaultLookbackDays} dni
                            {item.pendingBackfillFrom
                              ? ` · Backfill od ${item.pendingBackfillFrom}`
                              : ''}
                          </span>
                        </div>
                      </td>

                      <td>
                        <label className="switch">
                          <input
                            id={`toggle-active-${item.calendarSyncStateId}`}
                            type="checkbox"
                            checked={item.isActive}
                            disabled={isBusy}
                            onChange={() => handleToggle(item)}
                          />
                          <span className="switch-track">
                            <span className="switch-thumb" />
                          </span>
                          <span className="switch-label">{item.isActive ? 'Tak' : 'Wstrzymany'}</span>
                        </label>
                      </td>

                      <td>
                        <div className="row-actions">
                          {confirmDeleteId === item.calendarSyncStateId ? (
                            <>
                              <button
                                id={`confirm-delete-${item.calendarSyncStateId}`}
                                type="button"
                                className="btn btn-danger"
                                disabled={isBusy}
                                onClick={() => handleConfirmDelete(item.calendarSyncStateId)}
                              >
                                Potwierdź usunięcie
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
                                id={`edit-calendar-${item.calendarSyncStateId}`}
                                type="button"
                                className="btn btn-ghost"
                                disabled={isBusy}
                                onClick={() =>
                                  isEditing ? cancelEditing() : startEditing(item)
                                }
                              >
                                {isEditing ? 'Zamknij' : 'Edytuj'}
                              </button>
                              <button
                                id={`delete-calendar-${item.calendarSyncStateId}`}
                                type="button"
                                className="btn btn-ghost"
                                disabled={isBusy}
                                onClick={() => {
                                  cancelEditing()
                                  setConfirmDeleteId(item.calendarSyncStateId)
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
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="edit-row-box">
                            <div className="edit-grid">
                              <div className="field">
                                <label className="field-label">Konto (Account)</label>
                                <input
                                  type="email"
                                  className="input mono"
                                  value={editDraft.account}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, account: e.target.value })
                                  }
                                />
                              </div>

                              <div className="field">
                                <label className="field-label">Calendar ID</label>
                                <input
                                  type="text"
                                  className="input mono"
                                  value={editDraft.calendarId}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, calendarId: e.target.value })
                                  }
                                />
                              </div>

                              <div className="field">
                                <label className="field-label">Nazwa pomocnicza</label>
                                <input
                                  type="text"
                                  className="input"
                                  value={editDraft.calendarName ?? ''}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, calendarName: e.target.value })
                                  }
                                />
                              </div>

                              <div className="field">
                                <label className="field-label">Okno (dni)</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={3650}
                                  className="input mono"
                                  value={editDraft.defaultLookbackDays}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      defaultLookbackDays: Number.parseInt(e.target.value, 10) || 14,
                                    })
                                  }
                                />
                              </div>

                              <div className="field">
                                <label className="field-label">Backfill od daty</label>
                                <input
                                  type="date"
                                  className="input mono"
                                  value={editDraft.pendingBackfillFrom ?? ''}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      pendingBackfillFrom: e.target.value || null,
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
                                onClick={cancelEditing}
                              >
                                Anuluj
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={isBusy}
                                onClick={() => saveEdit(item.calendarSyncStateId)}
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
  )
}
