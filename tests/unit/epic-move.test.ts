import { describe, expect, it } from 'vitest'
import { createDefaultWorkspace, createEpic, createStage } from '../../app/domain/models/factories'
import { epicPeriod } from '../../app/domain/models/epic-period'
import { moveEpicSchedule } from '../../app/domain/scheduling/epic-move'
import type { ISODate, Stage } from '../../app/domain/models/types'

function fixture() {
  const data = createDefaultWorkspace(new Date(2026, 8, 30))
  const epic = createEpic(data.workspace.id, 'Эпик')
  const stage = (title: string, startDate: ISODate, endDate: ISODate, kind: Stage['kind'] = 'task') => createStage({
    workspaceId: data.workspace.id, epicId: epic.id, title, kind, startDate, endDate,
    activityTypeId: kind === 'milestone' ? 'activity-release' : 'activity-development', calendar: data.calendar,
  })
  return { data, epic, stage }
}

describe('epic drag schedule', () => {
  it('translates manual bounds, all children and milestones by the same calendar delta', () => {
    const { data, epic, stage } = fixture()
    epic.startDate = '2026-11-02'
    epic.endDate = '2026-11-20'
    const first = stage('Разработка', '2026-11-06', '2026-11-10')
    const second = stage('Скрытый этап', '2026-11-11', '2026-11-13')
    const milestone = stage('Релиз', '2026-11-14', '2026-11-14', 'milestone')
    const other = { ...stage('Другой эпик', '2026-11-09', '2026-11-10'), epicId: 'other-epic' }
    const stages = [first, second, milestone, other]
    const before = structuredClone({ epic, stages })
    const moved = moveEpicSchedule(epic, stages, 3, data.calendar)
    expect(moved.epic).toMatchObject({ startDate: '2026-11-05', endDate: '2026-11-23' })
    expect(moved.stages[0]).toMatchObject({ startDate: '2026-11-09', endDate: '2026-11-13', durationWorkdays: 5 })
    expect(moved.stages[1]).toMatchObject({ startDate: '2026-11-14', endDate: '2026-11-16', durationWorkdays: 1 })
    expect(moved.stages[2]).toMatchObject({ startDate: '2026-11-17', endDate: '2026-11-17', durationWorkdays: 0 })
    expect(moved.stages[3]).toBe(other)
    expect({ epic, stages }).toEqual(before)
    expect(epicPeriod(moved.epic, moved.stages)).toEqual({ startDate: '2026-11-05', endDate: '2026-11-23' })
  })

  it('keeps automatic epics automatic and updates every stage quarter across the year boundary', () => {
    const { data, epic, stage } = fixture()
    const children = [stage('Первый', '2026-12-28', '2026-12-30'), stage('Веха', '2026-12-31', '2026-12-31', 'milestone')]
    const moved = moveEpicSchedule(epic, children, 4, data.calendar)
    expect(moved.epic).not.toHaveProperty('startDate')
    expect(moved.epic).not.toHaveProperty('endDate')
    expect(moved.stages[0]).toMatchObject({ startDate: '2027-01-01', endDate: '2027-01-03', durationWorkdays: 1, quarterIds: ['2027-Q1'] })
    expect(moved.stages[1]).toMatchObject({ startDate: '2027-01-04', endDate: '2027-01-04', durationWorkdays: 0, quarterIds: ['2027-Q1'] })
    expect(epicPeriod(moved.epic, moved.stages)).toEqual({ startDate: '2027-01-01', endDate: '2027-01-04' })
  })

  it('rejects the entire move when any child is locked, including a hidden child', () => {
    const { data, epic, stage } = fixture()
    epic.startDate = '2026-11-09'
    epic.endDate = '2026-11-13'
    const stages = [stage('Первый', '2026-11-09', '2026-11-10'), { ...stage('Скрытый', '2026-11-11', '2026-11-13'), locked: true }]
    const before = structuredClone({ epic, stages })
    expect(() => moveEpicSchedule(epic, stages, 1, data.calendar)).toThrow('«Скрытый» заблокирован')
    expect({ epic, stages }).toEqual(before)
  })

  it('moves an empty epic and supports negative translation', () => {
    const { data, epic } = fixture()
    epic.startDate = '2026-10-01'
    epic.endDate = '2026-10-03'
    const moved = moveEpicSchedule(epic, [], -3, data.calendar)
    expect(moved.epic).toMatchObject({ startDate: '2026-09-28', endDate: '2026-09-30' })
    expect(moved.stages).toEqual([])
  })

  it('recalculates working duration from holidays while preserving geometric offsets', () => {
    const { data, epic, stage } = fixture()
    data.calendar.holidays = ['2026-11-12']
    const first = stage('Этап', '2026-11-09', '2026-11-11')
    const moved = moveEpicSchedule(epic, [first], 1, data.calendar)
    expect(moved.stages[0]).toMatchObject({ startDate: '2026-11-10', endDate: '2026-11-12', durationWorkdays: 2 })
  })

  it('makes a zero delta a no-op and rejects a fractional delta', () => {
    const { data, epic, stage } = fixture()
    const stages = [{ ...stage('Этап', '2026-11-09', '2026-11-10'), locked: true }]
    expect(moveEpicSchedule(epic, stages, 0, data.calendar)).toEqual({ epic, stages })
    expect(() => moveEpicSchedule(epic, stages, 0.5, data.calendar)).toThrow('целым числом')
  })
})
