import { cloneJson } from '../../utils/clone'

export interface HistoryEntry<T> {
  id: string
  label: string
  before: T
  after: T
  createdAt: string
}

export class CommandHistory<T> {
  private undoStack: HistoryEntry<T>[] = []
  private redoStack: HistoryEntry<T>[] = []

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label
  }

  push(label: string, before: T, after: T): void {
    this.undoStack.push({
      id: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36),
      label,
      before: cloneJson(before),
      after: cloneJson(after),
      createdAt: new Date().toISOString(),
    })
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  undo(current: T): T {
    const entry = this.undoStack.pop()
    if (!entry) return current
    this.redoStack.push(entry)
    return cloneJson(entry.before)
  }

  redo(current: T): T {
    const entry = this.redoStack.pop()
    if (!entry) return current
    this.undoStack.push(entry)
    return cloneJson(entry.after)
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
