import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createDefaultWorkspace } from '../app/domain/models/factories'
import type { BackupReason, BackupSnapshot, PlannerData } from '../app/domain/models/types'
import { validateReferences } from '../app/infrastructure/files/workspace-transfer'

export class ApiError extends Error {
  constructor(public status: number, message: string, public currentRevision?: number) { super(message) }
}

interface WorkspaceRow { id: string; code: string; payload: string; revision: number; updated_at: string; pin_salt: string; pin_hash: string }
interface BackupRow { id: string; workspace_id: string; name: string | null; reason: BackupReason; created_at: string; schema_version: number; workspace_revision: number; size_bytes: number; entity_count: number; payload: string }

export function openDatabase(path = process.env.DB_PATH || './data/planner.sqlite') {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
      revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
      pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_backups (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL, schema_version INTEGER NOT NULL,
      workspace_revision INTEGER NOT NULL, size_bytes INTEGER NOT NULL, entity_count INTEGER NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS backups_by_workspace ON workspace_backups(workspace_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS edit_sessions (
      token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_by_workspace ON edit_sessions(workspace_id);
    INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
  `)

  const getRow = (code: string) => db.prepare('SELECT * FROM workspaces WHERE code = ?').get(code.toLowerCase()) as WorkspaceRow | undefined
  const requiredRow = (code: string) => {
    const row = getRow(code)
    if (!row) throw new ApiError(404, 'Workspace не найден')
    return row
  }
  const asData = (row: WorkspaceRow): PlannerData => {
    const data = JSON.parse(row.payload) as PlannerData
    data.workspace.revision = row.revision
    data.workspace.updatedAt = row.updated_at
    return data
  }
  const validate = (data: PlannerData) => {
    try { validateReferences(data) }
    catch (error) { if (error instanceof Error && error.name === 'ZodError') throw error; throw new ApiError(422, error instanceof Error ? error.message : 'Некорректные данные workspace') }
  }
  const backupFromRow = (row: BackupRow): BackupSnapshot => ({
    id: row.id, workspaceId: row.workspace_id, name: row.name || undefined, reason: row.reason,
    createdAt: row.created_at, schemaVersion: row.schema_version, workspaceRevision: row.workspace_revision,
    sizeBytes: row.size_bytes, entityCount: row.entity_count, payload: row.payload,
  })
  const insertBackup = (row: WorkspaceRow, data: PlannerData, reason: BackupReason, name?: string) => {
    const payload = JSON.stringify(data)
    const backup: BackupSnapshot = {
      id: `backup-${crypto.randomUUID()}`, workspaceId: row.id, name: name?.trim() || undefined,
      reason, createdAt: new Date().toISOString(), schemaVersion: data.workspace.schemaVersion,
      workspaceRevision: row.revision, sizeBytes: Buffer.byteLength(payload),
      entityCount: data.epics.length + data.stages.length + data.dependencies.length + data.roles.length
        + data.people.length + data.assignments.length + data.workItems.length + data.baselines.length,
      payload,
    }
    db.prepare(`INSERT INTO workspace_backups VALUES (@id, @workspaceId, @name, @reason, @createdAt, @schemaVersion, @workspaceRevision, @sizeBytes, @entityCount, @payload)`)
      .run({ ...backup, name: backup.name ?? null })
    return backup
  }
  const pruneBackups = (workspaceId: string) => {
    const rows = db.prepare('SELECT id, size_bytes FROM workspace_backups WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC').all(workspaceId) as Array<{ id: string; size_bytes: number }>
    let total = 0
    rows.forEach((row, index) => {
      if (index < 10 && total + row.size_bytes <= 20 * 1024 * 1024) total += row.size_bytes
      else db.prepare('DELETE FROM workspace_backups WHERE id = ?').run(row.id)
    })
  }

  function hashPin(pin: string, salt: string) { return scryptSync(pin, Buffer.from(salt, 'hex'), 64) }
  function assertPin(pin: string) { if (!/^\d{4}$/.test(pin)) throw new ApiError(400, 'PIN должен состоять из четырёх цифр') }
  function createWorkspace(name: string, pin: string, imported?: PlannerData) {
    assertPin(pin)
    const data = imported ? structuredClone(imported) : createDefaultWorkspace()
    if (imported) {
      const oldId = data.workspace.id
      const newId = createDefaultWorkspace().workspace.id
      data.workspace.id = newId
      for (const value of [data.calendar, ...data.quarters, ...data.epics, ...data.stages, ...data.dependencies, ...data.activityTypes, ...data.roles, ...data.people, ...data.assignments, ...data.workItems, ...data.baselines]) {
        if (value.workspaceId === oldId) value.workspaceId = newId
      }
      data.workspace.revision = 0
      data.workspace.createdAt = new Date().toISOString()
      data.workspace.updatedAt = data.workspace.createdAt
    }
    data.workspace.name = name.trim()
    if (!data.workspace.name) throw new ApiError(400, 'Название workspace обязательно')
    validate(data)
    const salt = randomBytes(16).toString('hex')
    let code = ''
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
    do {
      let bits = BigInt(`0x${randomBytes(10).toString('hex')}`)
      code = ''
      for (let index = 0; index < 16; index += 1) { code = alphabet[Number(bits & 31n)] + code; bits >>= 5n }
    } while (getRow(code))
    db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(data.workspace.id, code, JSON.stringify(data), data.workspace.revision, data.workspace.updatedAt, salt, hashPin(pin, salt).toString('hex'))
    return { code, id: data.workspace.id, name: data.workspace.name }
  }
  function resetPin(code: string, pin: string) {
    assertPin(pin)
    const row = requiredRow(code)
    const salt = randomBytes(16).toString('hex')
    db.transaction(() => {
      db.prepare('UPDATE workspaces SET pin_salt = ?, pin_hash = ? WHERE id = ?').run(salt, hashPin(pin, salt).toString('hex'), row.id)
      db.prepare('DELETE FROM edit_sessions WHERE workspace_id = ?').run(row.id)
    })()
  }
  function checkPin(code: string, pin: string) {
    const row = requiredRow(code)
    if (!/^\d{4}$/.test(pin)) return false
    return timingSafeEqual(hashPin(pin, row.pin_salt), Buffer.from(row.pin_hash, 'hex'))
  }
  function createSession(code: string) {
    const row = requiredRow(code)
    const token = randomBytes(32).toString('base64url')
    const hours = Number(process.env.SESSION_HOURS || 8)
    const expiresAt = Date.now() + (Number.isFinite(hours) && hours > 0 ? hours : 8) * 60 * 60 * 1000
    db.prepare('INSERT INTO edit_sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), row.id, expiresAt)
    return { token, expiresAt }
  }
  function hasSession(code: string, token?: string) {
    if (!token) return false
    const row = requiredRow(code)
    const tokenHash = createHash('sha256').update(token).digest('hex')
    return Boolean(db.prepare('SELECT 1 FROM edit_sessions WHERE token_hash = ? AND workspace_id = ? AND expires_at > ?').get(tokenHash, row.id, Date.now()))
  }
  function deleteSession(token?: string) {
    if (token) db.prepare('DELETE FROM edit_sessions WHERE token_hash = ?').run(createHash('sha256').update(token).digest('hex'))
  }
  function listWorkspaces() {
    return db.prepare('SELECT code, json_extract(payload, \'$.workspace.name\') AS name, revision, updated_at FROM workspaces ORDER BY updated_at DESC').all()
  }
  function load(code: string) { return asData(requiredRow(code)) }
  function revision(code: string) { const row = requiredRow(code); return { revision: row.revision, updatedAt: row.updated_at } }
  function save(code: string, expectedRevision: number, candidate: PlannerData, backupReason?: BackupReason) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new ApiError(400, 'Некорректная версия workspace')
    return db.transaction(() => {
      const row = requiredRow(code)
      if (row.revision !== expectedRevision) throw new ApiError(409, 'Workspace изменён в другом браузере', row.revision)
      if (candidate.workspace.id !== row.id) throw new ApiError(400, 'ID workspace не совпадает')
      const next = structuredClone(candidate)
      next.workspace.createdAt = asData(row).workspace.createdAt
      next.workspace.revision = row.revision + 1
      next.workspace.updatedAt = new Date().toISOString()
      validate(next)
      const before = asData(row)
      const latestDaily = db.prepare("SELECT created_at, workspace_revision FROM workspace_backups WHERE workspace_id = ? AND reason = 'daily' ORDER BY created_at DESC LIMIT 1")
        .get(row.id) as { created_at: string; workspace_revision: number } | undefined
      if (row.revision > 0 && (!latestDaily || Date.now() - Date.parse(latestDaily.created_at) >= 86400000)) insertBackup(row, before, 'daily')
      if (backupReason) insertBackup(row, before, backupReason)
      db.prepare('UPDATE workspaces SET payload = ?, revision = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(next), next.workspace.revision, next.workspace.updatedAt, row.id)
      pruneBackups(row.id)
      return next
    })()
  }
  function listBackups(code: string) {
    const row = requiredRow(code)
    return (db.prepare('SELECT * FROM workspace_backups WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC').all(row.id) as BackupRow[])
      .map(backupFromRow).map(({ payload: _payload, ...meta }) => meta)
  }
  function getBackup(code: string, id: string) {
    const row = requiredRow(code)
    const backup = db.prepare('SELECT * FROM workspace_backups WHERE workspace_id = ? AND id = ?').get(row.id, id) as BackupRow | undefined
    if (!backup) throw new ApiError(404, 'Резервная копия не найдена')
    return backupFromRow(backup)
  }
  function createBackup(code: string, reason: BackupReason, name?: string) {
    return db.transaction(() => {
      const row = requiredRow(code)
      const backup = insertBackup(row, asData(row), reason, name)
      pruneBackups(row.id)
      return backup
    })()
  }
  function deleteBackup(code: string, id: string) {
    getBackup(code, id)
    db.prepare('DELETE FROM workspace_backups WHERE id = ?').run(id)
  }
  function restoreBackup(code: string, id: string, expectedRevision: number) {
    const backup = getBackup(code, id)
    const candidate = JSON.parse(backup.payload) as PlannerData
    return save(code, expectedRevision, candidate, 'before_restore')
  }
  return { db, createWorkspace, resetPin, checkPin, createSession, hasSession, deleteSession, listWorkspaces, load, revision, save, listBackups, getBackup, createBackup, deleteBackup, restoreBackup }
}
