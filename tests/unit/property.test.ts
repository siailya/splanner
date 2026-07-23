import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addWorkingDays, workingDayDelta, workingDaysBetween } from '../../app/domain/calendar/date'
import { calculateCapacity } from '../../app/domain/capacity/engine'
import { createEpic, createPerson, createRole, createStage } from '../../app/domain/models/factories'
import type { Assignment, Dependency, Stage, WorkingCalendar } from '../../app/domain/models/types'
import { detectScheduleConflicts, moveStages } from '../../app/domain/scheduling/engine'
import { topologicalSort } from '../../app/domain/scheduling/graph'

const calendar: WorkingCalendar = { id: 'c', workspaceId: 'w', workingWeekdays: [1, 2, 3, 4, 5], holidays: ['2026-08-03'], extraWorkingDays: ['2026-08-08'], revision: 1 }

function chain(length: number): { stages: Stage[]; dependencies: Dependency[] } {
  const stages: Stage[] = []
  const dependencies: Dependency[] = []
  let start = '2026-07-20' as const
  for (let index = 0; index < length; index += 1) {
    const stage = { ...createStage({ workspaceId: 'w', epicId: 'e', title: `S${index}`, kind: 'task', activityTypeId: 'dev', startDate: start, endDate: addWorkingDays(start, 1, calendar), calendar }), id: `s${index}` }
    stages.push(stage)
    if (index) dependencies.push({ id: `d${index}`, workspaceId: 'w', epicId: 'e', predecessorStageId: `s${index - 1}`, successorStageId: stage.id, type: 'finish_to_start', lagWorkdays: index % 3, createdAt: '2026-01-01T00:00:00.000Z' })
    start = addWorkingDays(stage.endDate, 1 + index % 3, calendar)
  }
  return { stages, dependencies }
}

describe('domain property invariants', () => {
  it('cascade preserves durations, remains a DAG and clears dependency conflicts', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 40 }), fc.integer({ min: -5, max: 12 }), (length, delta) => {
      const fixture = chain(length)
      const result = moveStages({ stageIds: ['s0'], deltaWorkdays: delta, mode: 'cascade', calendar, ...fixture })
      expect(result.ok).toBe(true)
      const changes = new Map(result.patches.map(item => [item.id, item.after!]))
      const next = fixture.stages.map(stage => changes.get(stage.id) ?? stage)
      expect(next.map(stage => stage.durationWorkdays)).toEqual(fixture.stages.map(stage => stage.durationWorkdays))
      expect(detectScheduleConflicts(next, fixture.dependencies, calendar)).toEqual([])
      expect(topologicalSort(next.map(stage => stage.id), fixture.dependencies)).toHaveLength(length)
      const repeated = moveStages({ stageIds: ['s0'], deltaWorkdays: delta, mode: 'cascade', stages: [...fixture.stages].reverse(), dependencies: [...fixture.dependencies].reverse(), calendar })
      expect(result.patches.map(item => [item.id, item.after?.startDate])).toEqual(repeated.patches.map(item => [item.id, item.after?.startDate]))
    }), { numRuns: 80 })
  })

  it('working-day arithmetic round-trips across weekends, holidays and leap ranges', () => {
    fc.assert(fc.property(fc.integer({ min: -120, max: 120 }), (delta) => {
      const target = addWorkingDays('2026-07-20', delta, calendar)
      expect(workingDayDelta('2026-07-20', target, calendar)).toBe(delta)
      expect(workingDaysBetween(target, target, calendar)).toBeGreaterThanOrEqual(0)
    }), { numRuns: 100 })
  })

  it('capacity is deterministic and person-days equal daily allocation sum', () => {
    fc.assert(fc.property(fc.double({ min: 0.1, max: 1.8, noNaN: true }), (allocation) => {
      const role = { ...createRole('w', 'Backend'), id: 'role' }
      const person = { ...createPerson({ workspaceId: 'w', name: 'Dev', primaryRoleId: role.id, baseCapacityFte: 1 }), id: 'person' }
      const epic = { ...createEpic('w', 'Epic'), id: 'epic' }
      const stage = { ...createStage({ workspaceId: 'w', epicId: epic.id, title: 'Stage', kind: 'task', activityTypeId: 'dev', startDate: '2026-07-20', endDate: '2026-07-24', calendar }), id: 'stage' }
      const assignments: Assignment[] = [{ id: 'a', workspaceId: 'w', stageId: stage.id, targetType: 'person', targetId: person.id, units: 1, allocationFte: allocation }]
      const input = { startDate: stage.startDate, endDate: stage.endDate, mode: 'week' as const, calendar, roles: [role], people: [person], epics: [epic], stages: [stage], assignments }
      const first = calculateCapacity(input)
      const second = calculateCapacity({ ...input, assignments: [...assignments].reverse() })
      expect(first).toEqual(second)
      const roundedDaily = Math.round(allocation * 100) / 100
      expect(first.rows.find(row => row.id === 'person:person')!.cells[0]!.assignedPersonDays).toBeCloseTo(Math.round(roundedDaily * 5 * 100) / 100, 8)
    }), { numRuns: 60 })
  })
})
