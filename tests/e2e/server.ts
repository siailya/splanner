import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../server/app'
import { createEpic } from '../../app/domain/models/factories'
import { openDatabase } from '../../server/database'

const temporary = mkdtempSync(join(tmpdir(), 'splanner-e2e-'))
const database = openDatabase(join(temporary, 'planner.sqlite'))
const one = database.createWorkspace('E2E Alpha', '0042')
const two = database.createWorkspace('E2E Beta', '1234')
const three = database.createWorkspace('E2E HTML', '9999')
const blocked = database.createWorkspace('E2E Blocked', '5678')
const workflow = database.createWorkspace('E2E Workflow', '2468')
const xssData = database.load(three.code)
const epic = createEpic(xssData.workspace.id, '<img src=x onerror=window.__xss=1>', 0)
epic.startDate = new Date().toISOString().slice(0, 10) as typeof epic.startDate
epic.endDate = epic.startDate
xssData.epics.push(epic)
database.save(three.code, 0, xssData)
mkdirSync('output/playwright', { recursive: true })
writeFileSync('output/playwright/workspaces.json', JSON.stringify({ one, two, three, workflow, blocked }))
process.env.PUBLIC_ORIGIN = 'http://127.0.0.1:3100'
const { app } = createApp(database)
const server = app.listen(3100, '127.0.0.1', () => console.log('E2E server listening on 3100'))
function shutdown() { server.close(() => database.db.close()) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
