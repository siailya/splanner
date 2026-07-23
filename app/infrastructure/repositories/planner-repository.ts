import type { BackupReason, BackupSnapshot, DataIntegrityMetadata, Id, PlannerData, QuarterId } from '../../domain/models/types'
import type { EntityTable } from 'dexie'
import { createDefaultWorkspace, newId, nowISO } from '../../domain/models/factories'
import type { PlannerDatabase } from '../db/database'
import { usePlannerDatabase } from '../db/database'

export class PlannerRepository {
  constructor(private readonly db: PlannerDatabase = usePlannerDatabase()) {}

  async initialize(): Promise<PlannerData> {
    const workspace = await this.db.workspaces.toCollection().first()
    if (workspace) return this.loadAll(workspace.id)
    const initial = createDefaultWorkspace()
    await this.replaceAll(initial)
    return initial
  }

  async loadAll(workspaceId: Id): Promise<PlannerData> {
    const [workspace, quarters, epics, stages, dependencies, activityTypes, roles, people, assignments, workItems, baselines, baselineStages, calendar] = await Promise.all([
      this.db.workspaces.get(workspaceId),
      this.db.quarters.where('workspaceId').equals(workspaceId).sortBy('startDate'),
      this.db.epics.where('workspaceId').equals(workspaceId).sortBy('sortOrder'),
      this.db.stages.where('workspaceId').equals(workspaceId).sortBy('sortOrder'),
      this.db.dependencies.toArray(),
      this.db.activityTypes.where('workspaceId').equals(workspaceId).sortBy('sortOrder'),
      this.db.roles.where('workspaceId').equals(workspaceId).sortBy('sortOrder'),
      this.db.people.where('workspaceId').equals(workspaceId).sortBy('sortOrder'),
      this.db.assignments.toArray(),
      this.db.workItems.toArray(),
      this.db.baselines.where('workspaceId').equals(workspaceId).reverse().sortBy('createdAt'),
      this.db.baselineStages.toArray(),
      this.db.calendars.where('workspaceId').equals(workspaceId).first(),
    ])
    if (!workspace || !calendar) throw new Error('Workspace повреждён: отсутствует workspace или календарь')
    const epicIds = new Set(epics.map(epic => epic.id))
    return {
      workspace,
      quarters,
      epics,
      stages,
      dependencies: dependencies.filter(dependency => epicIds.has(dependency.epicId)),
      activityTypes,
      roles,
      people,
      assignments: assignments.filter(assignment => assignment.workspaceId === workspaceId),
      workItems: workItems.filter(item => item.workspaceId === workspaceId),
      baselines,
      baselineStages: baselineStages.filter(item => baselines.some(baseline => baseline.id === item.baselineId)),
      calendar,
    }
  }

  async loadQuarterSlice(workspaceId: Id, quarterIds: QuarterId[]): Promise<Pick<PlannerData, 'epics' | 'stages' | 'dependencies'>> {
    const [epics, stages] = await Promise.all([
      this.db.epics.where('workspaceId').equals(workspaceId).sortBy('sortOrder'),
      this.db.stages.where('quarterIds').anyOf(quarterIds).toArray(),
    ])
    const stageIds = new Set(stages.map(stage => stage.id))
    const dependencies = (await this.db.dependencies.toArray()).filter(dependency =>
      stageIds.has(dependency.predecessorStageId) || stageIds.has(dependency.successorStageId),
    )
    return { epics, stages, dependencies }
  }

  async save(data: PlannerData): Promise<void> {
    const workspace = {
      ...data.workspace,
      revision: data.workspace.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    data.workspace = workspace
    await this.db.transaction(
      'rw',
      [this.db.workspaces, this.db.quarters, this.db.epics, this.db.stages, this.db.dependencies, this.db.activityTypes, this.db.roles, this.db.people, this.db.assignments, this.db.workItems, this.db.baselines, this.db.baselineStages, this.db.calendars, this.db.integrityMetadata],
      async () => {
        await this.db.workspaces.put(workspace)
        await Promise.all([
          this.syncTable(this.db.quarters, data.quarters, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.epics, data.epics, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.stages, data.stages, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.dependencies, data.dependencies, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.activityTypes, data.activityTypes, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.roles, data.roles, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.people, data.people, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.assignments, data.assignments, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.workItems, data.workItems, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.baselines, data.baselines, item => item.workspaceId === workspace.id),
          this.syncTable(this.db.baselineStages, data.baselineStages, item => data.baselines.some(baseline => baseline.id === item.baselineId)),
          this.syncTable(this.db.calendars, [data.calendar], item => item.workspaceId === workspace.id),
          this.db.integrityMetadata.put({
            id: `integrity:${workspace.id}`,
            workspaceId: workspace.id,
            lastSuccessfulSaveAt: workspace.updatedAt,
            lastIntegrityStatus: 'ok',
          }),
        ])
      },
    )
  }

  async replaceAll(data: PlannerData): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.workspaces, this.db.quarters, this.db.epics, this.db.stages, this.db.dependencies, this.db.activityTypes, this.db.roles, this.db.people, this.db.assignments, this.db.workItems, this.db.baselines, this.db.baselineStages, this.db.calendars, this.db.integrityMetadata],
      async () => {
        await Promise.all([
          this.db.workspaces.clear(),
          this.db.quarters.clear(),
          this.db.epics.clear(),
          this.db.stages.clear(),
          this.db.dependencies.clear(),
          this.db.activityTypes.clear(),
          this.db.roles.clear(),
          this.db.people.clear(),
          this.db.assignments.clear(),
          this.db.workItems.clear(),
          this.db.baselines.clear(),
          this.db.baselineStages.clear(),
          this.db.calendars.clear(),
        ])
        await this.db.workspaces.add(data.workspace)
        await Promise.all([
          this.db.quarters.bulkAdd(data.quarters),
          this.db.epics.bulkAdd(data.epics),
          this.db.stages.bulkAdd(data.stages),
          this.db.dependencies.bulkAdd(data.dependencies),
          this.db.activityTypes.bulkAdd(data.activityTypes),
          this.db.roles.bulkAdd(data.roles),
          this.db.people.bulkAdd(data.people),
          this.db.assignments.bulkAdd(data.assignments),
          this.db.workItems.bulkAdd(data.workItems),
          this.db.baselines.bulkAdd(data.baselines),
          this.db.baselineStages.bulkAdd(data.baselineStages),
          this.db.calendars.add(data.calendar),
          this.db.integrityMetadata.put({
            id: `integrity:${data.workspace.id}`,
            workspaceId: data.workspace.id,
            lastSuccessfulSaveAt: nowISO(),
            lastIntegrityStatus: 'ok',
          }),
        ])
      },
    )
  }

  async createBackup(data: PlannerData, reason: BackupReason, name?: string): Promise<BackupSnapshot> {
    const payload = JSON.stringify(data)
    const backup: BackupSnapshot = {
      id: newId('backup'),
      workspaceId: data.workspace.id,
      name: name?.trim() || undefined,
      reason,
      createdAt: nowISO(),
      schemaVersion: data.workspace.schemaVersion,
      workspaceRevision: data.workspace.revision,
      sizeBytes: new Blob([payload]).size,
      entityCount: data.epics.length + data.stages.length + data.dependencies.length + data.roles.length
        + data.people.length + data.assignments.length + data.workItems.length + data.baselines.length,
      payload,
    }
    await this.db.backups.add(backup)
    await this.pruneBackups(data.workspace.id)
    return backup
  }

  async listBackups(workspaceId?: Id): Promise<BackupSnapshot[]> {
    const values = workspaceId
      ? await this.db.backups.where('workspaceId').equals(workspaceId).toArray()
      : await this.db.backups.toArray()
    return values.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async getBackup(id: Id): Promise<BackupSnapshot | undefined> {
    return this.db.backups.get(id)
  }

  async deleteBackup(id: Id): Promise<void> {
    await this.db.backups.delete(id)
  }

  async shouldCreateDailyBackup(workspaceId: Id, revision: number): Promise<boolean> {
    const latest = (await this.listBackups(workspaceId)).find(item => item.reason === 'daily')
    if (!latest) return revision > 0
    const elapsed = Date.now() - Date.parse(latest.createdAt)
    return elapsed >= 24 * 60 * 60 * 1000 && revision > (latest.workspaceRevision ?? -1)
  }

  async getIntegrityMetadata(workspaceId: Id): Promise<DataIntegrityMetadata | undefined> {
    return this.db.integrityMetadata.get(`integrity:${workspaceId}`)
  }

  async updateIntegrityMetadata(workspaceId: Id, patch: Partial<DataIntegrityMetadata>): Promise<void> {
    const id = `integrity:${workspaceId}`
    const current = await this.db.integrityMetadata.get(id)
    await this.db.integrityMetadata.put({
      id,
      workspaceId,
      lastIntegrityStatus: 'unknown',
      ...current,
      ...patch,
    })
  }

  private async pruneBackups(_workspaceId: Id): Promise<void> {
    const backups = await this.listBackups()
    let total = 0
    const keep = new Set<string>()
    for (const backup of backups) {
      if (keep.size >= 10 || total + backup.sizeBytes > 20 * 1024 * 1024) continue
      keep.add(backup.id)
      total += backup.sizeBytes
    }
    const remove = backups.filter(item => !keep.has(item.id)).map(item => item.id)
    if (remove.length) await this.db.backups.bulkDelete(remove)
  }

  private async syncTable<T extends { id: string }>(
    table: EntityTable<T, 'id'>,
    values: T[],
    belongsToWorkspace: (item: T) => boolean,
  ): Promise<void> {
    const existing = (await table.toArray()).filter(belongsToWorkspace)
    const nextIds = new Set(values.map(value => value.id))
    const removedIds = existing.filter(value => !nextIds.has(value.id)).map(value => value.id)
    if (removedIds.length > 0) await table.bulkDelete(removedIds as never[])
    if (values.length > 0) await table.bulkPut(values)
  }
}
