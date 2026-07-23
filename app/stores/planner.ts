import { addWorkingDays, workingDayDelta, workingDaysBetween } from '../domain/calendar/date'
import { CommandHistory } from '../domain/commands/history'
import { createEpic, createPerson, createRole, createStage, newId, nowISO } from '../domain/models/factories'
import type {
  Assignment,
  ActivityType,
  BackupReason,
  BackupSnapshot,
  Baseline,
  BaselineStageSnapshot,
  Dependency,
  Epic,
  Id,
  ISODate,
  Person,
  PlannerData,
  Role,
  Stage,
  StageKind,
  WorkingCalendar,
  WorkItem,
  WorkItemStatus,
  WorkspaceSettings,
} from '../domain/models/types'
import { createQuarter } from '../domain/quarters/quarters'
import { compactSchedule, detectScheduleConflicts, moveStages, normalizeSchedule, resizeStage, updateDerived } from '../domain/scheduling/engine'
import { validateNewDependency } from '../domain/scheduling/graph'
import { downloadWorkspace, parseWorkspaceExport, replaceWorkspaceAtomically, serializeWorkspace, validateReferences, type WorkspaceExportOptions } from '../infrastructure/files/workspace-transfer'
import { PlannerRepository } from '../infrastructure/repositories/planner-repository'
import { cloneJson } from '../utils/clone'

export type SaveStatus = 'saved' | 'saving' | 'error'

export interface CalendarImpact {
  changedDurations: number
  dependencyConflicts: number
}

export const MAX_CAPACITY_FTE = 2

function validateExternalUrl(value?: string): void {
  if (value && !/^https?:\/\//i.test(value)) throw new Error('Ссылка должна начинаться с http:// или https://')
}

export const usePlannerStore = defineStore('planner', () => {
  const data = ref<PlannerData>()
  const initialized = ref(false)
  const loading = ref(false)
  const saveStatus = ref<SaveStatus>('saved')
  const lastError = ref<string>()
  const historyRevision = ref(0)
  const history = markRaw(new CommandHistory<PlannerData>(100))
  const repository = markRaw(new PlannerRepository())
  const backups = ref<BackupSnapshot[]>([])
  const activeBaselineId = ref<Id>()
  const storagePersisted = ref<boolean>()
  const storageUsage = ref(0)
  const storageQuota = ref(0)
  const lastIntegrityCheck = ref<{ status: 'ok' | 'error'; message: string; checkedAt: string }>()
  const recoveryRequired = ref(false)
  const activeBaselineStorageKey = 'delivery-planner:active-baseline:v1'
  if (import.meta.client) activeBaselineId.value = localStorage.getItem(activeBaselineStorageKey) || undefined
  watch(activeBaselineId, (value) => {
    if (!import.meta.client) return
    if (value) localStorage.setItem(activeBaselineStorageKey, value)
    else localStorage.removeItem(activeBaselineStorageKey)
  })

  const canUndo = computed(() => { void historyRevision.value; return history.canUndo })
  const canRedo = computed(() => { void historyRevision.value; return history.canRedo })
  const conflicts = computed(() => data.value
    ? detectScheduleConflicts(data.value.stages, data.value.dependencies, data.value.calendar)
    : [])

  async function refreshStorageInfo(): Promise<void> {
    if (!import.meta.client || !navigator.storage) return
    try {
      storagePersisted.value = await navigator.storage.persisted()
      if (!storagePersisted.value && navigator.storage.persist) storagePersisted.value = await navigator.storage.persist()
      const estimate = await navigator.storage.estimate()
      storageUsage.value = estimate.usage ?? 0
      storageQuota.value = estimate.quota ?? 0
    } catch {
      storagePersisted.value = false
    }
  }

  async function initialize(): Promise<void> {
    if (initialized.value || loading.value) return
    loading.value = true
    try {
      data.value = await repository.initialize()
      try {
        validateReferences(data.value)
        const checkedAt = nowISO()
        lastIntegrityCheck.value = { status: 'ok', message: 'Ссылочная целостность подтверждена', checkedAt }
        await repository.updateIntegrityMetadata(data.value.workspace.id, {
          lastIntegrityCheckAt: checkedAt,
          lastIntegrityStatus: 'ok',
          lastIntegrityMessage: lastIntegrityCheck.value.message,
        })
      } catch (error) {
        const checkedAt = nowISO()
        const message = error instanceof Error ? error.message : 'Ошибка проверки данных'
        lastIntegrityCheck.value = { status: 'error', message, checkedAt }
        await repository.updateIntegrityMetadata(data.value.workspace.id, {
          lastIntegrityCheckAt: checkedAt,
          lastIntegrityStatus: 'error',
          lastIntegrityMessage: message,
        })
        recoveryRequired.value = true
      }
      backups.value = await repository.listBackups()
      if (activeBaselineId.value && !data.value.baselines.some(item => item.id === activeBaselineId.value)) activeBaselineId.value = undefined
      if (await repository.shouldCreateDailyBackup(data.value.workspace.id, data.value.workspace.revision)) {
        await repository.createBackup(data.value, 'daily')
        backups.value = await repository.listBackups()
      }
      initialized.value = true
      saveStatus.value = 'saved'
      // Storage persistence is advisory. Firefox may keep the permission
      // request pending, so it must never block opening the local workspace.
      void refreshStorageInfo()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Не удалось открыть локальное хранилище'
      saveStatus.value = 'error'
      throw error
    } finally {
      loading.value = false
    }
  }

  async function runCommand(label: string, mutate: (draft: PlannerData) => void): Promise<void> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const before = cloneJson(data.value)
    const draft = cloneJson(data.value)
    mutate(draft)
    saveStatus.value = 'saving'
    lastError.value = undefined
    try {
      await repository.save(draft)
      data.value = draft
      history.push(label, before, draft)
      historyRevision.value += 1
      saveStatus.value = 'saved'
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Ошибка сохранения'
      saveStatus.value = 'error'
      throw error
    }
  }

  async function undo(): Promise<void> {
    if (!data.value || !history.canUndo) return
    const previous = history.undo(data.value)
    saveStatus.value = 'saving'
    try {
      await repository.save(previous)
      data.value = previous
      historyRevision.value += 1
      saveStatus.value = 'saved'
    } catch (error) {
      saveStatus.value = 'error'
      lastError.value = error instanceof Error ? error.message : 'Не удалось отменить операцию'
      throw error
    }
  }

  async function redo(): Promise<void> {
    if (!data.value || !history.canRedo) return
    const next = history.redo(data.value)
    saveStatus.value = 'saving'
    try {
      await repository.save(next)
      data.value = next
      historyRevision.value += 1
      saveStatus.value = 'saved'
    } catch (error) {
      saveStatus.value = 'error'
      lastError.value = error instanceof Error ? error.message : 'Не удалось повторить операцию'
      throw error
    }
  }

  async function addEpic(title: string): Promise<Epic> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const epic = createEpic(data.value.workspace.id, title, data.value.epics.length)
    await runCommand('Создать эпик', draft => { draft.epics.push(epic) })
    return epic
  }

  async function updateEpic(id: Id, changes: Partial<Pick<Epic, 'title' | 'code' | 'status' | 'marker' | 'descriptionMarkdown'>>): Promise<void> {
    await runCommand('Изменить эпик', (draft) => {
      const epic = draft.epics.find(item => item.id === id)
      if (!epic) throw new Error('Эпик не найден')
      Object.assign(epic, changes, { updatedAt: nowISO() })
    })
  }

  async function updateWorkspaceSettings(changes: Partial<WorkspaceSettings>): Promise<void> {
    await runCommand('Изменить настройки workspace', (draft) => {
      Object.assign(draft.workspace.settings, changes)
    })
  }

  async function addActivityType(input: { name: string; slug: string; colorToken: string }): Promise<ActivityType> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const name = input.name.trim()
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    if (!name || !slug) throw new Error('Название и slug обязательны')
    if (data.value.activityTypes.some(item => item.slug === slug)) throw new Error('Такой slug уже существует')
    const activityType: ActivityType = {
      id: newId('activity'),
      workspaceId: data.value.workspace.id,
      name,
      slug,
      colorToken: input.colorToken,
      sortOrder: data.value.activityTypes.length,
      isActive: true,
    }
    await runCommand('Создать activity type', draft => { draft.activityTypes.push(activityType) })
    return activityType
  }

  async function updateActivityType(id: Id, changes: Partial<Pick<ActivityType, 'name' | 'colorToken' | 'isActive'>>): Promise<void> {
    await runCommand('Изменить activity type', (draft) => {
      const activity = draft.activityTypes.find(item => item.id === id)
      if (!activity) throw new Error('Activity type не найден')
      Object.assign(activity, changes)
      if (!activity.name.trim()) throw new Error('Название обязательно')
    })
  }

  async function deleteActivityType(id: Id): Promise<void> {
    if (data.value?.stages.some(stage => stage.activityTypeId === id)) throw new Error('Activity type используется этапами; его можно архивировать')
    await runCommand('Удалить activity type', draft => { draft.activityTypes = draft.activityTypes.filter(item => item.id !== id) })
  }

  async function reorderEpics(ids: Id[]): Promise<void> {
    await runCommand('Изменить порядок эпиков', (draft) => {
      ids.forEach((id, index) => {
        const epic = draft.epics.find(item => item.id === id)
        if (epic) epic.sortOrder = index
      })
    })
  }

  async function deleteEpic(id: Id): Promise<void> {
    await createBackup('before_delete')
    await runCommand('Удалить эпик', (draft) => {
      const stageIds = new Set(draft.stages.filter(stage => stage.epicId === id).map(stage => stage.id))
      draft.dependencies = draft.dependencies.filter(dependency => !stageIds.has(dependency.predecessorStageId) && !stageIds.has(dependency.successorStageId))
      draft.stages = draft.stages.filter(stage => stage.epicId !== id)
      draft.assignments = draft.assignments.filter(assignment => !stageIds.has(assignment.stageId))
      draft.workItems = draft.workItems.filter(item => item.epicId !== id)
      draft.epics = draft.epics.filter(epic => epic.id !== id)
    })
  }

  async function addStage(input: {
    epicId: Id
    title: string
    kind: StageKind
    activityTypeId: Id
    startDate: ISODate
    endDate?: ISODate
  }): Promise<Stage> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const epicStages = data.value.stages.filter(stage => stage.epicId === input.epicId)
    const stage = createStage({
      ...input,
      workspaceId: data.value.workspace.id,
      calendar: data.value.calendar,
      sortOrder: epicStages.length,
    })
    await runCommand('Создать этап', (draft) => {
      if (!draft.epics.some(epic => epic.id === input.epicId)) throw new Error('Эпик не найден')
      const previous = draft.stages.filter(item => item.epicId === input.epicId).sort((a, b) => b.sortOrder - a.sortOrder)[0]
      draft.stages.push(stage)
      if (draft.workspace.settings.autoLinkNewStages && previous) {
        draft.dependencies.push({
          id: newId('dependency'),
          workspaceId: draft.workspace.id,
          epicId: input.epicId,
          predecessorStageId: previous.id,
          successorStageId: stage.id,
          type: 'finish_to_start',
          lagWorkdays: 0,
          createdAt: nowISO(),
        })
        const normalized = normalizeSchedule(draft.stages, draft.dependencies, draft.calendar)
        if (!normalized.ok) throw new Error(normalized.message)
        for (const patch of normalized.patches) {
          const index = draft.stages.findIndex(item => item.id === patch.id)
          if (index >= 0 && patch.after) draft.stages[index] = patch.after
        }
      }
      for (const quarterId of stage.quarterIds) {
        if (!draft.quarters.some(quarter => quarter.id === quarterId)) draft.quarters.push(createQuarter(quarterId, draft.workspace.id))
      }
    })
    return stage
  }

  async function updateStage(id: Id, changes: Partial<Omit<Stage, 'id' | 'workspaceId' | 'createdAt'>>): Promise<void> {
    validateExternalUrl(changes.externalUrl)
    await runCommand('Изменить этап', (draft) => {
      const stage = draft.stages.find(item => item.id === id)
      if (!stage) throw new Error('Этап не найден')
      if (stage.locked && (changes.startDate || changes.endDate)) throw new Error('Сначала разблокируйте этап')
      Object.assign(stage, changes)
      if (stage.kind === 'milestone') {
        stage.endDate = stage.startDate
        draft.assignments = draft.assignments.filter(assignment => assignment.stageId !== stage.id)
      }
      Object.assign(stage, updateDerived(stage, draft.calendar))
    })
  }

  async function deleteStage(id: Id): Promise<void> {
    await deleteStages([id])
  }

  async function deleteStages(ids: Id[]): Promise<void> {
    if (ids.length > 1) await createBackup('before_delete')
    const selected = new Set(ids)
    await runCommand(ids.length > 1 ? 'Удалить выбранные этапы' : 'Удалить этап', (draft) => {
      draft.dependencies = draft.dependencies.filter(dependency => !selected.has(dependency.predecessorStageId) && !selected.has(dependency.successorStageId))
      draft.stages = draft.stages.filter(stage => !selected.has(stage.id))
      draft.assignments = draft.assignments.filter(assignment => !selected.has(assignment.stageId))
      draft.workItems.forEach((item) => { if (item.stageId && selected.has(item.stageId)) item.stageId = undefined })
    })
  }

  async function reorderStage(id: Id, epicId: Id, targetIndex: number): Promise<void> {
    await runCommand('Изменить порядок этапов', (draft) => {
      const stage = draft.stages.find(item => item.id === id)
      if (!stage) throw new Error('Этап не найден')
      const siblings = draft.stages.filter(item => item.epicId === epicId && item.id !== id).sort((a, b) => a.sortOrder - b.sortOrder)
      siblings.splice(Math.max(0, Math.min(targetIndex, siblings.length)), 0, stage)
      siblings.forEach((item, index) => { item.epicId = epicId; item.sortOrder = index; item.updatedAt = nowISO() })
    })
  }

  async function moveStageBetweenEpics(stageId: Id, epicId: Id, removeDependencies = false): Promise<void> {
    await runCommand('Переместить этап в эпик', (draft) => {
      const stage = draft.stages.find(item => item.id === stageId)
      if (!stage || !draft.epics.some(epic => epic.id === epicId)) throw new Error('Этап или эпик не найден')
      const linked = draft.dependencies.filter(dependency => dependency.predecessorStageId === stageId || dependency.successorStageId === stageId)
      if (linked.length > 0 && !removeDependencies) throw new Error(`У этапа есть зависимостей: ${linked.length}`)
      if (removeDependencies) draft.dependencies = draft.dependencies.filter(dependency => !linked.includes(dependency))
      stage.epicId = epicId
      stage.sortOrder = draft.stages.filter(item => item.epicId === epicId).length
      stage.updatedAt = nowISO()
    })
  }

  async function move(stageIds: Id[], deltaWorkdays: number, mode: 'cascade' | 'free'): Promise<void> {
    if (!data.value) return
    const result = moveStages({ stageIds, deltaWorkdays, mode, ...data.value })
    if (!result.ok) throw new Error(result.message)
    if (result.patches.length === 0) return
    await runCommand(mode === 'cascade' ? 'Каскадный перенос' : 'Свободный перенос', (draft) => {
      for (const patch of result.patches) {
        const index = draft.stages.findIndex(stage => stage.id === patch.id)
        if (index >= 0 && patch.after) draft.stages[index] = patch.after
      }
    })
  }

  async function resize(id: Id, startDate: ISODate, endDate: ISODate, mode: 'cascade' | 'free'): Promise<void> {
    if (!data.value) return
    const result = resizeStage({ stageId: id, startDate, endDate, mode, ...data.value })
    if (!result.ok) throw new Error(result.message)
    if (result.patches.length === 0) return
    await runCommand(mode === 'cascade' ? 'Каскадное изменение длительности' : 'Изменить длительность', (draft) => {
      for (const patch of result.patches) {
        const index = draft.stages.findIndex(stage => stage.id === patch.id)
        if (index >= 0 && patch.after) draft.stages[index] = patch.after
      }
    })
  }

  async function addDependency(predecessorStageId: Id, successorStageId: Id, lagWorkdays = 0, mode: 'cascade' | 'free' = 'cascade'): Promise<Dependency> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const predecessor = data.value.stages.find(stage => stage.id === predecessorStageId)
    if (!predecessor) throw new Error('Предшественник не найден')
    const dependency: Dependency = {
      id: newId('dependency'), workspaceId: data.value.workspace.id, epicId: predecessor.epicId,
      predecessorStageId, successorStageId, type: 'finish_to_start', lagWorkdays, createdAt: nowISO(),
    }
    const validation = validateNewDependency(dependency, data.value.stages, data.value.dependencies)
    if (!validation.valid) throw new Error(validation.reason)
    const dependencies = [...data.value.dependencies, dependency]
    const normalizationPatches: Array<{ id: string; after?: Stage }> = []
    if (mode === 'cascade') {
      const normalization = normalizeSchedule(data.value.stages, dependencies, data.value.calendar)
      if (!normalization.ok) throw new Error(normalization.message)
      normalizationPatches.push(...normalization.patches)
    }
    await runCommand('Создать зависимость', (draft) => {
      draft.dependencies.push(dependency)
      for (const patch of normalizationPatches) {
        const index = draft.stages.findIndex(stage => stage.id === patch.id)
        if (index >= 0 && patch.after) draft.stages[index] = patch.after
      }
    })
    return dependency
  }

  async function removeDependency(id: Id): Promise<void> {
    await runCommand('Удалить зависимость', (draft) => {
      draft.dependencies = draft.dependencies.filter(dependency => dependency.id !== id)
    })
  }

  async function updateDependency(id: Id, lagWorkdays: number): Promise<void> {
    if (!Number.isInteger(lagWorkdays) || lagWorkdays < 0) throw new Error('Lag должен быть неотрицательным целым числом')
    await runCommand('Изменить зависимость', (draft) => {
      const dependency = draft.dependencies.find(item => item.id === id)
      if (!dependency) throw new Error('Зависимость не найдена')
      dependency.lagWorkdays = lagWorkdays
      const result = normalizeSchedule(draft.stages, draft.dependencies, draft.calendar)
      if (!result.ok) throw new Error(result.message)
      for (const patch of result.patches) {
        const index = draft.stages.findIndex(stage => stage.id === patch.id)
        if (index >= 0 && patch.after) draft.stages[index] = patch.after
      }
    })
  }

  function previewCalendar(calendar: WorkingCalendar): CalendarImpact {
    if (!data.value) return { changedDurations: 0, dependencyConflicts: 0 }
    const changedDurations = data.value.stages.filter((stage) => {
      const duration = stage.kind === 'milestone' ? 0 : workingDaysBetween(stage.startDate, stage.endDate, calendar)
      return duration !== stage.durationWorkdays
    }).length
    return {
      changedDurations,
      dependencyConflicts: detectScheduleConflicts(data.value.stages, data.value.dependencies, calendar).length,
    }
  }

  async function applyCalendar(calendar: WorkingCalendar, recalculateSchedule: boolean): Promise<void> {
    await createBackup('before_calendar_change')
    await runCommand('Изменить рабочий календарь', (draft) => {
      draft.calendar = { ...calendar, revision: draft.calendar.revision + 1 }
      draft.stages = draft.stages.map((stage) => {
        if (stage.kind === 'milestone') return updateDerived(stage, draft.calendar)
        if (!recalculateSchedule) return updateDerived(stage, draft.calendar)
        return updateDerived({ ...stage, endDate: addWorkingDays(stage.startDate, Math.max(0, stage.durationWorkdays - 1), draft.calendar) }, draft.calendar)
      })
      if (recalculateSchedule) {
        const result = normalizeSchedule(draft.stages, draft.dependencies, draft.calendar)
        if (!result.ok) throw new Error(result.message)
        for (const patch of result.patches) {
          const index = draft.stages.findIndex(stage => stage.id === patch.id)
          if (index >= 0 && patch.after) draft.stages[index] = patch.after
        }
      }
    })
  }

  async function fixSchedule(): Promise<void> {
    if (!data.value) return
    const result = normalizeSchedule(data.value.stages, data.value.dependencies, data.value.calendar)
    if (!result.ok) throw new Error(result.message)
    if (result.patches.length === 0) return
    await runCommand('Исправить расписание', (draft) => {
      for (const patch of result.patches) {
        const index = draft.stages.findIndex(stage => stage.id === patch.id)
        if (index >= 0 && patch.after) draft.stages[index] = patch.after
      }
    })
  }

  async function compactStages(stageIds: Id[]): Promise<void> {
    if (!data.value || stageIds.length === 0) return
    const result = compactSchedule(stageIds, data.value.stages, data.value.dependencies, data.value.calendar)
    if (!result.ok) throw new Error(result.message)
    if (result.patches.length === 0) return
    await runCommand('Сжать цепочку', (draft) => {
      for (const patch of result.patches) {
        const index = draft.stages.findIndex(stage => stage.id === patch.id)
        if (index >= 0 && patch.after) draft.stages[index] = patch.after
      }
    })
  }

  function validateCapacity(value: number): void {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_CAPACITY_FTE) throw new Error(`Capacity должен быть больше 0 и не больше ${MAX_CAPACITY_FTE} FTE`)
  }

  async function addRole(name: string, marker = '#2563eb'): Promise<Role> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    if (!name.trim()) throw new Error('Название роли обязательно')
    const role = createRole(data.value.workspace.id, name, data.value.roles.length)
    role.marker = marker
    await runCommand('Создать роль', draft => { draft.roles.push(role) })
    return role
  }

  async function updateRole(id: Id, changes: Partial<Pick<Role, 'name' | 'marker' | 'isActive'>>): Promise<void> {
    await runCommand('Изменить роль', (draft) => {
      const role = draft.roles.find(item => item.id === id)
      if (!role) throw new Error('Роль не найдена')
      if (changes.name !== undefined && !changes.name.trim()) throw new Error('Название роли обязательно')
      Object.assign(role, changes, { updatedAt: nowISO() })
    })
  }

  function roleUsage(id: Id): { people: number; assignments: number } {
    return {
      people: data.value?.people.filter(person => person.roleIds.includes(id)).length ?? 0,
      assignments: data.value?.assignments.filter(assignment => assignment.targetType === 'role' && assignment.targetId === id).length ?? 0,
    }
  }

  async function deleteRole(id: Id): Promise<void> {
    const usage = roleUsage(id)
    if (usage.people || usage.assignments) throw new Error(`Роль используется: сотрудников ${usage.people}, назначений ${usage.assignments}`)
    await runCommand('Удалить роль', draft => { draft.roles = draft.roles.filter(role => role.id !== id) })
  }

  async function addPerson(input: { name: string; primaryRoleId: Id; roleIds?: Id[]; baseCapacityFte: number }): Promise<Person> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    validateCapacity(input.baseCapacityFte)
    if (!data.value.roles.some(role => role.id === input.primaryRoleId)) throw new Error('Основная роль не найдена')
    const person = createPerson({ ...input, workspaceId: data.value.workspace.id, sortOrder: data.value.people.length })
    await runCommand('Создать сотрудника', draft => { draft.people.push(person) })
    return person
  }

  async function updatePerson(id: Id, changes: Partial<Pick<Person, 'name' | 'primaryRoleId' | 'roleIds' | 'baseCapacityFte' | 'isActive'>>): Promise<void> {
    if (changes.baseCapacityFte !== undefined) validateCapacity(changes.baseCapacityFte)
    await runCommand('Изменить сотрудника', (draft) => {
      const person = draft.people.find(item => item.id === id)
      if (!person) throw new Error('Сотрудник не найден')
      Object.assign(person, changes)
      if (!person.name.trim()) throw new Error('Имя обязательно')
      if (!draft.roles.some(role => role.id === person.primaryRoleId)) throw new Error('Основная роль не найдена')
      person.roleIds = [...new Set([person.primaryRoleId, ...person.roleIds])]
      person.updatedAt = nowISO()
    })
  }

  function personUsage(id: Id): number {
    return data.value?.assignments.filter(assignment => assignment.targetType === 'person' && assignment.targetId === id).length ?? 0
  }

  async function deletePerson(id: Id): Promise<void> {
    const assignments = personUsage(id)
    if (assignments) throw new Error(`У сотрудника есть активных назначений: ${assignments}. Сначала удалите их или архивируйте сотрудника.`)
    await runCommand('Удалить сотрудника', (draft) => {
      draft.people = draft.people.filter(person => person.id !== id)
      draft.workItems.forEach((item) => { if (item.personId === id) item.personId = undefined })
    })
  }

  async function upsertAssignment(input: { id?: Id; stageId: Id; targetType: 'person' | 'role'; targetId: Id; units: number; allocationFte: number }): Promise<Assignment> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const stage = data.value.stages.find(item => item.id === input.stageId)
    if (!stage) throw new Error('Этап не найден')
    if (stage.kind === 'milestone') throw new Error('Веха не создаёт нагрузку и не может иметь назначения')
    validateCapacity(input.allocationFte)
    if (!Number.isFinite(input.units) || input.units <= 0 || (input.targetType === 'role' && !Number.isInteger(input.units))) throw new Error('Units должно быть положительным целым числом')
    if (input.targetType === 'person') {
      const person = data.value.people.find(item => item.id === input.targetId)
      if (!person) throw new Error('Сотрудник не найден')
      if (input.allocationFte > person.baseCapacityFte) throw new Error(`Allocation превышает capacity сотрудника ${person.baseCapacityFte} FTE`)
    } else if (!data.value.roles.some(role => role.id === input.targetId)) throw new Error('Роль не найдена')
    const assignment: Assignment = {
      id: input.id ?? newId('assignment'), workspaceId: data.value.workspace.id, stageId: input.stageId,
      targetType: input.targetType, targetId: input.targetId, units: input.targetType === 'person' ? 1 : input.units,
      allocationFte: input.allocationFte,
    }
    await runCommand(input.id ? 'Изменить назначение' : 'Добавить назначение', (draft) => {
      const index = draft.assignments.findIndex(item => item.id === assignment.id)
      if (index >= 0) draft.assignments[index] = assignment
      else draft.assignments.push(assignment)
    })
    return assignment
  }

  async function deleteAssignment(id: Id): Promise<void> {
    await runCommand('Удалить назначение', draft => { draft.assignments = draft.assignments.filter(item => item.id !== id) })
  }

  async function addWorkItem(input: { epicId: Id; stageId?: Id; title: string; personId?: Id; externalUrl?: string }): Promise<WorkItem> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    if (!input.title.trim()) throw new Error('Название задачи обязательно')
    validateExternalUrl(input.externalUrl)
    const timestamp = nowISO()
    const item: WorkItem = {
      id: newId('work-item'), workspaceId: data.value.workspace.id, epicId: input.epicId,
      stageId: input.stageId, title: input.title.trim(), status: 'todo', personId: input.personId, externalUrl: input.externalUrl,
      sortOrder: data.value.workItems.filter(value => value.epicId === input.epicId && value.stageId === input.stageId).length,
      createdAt: timestamp, updatedAt: timestamp,
    }
    await runCommand('Создать задачу', draft => { draft.workItems.push(item) })
    return item
  }

  async function updateWorkItem(id: Id, changes: Partial<Pick<WorkItem, 'title' | 'status' | 'personId' | 'stageId' | 'sortOrder' | 'externalUrl'>>): Promise<void> {
    validateExternalUrl(changes.externalUrl)
    await runCommand('Изменить задачу', (draft) => {
      const item = draft.workItems.find(value => value.id === id)
      if (!item) throw new Error('Задача не найдена')
      if (changes.stageId) {
        const stage = draft.stages.find(value => value.id === changes.stageId)
        if (!stage || stage.epicId !== item.epicId) throw new Error('Задачу можно перемещать только внутри своего эпика')
      }
      Object.assign(item, changes, { updatedAt: nowISO() })
    })
  }

  async function deleteWorkItem(id: Id): Promise<void> {
    await runCommand('Удалить задачу', draft => { draft.workItems = draft.workItems.filter(item => item.id !== id) })
  }

  async function bulkUpdateStages(stageIds: Id[], changes: Partial<Pick<Stage, 'status' | 'activityTypeId'>>): Promise<void> {
    await runCommand('Массово изменить этапы', (draft) => {
      for (const stage of draft.stages) if (stageIds.includes(stage.id)) Object.assign(stage, changes, { updatedAt: nowISO() })
    })
  }

  async function copyStages(input: { stageIds: Id[]; targetEpicId: Id; targetStartDate?: ISODate; includeDependencies?: boolean; includeWorkItems?: boolean }): Promise<Id[]> {
    if (!data.value || input.stageIds.length === 0) return []
    const sourceStages = data.value.stages.filter(stage => input.stageIds.includes(stage.id)).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sortOrder - b.sortOrder)
    if (!sourceStages.length) return []
    const anchor = sourceStages[0]!.startDate
    const targetStart = input.targetStartDate ?? anchor
    const createdIds: Id[] = []
    await runCommand('Копировать этапы', (draft) => {
      const idMap = new Map<string, string>()
      for (const source of sourceStages) {
        const offset = workingDayDelta(anchor, source.startDate, draft.calendar)
        const startDate = addWorkingDays(targetStart, offset, draft.calendar)
        const copy = createStage({
          workspaceId: draft.workspace.id, epicId: input.targetEpicId, title: `${source.title} — копия`, kind: source.kind,
          activityTypeId: source.activityTypeId, startDate,
          endDate: source.kind === 'milestone' ? undefined : addWorkingDays(startDate, Math.max(0, source.durationWorkdays - 1), draft.calendar),
          calendar: draft.calendar, sortOrder: draft.stages.filter(stage => stage.epicId === input.targetEpicId).length + createdIds.length,
        })
        Object.assign(copy, { status: source.status, descriptionMarkdown: source.descriptionMarkdown, externalUrl: source.externalUrl })
        draft.stages.push(copy); idMap.set(source.id, copy.id); createdIds.push(copy.id)
        for (const assignment of draft.assignments.filter(item => item.stageId === source.id)) draft.assignments.push({ ...assignment, id: newId('assignment'), stageId: copy.id })
        if (input.includeWorkItems) for (const item of draft.workItems.filter(value => value.stageId === source.id)) draft.workItems.push({ ...item, id: newId('work-item'), stageId: copy.id, epicId: input.targetEpicId, createdAt: nowISO(), updatedAt: nowISO() })
      }
      if (input.includeDependencies) {
        for (const dependency of [...draft.dependencies]) {
          const predecessorStageId = idMap.get(dependency.predecessorStageId)
          const successorStageId = idMap.get(dependency.successorStageId)
          if (predecessorStageId && successorStageId) draft.dependencies.push({ ...dependency, id: newId('dependency'), epicId: input.targetEpicId, predecessorStageId, successorStageId, createdAt: nowISO() })
        }
      }
    })
    return createdIds
  }

  function exportJson(options?: WorkspaceExportOptions): void {
    if (!data.value) return
    downloadWorkspace(data.value, options)
    void repository.updateIntegrityMetadata(data.value.workspace.id, { lastExportAt: nowISO() })
  }

  async function importJson(json: string): Promise<void> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    parseWorkspaceExport(json)
    await createBackup('before_import')
    saveStatus.value = 'saving'
    try {
      data.value = await replaceWorkspaceAtomically(repository, data.value, json)
      backups.value = await repository.listBackups()
      history.clear()
      historyRevision.value += 1
      saveStatus.value = 'saved'
    } catch (error) {
      saveStatus.value = 'error'
      lastError.value = error instanceof Error ? error.message : 'Импорт не выполнен'
      throw error
    }
  }

  async function loadDemo(): Promise<void> {
    if (!data.value) return
    await runCommand('Создать демонстрационный план', (draft) => {
      draft.epics = []
      draft.stages = []
      draft.dependencies = []
      draft.roles = []
      draft.people = []
      draft.assignments = []
      draft.workItems = []
      const epic = createEpic(draft.workspace.id, 'CPM–CPA аукцион', 0)
      epic.code = 'ADS-01'
      epic.marker = '#2563eb'
      epic.descriptionMarkdown = '## Цель\n\nЗапустить аукцион с параллельными **CPM** и **CPA** ветками.\n\n- Проверить механику ставок\n- Подготовить monitoring\n- Согласовать критерии запуска'
      draft.epics.push(epic)
      const start = draft.quarters.sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!.startDate
      const activity = (slug: string) => draft.activityTypes.find(type => type.slug === slug)!.id
      const make = (title: string, kind: StageKind, activityTypeId: string, offset: number, duration: number, sortOrder: number) => createStage({
        workspaceId: draft.workspace.id,
        epicId: epic.id,
        title,
        kind,
        activityTypeId,
        startDate: addWorkingDays(start, offset, draft.calendar),
        endDate: kind === 'milestone' ? undefined : addWorkingDays(start, offset + duration - 1, draft.calendar),
        calendar: draft.calendar,
        sortOrder,
      })
      const research = make('Исследование механики аукциона', 'task', activity('research'), 2, 5, 0)
      const cpmDev = make('CPM: разработка стратегии', 'task', activity('development'), 8, 8, 1)
      const cpmTest = make('CPM: тестирование', 'task', activity('testing'), 17, 5, 2)
      const cpaScope = make('CPA: интеграционный scope', 'scope', activity('integration'), 8, 10, 3)
      const cpaTest = make('CPA: проверка конверсий', 'task', activity('testing'), 19, 4, 4)
      const release = make('Запуск аукциона', 'milestone', activity('release'), 25, 0, 5)
      draft.stages.push(research, cpmDev, cpmTest, cpaScope, cpaTest, release)
      research.descriptionMarkdown = 'Проверить гипотезы и зафиксировать ограничения механики.'
      cpmDev.descriptionMarkdown = '## CPM branch\n\nРеализовать стратегию ставок и защитные лимиты.'
      cpaScope.descriptionMarkdown = '## CPA branch\n\nИнтеграция конверсий и атрибуции.'
      const link = (predecessorStageId: string, successorStageId: string): Dependency => ({
        id: newId('dependency'), workspaceId: draft.workspace.id, epicId: epic.id,
        predecessorStageId, successorStageId, type: 'finish_to_start', lagWorkdays: 0, createdAt: nowISO(),
      })
      draft.dependencies.push(
        link(research.id, cpmDev.id), link(cpmDev.id, cpmTest.id), link(cpmTest.id, release.id),
        link(research.id, cpaScope.id), link(cpaScope.id, cpaTest.id), link(cpaTest.id, release.id),
      )
      const backend = createRole(draft.workspace.id, 'Backend', 0); backend.marker = '#2563eb'
      const qa = createRole(draft.workspace.id, 'QA', 1); qa.marker = '#f59e0b'
      const developerOne = createPerson({ workspaceId: draft.workspace.id, name: 'Анна Backend', primaryRoleId: backend.id, baseCapacityFte: 1, sortOrder: 0 })
      const developerTwo = createPerson({ workspaceId: draft.workspace.id, name: 'Михаил Backend', primaryRoleId: backend.id, baseCapacityFte: 0.8, sortOrder: 1 })
      const tester = createPerson({ workspaceId: draft.workspace.id, name: 'Ольга QA', primaryRoleId: qa.id, baseCapacityFte: 0.8, sortOrder: 2 })
      draft.roles.push(backend, qa); draft.people.push(developerOne, developerTwo, tester)
      const assignment = (stageId: string, targetType: 'person' | 'role', targetId: string, allocationFte: number, units = 1): Assignment => ({ id: newId('assignment'), workspaceId: draft.workspace.id, stageId, targetType, targetId, units, allocationFte })
      draft.assignments.push(
        assignment(cpmDev.id, 'person', developerOne.id, 1), assignment(cpaScope.id, 'person', developerTwo.id, 0.8),
        assignment(cpmTest.id, 'person', tester.id, 0.8), assignment(cpaTest.id, 'person', tester.id, 0.8),
        assignment(cpmTest.id, 'role', qa.id, 0.5),
      )
      const workItem = (stageId: string | undefined, title: string, status: WorkItemStatus = 'todo', personId?: string): WorkItem => ({ id: newId('work-item'), workspaceId: draft.workspace.id, epicId: epic.id, stageId, title, status, personId, sortOrder: draft.workItems.length, createdAt: nowISO(), updatedAt: nowISO() })
      draft.workItems.push(
        workItem(undefined, 'Согласовать продуктовые метрики'), workItem(research.id, 'Собрать ограничения DSP', 'done'),
        workItem(cpmDev.id, 'Реализовать pacing', 'in_progress', developerOne.id), workItem(cpaScope.id, 'Подключить conversion feed', 'todo', developerTwo.id),
        workItem(cpmTest.id, 'Подготовить тест-кейсы', 'todo', tester.id),
      )
    })
  }

  async function clearPlan(): Promise<void> {
    await createBackup('before_delete')
    await runCommand('Очистить план', (draft) => {
      draft.epics = []
      draft.stages = []
      draft.dependencies = []
      draft.assignments = []
      draft.workItems = []
    })
  }

  async function resetWorkspace(): Promise<void> {
    await createBackup('before_delete')
    await runCommand('Безопасно сбросить workspace', (draft) => {
      draft.epics = []
      draft.stages = []
      draft.dependencies = []
      draft.roles = []
      draft.people = []
      draft.assignments = []
      draft.workItems = []
      draft.baselines = []
      draft.baselineStages = []
      draft.calendar = {
        ...draft.calendar,
        workingWeekdays: [1, 2, 3, 4, 5],
        holidays: [],
        extraWorkingDays: [],
        revision: draft.calendar.revision + 1,
      }
    })
    recoveryRequired.value = false
  }

  async function runIntegrityCheck(rebuildDerived = false): Promise<void> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    if (rebuildDerived) {
      await runCommand('Перестроить вычисляемые данные', (draft) => {
        draft.stages = draft.stages.map(stage => updateDerived(stage, draft.calendar))
      })
    }
    const checkedAt = nowISO()
    try {
      validateReferences(data.value)
      lastIntegrityCheck.value = { status: 'ok', message: 'Ссылки, даты и DAG корректны', checkedAt }
      recoveryRequired.value = false
      await repository.updateIntegrityMetadata(data.value.workspace.id, {
        lastIntegrityCheckAt: checkedAt,
        lastIntegrityStatus: 'ok',
        lastIntegrityMessage: lastIntegrityCheck.value.message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка проверки данных'
      lastIntegrityCheck.value = { status: 'error', message, checkedAt }
      recoveryRequired.value = true
      await repository.updateIntegrityMetadata(data.value.workspace.id, {
        lastIntegrityCheckAt: checkedAt,
        lastIntegrityStatus: 'error',
        lastIntegrityMessage: message,
      })
      throw error
    }
  }

  async function createBaseline(input: { name: string; comment?: string; quarterIds: string[]; epicIds?: Id[] }): Promise<Baseline> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const name = input.name.trim()
    if (!name) throw new Error('Название baseline обязательно')
    const baseline: Baseline = {
      id: newId('baseline'),
      workspaceId: data.value.workspace.id,
      name,
      comment: input.comment?.trim() || undefined,
      quarterIds: input.quarterIds as Baseline['quarterIds'],
      epicIds: input.epicIds?.length ? [...input.epicIds] : undefined,
      createdAt: nowISO(),
    }
    await runCommand('Создать baseline', (draft) => {
      const scoped = draft.stages.filter(stage =>
        (!baseline.epicIds?.length || baseline.epicIds.includes(stage.epicId))
        && stage.quarterIds.some(id => baseline.quarterIds.includes(id)),
      )
      const snapshots: BaselineStageSnapshot[] = scoped.map(stage => ({
        id: newId('baseline-stage'),
        baselineId: baseline.id,
        stageId: stage.id,
        epicId: stage.epicId,
        title: stage.title,
        kind: stage.kind,
        activityTypeId: stage.activityTypeId,
        status: stage.status,
        startDate: stage.startDate,
        endDate: stage.endDate,
        durationWorkdays: stage.durationWorkdays,
      }))
      draft.baselines.push(baseline)
      draft.baselineStages.push(...snapshots)
    })
    activeBaselineId.value = baseline.id
    return baseline
  }

  async function renameBaseline(id: Id, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Название baseline обязательно')
    await runCommand('Переименовать baseline', (draft) => {
      const baseline = draft.baselines.find(item => item.id === id)
      if (!baseline) throw new Error('Baseline не найден')
      baseline.name = trimmed
    })
  }

  async function deleteBaseline(id: Id): Promise<void> {
    await runCommand('Удалить baseline', (draft) => {
      draft.baselines = draft.baselines.filter(item => item.id !== id)
      draft.baselineStages = draft.baselineStages.filter(item => item.baselineId !== id)
    })
    if (activeBaselineId.value === id) activeBaselineId.value = undefined
  }

  async function createBackup(reason: BackupReason = 'manual', name?: string): Promise<BackupSnapshot> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const backup = await repository.createBackup(data.value, reason, name)
    backups.value = await repository.listBackups()
    return backup
  }

  async function restoreBackup(id: Id): Promise<void> {
    if (!data.value) throw new Error('Workspace ещё не загружен')
    const backup = await repository.getBackup(id)
    if (!backup) throw new Error('Backup не найден')
    let restored: PlannerData
    try {
      restored = JSON.parse(backup.payload) as PlannerData
      restored = {
        ...restored,
        workspace: { ...restored.workspace, schemaVersion: 3 },
        baselines: restored.baselines ?? [],
        baselineStages: restored.baselineStages ?? [],
      }
      validateReferences(restored)
    } catch (error) {
      throw new Error(`Backup повреждён: ${error instanceof Error ? error.message : 'некорректный payload'}`)
    }
    await createBackup('before_restore')
    const current = cloneJson(data.value)
    try {
      await repository.replaceAll(restored)
      data.value = restored
      recoveryRequired.value = false
      history.clear()
      historyRevision.value += 1
      backups.value = await repository.listBackups()
    } catch (error) {
      await repository.replaceAll(current)
      throw error
    }
  }

  async function deleteBackup(id: Id): Promise<void> {
    await repository.deleteBackup(id)
    if (data.value) backups.value = await repository.listBackups()
  }

  function exportBackup(id: Id): void {
    const backup = backups.value.find(item => item.id === id)
    if (!backup) throw new Error('Backup не найден')
    const restored = JSON.parse(backup.payload) as PlannerData
    const blob = new Blob([serializeWorkspace(restored)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `delivery-planner-backup-${backup.createdAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return {
    data, initialized, loading, saveStatus, lastError, canUndo, canRedo, conflicts,
    backups, activeBaselineId, storagePersisted, storageUsage, storageQuota, lastIntegrityCheck, recoveryRequired,
    initialize, runCommand, undo, redo,
    updateWorkspaceSettings, addActivityType, updateActivityType, deleteActivityType,
    addEpic, updateEpic, reorderEpics, deleteEpic,
    addStage, updateStage, deleteStage, deleteStages, reorderStage, moveStageBetweenEpics, move, resize,
    addDependency, removeDependency, updateDependency,
    previewCalendar, applyCalendar, fixSchedule, compactStages,
    addRole, updateRole, deleteRole, roleUsage,
    addPerson, updatePerson, deletePerson, personUsage,
    upsertAssignment, deleteAssignment,
    addWorkItem, updateWorkItem, deleteWorkItem,
    bulkUpdateStages, copyStages,
    createBaseline, renameBaseline, deleteBaseline,
    createBackup, restoreBackup, deleteBackup, exportBackup,
    exportJson, importJson, loadDemo, clearPlan, resetWorkspace, runIntegrityCheck,
  }
})
