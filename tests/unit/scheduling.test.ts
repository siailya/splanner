import { describe, expect, it } from 'vitest'
import { createStage } from '../../app/domain/models/factories'
import type { Dependency, Stage, WorkingCalendar } from '../../app/domain/models/types'
import { compactSchedule, detectScheduleConflicts, minimumAllowedStart, moveStages, resizeStage } from '../../app/domain/scheduling/engine'
import { topologicalSort, validateNewDependency } from '../../app/domain/scheduling/graph'

const calendar: WorkingCalendar = { id: 'cal', workspaceId: 'w', workingWeekdays: [1, 2, 3, 4, 5], holidays: [], extraWorkingDays: [], revision: 0 }

function stage(id: string, startDate: `${number}-${number}-${number}`, endDate: `${number}-${number}-${number}`, locked = false): Stage {
  return { ...createStage({ workspaceId: 'w', epicId: 'e', title: id, kind: 'task', activityTypeId: 'dev', startDate, endDate, calendar }), id, locked }
}

function dependency(id: string, predecessorStageId: string, successorStageId: string, lagWorkdays = 0): Dependency {
  return { id, workspaceId: 'w', epicId: 'e', predecessorStageId, successorStageId, lagWorkdays, type: 'finish_to_start', createdAt: '2026-01-01T00:00:00.000Z' }
}

function applied(stages: Stage[], patches: ReturnType<typeof moveStages>['patches']): Stage[] {
  const changes = new Map(patches.map(patch => [patch.id, patch.after!]))
  return stages.map(item => changes.get(item.id) ?? item)
}

describe('scheduling engine', () => {
  it('cascades one branch and leaves an independent parallel branch unchanged', () => {
    const stages = [
      stage('a', '2026-07-20', '2026-07-22'), stage('b', '2026-07-23', '2026-07-24'),
      stage('c', '2026-07-20', '2026-07-24'),
    ]
    const result = moveStages({ stageIds: ['a'], deltaWorkdays: 2, mode: 'cascade', stages, dependencies: [dependency('ab', 'a', 'b')], calendar })
    expect(result.ok).toBe(true)
    const next = applied(stages, result.patches)
    expect(next.find(item => item.id === 'a')?.startDate).toBe('2026-07-22')
    expect(next.find(item => item.id === 'b')?.startDate).toBe('2026-07-27')
    expect(next.find(item => item.id === 'c')?.startDate).toBe('2026-07-20')
  })

  it('allows free move and reports the resulting FS conflict', () => {
    const stages = [stage('a', '2026-07-20', '2026-07-22'), stage('b', '2026-07-23', '2026-07-24')]
    const links = [dependency('ab', 'a', 'b')]
    const result = moveStages({ stageIds: ['a'], deltaWorkdays: 2, mode: 'free', stages, dependencies: links, calendar })
    expect(result.ok).toBe(true)
    expect(result.patches).toHaveLength(1)
    expect(result.conflicts).toHaveLength(1)
    expect(detectScheduleConflicts(applied(stages, result.patches), links, calendar)[0]?.minimumStart).toBe('2026-07-27')
  })

  it('uses the latest constraint for multiple predecessors and lag', () => {
    const stages = [
      stage('a', '2026-07-20', '2026-07-22'),
      stage('b', '2026-07-20', '2026-07-24'),
      stage('c', '2026-07-28', '2026-07-29'),
    ]
    const links = [dependency('ac', 'a', 'c', 1), dependency('bc', 'b', 'c', 1)]
    expect(minimumAllowedStart('c', new Map(stages.map(item => [item.id, item])), links, calendar)).toBe('2026-07-28')
    expect(detectScheduleConflicts(stages, links, calendar)).toHaveLength(0)
  })

  it('rejects cycles before commit', () => {
    const stages = [stage('a', '2026-07-20', '2026-07-20'), stage('b', '2026-07-21', '2026-07-21'), stage('c', '2026-07-22', '2026-07-22')]
    const links = [dependency('ab', 'a', 'b'), dependency('bc', 'b', 'c')]
    expect(validateNewDependency(dependency('ca', 'c', 'a'), stages, links)).toEqual({ valid: false, reason: 'Зависимость создаёт цикл' })
    expect(() => topologicalSort(stages.map(item => item.id), [...links, dependency('ca', 'c', 'a')])).toThrow('цикл')
  })

  it('blocks implicit move and resize at a locked successor', () => {
    const stages = [stage('a', '2026-07-20', '2026-07-22'), stage('b', '2026-07-23', '2026-07-24', true)]
    const links = [dependency('ab', 'a', 'b')]
    const moved = moveStages({ stageIds: ['a'], deltaWorkdays: 1, mode: 'cascade', stages, dependencies: links, calendar })
    expect(moved.ok).toBe(false)
    expect(moved.blockedStageId).toBe('b')
    const resized = resizeStage({ stageId: 'a', startDate: '2026-07-20', endDate: '2026-07-23', mode: 'cascade', stages, dependencies: links, calendar })
    expect(resized.ok).toBe(false)
    expect(resized.blockedStageId).toBe('b')
  })

  it('keeps milestone duration at zero', () => {
    const milestone = createStage({ workspaceId: 'w', epicId: 'e', title: 'release', kind: 'milestone', activityTypeId: 'release', startDate: '2026-07-24', calendar })
    expect(milestone.endDate).toBe(milestone.startDate)
    expect(milestone.durationWorkdays).toBe(0)
  })

  it('returns deterministic patches regardless of input record order', () => {
    const stages = [stage('a', '2026-07-20', '2026-07-22'), stage('b', '2026-07-23', '2026-07-24'), stage('c', '2026-07-27', '2026-07-28')]
    const links = [dependency('ab', 'a', 'b'), dependency('bc', 'b', 'c')]
    const first = moveStages({ stageIds: ['a'], deltaWorkdays: 3, mode: 'cascade', stages, dependencies: links, calendar })
    const second = moveStages({ stageIds: ['a'], deltaWorkdays: 3, mode: 'cascade', stages: [...stages].reverse(), dependencies: [...links].reverse(), calendar })
    expect(first.patches.map(patch => [patch.id, patch.after?.startDate])).toEqual(second.patches.map(patch => [patch.id, patch.after?.startDate]))
  })

  it('moves a selected predecessor and successor only once while preserving their interval', () => {
    const stages = [stage('a', '2026-07-20', '2026-07-21'), stage('b', '2026-07-22', '2026-07-23')]
    const result = moveStages({ stageIds: ['a', 'b'], deltaWorkdays: 2, mode: 'cascade', stages, dependencies: [dependency('ab', 'a', 'b')], calendar })
    const next = applied(stages, result.patches)
    expect(next.find(item => item.id === 'a')?.startDate).toBe('2026-07-22')
    expect(next.find(item => item.id === 'b')?.startDate).toBe('2026-07-24')
  })

  it('compacts selected successors to their earliest deterministic dates', () => {
    const stages = [stage('a', '2026-07-20', '2026-07-20'), stage('b', '2026-07-27', '2026-07-27'), stage('c', '2026-08-03', '2026-08-03')]
    const links = [dependency('ab', 'a', 'b'), dependency('bc', 'b', 'c')]
    const result = compactSchedule(['b', 'c'], stages, links, calendar)
    const changes = new Map(result.patches.map(patch => [patch.id, patch.after!]))
    expect(changes.get('b')?.startDate).toBe('2026-07-21')
    expect(changes.get('c')?.startDate).toBe('2026-07-22')
  })
})
