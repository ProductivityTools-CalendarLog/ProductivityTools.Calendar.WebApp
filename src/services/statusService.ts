export type StatusEntryType = 'pending' | 'success' | 'error' | 'warn' | 'info'

export interface StatusEntry {
  id: number
  message: string
  type: StatusEntryType
  timestamp: Date
  durationMs?: number
}

interface ActiveOp extends StatusEntry {
  startTime: number
}

export interface StatusState {
  current: StatusEntry | null
  history: StatusEntry[]
  pendingCount: number
}

type StatusListener = (state: StatusState) => void

class StatusService {
  private listeners = new Set<StatusListener>()
  private history: StatusEntry[] = []
  private activeOps = new Map<number, ActiveOp>()
  private counter = 0
  private current: StatusEntry | null = null

  private notify(): void {
    const state = this.getState()
    this.listeners.forEach((listener) => {
      listener(state)
    })
  }

  getState(): StatusState {
    return {
      current: this.current,
      history: [...this.history],
      pendingCount: this.activeOps.size,
    }
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(message: string): number {
    const id = ++this.counter
    const startTime = performance.now()
    const entry: ActiveOp = {
      id,
      message,
      type: 'pending',
      timestamp: new Date(),
      startTime,
    }
    this.activeOps.set(id, entry)
    const publicEntry: StatusEntry = {
      id,
      message,
      type: 'pending',
      timestamp: entry.timestamp,
    }
    this.current = publicEntry
    this.history.unshift(publicEntry)
    if (this.history.length > 50) {
      this.history.pop()
    }
    this.notify()
    return id
  }

  success(idOrMessage: number | string, maybeMessage?: string): StatusEntry {
    return this.finishOp('success', 'Completed', idOrMessage, maybeMessage)
  }

  error(idOrMessage: number | string, maybeMessage?: string): StatusEntry {
    return this.finishOp('error', 'Operation failed', idOrMessage, maybeMessage)
  }

  info(message: string): number {
    return this.report(message, 'info')
  }

  warn(message: string): number {
    return this.report(message, 'warn')
  }

  private finishOp(
    type: 'success' | 'error',
    fallbackMsg: string,
    idOrMessage: number | string,
    maybeMessage?: string,
  ): StatusEntry {
    let id: number | null = null
    let message = fallbackMsg

    if (maybeMessage !== undefined && typeof idOrMessage === 'number') {
      id = idOrMessage
      message = maybeMessage || fallbackMsg
    } else if (typeof idOrMessage === 'number') {
      id = idOrMessage
    } else {
      message = idOrMessage
    }

    const now = performance.now()
    let durationMs: number | undefined
    if (id !== null && this.activeOps.has(id)) {
      const op = this.activeOps.get(id)!
      durationMs = Math.round(now - op.startTime)
      this.activeOps.delete(id)
    }

    const entryId = id ?? ++this.counter
    const completedEntry: StatusEntry = {
      id: entryId,
      message,
      type,
      timestamp: new Date(),
      durationMs,
    }

    if (id !== null) {
      const idx = this.history.findIndex((item) => item.id === id)
      if (idx !== -1) {
        this.history[idx] = completedEntry
      } else {
        this.history.unshift(completedEntry)
      }
    } else {
      this.history.unshift(completedEntry)
      if (this.history.length > 50) {
        this.history.pop()
      }
    }

    this.current = completedEntry
    this.notify()
    return completedEntry
  }

  private report(message: string, type: StatusEntryType): number {
    const id = ++this.counter
    const entry: StatusEntry = {
      id,
      message,
      type,
      timestamp: new Date(),
    }
    this.current = entry
    this.history.unshift(entry)
    if (this.history.length > 50) {
      this.history.pop()
    }
    this.notify()
    return id
  }

  clearHistory(): void {
    this.history = []
    this.notify()
  }
}

export const statusService = new StatusService()
