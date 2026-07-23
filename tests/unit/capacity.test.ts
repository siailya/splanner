import { describe, expect, it } from 'vitest'
import { calculateCapacity } from '../../app/domain/capacity/engine'
import { createEpic, createPerson, createRole, createStage } from '../../app/domain/models/factories'
import type { Assignment, WorkingCalendar } from '../../app/domain/models/types'

const calendar: WorkingCalendar = { id: 'c', workspaceId: 'w', workingWeekdays: [1, 2, 3, 4, 5], holidays: [], extraWorkingDays: [], revision: 0 }

function fixture() {
  const role = { ...createRole('w', 'Backend'), id: 'backend' }
  const person = { ...createPerson({ workspaceId: 'w', name: 'Ирина', primaryRoleId: role.id, baseCapacityFte: 0.8 }), id: 'irina' }
  const epic = { ...createEpic('w', 'Аукцион'), id: 'epic' }
  const stage = { ...createStage({ workspaceId: 'w', epicId: epic.id, title: 'Разработка', kind: 'task', activityTypeId: 'development', startDate: '2026-07-20', endDate: '2026-07-24', calendar }), id: 'stage' }
  return { role, person, epic, stage }
}

describe('capacity engine', () => {
  it('calculates person and primary-role daily load', () => {
    const { role, person, epic, stage } = fixture()
    const assignments: Assignment[] = [{ id: 'a', workspaceId: 'w', stageId: stage.id, targetType: 'person', targetId: person.id, units: 1, allocationFte: 0.6 }]
    const result = calculateCapacity({ startDate: '2026-07-20', endDate: '2026-07-26', mode: 'day', calendar, roles: [role], people: [person], epics: [epic], stages: [stage], assignments })
    expect(result.rows.find(row => row.id === 'person:irina')!.cells[0]).toMatchObject({ usedFte: 0.6, availableFte: 0.8, freeFte: 0.2, state: 'normal' })
    expect(result.rows.find(row => row.id === 'role:backend')!.cells[0]!.usedFte).toBe(0.6)
    expect(result.rows.find(row => row.id === 'person:irina')!.cells[5]).toMatchObject({ usedFte: 0, availableFte: 0, state: 'unavailable' })
  })

  it('adds role demand, detects overload and aggregates person-days by week', () => {
    const { role, person, epic, stage } = fixture()
    const assignments: Assignment[] = [
      { id: 'person', workspaceId: 'w', stageId: stage.id, targetType: 'person', targetId: person.id, units: 1, allocationFte: 0.8 },
      { id: 'role', workspaceId: 'w', stageId: stage.id, targetType: 'role', targetId: role.id, units: 1, allocationFte: 0.5 },
    ]
    const result = calculateCapacity({ startDate: '2026-07-20', endDate: '2026-07-26', mode: 'week', calendar, roles: [role], people: [person], epics: [epic], stages: [stage], assignments })
    const roleCell = result.rows.find(row => row.id === 'role:backend')!.cells[0]!
    expect(roleCell).toMatchObject({ usedFte: 1.3, availableFte: 0.8, assignedPersonDays: 6.5, availablePersonDays: 4, state: 'overloaded' })
    expect(result.overloadedStageIds).toEqual(['stage'])
  })

  it('ignores milestone assignments defensively', () => {
    const { role, person, epic, stage } = fixture()
    stage.kind = 'milestone'; stage.endDate = stage.startDate; stage.durationWorkdays = 0
    const result = calculateCapacity({ startDate: stage.startDate, endDate: stage.endDate, mode: 'day', calendar, roles: [role], people: [person], epics: [epic], stages: [stage], assignments: [{ id: 'bad', workspaceId: 'w', stageId: stage.id, targetType: 'person', targetId: person.id, units: 1, allocationFte: 1 }] })
    expect(result.rows.find(row => row.id === 'person:irina')!.cells[0]!.usedFte).toBe(0)
  })
})
