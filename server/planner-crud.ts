import { z } from 'zod'
import { addCalendarDays, assertISODate, fromLocalDate, workingDaysBetween } from '../app/domain/calendar/date'
import { epicPeriod } from '../app/domain/models/epic-period'
import { createEpic, createStage, nowISO } from '../app/domain/models/factories'
import type { BackupReason, Epic, ISODate, PlannerData, Stage } from '../app/domain/models/types'
import { createQuarter, quarterIdsForRange } from '../app/domain/quarters/quarters'
import { ApiError, type openDatabase } from './database'

type PlannerDatabase = ReturnType<typeof openDatabase>
export interface CrudResponse<T> { data: T; revision: number; updatedAt: string }
export type EpicResource = Epic & {
  effectivePeriod: { startDate: ISODate; endDate: ISODate; durationWorkdays: number } | null
}

const date = z.string().refine((value) => {
  try { assertISODate(value); return true } catch { return false }
}, 'Ожидается существующая календарная дата YYYY-MM-DD').transform(value => value as ISODate)
const title = z.string().trim().min(1, 'Название обязательно')
const sortOrder = z.number().nonnegative()
const epicFields = z.object({
  title,
  code: z.string().nullable().optional(),
  descriptionMarkdown: z.string().optional(),
  status: z.enum(['active', 'paused', 'done', 'archived', 'blocked']).optional(),
  startDate: date.nullable().optional(),
  endDate: date.nullable().optional(),
  marker: z.string().nullable().optional(),
  fillStyle: z.enum(['solid', 'striped']).optional(),
  sortOrder: sortOrder.optional(),
}).strict()
const stageFields = z.object({
  title,
  kind: z.enum(['task', 'scope', 'milestone']).optional(),
  activityTypeId: z.string().trim().min(1),
  status: z.enum(['planned', 'in_progress', 'done', 'blocked']).optional(),
  descriptionMarkdown: z.string().optional(),
  startDate: date,
  endDate: date.optional(),
  locked: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
  externalUrl: z.string().url().refine(value => /^https?:/.test(value), 'Разрешены только HTTP/HTTPS ссылки').nullable().optional(),
}).strict()
const epicPatch = epicFields.partial().refine(value => Object.keys(value).length > 0, 'Передайте хотя бы одно поле')
const stagePatch = stageFields.partial().refine(value => Object.keys(value).length > 0, 'Передайте хотя бы одно поле')
const revisionSchema = z.number().int().nonnegative()
const deleteSchema = z.object({ expectedRevision: revisionSchema }).strict()

function input<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const envelope = z.object({ expectedRevision: revisionSchema, data: z.unknown() }).strict().parse(body)
  return schema.parse(envelope.data)
}

function expectedRevision(body: unknown): number {
  const value = body && typeof body === 'object' && 'expectedRevision' in body ? body.expectedRevision : undefined
  const parsed = revisionSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Некорректная версия workspace')
  return parsed.data
}

function applyFields(target: object, changes: object) {
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) Reflect.deleteProperty(target, key)
    else Reflect.set(target, key, value)
  }
}

function ordered<T extends { sortOrder: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function nextOrder(items: { sortOrder: number }[]): number {
  return items.length ? Math.max(...items.map(item => item.sortOrder)) + 1 : 0
}

function requireEpic(data: PlannerData, id: string): Epic {
  const epic = data.epics.find(item => item.id === id)
  if (!epic) throw new ApiError(404, 'Эпик не найден')
  return epic
}

function requireStage(data: PlannerData, id: string): Stage {
  const stage = data.stages.find(item => item.id === id)
  if (!stage) throw new ApiError(404, 'Этап не найден')
  return stage
}

function epicResource(data: PlannerData, epic: Epic): EpicResource {
  const period = epicPeriod(epic, data.stages)
  return { ...epic, effectivePeriod: period ? { ...period, durationWorkdays: workingDaysBetween(period.startDate, period.endDate, data.calendar) } : null }
}

function response<T>(workspace: PlannerData, data: T): CrudResponse<T> {
  return { data, revision: workspace.workspace.revision, updatedAt: workspace.workspace.updatedAt }
}

function validateEpicDates(epic: Epic) {
  if (Boolean(epic.startDate) !== Boolean(epic.endDate)) throw new ApiError(422, 'Укажите обе даты эпика или очистите обе')
  if (epic.startDate && epic.endDate && epic.startDate > epic.endDate) throw new ApiError(422, 'Дата начала эпика позже окончания')
}

function deriveStageDates(data: PlannerData, stage: Pick<Stage, 'kind' | 'startDate' | 'endDate'>, explicitEndDate: boolean) {
  let endDate = stage.endDate
  if (stage.kind === 'milestone') {
    if (explicitEndDate && endDate !== stage.startDate) throw new ApiError(422, 'Дата окончания вехи должна совпадать с началом')
    endDate = stage.startDate
  }
  if (stage.startDate > endDate) throw new ApiError(422, 'Дата начала этапа позже окончания')
  const durationWorkdays = stage.kind === 'milestone' ? 0 : workingDaysBetween(stage.startDate, endDate, data.calendar)
  if (stage.kind !== 'milestone' && durationWorkdays < 1) throw new ApiError(422, 'Этап должен содержать хотя бы один рабочий день')
  return { endDate, durationWorkdays, quarterIds: quarterIdsForRange(stage.startDate, endDate) }
}

function ensureQuarters(data: PlannerData, stage: Stage) {
  for (const id of stage.quarterIds) {
    if (!data.quarters.some(quarter => quarter.id === id)) data.quarters.push(createQuarter(id, data.workspace.id))
  }
}

export function createPlannerCrud(database: PlannerDatabase) {
  function write<T>(code: string, body: unknown, apply: (draft: PlannerData) => (saved: PlannerData) => T, backupReason?: BackupReason): CrudResponse<T> {
    const revision = expectedRevision(body)
    const draft = database.load(code)
    if (draft.workspace.revision !== revision) throw new ApiError(409, 'Workspace изменён в другом браузере', draft.workspace.revision)
    const select = apply(draft)
    const saved = database.save(code, revision, draft, backupReason)
    return response(saved, select(saved))
  }

  return {
    listEpics(code: string) {
      const data = database.load(code)
      return response(data, ordered(data.epics).map(epic => epicResource(data, epic)))
    },
    getEpic(code: string, id: string) {
      const data = database.load(code)
      return response(data, epicResource(data, requireEpic(data, id)))
    },
    createEpic(code: string, body: unknown) {
      return write(code, body, (draft) => {
        const fields = input(epicFields, body)
        if ((fields.startDate === null) !== (fields.endDate === null)) throw new ApiError(422, 'Для автоматического периода передайте обе даты null')
        const epic = createEpic(draft.workspace.id, fields.title, nextOrder(draft.epics))
        if (fields.startDate === undefined && fields.endDate === undefined) {
          epic.startDate = fromLocalDate(new Date())
          epic.endDate = addCalendarDays(epic.startDate, 3)
        }
        applyFields(epic, fields)
        validateEpicDates(epic)
        draft.epics.push(epic)
        return saved => epicResource(saved, requireEpic(saved, epic.id))
      })
    },
    updateEpic(code: string, id: string, body: unknown) {
      return write(code, body, (draft) => {
        const epic = requireEpic(draft, id)
        applyFields(epic, input(epicPatch, body))
        validateEpicDates(epic)
        epic.updatedAt = nowISO()
        return saved => epicResource(saved, requireEpic(saved, id))
      })
    },
    deleteEpic(code: string, id: string, body: unknown) {
      return write(code, body, (draft) => {
        deleteSchema.parse(body)
        requireEpic(draft, id)
        const stageIds = new Set(draft.stages.filter(stage => stage.epicId === id).map(stage => stage.id))
        draft.dependencies = draft.dependencies.filter(link => !stageIds.has(link.predecessorStageId) && !stageIds.has(link.successorStageId))
        draft.assignments = draft.assignments.filter(item => !stageIds.has(item.stageId))
        draft.workItems = draft.workItems.filter(item => item.epicId !== id)
        draft.stages = draft.stages.filter(stage => stage.epicId !== id)
        draft.epics = draft.epics.filter(epic => epic.id !== id)
        for (const baseline of draft.baselines) {
          if (baseline.epicIds) baseline.epicIds = baseline.epicIds.filter(epicId => epicId !== id)
        }
        return () => ({ deletedId: id })
      }, 'before_delete')
    },
    listStages(code: string, epicId?: string) {
      const data = database.load(code)
      if (epicId !== undefined) requireEpic(data, epicId)
      return response(data, ordered(data.stages.filter(stage => epicId === undefined || stage.epicId === epicId)))
    },
    getStage(code: string, id: string) {
      const data = database.load(code)
      return response(data, requireStage(data, id))
    },
    createStage(code: string, epicId: string, body: unknown) {
      return write(code, body, (draft) => {
        requireEpic(draft, epicId)
        const fields = input(stageFields, body)
        const kind = fields.kind ?? 'task'
        const derived = deriveStageDates(draft, { kind, startDate: fields.startDate, endDate: fields.endDate ?? fields.startDate }, fields.endDate !== undefined)
        const stage = createStage({
          workspaceId: draft.workspace.id, epicId, title: fields.title, kind,
          activityTypeId: fields.activityTypeId, startDate: fields.startDate, endDate: derived.endDate,
          calendar: draft.calendar, sortOrder: nextOrder(draft.stages.filter(item => item.epicId === epicId)),
        })
        applyFields(stage, fields)
        Object.assign(stage, derived)
        draft.stages.push(stage)
        ensureQuarters(draft, stage)
        return saved => requireStage(saved, stage.id)
      })
    },
    updateStage(code: string, id: string, body: unknown) {
      return write(code, body, (draft) => {
        const stage = requireStage(draft, id)
        const fields = input(stagePatch, body)
        if (stage.locked && (fields.startDate !== undefined || fields.endDate !== undefined || (fields.kind !== undefined && fields.kind !== stage.kind))) {
          throw new ApiError(423, 'Сначала разблокируйте этап отдельным запросом')
        }
        applyFields(stage, fields)
        Object.assign(stage, deriveStageDates(draft, stage, fields.endDate !== undefined), { updatedAt: nowISO() })
        if (stage.kind === 'milestone') draft.assignments = draft.assignments.filter(item => item.stageId !== id)
        ensureQuarters(draft, stage)
        return saved => requireStage(saved, id)
      })
    },
    deleteStage(code: string, id: string, body: unknown) {
      return write(code, body, (draft) => {
        deleteSchema.parse(body)
        requireStage(draft, id)
        draft.dependencies = draft.dependencies.filter(link => link.predecessorStageId !== id && link.successorStageId !== id)
        draft.assignments = draft.assignments.filter(item => item.stageId !== id)
        draft.stages = draft.stages.filter(stage => stage.id !== id)
        for (const item of draft.workItems) {
          if (item.stageId === id) { delete item.stageId; item.updatedAt = nowISO() }
        }
        return () => ({ deletedId: id })
      }, 'before_delete')
    },
  }
}
