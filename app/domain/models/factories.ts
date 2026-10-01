import { workingDaysBetween } from '../calendar/date'
import { createQuarter, nextQuarterId, quarterIdForDate, quarterIdsForRange } from '../quarters/quarters'
import type { ActivityType, Epic, ISODate, Person, PlannerData, Role, Stage, StageKind, WorkingCalendar, Workspace } from './types'

const ACTIVITY_TYPES = [
  ['Исследование', 'research', '#8b5cf6'],
  ['Дизайн и анализ', 'design', '#ec4899'],
  ['Разработка', 'development', '#2563eb'],
  ['Тестирование', 'testing', '#f59e0b'],
  ['Интеграция', 'integration', '#14b8a6'],
  ['Релиз', 'release', '#22c55e'],
  ['Другое', 'other', '#64748b'],
] as const

export function newId(prefix = 'id'): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function createDefaultWorkspace(today = new Date()): PlannerData {
  const timestamp = nowISO()
  const workspaceId = newId('workspace')
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` as ISODate
  const currentQuarterId = quarterIdForDate(todayDate)
  const workspace: Workspace = {
    id: workspaceId,
    name: 'Мой delivery-план',
    schemaVersion: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
    settings: {
      locale: 'ru-RU',
      firstDayOfWeek: 1,
      defaultTimelineScale: 'day',
      defaultMoveMode: 'cascade',
      autoLinkNewStages: false,
      capacityWarningThreshold: 0.8,
      theme: 'system',
    },
  }
  const calendar: WorkingCalendar = {
    id: newId('calendar'),
    workspaceId,
    workingWeekdays: [1, 2, 3, 4, 5],
    holidays: [],
    extraWorkingDays: [],
    revision: 0,
  }
  const activityTypes: ActivityType[] = ACTIVITY_TYPES.map(([name, slug, colorToken], sortOrder) => ({
    id: `activity-${slug}`,
    workspaceId,
    name,
    slug,
    colorToken,
    sortOrder,
    isActive: true,
  }))
  return {
    workspace,
    calendar,
    activityTypes,
    quarters: [createQuarter(currentQuarterId, workspaceId), createQuarter(nextQuarterId(currentQuarterId), workspaceId)],
    epics: [],
    stages: [],
    dependencies: [],
    roles: [],
    people: [],
    assignments: [],
    workItems: [],
    baselines: [],
    baselineStages: [],
  }
}

export function createRole(workspaceId: string, name: string, sortOrder = 0): Role {
  const timestamp = nowISO()
  return {
    id: newId('role'), workspaceId, name: name.trim(), marker: '#2563eb', sortOrder,
    isActive: true, createdAt: timestamp, updatedAt: timestamp,
  }
}

export function createPerson(input: {
  workspaceId: string
  name: string
  primaryRoleId: string
  roleIds?: string[]
  baseCapacityFte?: number
  sortOrder?: number
}): Person {
  const timestamp = nowISO()
  return {
    id: newId('person'), workspaceId: input.workspaceId, name: input.name.trim(),
    primaryRoleId: input.primaryRoleId,
    roleIds: [...new Set([input.primaryRoleId, ...(input.roleIds ?? [])])],
    baseCapacityFte: input.baseCapacityFte ?? 1,
    isActive: true, sortOrder: input.sortOrder ?? 0,
    createdAt: timestamp, updatedAt: timestamp,
  }
}

export function createEpic(workspaceId: string, title: string, sortOrder = 0): Epic {
  const timestamp = nowISO()
  return {
    id: newId('epic'),
    workspaceId,
    title: title.trim(),
    descriptionMarkdown: '',
    status: 'active',
    marker: '#2563eb',
    fillStyle: 'solid',
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createStage(input: {
  workspaceId: string
  epicId: string
  title: string
  kind: StageKind
  activityTypeId: string
  startDate: ISODate
  endDate?: ISODate
  calendar: WorkingCalendar
  sortOrder?: number
}): Stage {
  const timestamp = nowISO()
  const endDate = input.kind === 'milestone' ? input.startDate : (input.endDate ?? input.startDate)
  const durationWorkdays = input.kind === 'milestone' ? 0 : workingDaysBetween(input.startDate, endDate, input.calendar)
  if (input.kind !== 'milestone' && durationWorkdays < 1) throw new Error('Этап должен содержать хотя бы один рабочий день')
  return {
    id: newId('stage'),
    workspaceId: input.workspaceId,
    epicId: input.epicId,
    title: input.title.trim(),
    kind: input.kind,
    activityTypeId: input.activityTypeId,
    status: 'planned',
    descriptionMarkdown: '',
    startDate: input.startDate,
    endDate,
    durationWorkdays,
    locked: false,
    sortOrder: input.sortOrder ?? 0,
    quarterIds: quarterIdsForRange(input.startDate, endDate),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
