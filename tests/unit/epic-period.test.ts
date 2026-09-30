import { describe, expect, it } from 'vitest'
import { epicPeriod, epicVisibleInRange } from '../../app/domain/models/epic-period'
import { createDefaultWorkspace, createEpic, createStage } from '../../app/domain/models/factories'
import { validateReferences } from '../../app/infrastructure/files/workspace-transfer'

describe('epic periods and quarter visibility', () => {
  const data = createDefaultWorkspace(new Date(2026, 6, 22))
  const epic = createEpic(data.workspace.id, 'Эпик')
  const previousStage = createStage({
    workspaceId: data.workspace.id, epicId: epic.id, title: 'Предыдущий квартал', kind: 'task',
    activityTypeId: data.activityTypes[0]!.id, startDate: '2026-04-01', endDate: '2026-04-03', calendar: data.calendar,
  })
  const currentStage = createStage({
    workspaceId: data.workspace.id, epicId: epic.id, title: 'Текущий квартал', kind: 'task',
    activityTypeId: data.activityTypes[0]!.id, startDate: '2026-07-01', endDate: '2026-07-03', calendar: data.calendar,
  })
  const currentQuarter = { startDate: '2026-07-01' as const, endDate: '2026-09-30' as const }

  it('derives an undated epic from its stages and omits a completed epic with only older stages', () => {
    epic.status = 'done'
    expect(epicPeriod(epic, [previousStage, currentStage])).toEqual({ startDate: '2026-04-01', endDate: '2026-07-03' })
    expect(epicVisibleInRange(epic, [], currentQuarter)).toBe(false)
    expect(epicVisibleInRange(epic, [currentStage], currentQuarter)).toBe(true)
  })

  it('expands explicit dates to include stages and restores automatic dates when cleared', () => {
    epic.startDate = '2026-08-01'
    epic.endDate = '2026-08-31'
    expect(epicPeriod(epic, [])).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' })
    expect(epicPeriod(epic, [previousStage])).toEqual({ startDate: '2026-04-01', endDate: '2026-08-31' })
    expect(epicVisibleInRange(epic, [], currentQuarter)).toBe(true)
    epic.startDate = undefined
    epic.endDate = undefined
    expect(epicPeriod(epic, [previousStage])).toEqual({ startDate: '2026-04-01', endDate: '2026-04-03' })
  })

  it('extends the right edge for later internal stages without replacing the manual dates', () => {
    const shortEpic = createEpic(data.workspace.id, 'Короткий эпик')
    shortEpic.startDate = '2026-07-01'
    shortEpic.endDate = '2026-07-03'
    const initialStage = createStage({
      workspaceId: data.workspace.id, epicId: shortEpic.id, title: 'Первый этап', kind: 'task',
      activityTypeId: data.activityTypes[0]!.id, startDate: '2026-07-01', endDate: '2026-07-03', calendar: data.calendar,
    })
    const laterStage = createStage({
      workspaceId: data.workspace.id, epicId: shortEpic.id, title: 'Следующий этап', kind: 'task',
      activityTypeId: data.activityTypes[0]!.id, startDate: '2026-07-06', endDate: '2026-07-10', calendar: data.calendar,
    })
    expect(epicPeriod(shortEpic, [initialStage, laterStage])).toEqual({ startDate: '2026-07-01', endDate: '2026-07-10' })
    expect(epicPeriod(shortEpic, [initialStage])).toEqual({ startDate: '2026-07-01', endDate: '2026-07-03' })
    expect(shortEpic.endDate).toBe('2026-07-03')
  })

  it('requires both explicit boundaries in transferred data', () => {
    data.epics.push(epic)
    epic.startDate = '2026-08-01'
    expect(() => validateReferences(data)).toThrow('укажите обе даты')
    epic.endDate = '2026-08-31'
    expect(() => validateReferences(data)).not.toThrow()
  })
})
