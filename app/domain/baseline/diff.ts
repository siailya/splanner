import { workingDayDelta } from '../calendar/date'
import type { Baseline, BaselineStageSnapshot, Id, Stage, WorkingCalendar } from '../models/types'

export interface BaselineVariance {
  stageId: Id
  state: 'unchanged' | 'changed' | 'new'
  startVariance: number
  finishVariance: number
  durationVariance: number
}

export interface RemovedBaselineStage {
  snapshot: BaselineStageSnapshot
  state: 'removed'
}

export function compareBaseline(
  baseline: Baseline,
  snapshots: BaselineStageSnapshot[],
  stages: Stage[],
  calendar: WorkingCalendar,
): { variances: BaselineVariance[]; removed: RemovedBaselineStage[] } {
  const selectedSnapshots = snapshots.filter(item => item.baselineId === baseline.id)
  const snapshotByStage = new Map(selectedSnapshots.map(item => [item.stageId, item]))
  const currentById = new Map(stages.map(stage => [stage.id, stage]))
  const scopedStages = stages.filter(stage =>
    (baseline.epicIds?.length ? baseline.epicIds.includes(stage.epicId) : true)
    && stage.quarterIds.some(id => baseline.quarterIds.includes(id)),
  )

  const variances = scopedStages.map((stage): BaselineVariance => {
    const snapshot = snapshotByStage.get(stage.id)
    if (!snapshot) {
      return { stageId: stage.id, state: 'new', startVariance: 0, finishVariance: 0, durationVariance: 0 }
    }
    const startVariance = workingDayDelta(snapshot.startDate, stage.startDate, calendar)
    const finishVariance = workingDayDelta(snapshot.endDate, stage.endDate, calendar)
    const durationVariance = stage.durationWorkdays - snapshot.durationWorkdays
    return {
      stageId: stage.id,
      state: startVariance || finishVariance || durationVariance ? 'changed' : 'unchanged',
      startVariance,
      finishVariance,
      durationVariance,
    }
  })

  const removed = selectedSnapshots
    .filter(snapshot => !currentById.has(snapshot.stageId))
    .map(snapshot => ({ snapshot, state: 'removed' as const }))

  return { variances, removed }
}
