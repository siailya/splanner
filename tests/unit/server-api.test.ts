// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import type { Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../server/app'
import { openDatabase } from '../../server/database'

let server: Server | undefined
let db: ReturnType<typeof openDatabase> | undefined
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); db?.db.close(); server = undefined; db = undefined })

async function setup() {
  db = openDatabase(':memory:')
  const one = db.createWorkspace('Alpha', '0042')
  const two = db.createWorkspace('Beta', '1234')
  const app = createApp(db).app
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server!.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  const root = `http://127.0.0.1:${address.port}`
  const path = (code: string) => `${root}/api/workspaces/${code}`
  const postPin = async (code: string, pin: string) => {
    const response = await fetch(`${path(code)}/edit-session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: root }, body: JSON.stringify({ pin }) })
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' }
  }
  return { one, two, root, path, postPin }
}

test('workspace, PIN and sessions remain isolated; revisions reject stale writes', async () => {
  const { one, two, path, postPin, root } = await setup()
  const alpha = await (await fetch(path(one.code))).json()
  expect(alpha.data.workspace.name).toBe('Alpha')
  expect(alpha.data.workspace.revision).toBe(0)
  expect((await fetch(path(two.code))).status).toBe(200)
  const blocked = await fetch(path(one.code), { method: 'PUT', headers: { 'content-type': 'application/json', origin: root }, body: JSON.stringify({ expectedRevision: 0, data: alpha.data }) })
  expect(blocked.status).toBe(403)
  expect((await postPin(one.code, '1234')).response.status).toBe(403)
  const { response, cookie } = await postPin(one.code, '0042')
  expect(response.status).toBe(200)
  expect(cookie).toContain('planner_edit=')
  const other = await fetch(path(two.code), { method: 'PUT', headers: { 'content-type': 'application/json', origin: root, cookie }, body: JSON.stringify({ expectedRevision: 0, data: alpha.data }) })
  expect(other.status).toBe(403)
  const update = { ...alpha.data, workspace: { ...alpha.data.workspace, name: 'Changed' } }
  const request = () => fetch(path(one.code), { method: 'PUT', headers: { 'content-type': 'application/json', origin: root, cookie }, body: JSON.stringify({ expectedRevision: 0, data: update }) })
  const results = await Promise.all([request(), request()])
  expect(results.map(item => item.status).sort()).toEqual([200, 409])
  expect((await (await fetch(path(one.code))).json()).data.workspace.revision).toBe(1)
  expect((await (await fetch(path(two.code))).json()).data.workspace.name).toBe('Beta')
  db!.resetPin(one.code, '0007')
  expect((await fetch(`${path(one.code)}/edit-session`, { headers: { cookie } }).then(response => response.json())).canEdit).toBe(false)
  expect((await postPin(one.code, '0007')).response.status).toBe(200)
})

test('invalid data and wrong Origin do not change server state; backups restore with monotonic revision', async () => {
  const { one, path, postPin, root } = await setup()
  const { cookie } = await postPin(one.code, '0042')
  const initial = (await (await fetch(path(one.code))).json()).data
  const bad = { ...initial, epics: [{ id: 'x' }] }
  const write = (data: unknown, origin = root, expectedRevision = 0) => fetch(path(one.code), { method: 'PUT', headers: { 'content-type': 'application/json', origin, cookie }, body: JSON.stringify({ expectedRevision, data }) })
  expect((await write(initial, 'https://evil.example')).status).toBe(403)
  expect((await write(bad)).status).toBe(422)
  expect((await (await fetch(path(one.code))).json()).data.workspace.revision).toBe(0)
  const backupResponse = await fetch(`${path(one.code)}/backups`, { method: 'POST', headers: { 'content-type': 'application/json', origin: root, cookie }, body: JSON.stringify({ reason: 'manual', name: 'Before' }) })
  expect(backupResponse.status).toBe(201)
  const backup = (await backupResponse.json()).backup
  expect((await write({ ...initial, workspace: { ...initial.workspace, name: 'Changed' } })).status).toBe(200)
  const restore = await fetch(`${path(one.code)}/backups/${backup.id}/restore`, { method: 'POST', headers: { 'content-type': 'application/json', origin: root, cookie }, body: JSON.stringify({ expectedRevision: 1 }) })
  expect(restore.status).toBe(200)
  expect((await restore.json()).data.workspace.revision).toBe(2)
  expect((await (await fetch(path(one.code))).json()).data.workspace.name).toBe('Alpha')
})

test('PIN rate limit and expired session', async () => {
  const { one, path, postPin } = await setup()
  for (let attempt = 0; attempt < 5; attempt += 1) expect((await postPin(one.code, '9999')).response.status).toBe(403)
  const limited = (await postPin(one.code, '0042')).response
  expect(limited.status).toBe(429)
  expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
  const session = db!.createSession(one.code)
  expect(db!.hasSession(one.code, session.token)).toBe(true)
  db!.db.prepare('UPDATE edit_sessions SET expires_at = ?').run(Date.now() - 1)
  expect(db!.hasSession(one.code, session.token)).toBe(false)
  expect((await fetch(`${path(one.code)}/edit-session`, { headers: { cookie: `planner_edit=${session.token}` } }).then(response => response.json())).canEdit).toBe(false)
})

test('import remaps workspace IDs and rejects malformed files before commit', async () => {
  const { one, two, path, postPin, root } = await setup()
  const { cookie } = await postPin(one.code, '0042')
  const source = (await (await fetch(path(two.code))).json()).data
  const imported = { format: 'delivery-planner-workspace', application: 'delivery-planner', schemaVersion: 3, appVersion: '1.0.0', exportedAt: new Date().toISOString(), workspace: source }
  const send = (json: string, expectedRevision = 0) => fetch(`${path(one.code)}/import`, { method: 'POST', headers: { 'content-type': 'application/json', origin: root, cookie }, body: JSON.stringify({ expectedRevision, json }) })
  expect((await send('{broken')).status).toBe(422)
  expect((await (await fetch(path(one.code))).json()).data.workspace.revision).toBe(0)
  const response = await send(JSON.stringify(imported))
  expect(response.status).toBe(200)
  const saved = (await response.json()).data
  expect(saved.workspace.id).toBe(one.id)
  expect(saved.workspace.revision).toBe(1)
  expect(saved.calendar.workspaceId).toBe(one.id)
  expect(saved.activityTypes.every((item: { workspaceId: string }) => item.workspaceId === one.id)).toBe(true)
  expect((await (await fetch(path(two.code))).json()).data.workspace.revision).toBe(0)
})


test('SQLite survives restart and online whole-database backup is consistent', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'splanner-db-test-'))
  const path = join(directory, 'planner.sqlite')
  const backupPath = join(directory, 'backup.sqlite')
  const source = openDatabase(path)
  try {
    const workspace = source.createWorkspace('Persistent', '0042')
    const changed = source.load(workspace.code)
    changed.workspace.name = 'After save'
    expect(source.save(workspace.code, 0, changed).workspace.revision).toBe(1)
    await source.db.backup(backupPath)
    source.db.close()
    const reopened = openDatabase(path)
    expect(reopened.load(workspace.code).workspace.name).toBe('After save')
    reopened.db.close()
    const restored = openDatabase(backupPath)
    expect(restored.load(workspace.code).workspace.revision).toBe(1)
    restored.db.close()
  } finally {
    if (source.db.open) source.db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
