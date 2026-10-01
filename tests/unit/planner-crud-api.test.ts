// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import type { Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../server/app'
import { openDatabase } from '../../server/database'
import { addCalendarDays, fromLocalDate } from '../../app/domain/calendar/date'
import { createEpic, createRole, createStage, nowISO } from '../../app/domain/models/factories'

let server: Server | undefined
let database: ReturnType<typeof openDatabase> | undefined
let directory: string | undefined
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
  database?.db.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
  server = undefined
  database = undefined
  directory = undefined
})

async function setup(persistent = false) {
  if (persistent) directory = mkdtempSync(join(tmpdir(), 'splanner-crud-'))
  const dbPath = directory ? join(directory, 'planner.sqlite') : ':memory:'
  database = openDatabase(dbPath)
  const one = database.createWorkspace('CRUD Alpha', '0042')
  const two = database.createWorkspace('CRUD Beta', '1234')
  server = createApp(database).app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server!.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  const root = `http://127.0.0.1:${address.port}`
  const base = `/api/workspaces/${one.code}`
  const login = async (code: string, pin: string) => {
    const response = await fetch(`${root}/api/workspaces/${code}/edit-session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: root }, body: JSON.stringify({ pin }),
    })
    expect(response.status).toBe(200)
    return response.headers.get('set-cookie')!.split(';')[0]!
  }
  const cookie = await login(one.code, '0042')
  async function request(method: string, path: string, body?: unknown, options: { cookie?: string; origin?: string } = {}) {
    const response = await fetch(`${root}${path.startsWith('/api/') ? path : base + path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: options.origin ?? root, cookie: options.cookie ?? cookie },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, body: await response.json(), headers: response.headers }
  }
  return { request, one, two, base, cookie, login, dbPath }
}

test('HTTP CRUD returns complete resources, ordered unfiltered lists and effective epic dates', async () => {
  const { request } = await setup()
  const today = fromLocalDate(new Date())
  const first = await request('POST', '/epics', { expectedRevision: 0, data: { title: '  Первый эпик  ', sortOrder: 10 } })
  expect(first.status).toBe(201)
  expect(first.headers.get('cache-control')).toBe('no-store')
  expect(first.body).toMatchObject({ revision: 1, data: { title: 'Первый эпик', status: 'active', marker: '#2563eb', descriptionMarkdown: '', startDate: today, endDate: addCalendarDays(today, 3) } })
  const id = first.body.data.id
  const second = await request('POST', '/epics', { expectedRevision: 1, data: { title: 'Авто', startDate: null, endDate: null, status: 'archived' } })
  expect(second.body).toMatchObject({ revision: 2, data: { effectivePeriod: null, sortOrder: 11, status: 'archived' } })
  expect(second.body.data).not.toHaveProperty('startDate')
  const changed = await request('PATCH', `/epics/${id}`, { expectedRevision: 2, data: { code: 'A', descriptionMarkdown: 'Текст\n**без markdown**', marker: null, status: 'paused', startDate: '2026-11-10', endDate: '2026-11-11' } })
  expect(changed.status).toBe(200)
  expect(changed.body.data).not.toHaveProperty('marker')
  expect(changed.body.data.createdAt).toBe(first.body.data.createdAt)
  expect(changed.body.data.descriptionMarkdown).toBe('Текст\n**без markdown**')
  const task = await request('POST', `/epics/${id}/stages`, { expectedRevision: 3, data: { title: 'Этап', activityTypeId: 'activity-development', startDate: '2026-11-09', endDate: '2026-11-12', sortOrder: 7 } })
  expect(task.status).toBe(201)
  expect(task.body).toMatchObject({ revision: 4, data: { epicId: id, kind: 'task', status: 'planned', locked: false, durationWorkdays: 4, quarterIds: ['2026-Q4'], sortOrder: 7 } })
  const scope = await request('POST', `/epics/${id}/stages`, { expectedRevision: 4, data: { title: 'Scope', kind: 'scope', activityTypeId: 'activity-testing', startDate: '2026-11-09', status: 'in_progress' } })
  expect(scope.body.data).toMatchObject({ durationWorkdays: 1, endDate: '2026-11-09', kind: 'scope', sortOrder: 8 })
  const milestone = await request('POST', `/epics/${id}/stages`, { expectedRevision: 5, data: { title: 'Веха', kind: 'milestone', activityTypeId: 'activity-release', startDate: '2026-11-14' } })
  expect(milestone.status).toBe(201)
  expect(milestone.body.data).toMatchObject({ startDate: '2026-11-14', endDate: '2026-11-14', durationWorkdays: 0, sortOrder: 9 })
  const updated = await request('PATCH', `/stages/${scope.body.data.id}`, { expectedRevision: 6, data: { title: 'Новый scope', status: 'done', descriptionMarkdown: 'Описание', activityTypeId: 'activity-integration', externalUrl: 'https://example.com/task', sortOrder: 2 } })
  expect(updated.body).toMatchObject({ revision: 7, data: { title: 'Новый scope', status: 'done', descriptionMarkdown: 'Описание', kind: 'scope' } })
  const epic = await request('GET', `/epics/${id}`)
  expect(epic.body.data.effectivePeriod).toEqual({ startDate: '2026-11-09', endDate: '2026-11-14', durationWorkdays: 5 })
  expect(epic.body.data.startDate).toBe('2026-11-10')
  const all = await request('GET', '/epics')
  expect(all.body.data.map((item: { id: string }) => item.id)).toEqual([id, second.body.data.id])
  const stages = await request('GET', `/epics/${id}/stages`)
  expect(stages.body.data.map((item: { sortOrder: number }) => item.sortOrder)).toEqual([2, 7, 9])
  expect((await request('GET', '/stages')).body).toEqual(stages.body)
  expect((await request('GET', `/stages/${scope.body.data.id}`)).body).toEqual(updated.body)
  const cleared = await request('PATCH', `/epics/${id}`, { expectedRevision: 7, data: { startDate: null, endDate: null, code: null } })
  expect(cleared.body.data).not.toHaveProperty('startDate')
  expect(cleared.body.data).not.toHaveProperty('code')
  expect(cleared.body.data.effectivePeriod).toEqual(epic.body.data.effectivePeriod)
  expect((await request('GET', '')).body.data.workspace.revision).toBe(8)
})

test('invalid CRUD inputs do not write data, revisions or backups', async () => {
  const { request, one } = await setup()
  const created = await request('POST', '/epics', { expectedRevision: 0, data: { title: 'Эпик' } })
  const id = created.body.data.id
  const stage = await request('POST', `/epics/${id}/stages`, { expectedRevision: 1, data: { title: 'Этап', activityTypeId: 'activity-development', startDate: '2026-11-09' } })
  const stageId = stage.body.data.id
  const before = database!.load(one.code)
  const backups = database!.listBackups(one.code)
  const invalidEpics = [
    { title: '   ' }, { status: 'blocked' }, { startDate: '2026-02-30' },
    { startDate: '2026-11-12', endDate: '2026-11-10' }, { startDate: null },
    { id: 'replacement' }, { workspaceId: 'foreign' }, { createdAt: nowISO() },
    { effectivePeriod: null }, { sortOrder: -1 }, {},
  ]
  for (const data of invalidEpics) {
    expect((await request('PATCH', `/epics/${id}`, { expectedRevision: 2, data })).status).toBe(422)
  }
  const invalidStages = [
    { title: '' }, { status: 'active' }, { startDate: '2026-13-01' }, { endDate: '2026-11-08' },
    { startDate: '2026-11-14', endDate: '2026-11-15' }, { activityTypeId: 'missing' },
    { externalUrl: 'javascript:alert(1)' }, { externalUrl: 'bad' }, { epicId: id },
    { durationWorkdays: 50 }, { quarterIds: [] }, { updatedAt: nowISO() }, {},
    { kind: 'milestone', startDate: '2026-11-09', endDate: '2026-11-10' },
  ]
  for (const data of invalidStages) {
    expect((await request('PATCH', `/stages/${stageId}`, { expectedRevision: 2, data })).status).toBe(422)
  }
  const badMilestone = { title: 'Веха', kind: 'milestone', activityTypeId: 'activity-release', startDate: '2026-11-09', endDate: '2026-11-10' }
  expect((await request('POST', `/epics/${id}/stages`, { expectedRevision: 2, data: badMilestone })).status).toBe(422)
  expect((await request('POST', '/epics', { expectedRevision: 2, data: { title: 'Авто', startDate: null } })).status).toBe(422)
  for (const expectedRevision of [undefined, null, '2', -1, 1.5]) {
    expect((await request('PATCH', `/epics/${id}`, { expectedRevision, data: { title: 'Не записать' } })).status).toBe(400)
  }
  const unknown = await request('PATCH', `/stages/${stageId}`, { expectedRevision: 2, data: { unknown: true } })
  expect(unknown.body.issues).toBeDefined()
  expect((await request('DELETE', `/stages/${stageId}`, { expectedRevision: 2, force: true })).status).toBe(422)
  expect(database!.load(one.code)).toEqual(before)
  expect(database!.listBackups(one.code)).toEqual(backups)
})

test('all CRUD writes enforce session, origin and workspace isolation', async () => {
  const { request, one, two, login } = await setup()
  const created = await request('POST', '/epics', { expectedRevision: 0, data: { title: 'Alpha' } })
  const id = created.body.data.id
  const stage = await request('POST', `/epics/${id}/stages`, { expectedRevision: 1, data: { title: 'Этап', activityTypeId: 'activity-development', startDate: '2026-11-09' } })
  const sid = stage.body.data.id
  const operations = [
    ['POST', '/epics', { title: 'Не создавать' }], ['PATCH', `/epics/${id}`, { title: 'Не менять' }], ['DELETE', `/epics/${id}`, undefined],
    ['POST', `/epics/${id}/stages`, { title: 'Не создавать' }], ['PATCH', `/stages/${sid}`, { title: 'Не менять' }], ['DELETE', `/stages/${sid}`, undefined],
  ] as const
  for (const [method, path, data] of operations) {
    expect((await request(method, path, { expectedRevision: 2, data }, { cookie: '' })).status).toBe(403)
  }
  expect((await request('GET', '/epics', undefined, { cookie: '' })).status).toBe(200)
  expect((await request('PATCH', `/epics/${id}`, { expectedRevision: 2, data: { title: 'Другой origin' } }, { origin: 'https://evil.example' })).status).toBe(403)
  const beta = `/api/workspaces/${two.code}`
  expect((await request('POST', `${beta}/epics`, { expectedRevision: 0, data: { title: 'Beta' } })).status).toBe(403)
  const betaCookie = await login(two.code, '1234')
  const options = { cookie: betaCookie }
  for (const path of [`/epics/${id}`, `/epics/${id}/stages`, `/stages/${sid}`]) {
    expect((await request('GET', beta + path, undefined, options)).status).toBe(404)
  }
  expect((await request('PATCH', `${beta}/epics/${id}`, { expectedRevision: 0, data: { title: 'Foreign' } }, options)).status).toBe(404)
  expect((await request('POST', `${beta}/epics/${id}/stages`, { expectedRevision: 0, data: { title: 'Foreign' } }, options)).status).toBe(404)
  expect((await request('DELETE', `${beta}/stages/${sid}`, { expectedRevision: 0 }, options)).status).toBe(404)
  expect((await request('GET', '/api/workspaces/missing/epics')).status).toBe(404)
  database!.db.prepare('UPDATE edit_sessions SET expires_at = ? WHERE workspace_id = ?').run(Date.now() - 1, one.id)
  for (const [method, path, data] of operations) {
    expect((await request(method, path, { expectedRevision: 2, data })).status).toBe(403)
  }
  expect(database!.load(one.code).workspace.revision).toBe(2)
  expect(database!.load(two.code).workspace.revision).toBe(0)
})

test('concurrent CRUD and whole-workspace writes share revision protection', async () => {
  const { request, one } = await setup()
  const original = database!.load(one.code)
  const create = () => request('POST', '/epics', { expectedRevision: 0, data: { title: 'Один победитель' } })
  const concurrent = await Promise.all([create(), create()])
  expect(concurrent.map(result => result.status).sort()).toEqual([201, 409])
  expect(concurrent.find(result => result.status === 409)!.body.currentRevision).toBe(1)
  expect((await request('PUT', '', { expectedRevision: 0, data: original })).status).toBe(409)
  const epic = database!.load(one.code).epics[0]!
  const changed = database!.load(one.code)
  changed.workspace.name = 'SPA save'
  expect((await request('PUT', '', { expectedRevision: 1, data: changed })).status).toBe(200)
  expect((await request('PATCH', `/epics/${epic.id}`, { expectedRevision: 1, data: { title: 'Устаревшее' } })).status).toBe(409)
  expect(database!.load(one.code).epics).toHaveLength(1)
  expect(database!.load(one.code).epics[0]!.title).toBe('Один победитель')
  expect(database!.load(one.code).workspace.name).toBe('SPA save')
})

function seedRelations(code: string) {
  const data = database!.load(code)
  const epic = createEpic(data.workspace.id, 'Связанный эпик')
  const otherEpic = createEpic(data.workspace.id, 'Другой эпик', 1)
  const predecessor = createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'Предшественник', kind: 'task', activityTypeId: 'activity-development', startDate: '2026-11-09', endDate: '2026-11-10', calendar: data.calendar })
  const successor = createStage({ workspaceId: data.workspace.id, epicId: epic.id, title: 'Последователь', kind: 'scope', activityTypeId: 'activity-testing', startDate: '2026-11-11', endDate: '2026-11-12', calendar: data.calendar })
  const otherStage = createStage({ workspaceId: data.workspace.id, epicId: otherEpic.id, title: 'Другой этап', kind: 'task', activityTypeId: 'activity-development', startDate: '2026-11-09', calendar: data.calendar })
  const role = createRole(data.workspace.id, 'Разработчик')
  const timestamp = nowISO()
  data.workspace.settings.autoLinkNewStages = true
  data.epics.push(epic, otherEpic)
  data.stages.push(predecessor, successor, otherStage)
  data.roles.push(role)
  data.dependencies.push({ id: 'dependency-test', workspaceId: data.workspace.id, epicId: epic.id, predecessorStageId: predecessor.id, successorStageId: successor.id, type: 'finish_to_start', lagWorkdays: 0, createdAt: timestamp })
  data.assignments.push({ id: 'assignment-test', workspaceId: data.workspace.id, stageId: predecessor.id, targetType: 'role', targetId: role.id, units: 1, allocationFte: 1 })
  data.workItems.push(
    { id: 'work-test', workspaceId: data.workspace.id, epicId: epic.id, stageId: predecessor.id, title: 'Задача', status: 'todo', sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: 'work-other', workspaceId: data.workspace.id, epicId: otherEpic.id, stageId: otherStage.id, title: 'Другая задача', status: 'todo', sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
  )
  data.baselines.push({ id: 'baseline-test', workspaceId: data.workspace.id, name: 'До удаления', quarterIds: ['2026-Q4'], epicIds: [epic.id, otherEpic.id], createdAt: timestamp })
  data.baselineStages.push({ id: 'snapshot-test', baselineId: 'baseline-test', stageId: predecessor.id, epicId: epic.id, title: predecessor.title, kind: predecessor.kind, activityTypeId: predecessor.activityTypeId, status: predecessor.status, startDate: predecessor.startDate, endDate: predecessor.endDate, durationWorkdays: predecessor.durationWorkdays })
  database!.save(code, 0, data)
  return { epic, otherEpic, predecessor, successor, otherStage }
}

test('date changes recalculate only the target; locks, milestones and new quarters work', async () => {
  const { request, one } = await setup()
  const { epic, predecessor, successor } = seedRelations(one.code)
  const unchanged = database!.load(one.code).stages.find(item => item.id === successor.id)
  const moved = await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 1, data: { startDate: '2027-03-31', endDate: '2027-04-02' } })
  expect(moved.status).toBe(200)
  expect(moved.body.data).toMatchObject({ durationWorkdays: 3, quarterIds: ['2027-Q1', '2027-Q2'] })
  expect(database!.load(one.code).quarters.map(item => item.id)).toEqual(expect.arrayContaining(['2027-Q1', '2027-Q2']))
  expect(database!.load(one.code).stages.find(item => item.id === successor.id)).toEqual(unchanged)
  expect((await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 2, data: { locked: true } })).status).toBe(200)
  expect((await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 3, data: { locked: false, startDate: '2027-04-01' } })).status).toBe(423)
  expect((await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 3, data: { kind: 'milestone' } })).status).toBe(423)
  expect((await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 3, data: { locked: false } })).status).toBe(200)
  const milestone = await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 4, data: { kind: 'milestone', startDate: '2027-04-03' } })
  expect(milestone.body.data).toMatchObject({ endDate: '2027-04-03', durationWorkdays: 0, quarterIds: ['2027-Q2'] })
  expect(database!.load(one.code).assignments).toEqual([])
  const milestoneMoved = await request('PATCH', `/stages/${predecessor.id}`, { expectedRevision: 5, data: { startDate: '2027-04-04' } })
  expect(milestoneMoved.body.data.endDate).toBe('2027-04-04')
  const newStage = await request('POST', `/epics/${epic.id}/stages`, { expectedRevision: 6, data: { title: 'Без автоматики', activityTypeId: 'activity-development', startDate: '2026-11-09', externalUrl: 'https://example.com/' } })
  expect(newStage.status).toBe(201)
  expect(database!.load(one.code).dependencies).toHaveLength(1)
  expect(database!.load(one.code).assignments).toEqual([])
  const cleared = await request('PATCH', `/stages/${newStage.body.data.id}`, { expectedRevision: 7, data: { externalUrl: null } })
  expect(cleared.body.data).not.toHaveProperty('externalUrl')
})

test('stage deletion detaches work items, preserves snapshots and can be restored from backup', async () => {
  const { request, one } = await setup()
  const { predecessor, successor } = seedRelations(one.code)
  const before = database!.load(one.code)
  const result = await request('DELETE', `/stages/${predecessor.id}`, { expectedRevision: 1 })
  expect(result.body).toMatchObject({ data: { deletedId: predecessor.id }, revision: 2 })
  expect(result.status).toBe(200)
  const after = database!.load(one.code)
  expect(after.dependencies).toEqual([])
  expect(after.assignments).toEqual([])
  expect(after.workItems.find(item => item.id === 'work-test')).not.toHaveProperty('stageId')
  expect(after.stages.find(item => item.id === successor.id)).toEqual(before.stages.find(item => item.id === successor.id))
  expect(after.baselineStages).toEqual(before.baselineStages)
  expect((await request('GET', `/stages/${predecessor.id}`)).status).toBe(404)
  expect((await request('DELETE', `/stages/${predecessor.id}`, { expectedRevision: 2 })).status).toBe(404)
  const backup = database!.listBackups(one.code).find(item => item.reason === 'before_delete')!
  expect(JSON.parse(database!.getBackup(one.code, backup.id).payload)).toEqual(before)
  const restored = await request('POST', `/backups/${backup.id}/restore`, { expectedRevision: 2 })
  expect(restored.status).toBe(200)
  expect(restored.body.data.workspace.revision).toBe(3)
  expect(restored.body.data.stages).toEqual(before.stages)
})

test('epic deletion cleans live references, retains baseline history and leaves other workspace intact', async () => {
  const { request, one, two } = await setup()
  const { epic, otherEpic, otherStage } = seedRelations(one.code)
  const before = database!.load(one.code)
  const beta = database!.load(two.code)
  const result = await request('DELETE', `/epics/${epic.id}`, { expectedRevision: 1 })
  expect(result.status).toBe(200)
  expect(result.body).toMatchObject({ data: { deletedId: epic.id }, revision: 2 })
  const after = database!.load(one.code)
  expect(after.epics.map(item => item.id)).toEqual([otherEpic.id])
  expect(after.stages.map(item => item.id)).toEqual([otherStage.id])
  expect(after.dependencies).toEqual([])
  expect(after.assignments).toEqual([])
  expect(after.workItems.map(item => item.id)).toEqual(['work-other'])
  expect(after.baselines[0]!.epicIds).toEqual([otherEpic.id])
  expect(after.baselineStages).toEqual(before.baselineStages)
  expect(database!.load(two.code)).toEqual(beta)
  expect((await request('GET', `/epics/${epic.id}`)).status).toBe(404)
  expect((await request('GET', `/epics/${epic.id}/stages`)).status).toBe(404)
  const backup = database!.listBackups(one.code).find(item => item.reason === 'before_delete')!
  const restored = await request('POST', `/backups/${backup.id}/restore`, { expectedRevision: 2 })
  expect(restored.status).toBe(200)
  expect(restored.body.data.epics).toEqual(before.epics)
  expect(restored.body.data.baselines).toEqual(before.baselines)
})

test('CRUD changes survive closing and reopening SQLite', async () => {
  const { request, one, dbPath } = await setup(true)
  const epic = await request('POST', '/epics', { expectedRevision: 0, data: { title: 'После рестарта' } })
  const stage = await request('POST', `/epics/${epic.body.data.id}/stages`, { expectedRevision: 1, data: { title: 'Веха', kind: 'milestone', activityTypeId: 'activity-release', startDate: '2026-11-10' } })
  const changed = await request('PATCH', `/stages/${stage.body.data.id}`, { expectedRevision: 2, data: { startDate: '2026-11-11', descriptionMarkdown: 'Сохранённое описание', status: 'done' } })
  expect(changed.status).toBe(200)
  const before = database!.load(one.code)
  await new Promise<void>(resolve => server!.close(() => resolve()))
  server = undefined
  database!.db.close()
  database = openDatabase(dbPath)
  expect(database.load(one.code)).toEqual(before)
  expect(database.load(one.code).workspace.revision).toBe(3)
})

test('epic fill style persists and rejects unsupported values', async () => {
  const { request, one } = await setup()
  const created = await request('POST', '/epics', { expectedRevision: 0, data: { title: 'Техдолг', fillStyle: 'striped' } })
  expect(created.status).toBe(201)
  const id = created.body.data.id
  expect(database!.load(one.code).epics.find(epic => epic.id === id)?.fillStyle).toBe('striped')
  expect((await request('GET', `/epics/${id}`)).body.data.fillStyle).toBe('striped')
  const invalid = await request('PATCH', `/epics/${id}`, { expectedRevision: 1, data: { fillStyle: 'dots' } })
  expect(invalid.status).toBe(422)
  expect(database!.load(one.code).workspace.revision).toBe(1)
  const updated = await request('PATCH', `/epics/${id}`, { expectedRevision: 1, data: { fillStyle: 'solid' } })
  expect(updated.status).toBe(200)
  expect((await request('GET', `/epics/${id}`)).body.data.fillStyle).toBe('solid')
})
