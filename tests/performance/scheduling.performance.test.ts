import { describe, expect, it } from 'vitest'
import { createStage } from '../../app/domain/models/factories'
import type { Dependency, WorkingCalendar } from '../../app/domain/models/types'
import { moveStages } from '../../app/domain/scheduling/engine'

const calendar: WorkingCalendar = { id: 'cal', workspaceId: 'w', workingWeekdays: [1, 2, 3, 4, 5], holidays: [], extraWorkingDays: [], revision: 0 }

describe('500/1500 scheduling smoke test', () => {
  it('keeps a cascade command inside the agreed 100 ms budget after warm-up', () => {
    const stages = Array.from({ length: 500 }, (_, index) => ({
      ...createStage({ workspaceId: 'w', epicId: 'e', title: `Stage ${index}`, kind: 'task', activityTypeId: 'dev', startDate: '2026-07-20', endDate: '2026-07-20', calendar, sortOrder: index }),
      id: `s-${index}`,
    }))
    const pairs = new Set<string>()
    for (let distance = 1; pairs.size < 1_500; distance += 1) {
      for (let source = 0; source + distance < 500 && pairs.size < 1_500; source += 1) pairs.add(`${source}:${source + distance}`)
    }
    const dependencies: Dependency[] = [...pairs].map((pair, index) => {
      const [source, target] = pair.split(':')
      return { id: `d-${index}`, workspaceId: 'w', epicId: 'e', predecessorStageId: `s-${source}`, successorStageId: `s-${target}`, type: 'finish_to_start', lagWorkdays: 0, createdAt: '2026-01-01T00:00:00.000Z' }
    })
    moveStages({ stageIds: ['s-0'], deltaWorkdays: 1, mode: 'cascade', stages, dependencies, calendar })
    const started = performance.now()
    const result = moveStages({ stageIds: ['s-0'], deltaWorkdays: 1, mode: 'cascade', stages, dependencies, calendar })
    const elapsed = performance.now() - started
    expect(result.ok).toBe(true)
    expect(result.affectedStageIds).toHaveLength(500)
    expect(elapsed).toBeLessThan(100)
  })
})
