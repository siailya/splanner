import { describe, expect, it } from 'vitest'
import { calculateCapacity } from '../../app/domain/capacity/engine'
import { createEpic, createPerson, createRole, createStage } from '../../app/domain/models/factories'
import type { Assignment, WorkingCalendar } from '../../app/domain/models/types'

const calendar: WorkingCalendar = { id: 'c', workspaceId: 'w', workingWeekdays: [1, 2, 3, 4, 5], holidays: [], extraWorkingDays: [], revision: 0 }

describe('capacity performance', () => {
  it('recomputes 500 assigned stages across two quarters under 150 ms', () => {
    const role = { ...createRole('w', 'Backend'), id: 'role' }
    const people = Array.from({ length: 50 }, (_, index) => ({ ...createPerson({ workspaceId: 'w', name: `Person ${index}`, primaryRoleId: role.id, baseCapacityFte: 1 }), id: `p-${index}` }))
    const epic = { ...createEpic('w', 'Plan'), id: 'epic' }
    const stages = Array.from({ length: 500 }, (_, index) => ({ ...createStage({ workspaceId: 'w', epicId: epic.id, title: `Stage ${index}`, kind: 'task', activityTypeId: 'dev', startDate: '2026-07-01', endDate: '2026-07-31', calendar }), id: `s-${index}` }))
    const assignments: Assignment[] = stages.map((stage, index) => ({ id: `a-${index}`, workspaceId: 'w', stageId: stage.id, targetType: 'person', targetId: people[index % people.length]!.id, units: 1, allocationFte: 0.1 }))
    const input = { startDate: '2026-07-01' as const, endDate: '2026-12-31' as const, mode: 'day' as const, calendar, roles: [role], people, epics: [epic], stages, assignments }
    calculateCapacity(input)
    const started = performance.now(); calculateCapacity(input); const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(150)
  })
})
