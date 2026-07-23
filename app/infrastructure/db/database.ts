import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityType,
  Assignment,
  BackupSnapshot,
  Baseline,
  BaselineStageSnapshot,
  DataIntegrityMetadata,
  Dependency,
  Epic,
  Person,
  Quarter,
  Role,
  Stage,
  WorkingCalendar,
  Workspace,
  WorkItem,
} from '../../domain/models/types'

export interface UiSetting {
  key: string
  value: unknown
}

export class PlannerDatabase extends Dexie {
  workspaces!: EntityTable<Workspace, 'id'>
  quarters!: EntityTable<Quarter, 'id'>
  epics!: EntityTable<Epic, 'id'>
  stages!: EntityTable<Stage, 'id'>
  dependencies!: EntityTable<Dependency, 'id'>
  activityTypes!: EntityTable<ActivityType, 'id'>
  calendars!: EntityTable<WorkingCalendar, 'id'>
  settings!: EntityTable<UiSetting, 'key'>
  roles!: EntityTable<Role, 'id'>
  people!: EntityTable<Person, 'id'>
  assignments!: EntityTable<Assignment, 'id'>
  workItems!: EntityTable<WorkItem, 'id'>
  baselines!: EntityTable<Baseline, 'id'>
  baselineStages!: EntityTable<BaselineStageSnapshot, 'id'>
  backups!: EntityTable<BackupSnapshot, 'id'>
  integrityMetadata!: EntityTable<DataIntegrityMetadata, 'id'>

  constructor(name = 'delivery-planner') {
    super(name)
    this.version(1).stores({
      workspaces: 'id, updatedAt',
      quarters: 'id, workspaceId, year, number',
      epics: 'id, workspaceId, [workspaceId+status], sortOrder',
      stages: 'id, workspaceId, epicId, *quarterIds, startDate, endDate, status, activityTypeId',
      dependencies: 'id, epicId, predecessorStageId, successorStageId',
      activityTypes: 'id, workspaceId, sortOrder',
      calendars: 'id, workspaceId',
      settings: 'key',
    })
    this.version(2).stores({
      workspaces: 'id, updatedAt',
      quarters: 'id, workspaceId, year, number',
      epics: 'id, workspaceId, [workspaceId+status], sortOrder',
      stages: 'id, workspaceId, epicId, *quarterIds, startDate, endDate, status, activityTypeId',
      dependencies: 'id, epicId, predecessorStageId, successorStageId',
      activityTypes: 'id, workspaceId, sortOrder',
      calendars: 'id, workspaceId',
      settings: 'key',
      roles: 'id, workspaceId, sortOrder, isActive',
      people: 'id, workspaceId, primaryRoleId, *roleIds, sortOrder, isActive',
      assignments: 'id, stageId, [targetType+targetId]',
      workItems: 'id, epicId, stageId, status, personId, sortOrder',
    }).upgrade(async (transaction) => {
      await transaction.table('workspaces').toCollection().modify((workspace: Record<string, unknown>) => {
        workspace.schemaVersion = 2
      })
    })
    this.version(3).stores({
      workspaces: 'id, updatedAt',
      quarters: 'id, workspaceId, year, number',
      epics: 'id, workspaceId, [workspaceId+status], sortOrder',
      stages: 'id, workspaceId, epicId, *quarterIds, startDate, endDate, status, activityTypeId',
      dependencies: 'id, epicId, predecessorStageId, successorStageId',
      activityTypes: 'id, workspaceId, sortOrder',
      calendars: 'id, workspaceId',
      settings: 'key',
      roles: 'id, workspaceId, sortOrder, isActive',
      people: 'id, workspaceId, primaryRoleId, *roleIds, sortOrder, isActive',
      assignments: 'id, stageId, [targetType+targetId]',
      workItems: 'id, epicId, stageId, status, personId, sortOrder',
      baselines: 'id, workspaceId, createdAt, *quarterIds',
      baselineStages: 'id, baselineId, stageId, epicId',
      backups: 'id, workspaceId, createdAt, reason',
      integrityMetadata: 'id, workspaceId',
    }).upgrade(async (transaction) => {
      await transaction.table('workspaces').toCollection().modify((workspace: Record<string, unknown>) => {
        workspace.schemaVersion = 3
      })
    })
  }
}

let database: PlannerDatabase | undefined

export function usePlannerDatabase(): PlannerDatabase {
  database ??= new PlannerDatabase()
  return database
}

export async function deletePlannerDatabase(): Promise<void> {
  database?.close()
  database = undefined
  await Dexie.delete('delivery-planner')
}
