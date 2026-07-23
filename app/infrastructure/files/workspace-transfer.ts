import type { Id, PlannerData, QuarterId } from '../../domain/models/types'
import { compareDates, workingDaysBetween } from '../../domain/calendar/date'
import { quarterIdsForRange } from '../../domain/quarters/quarters'
import { topologicalSort } from '../../domain/scheduling/graph'
import { plannerDataSchema, workspaceExportSchema } from '../../domain/validation/export-schema'
import type { PlannerRepository } from '../repositories/planner-repository'
import { cloneJson } from '../../utils/clone'

export interface WorkspaceExport {
  format: 'delivery-planner-workspace'
  application: 'delivery-planner'
  schemaVersion: 3
  appVersion: string
  exportedAt: string
  workspace: PlannerData
}

export interface WorkspaceExportOptions {
  quarterIds?: QuarterId[]
  epicIds?: Id[]
  includeBaselineId?: Id
}

export interface ImportPreview {
  schemaVersion: number
  migratedFrom?: number
  counts: Record<'epics' | 'stages' | 'dependencies' | 'roles' | 'people' | 'assignments' | 'workItems' | 'baselines', number>
  workspaceName: string
  exportedAt: string
}

function exportSlice(data: PlannerData, options?: WorkspaceExportOptions): PlannerData {
  if (!options?.quarterIds?.length && !options?.epicIds?.length) return cloneJson(data)
  const quarterIds = new Set(options.quarterIds ?? data.quarters.map(item => item.id))
  const requestedEpics = options.epicIds ? new Set(options.epicIds) : undefined
  const stages = data.stages.filter(stage =>
    (!requestedEpics || requestedEpics.has(stage.epicId))
    && stage.quarterIds.some(id => quarterIds.has(id)),
  )
  const stageIds = new Set(stages.map(stage => stage.id))
  const epicIds = new Set(stages.map(stage => stage.epicId))
  const assignments = data.assignments.filter(item => stageIds.has(item.stageId))
  const workItems = data.workItems.filter(item => epicIds.has(item.epicId) && (!item.stageId || stageIds.has(item.stageId)))
  const personIds = new Set([
    ...assignments.filter(item => item.targetType === 'person').map(item => item.targetId),
    ...workItems.flatMap(item => item.personId ? [item.personId] : []),
  ])
  const roleIds = new Set(assignments.filter(item => item.targetType === 'role').map(item => item.targetId))
  for (const person of data.people.filter(item => personIds.has(item.id))) {
    roleIds.add(person.primaryRoleId)
    person.roleIds.forEach(id => roleIds.add(id))
  }
  const baselines = options.includeBaselineId
    ? data.baselines.filter(item => item.id === options.includeBaselineId).map(item => ({
        ...item,
        epicIds: item.epicIds?.filter(id => epicIds.has(id)),
      }))
    : []
  const baselineIds = new Set(baselines.map(item => item.id))
  return {
    ...cloneJson(data),
    quarters: data.quarters.filter(item => quarterIds.has(item.id)),
    epics: data.epics.filter(item => epicIds.has(item.id)),
    stages,
    dependencies: data.dependencies.filter(item => stageIds.has(item.predecessorStageId) && stageIds.has(item.successorStageId)),
    activityTypes: data.activityTypes.filter(item => stages.some(stage => stage.activityTypeId === item.id)),
    roles: data.roles.filter(item => roleIds.has(item.id)),
    people: data.people.filter(item => personIds.has(item.id)),
    assignments,
    workItems,
    baselines,
    baselineStages: data.baselineStages.filter(item =>
      baselineIds.has(item.baselineId)
      && epicIds.has(item.epicId)
      && quarterIdsForRange(item.startDate, item.endDate).some(id => quarterIds.has(id)),
    ),
  }
}

export function createWorkspaceExport(data: PlannerData, options?: WorkspaceExportOptions): WorkspaceExport {
  return {
    format: 'delivery-planner-workspace',
    application: 'delivery-planner',
    schemaVersion: 3,
    appVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    workspace: exportSlice(data, options),
  }
}

export function serializeWorkspace(data: PlannerData, options?: WorkspaceExportOptions): string {
  return JSON.stringify(createWorkspaceExport(data, options), null, 2)
}

export function parseWorkspaceExport(text: string): WorkspaceExport {
  if (new Blob([text]).size > 20 * 1024 * 1024) throw new Error('Файл превышает лимит 20 МБ')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Файл не является корректным JSON')
  }
  const parsed = workspaceExportSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map(issue => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Файл не прошёл проверку:\n${issues.join('\n')}`)
  }
  const migratedFrom = parsed.data.schemaVersion
  const data = {
    ...parsed.data.workspace,
    workspace: { ...parsed.data.workspace.workspace, schemaVersion: 3 },
    roles: parsed.data.workspace.roles ?? [],
    people: parsed.data.workspace.people ?? [],
    assignments: parsed.data.workspace.assignments ?? [],
    workItems: parsed.data.workspace.workItems ?? [],
    baselines: parsed.data.workspace.baselines ?? [],
    baselineStages: parsed.data.workspace.baselineStages ?? [],
  } as PlannerData
  validateReferences(data)
  return {
    ...parsed.data,
    schemaVersion: 3,
    appVersion: String(parsed.data.appVersion),
    workspace: data,
    ...(migratedFrom < 3 ? { migratedFrom } : {}),
  } as WorkspaceExport
}

export function previewWorkspaceImport(text: string): ImportPreview {
  const imported = parseWorkspaceExport(text)
  const data = imported.workspace
  return {
    schemaVersion: 3,
    migratedFrom: (imported as WorkspaceExport & { migratedFrom?: number }).migratedFrom,
    workspaceName: data.workspace.name,
    exportedAt: imported.exportedAt,
    counts: {
      epics: data.epics.length,
      stages: data.stages.length,
      dependencies: data.dependencies.length,
      roles: data.roles.length,
      people: data.people.length,
      assignments: data.assignments.length,
      workItems: data.workItems.length,
      baselines: data.baselines.length,
    },
  }
}

export function validateReferences(data: PlannerData): void {
  plannerDataSchema.parse(data)
  const ensureUnique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error(`${label}: обнаружены повторяющиеся ID`)
  }
  ensureUnique('epics', data.epics.map(item => item.id))
  ensureUnique('stages', data.stages.map(item => item.id))
  ensureUnique('dependencies', data.dependencies.map(item => item.id))
  ensureUnique('activityTypes', data.activityTypes.map(item => item.id))
  ensureUnique('roles', data.roles.map(item => item.id))
  ensureUnique('people', data.people.map(item => item.id))
  ensureUnique('assignments', data.assignments.map(item => item.id))
  ensureUnique('workItems', data.workItems.map(item => item.id))
  ensureUnique('baselines', data.baselines.map(item => item.id))
  ensureUnique('baselineStages', data.baselineStages.map(item => item.id))
  const workspaceId = data.workspace.id
  const epicIds = new Set(data.epics.map(epic => epic.id))
  const stageIds = new Set(data.stages.map(stage => stage.id))
  const activityIds = new Set(data.activityTypes.map(type => type.id))
  const roleIds = new Set(data.roles.map(role => role.id))
  const personIds = new Set(data.people.map(person => person.id))
  const allScoped = [data.calendar, ...data.quarters, ...data.epics, ...data.stages, ...data.dependencies, ...data.activityTypes, ...data.roles, ...data.people, ...data.assignments, ...data.workItems]
  if (allScoped.some(entity => entity.workspaceId !== workspaceId)) throw new Error('Найдены записи другого workspace')
  for (const stage of data.stages) {
    if (!epicIds.has(stage.epicId)) throw new Error(`Этап ${stage.id} ссылается на отсутствующий эпик`)
    if (!activityIds.has(stage.activityTypeId)) throw new Error(`Этап ${stage.id} ссылается на отсутствующий activity type`)
    if (compareDates(stage.startDate, stage.endDate) > 0) throw new Error(`Этап ${stage.id}: дата начала позже даты окончания`)
    if (stage.kind === 'milestone' && (stage.startDate !== stage.endDate || stage.durationWorkdays !== 0)) {
      throw new Error(`Веха ${stage.id} имеет некорректную длительность`)
    }
    if (stage.kind !== 'milestone' && workingDaysBetween(stage.startDate, stage.endDate, data.calendar) !== stage.durationWorkdays) {
      throw new Error(`Этап ${stage.id}: working duration не соответствует календарю`)
    }
    const expectedQuarters = quarterIdsForRange(stage.startDate, stage.endDate)
    if (expectedQuarters.some(id => !stage.quarterIds.includes(id)) || stage.quarterIds.some(id => !expectedQuarters.includes(id))) {
      throw new Error(`Этап ${stage.id}: quarterIds не соответствуют датам`)
    }
  }
  for (const person of data.people) {
    if (!roleIds.has(person.primaryRoleId) || person.roleIds.some(id => !roleIds.has(id))) throw new Error(`Сотрудник ${person.id} ссылается на отсутствующую роль`)
  }
  for (const assignment of data.assignments) {
    const stage = data.stages.find(item => item.id === assignment.stageId)
    if (!stage) throw new Error(`Назначение ${assignment.id} ссылается на отсутствующий этап`)
    if (stage.kind === 'milestone') throw new Error(`Веха ${stage.id} не может иметь назначения`)
    if (assignment.targetType === 'person' ? !personIds.has(assignment.targetId) : !roleIds.has(assignment.targetId)) {
      throw new Error(`Назначение ${assignment.id} ссылается на отсутствующий ресурс`)
    }
    if (assignment.targetType === 'person') {
      const person = data.people.find(item => item.id === assignment.targetId)!
      if (assignment.units !== 1) throw new Error(`Person assignment ${assignment.id} должен иметь units = 1`)
      if (assignment.allocationFte > person.baseCapacityFte) throw new Error(`Назначение ${assignment.id} превышает capacity сотрудника`)
    }
  }
  for (const item of data.workItems) {
    if (!epicIds.has(item.epicId)) throw new Error(`Задача ${item.id} ссылается на отсутствующий эпик`)
    if (item.stageId && !stageIds.has(item.stageId)) throw new Error(`Задача ${item.id} ссылается на отсутствующий этап`)
    if (item.personId && !personIds.has(item.personId)) throw new Error(`Задача ${item.id} ссылается на отсутствующего сотрудника`)
  }
  for (const dependency of data.dependencies) {
    if (!stageIds.has(dependency.predecessorStageId) || !stageIds.has(dependency.successorStageId)) {
      throw new Error(`Зависимость ${dependency.id} ссылается на отсутствующий этап`)
    }
    const predecessor = data.stages.find(stage => stage.id === dependency.predecessorStageId)!
    const successor = data.stages.find(stage => stage.id === dependency.successorStageId)!
    if (predecessor.epicId !== successor.epicId || dependency.epicId !== predecessor.epicId) {
      throw new Error(`Зависимость ${dependency.id} связывает разные эпики`)
    }
  }
  const baselineIds = new Set(data.baselines.map(item => item.id))
  for (const baseline of data.baselines) {
    if (baseline.workspaceId !== workspaceId) throw new Error(`Baseline ${baseline.id} относится к другому workspace`)
    if (baseline.epicIds?.some(id => !epicIds.has(id))) throw new Error(`Baseline ${baseline.id} ссылается на отсутствующий эпик`)
  }
  for (const snapshot of data.baselineStages) {
    if (!baselineIds.has(snapshot.baselineId)) throw new Error(`Baseline snapshot ${snapshot.id} не имеет baseline`)
  }
  topologicalSort(data.stages.map(stage => stage.id), data.dependencies)
}

export async function replaceWorkspaceAtomically(repository: PlannerRepository, current: PlannerData, json: string): Promise<PlannerData> {
  const backup = cloneJson(current)
  const imported = parseWorkspaceExport(json).workspace
  try {
    await repository.replaceAll(imported)
    return imported
  } catch (error) {
    await repository.replaceAll(backup)
    throw error
  }
}

export function downloadWorkspace(data: PlannerData, options?: WorkspaceExportOptions): void {
  const blob = new Blob([serializeWorkspace(data, options)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `delivery-planner-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
