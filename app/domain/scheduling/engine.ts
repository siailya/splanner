import {
  addWorkingDays,
  compareDates,
  nextWorkingDay,
  workingDayDelta,
  workingDaysBetween,
} from '../calendar/date'
import type { Dependency, EntityPatch, Id, ISODate, Stage, WorkingCalendar } from '../models/types'
import { quarterIdsForRange } from '../quarters/quarters'
import { topologicalSort, transitiveSuccessors } from './graph'

export interface ScheduleConflict {
  dependencyId: Id
  predecessorStageId: Id
  successorStageId: Id
  minimumStart: ISODate
  actualStart: ISODate
  locked: boolean
}

export interface ScheduleResult {
  ok: boolean
  patches: EntityPatch<Stage>[]
  affectedStageIds: Id[]
  conflicts: ScheduleConflict[]
  blockedStageId?: Id
  message?: string
}

function cloneStage(stage: Stage): Stage {
  return { ...stage, quarterIds: [...stage.quarterIds] }
}

function finishConstraint(predecessor: Stage, dependency: Dependency, calendar: WorkingCalendar): ISODate {
  const firstAllowed = nextWorkingDay(predecessor.endDate, calendar)
  return addWorkingDays(firstAllowed, dependency.lagWorkdays, calendar)
}

function incomingDependencies(dependencies: Dependency[]): Map<Id, Dependency[]> {
  const incoming = new Map<Id, Dependency[]>()
  for (const dependency of dependencies) {
    const values = incoming.get(dependency.successorStageId)
    if (values) values.push(dependency)
    else incoming.set(dependency.successorStageId, [dependency])
  }
  return incoming
}

function minimumAllowedStartIndexed(
  stageId: Id,
  stagesById: ReadonlyMap<Id, Stage>,
  incoming: ReadonlyMap<Id, Dependency[]>,
  calendar: WorkingCalendar,
): ISODate | undefined {
  let latest: ISODate | undefined
  for (const dependency of incoming.get(stageId) ?? []) {
    const predecessor = stagesById.get(dependency.predecessorStageId)
    if (!predecessor) continue
    const constraint = finishConstraint(predecessor, dependency, calendar)
    if (!latest || compareDates(constraint, latest) > 0) latest = constraint
  }
  return latest
}

export function minimumAllowedStart(
  stageId: Id,
  stagesById: ReadonlyMap<Id, Stage>,
  dependencies: Dependency[],
  calendar: WorkingCalendar,
): ISODate | undefined {
  return minimumAllowedStartIndexed(stageId, stagesById, incomingDependencies(dependencies), calendar)
}

export function detectScheduleConflicts(stages: Stage[], dependencies: Dependency[], calendar: WorkingCalendar): ScheduleConflict[] {
  const byId = new Map(stages.map(stage => [stage.id, stage]))
  return dependencies.flatMap((dependency) => {
    const predecessor = byId.get(dependency.predecessorStageId)
    const successor = byId.get(dependency.successorStageId)
    if (!predecessor || !successor) return []
    const minimumStart = finishConstraint(predecessor, dependency, calendar)
    if (compareDates(successor.startDate, minimumStart) >= 0) return []
    return [{
      dependencyId: dependency.id,
      predecessorStageId: predecessor.id,
      successorStageId: successor.id,
      minimumStart,
      actualStart: successor.startDate,
      locked: successor.locked,
    }]
  }).sort((left, right) => left.successorStageId.localeCompare(right.successorStageId) || left.dependencyId.localeCompare(right.dependencyId))
}

function shifted(stage: Stage, delta: number, calendar: WorkingCalendar): Stage {
  if (delta === 0) return cloneStage(stage)
  const startDate = addWorkingDays(stage.startDate, delta, calendar)
  const endDate = stage.kind === 'milestone' ? startDate : addWorkingDays(stage.endDate, delta, calendar)
  return updateDerived({ ...stage, startDate, endDate }, calendar)
}

function placedAt(stage: Stage, startDate: ISODate, calendar: WorkingCalendar): Stage {
  const endDate = stage.kind === 'milestone'
    ? startDate
    : addWorkingDays(startDate, Math.max(0, stage.durationWorkdays - 1), calendar)
  return updateDerived({ ...stage, startDate, endDate }, calendar)
}

export function updateDerived(stage: Stage, calendar: WorkingCalendar): Stage {
  const endDate = stage.kind === 'milestone' ? stage.startDate : stage.endDate
  return {
    ...stage,
    endDate,
    durationWorkdays: stage.kind === 'milestone' ? 0 : workingDaysBetween(stage.startDate, endDate, calendar),
    quarterIds: quarterIdsForRange(stage.startDate, endDate),
  }
}

function toPatches(before: Map<Id, Stage>, after: Map<Id, Stage>): EntityPatch<Stage>[] {
  return [...after.keys()].sort().flatMap((id) => {
    const oldStage = before.get(id)!
    const newStage = after.get(id)!
    if (
      oldStage.startDate === newStage.startDate
      && oldStage.endDate === newStage.endDate
      && oldStage.durationWorkdays === newStage.durationWorkdays
      && oldStage.quarterIds.length === newStage.quarterIds.length
      && oldStage.quarterIds.every((quarterId, index) => quarterId === newStage.quarterIds[index])
    ) return []
    return [{ id, before: oldStage, after: newStage }]
  })
}

export function moveStages(input: {
  stageIds: Id[]
  deltaWorkdays: number
  mode: 'cascade' | 'free'
  stages: Stage[]
  dependencies: Dependency[]
  calendar: WorkingCalendar
}): ScheduleResult {
  const selected = new Set(input.stageIds)
  const source = new Map(input.stages.map(stage => [stage.id, cloneStage(stage)]))
  const missing = input.stageIds.find(id => !source.has(id))
  if (missing) return { ok: false, patches: [], affectedStageIds: [], conflicts: [], message: `Этап ${missing} не найден` }
  const selectedLocked = input.stageIds.find(id => source.get(id)!.locked)
  if (selectedLocked) return { ok: false, patches: [], affectedStageIds: [], conflicts: [], blockedStageId: selectedLocked, message: 'Заблокированный этап нельзя переместить' }

  const affected = input.mode === 'cascade'
    ? new Set([...selected, ...transitiveSuccessors(selected, input.dependencies)])
    : selected
  const working = new Map(source)
  const incoming = incomingDependencies(input.dependencies)

  for (const id of [...affected].sort()) {
    const stage = working.get(id)
    if (!stage) continue
    if (stage.locked && !selected.has(id)) continue
    working.set(id, shifted(stage, input.deltaWorkdays, input.calendar))
  }

  if (input.mode === 'cascade') {
    const order = topologicalSort(input.stages.map(stage => stage.id), input.dependencies)
    for (const id of order) {
      if (!affected.has(id)) continue
      const stage = working.get(id)!
      const minimumStart = minimumAllowedStartIndexed(id, working, incoming, input.calendar)
      if (!minimumStart || compareDates(stage.startDate, minimumStart) >= 0) continue
      if (stage.locked) {
        return {
          ok: false,
          patches: [],
          affectedStageIds: [...affected].sort(),
          conflicts: detectScheduleConflicts([...working.values()], input.dependencies, input.calendar),
          blockedStageId: id,
          message: `Каскад упирается в заблокированный этап «${stage.title}»`,
        }
      }
      working.set(id, placedAt(stage, minimumStart, input.calendar))
    }
  }

  const patches = toPatches(source, working)
  return {
    ok: true,
    patches,
    affectedStageIds: patches.map(patch => patch.id),
    conflicts: detectScheduleConflicts([...working.values()], input.dependencies, input.calendar),
  }
}

export function resizeStage(input: {
  stageId: Id
  startDate: ISODate
  endDate: ISODate
  mode: 'cascade' | 'free'
  stages: Stage[]
  dependencies: Dependency[]
  calendar: WorkingCalendar
}): ScheduleResult {
  const stage = input.stages.find(item => item.id === input.stageId)
  if (!stage) return { ok: false, patches: [], affectedStageIds: [], conflicts: [], message: 'Этап не найден' }
  if (stage.locked) return { ok: false, patches: [], affectedStageIds: [], conflicts: [], blockedStageId: stage.id, message: 'Заблокированный этап нельзя изменить' }
  if (stage.kind === 'milestone') return { ok: false, patches: [], affectedStageIds: [], conflicts: [], message: 'Веха не имеет длительности' }
  if (workingDaysBetween(input.startDate, input.endDate, input.calendar) < 1) {
    return { ok: false, patches: [], affectedStageIds: [], conflicts: [], message: 'Длительность не может быть меньше одного рабочего дня' }
  }

  const resized = updateDerived({ ...stage, startDate: input.startDate, endDate: input.endDate }, input.calendar)
  const deltaEnd = workingDayDelta(stage.endDate, resized.endDate, input.calendar)
  const replacedStages = input.stages.map(item => item.id === stage.id ? resized : item)
  if (input.mode === 'free') {
    return {
      ok: true,
      patches: [{ id: stage.id, before: stage, after: resized }],
      affectedStageIds: [stage.id],
      conflicts: detectScheduleConflicts(replacedStages, input.dependencies, input.calendar),
    }
  }
  const successors = [...transitiveSuccessors([stage.id], input.dependencies)]
  const lockedSuccessor = successors.map(id => input.stages.find(item => item.id === id)).find(item => item?.locked)
  if (lockedSuccessor && deltaEnd !== 0) {
    return {
      ok: false,
      patches: [],
      affectedStageIds: successors,
      conflicts: detectScheduleConflicts(replacedStages, input.dependencies, input.calendar),
      blockedStageId: lockedSuccessor.id,
      message: `Каскад упирается в заблокированный этап «${lockedSuccessor.title}»`,
    }
  }
  const cascade = moveStages({
    stageIds: successors.filter(id => !input.stages.find(item => item.id === id)?.locked),
    deltaWorkdays: deltaEnd,
    mode: 'cascade',
    stages: replacedStages,
    dependencies: input.dependencies,
    calendar: input.calendar,
  })
  if (!cascade.ok) return cascade
  const patches = [{ id: stage.id, before: stage, after: resized }, ...cascade.patches.filter(patch => patch.id !== stage.id)]
  return { ...cascade, patches, affectedStageIds: patches.map(patch => patch.id) }
}

export function normalizeSchedule(stages: Stage[], dependencies: Dependency[], calendar: WorkingCalendar): ScheduleResult {
  const source = new Map(stages.map(stage => [stage.id, cloneStage(stage)]))
  const working = new Map(source)
  const incoming = incomingDependencies(dependencies)
  for (const id of topologicalSort(stages.map(stage => stage.id), dependencies)) {
    const stage = working.get(id)!
    const minimumStart = minimumAllowedStartIndexed(id, working, incoming, calendar)
    if (!minimumStart || compareDates(stage.startDate, minimumStart) >= 0) continue
    if (stage.locked) {
      return { ok: false, patches: [], affectedStageIds: [], conflicts: detectScheduleConflicts([...working.values()], dependencies, calendar), blockedStageId: id, message: `Этап «${stage.title}» заблокирован` }
    }
    working.set(id, placedAt(stage, minimumStart, calendar))
  }
  const patches = toPatches(source, working)
  return { ok: true, patches, affectedStageIds: patches.map(patch => patch.id), conflicts: [] }
}

export function compactSchedule(stageIds: Id[], stages: Stage[], dependencies: Dependency[], calendar: WorkingCalendar): ScheduleResult {
  const selected = new Set(stageIds)
  const source = new Map(stages.map(stage => [stage.id, cloneStage(stage)]))
  const working = new Map(source)
  const incoming = incomingDependencies(dependencies)
  for (const id of topologicalSort(stages.map(stage => stage.id), dependencies)) {
    if (!selected.has(id)) continue
    const stage = working.get(id)
    if (!stage) continue
    const minimumStart = minimumAllowedStartIndexed(id, working, incoming, calendar)
    if (!minimumStart || stage.startDate === minimumStart) continue
    if (stage.locked) {
      return { ok: false, patches: [], affectedStageIds: [], conflicts: detectScheduleConflicts([...working.values()], dependencies, calendar), blockedStageId: id, message: `Этап «${stage.title}» заблокирован` }
    }
    working.set(id, placedAt(stage, minimumStart, calendar))
  }
  const patches = toPatches(source, working).filter(patch => selected.has(patch.id))
  return { ok: true, patches, affectedStageIds: patches.map(patch => patch.id), conflicts: detectScheduleConflicts([...working.values()], dependencies, calendar) }
}
