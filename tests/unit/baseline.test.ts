import { describe, expect, it } from 'vitest'
import { compareBaseline } from '../../app/domain/baseline/diff'
import { createDefaultWorkspace, createEpic, createStage } from '../../app/domain/models/factories'
import type { Baseline, BaselineStageSnapshot } from '../../app/domain/models/types'

describe('baseline diff', () => {
  it('reports changed, new and removed stages in working days', () => {
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    const epic = createEpic(data.workspace.id, 'Delivery')
    const changed = createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'Changed', kind: 'task', activityTypeId: data.activityTypes[0]!.id, startDate: '2026-07-22', endDate: '2026-07-24', calendar: data.calendar })
    const added = createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'New', kind: 'task', activityTypeId: data.activityTypes[0]!.id, startDate: '2026-07-27', endDate: '2026-07-27', calendar: data.calendar })
    const baseline: Baseline = { id: 'b', workspaceId: data.workspace.id, name: 'Approved', quarterIds: ['2026-Q3'], createdAt: new Date().toISOString() }
    const snapshots: BaselineStageSnapshot[] = [
      { id: 's1', baselineId: 'b', stageId: changed.id, epicId: epic.id, title: changed.title, kind: changed.kind, activityTypeId: changed.activityTypeId, status: changed.status, startDate: '2026-07-20', endDate: '2026-07-22', durationWorkdays: 3 },
      { id: 's2', baselineId: 'b', stageId: 'removed', epicId: epic.id, title: 'Removed', kind: 'milestone', activityTypeId: changed.activityTypeId, status: 'planned', startDate: '2026-07-21', endDate: '2026-07-21', durationWorkdays: 0 },
    ]
    const result = compareBaseline(baseline, snapshots, [changed, added], data.calendar)
    expect(result.variances.find(item => item.stageId === changed.id)).toMatchObject({ state: 'changed', startVariance: 2, finishVariance: 2, durationVariance: 0 })
    expect(result.variances.find(item => item.stageId === added.id)?.state).toBe('new')
    expect(result.removed.map(item => item.snapshot.stageId)).toEqual(['removed'])
  })

  it('does not mutate the current schedule', () => {
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    const baseline: Baseline = { id: 'b', workspaceId: data.workspace.id, name: 'Approved', quarterIds: ['2026-Q3'], createdAt: new Date().toISOString() }
    const before = JSON.stringify(data.stages)
    compareBaseline(baseline, [], data.stages, data.calendar)
    expect(JSON.stringify(data.stages)).toBe(before)
  })
})
