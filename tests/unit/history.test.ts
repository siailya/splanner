import { describe, expect, it } from 'vitest'
import { CommandHistory } from '../../app/domain/commands/history'

describe('command history', () => {
  it('undoes a cascade snapshot atomically and supports redo', () => {
    const history = new CommandHistory<{ dates: Record<string, string> }>(100)
    const before = { dates: { a: '2026-07-20', b: '2026-07-21', c: '2026-07-22' } }
    const after = { dates: { a: '2026-07-23', b: '2026-07-24', c: '2026-07-27' } }
    history.push('Каскадный перенос', before, after)
    expect(history.undo(after)).toEqual(before)
    expect(history.redo(before)).toEqual(after)
  })

  it('keeps the configured history limit', () => {
    const history = new CommandHistory<number>(50)
    for (let value = 0; value < 70; value += 1) history.push(String(value), value, value + 1)
    let state = 70
    let undos = 0
    while (history.canUndo) { state = history.undo(state); undos += 1 }
    expect(undos).toBe(50)
  })
})
