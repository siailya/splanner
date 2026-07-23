import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PlannerDatabase } from '../../app/infrastructure/db/database'
import { PlannerRepository } from '../../app/infrastructure/repositories/planner-repository'
import { createDefaultWorkspace, createEpic, createStage } from '../../app/domain/models/factories'
import { parseWorkspaceExport, replaceWorkspaceAtomically, serializeWorkspace, validateReferences } from '../../app/infrastructure/files/workspace-transfer'

const databases: PlannerDatabase[] = []
function repository() {
  const db = new PlannerDatabase(`test-${crypto.randomUUID()}`)
  databases.push(db)
  return new PlannerRepository(db)
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async db => { const name = db.name; db.close(); await PlannerDatabase.delete(name) }))
})

describe('Dexie persistence and transfer', () => {
  it('restores an equivalent workspace after reload', async () => {
    const repo = repository()
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    const epic = createEpic(data.workspace.id, 'CPM–CPA аукцион')
    data.epics.push(epic)
    data.stages.push(createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'Research', kind: 'task', activityTypeId: data.activityTypes[0]!.id, startDate: '2026-07-22', endDate: '2026-07-24', calendar: data.calendar }))
    await repo.replaceAll(data)
    expect(await repo.loadAll(data.workspace.id)).toEqual(data)
  })

  it('round-trips a full workspace JSON', () => {
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    const parsed = parseWorkspaceExport(serializeWorkspace(data))
    expect(parsed.schemaVersion).toBe(3)
    expect(parsed.application).toBe('delivery-planner')
    expect(parsed.workspace).toEqual(data)
  })

  it('migrates an iteration-1 export through schema v3 without changing schedule', () => {
    const legacy = JSON.parse(serializeWorkspace(createDefaultWorkspace(new Date(2026, 6, 22))))
    legacy.schemaVersion = 1
    legacy.workspace.workspace.schemaVersion = 1
    delete legacy.workspace.roles
    delete legacy.workspace.people
    delete legacy.workspace.assignments
    delete legacy.workspace.workItems
    const migrated = parseWorkspaceExport(JSON.stringify(legacy))
    delete legacy.workspace.baselines
    delete legacy.workspace.baselineStages
    expect(migrated.workspace.workspace.schemaVersion).toBe(3)
    expect(migrated.workspace.roles).toEqual([])
    expect(migrated.workspace.assignments).toEqual([])
    expect(migrated.workspace.baselines).toEqual([])
    expect(migrated.workspace.baselineStages).toEqual([])
  })

  it('creates, rotates and restores persistent backup payloads', async () => {
    const repo = repository()
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    await repo.replaceAll(data)
    const backup = await repo.createBackup(data, 'manual', 'Перед демо')
    expect(backup.sizeBytes).toBeGreaterThan(0)
    expect(backup.entityCount).toBe(0)
    expect((await repo.listBackups())[0]).toMatchObject({ reason: 'manual', name: 'Перед демо' })
    expect(JSON.parse((await repo.getBackup(backup.id))!.payload).workspace.id).toBe(data.workspace.id)
  })

  it('migrates an existing IndexedDB schema v2 to v3 transactionally', async () => {
    const name = `migration-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(2).stores({
      workspaces: 'id, updatedAt', quarters: 'id, workspaceId', epics: 'id, workspaceId',
      stages: 'id, workspaceId', dependencies: 'id', activityTypes: 'id, workspaceId',
      calendars: 'id, workspaceId', settings: 'key', roles: 'id, workspaceId',
      people: 'id, workspaceId', assignments: 'id, stageId', workItems: 'id, epicId',
    })
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    await legacy.table('workspaces').put({ ...data.workspace, schemaVersion: 2 })
    legacy.close()
    const upgraded = new PlannerDatabase(name)
    databases.push(upgraded)
    expect((await upgraded.workspaces.get(data.workspace.id))?.schemaVersion).toBe(3)
    expect(await upgraded.baselines.count()).toBe(0)
    expect(await upgraded.backups.count()).toBe(0)
  })

  it('rejects broken references and keeps current IndexedDB state', async () => {
    const repo = repository()
    const current = createDefaultWorkspace(new Date(2026, 6, 22))
    current.workspace.name = 'Текущий план'
    await repo.replaceAll(current)
    const invalid = JSON.parse(serializeWorkspace(current))
    invalid.workspace.stages.push({ id: 'broken', workspaceId: current.workspace.id, epicId: 'missing' })
    await expect(replaceWorkspaceAtomically(repo, current, JSON.stringify(invalid))).rejects.toThrow()
    expect((await repo.loadAll(current.workspace.id)).workspace.name).toBe('Текущий план')
  })

  it('rejects duplicate IDs before any write', () => {
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    const first = createEpic(data.workspace.id, 'First')
    const duplicate = { ...createEpic(data.workspace.id, 'Duplicate'), id: first.id }
    data.epics.push(first, duplicate)
    expect(() => validateReferences(data)).toThrow('повторяющиеся ID')
  })

  it('exports a quarter slice with only required linked entities', () => {
    const data = createDefaultWorkspace(new Date(2026, 6, 22))
    const epic = createEpic(data.workspace.id, 'Cross-quarter')
    const q3 = createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'Q3', kind: 'task', activityTypeId: data.activityTypes[0]!.id, startDate: '2026-09-29', endDate: '2026-10-02', calendar: data.calendar })
    const q4 = createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'Q4', kind: 'task', activityTypeId: data.activityTypes[1]!.id, startDate: '2026-12-01', endDate: '2026-12-02', calendar: data.calendar })
    data.epics.push(epic)
    data.stages.push(q3, q4)
    const parsed = parseWorkspaceExport(serializeWorkspace(data, { quarterIds: ['2026-Q3'] }))
    expect(parsed.workspace.stages.map(item => item.title)).toEqual(['Q3'])
    expect(parsed.workspace.epics.map(item => item.id)).toEqual([epic.id])
    expect(parsed.workspace.activityTypes.map(item => item.id)).toEqual([q3.activityTypeId])
  })

  it('keeps the bundled sample workspace importable', () => {
    const sample = readFileSync(resolve(process.cwd(), 'samples/mvp-workspace.json'), 'utf8')
    const parsed = parseWorkspaceExport(sample)
    expect(parsed.workspace.epics[0]?.title).toBe('CPM–CPA аукцион')
    expect(parsed.workspace.baselines).toHaveLength(1)
  })
})
