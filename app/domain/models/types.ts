export type Id = string
export type ISODate = `${number}-${number}-${number}`
export type QuarterId = `${number}-Q${1 | 2 | 3 | 4}`

export type StageKind = 'task' | 'scope' | 'milestone'
export type StageStatus = 'planned' | 'in_progress' | 'done' | 'blocked'
export type EpicStatus = 'active' | 'paused' | 'done' | 'archived'
export type MoveMode = 'cascade' | 'free'
export type TimelineScale = 'day' | 'week' | 'month'
export type AssignmentTargetType = 'person' | 'role'
export type WorkItemStatus = 'todo' | 'in_progress' | 'done'
export type BackupReason = 'manual' | 'daily' | 'before_import' | 'before_delete' | 'before_calendar_change' | 'before_restore'

export interface WorkspaceSettings {
  locale: 'ru-RU'
  firstDayOfWeek: 1
  defaultTimelineScale: TimelineScale
  defaultMoveMode: MoveMode
  autoLinkNewStages: boolean
  capacityWarningThreshold: number
  theme: 'system' | 'light' | 'dark'
}

export interface Workspace {
  id: Id
  name: string
  schemaVersion: 3
  createdAt: string
  updatedAt: string
  revision: number
  settings: WorkspaceSettings
}

export interface Quarter {
  id: QuarterId
  workspaceId: Id
  year: number
  number: 1 | 2 | 3 | 4
  startDate: ISODate
  endDate: ISODate
}

export interface Epic {
  id: Id
  workspaceId: Id
  title: string
  code?: string
  /** Legacy JSON key retained for export compatibility; the value is plain text. */
  descriptionMarkdown: string
  status: EpicStatus
  startDate?: ISODate
  endDate?: ISODate
  marker?: string
  fillStyle?: 'solid' | 'striped'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Stage {
  id: Id
  workspaceId: Id
  epicId: Id
  title: string
  kind: StageKind
  activityTypeId: Id
  status: StageStatus
  /** Legacy JSON key retained for export compatibility; the value is plain text. */
  descriptionMarkdown: string
  startDate: ISODate
  endDate: ISODate
  durationWorkdays: number
  locked: boolean
  sortOrder: number
  quarterIds: QuarterId[]
  externalUrl?: string
  createdAt: string
  updatedAt: string
}

export interface Dependency {
  id: Id
  workspaceId: Id
  epicId: Id
  predecessorStageId: Id
  successorStageId: Id
  type: 'finish_to_start'
  lagWorkdays: number
  createdAt: string
}

export interface ActivityType {
  id: Id
  workspaceId: Id
  name: string
  slug: string
  colorToken: string
  sortOrder: number
  isActive: boolean
}

export interface WorkingCalendar {
  id: Id
  workspaceId: Id
  workingWeekdays: number[]
  holidays: ISODate[]
  extraWorkingDays: ISODate[]
  revision: number
}

export interface Role {
  id: Id
  workspaceId: Id
  name: string
  marker?: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Person {
  id: Id
  workspaceId: Id
  name: string
  primaryRoleId: Id
  roleIds: Id[]
  baseCapacityFte: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Assignment {
  id: Id
  workspaceId: Id
  stageId: Id
  targetType: AssignmentTargetType
  targetId: Id
  units: number
  allocationFte: number
}

export interface WorkItem {
  id: Id
  workspaceId: Id
  epicId: Id
  stageId?: Id
  title: string
  status: WorkItemStatus
  personId?: Id
  externalUrl?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Baseline {
  id: Id
  workspaceId: Id
  name: string
  comment?: string
  quarterIds: QuarterId[]
  epicIds?: Id[]
  createdAt: string
}

export interface BaselineStageSnapshot {
  id: Id
  baselineId: Id
  stageId: Id
  epicId: Id
  title: string
  kind: StageKind
  activityTypeId: Id
  status: StageStatus
  startDate: ISODate
  endDate: ISODate
  durationWorkdays: number
}

export interface BackupSnapshot {
  id: Id
  workspaceId: Id
  name?: string
  reason: BackupReason
  createdAt: string
  schemaVersion: number
  workspaceRevision: number
  sizeBytes: number
  entityCount: number
  payload: string
}

export interface DataIntegrityMetadata {
  id: Id
  workspaceId: Id
  lastSuccessfulSaveAt?: string
  lastIntegrityCheckAt?: string
  lastIntegrityStatus: 'unknown' | 'ok' | 'error'
  lastIntegrityMessage?: string
  lastExportAt?: string
}

export interface PlannerData {
  workspace: Workspace
  quarters: Quarter[]
  epics: Epic[]
  stages: Stage[]
  dependencies: Dependency[]
  activityTypes: ActivityType[]
  roles: Role[]
  people: Person[]
  assignments: Assignment[]
  workItems: WorkItem[]
  baselines: Baseline[]
  baselineStages: BaselineStageSnapshot[]
  calendar: WorkingCalendar
}

export interface EntityPatch<T> {
  id: Id
  before?: T
  after?: T
}

export interface CommandPatch {
  label: string
  epics?: EntityPatch<Epic>[]
  stages?: EntityPatch<Stage>[]
  dependencies?: EntityPatch<Dependency>[]
  roles?: EntityPatch<Role>[]
  people?: EntityPatch<Person>[]
  assignments?: EntityPatch<Assignment>[]
  workItems?: EntityPatch<WorkItem>[]
  baselines?: EntityPatch<Baseline>[]
  baselineStages?: EntityPatch<BaselineStageSnapshot>[]
  calendar?: EntityPatch<WorkingCalendar>[]
}

export interface PlannerCommand {
  id: Id
  label: string
  createdAt: string
  patch: CommandPatch
  inversePatch: CommandPatch
}
