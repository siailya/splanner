import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ZodError } from 'zod'
import type { BackupReason, PlannerData } from '../app/domain/models/types'
import { parseWorkspaceExport } from '../app/infrastructure/files/workspace-transfer'
import { ApiError, openDatabase } from './database'
import { plannerRoutes } from './planner-routes'

const BACKUP_REASONS = new Set<BackupReason>(['manual', 'daily', 'before_import', 'before_delete', 'before_calendar_change', 'before_restore'])

export function createApp(database = openDatabase()) {
  const app = express()
  app.disable('x-powered-by')
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
  app.use(express.json({ limit: process.env.JSON_LIMIT || '10mb' }))
  const failedByPair = new Map<string, number[]>()
  const failedByIp = new Map<string, number[]>()
  const publicOrigin = process.env.PUBLIC_ORIGIN
  const configuredHours = Number(process.env.SESSION_HOURS || 8)
  const sessionMs = (Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 8) * 60 * 60 * 1000
  const editCookie = (code: string) => ({ httpOnly: true, sameSite: 'strict' as const, secure: publicOrigin?.startsWith('https://') ?? false, path: `/api/workspaces/${code}`, maxAge: sessionMs })
  const tokenFor = (req: Request) => {
    const cookie = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('planner_edit='))
    return cookie?.slice('planner_edit='.length)
  }
  const sameOrigin = (req: Request) => {
    const origin = req.get('origin')
    if (!origin) return true
    return origin === (publicOrigin || `${req.protocol}://${req.get('host')}`)
  }
  const codeFor = (req: Request) => String(req.params.code).toLowerCase()
  const requireEdit = (req: Request, _res: Response, next: NextFunction) => {
    try {
      database.revision(codeFor(req))
      if (!database.hasSession(codeFor(req), tokenFor(req))) throw new ApiError(403, 'Для изменения workspace нужен PIN')
      next()
    } catch (error) { next(error) }
  }
  const asyncRoute = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve().then(() => fn(req, res)).catch(next)
  }
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || sameOrigin(req)) return next()
    next(new ApiError(403, 'Недопустимый Origin'))
  })
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  app.get('/health', (_req, res) => { database.db.prepare('SELECT 1').get(); res.json({ status: 'ok' }) })
  app.get('/api/workspaces/:code', asyncRoute((req, res) => res.json({ data: database.load(codeFor(req)) })))
  app.get('/api/workspaces/:code/revision', asyncRoute((req, res) => res.json(database.revision(codeFor(req)))))
  app.get('/api/workspaces/:code/edit-session', asyncRoute((req, res) => { database.revision(codeFor(req)); res.json({ canEdit: database.hasSession(codeFor(req), tokenFor(req)) }) }))
  app.post('/api/workspaces/:code/edit-session', asyncRoute((req, res) => {
    const code = codeFor(req)
    database.revision(code)
    const ip = req.ip || 'unknown'
    const pairKey = `${code}:${ip}`
    const now = Date.now()
    const attempts = (map: Map<string, number[]>, key: string) => {
      const recent = (map.get(key) || []).filter(time => time > now - 15 * 60 * 1000)
      map.set(key, recent)
      return recent
    }
    const pair = attempts(failedByPair, pairKey)
    const all = attempts(failedByIp, ip)
    if (pair.length >= 5 || all.length >= 30) {
      const first = pair.length >= 5 ? pair[0]! : all[0]!
      res.setHeader('Retry-After', Math.max(1, Math.ceil((first + 15 * 60 * 1000 - now) / 1000)))
      throw new ApiError(429, 'Слишком много попыток ввода PIN')
    }
    const pin = req.body?.pin
    if (typeof pin !== 'string' || !database.checkPin(code, pin)) {
      pair.push(now); all.push(now)
      throw new ApiError(403, 'Неверный PIN')
    }
    failedByPair.delete(pairKey)
    const { token } = database.createSession(code)
    res.cookie('planner_edit', token, editCookie(code)).json({ canEdit: true })
  }))
  app.delete('/api/workspaces/:code/edit-session', asyncRoute((req, res) => {
    database.deleteSession(tokenFor(req))
    res.clearCookie('planner_edit', { path: editCookie(codeFor(req)).path }).json({ canEdit: false })
  }))
  app.put('/api/workspaces/:code', requireEdit, asyncRoute((req, res) => {
    const { expectedRevision, data, backupReason } = req.body || {}
    if (backupReason !== undefined && !BACKUP_REASONS.has(backupReason)) throw new ApiError(400, 'Неизвестная причина backup')
    if (!data || typeof data !== 'object') throw new ApiError(400, 'Отсутствуют данные workspace')
    res.json({ data: database.save(codeFor(req), expectedRevision, data as PlannerData, backupReason) })
  }))
  app.post('/api/workspaces/:code/import', requireEdit, asyncRoute((req, res) => {
    const { expectedRevision, json } = req.body || {}
    if (typeof json !== 'string') throw new ApiError(400, 'Отсутствует JSON export')
    let imported: PlannerData
    try { imported = parseWorkspaceExport(json).workspace }
    catch (error) { throw new ApiError(422, error instanceof Error ? error.message : 'Файл не прошёл проверку') }
    const current = database.load(codeFor(req))
    const oldId = imported.workspace.id
    imported.workspace.id = current.workspace.id
    for (const value of [imported.calendar, ...imported.quarters, ...imported.epics, ...imported.stages, ...imported.dependencies, ...imported.activityTypes, ...imported.roles, ...imported.people, ...imported.assignments, ...imported.workItems, ...imported.baselines]) {
      if (value.workspaceId === oldId) value.workspaceId = current.workspace.id
    }
    res.json({ data: database.save(codeFor(req), expectedRevision, imported, 'before_import') })
  }))
  app.get('/api/workspaces/:code/backups', requireEdit, asyncRoute((req, res) => res.json({ backups: database.listBackups(codeFor(req)) })))
  app.get('/api/workspaces/:code/backups/:id', requireEdit, asyncRoute((req, res) => res.json({ backup: database.getBackup(codeFor(req), String(req.params.id)) })))
  app.post('/api/workspaces/:code/backups', requireEdit, asyncRoute((req, res) => {
    const { reason = 'manual', name } = req.body || {}
    if (!BACKUP_REASONS.has(reason)) throw new ApiError(400, 'Неизвестная причина backup')
    res.status(201).json({ backup: database.createBackup(codeFor(req), reason, typeof name === 'string' ? name : undefined) })
  }))
  app.delete('/api/workspaces/:code/backups/:id', requireEdit, asyncRoute((req, res) => {
    database.deleteBackup(codeFor(req), String(req.params.id))
    res.status(204).end()
  }))
  app.post('/api/workspaces/:code/backups/:id/restore', requireEdit, asyncRoute((req, res) => {
    res.json({ data: database.restoreBackup(codeFor(req), String(req.params.id), req.body?.expectedRevision) })
  }))
  app.use('/api/workspaces/:code', plannerRoutes(database, requireEdit))
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'API endpoint не найден')))
  const staticDir = resolve(process.cwd(), '.output/public')
  if (existsSync(staticDir)) {
    const entrypoint = readFileSync(join(staticDir, 'index.html'))
    app.use(express.static(staticDir, { index: false }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next()
      res.type('html').send(entrypoint)
    })
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message, currentRevision: error.currentRevision })
    if (error instanceof ZodError) return res.status(422).json({ error: 'Некорректные данные workspace', issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) })
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Некорректный JSON' })
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ error: 'Размер запроса превышает лимит' })
    if (error && typeof error === 'object' && 'code' in error && /^SQLITE_(BUSY|LOCKED|IOERR|FULL|CANTOPEN)/.test(String(error.code))) return res.status(503).json({ error: 'Хранилище временно недоступно' })
    console.error(error instanceof Error ? error.message : 'Неизвестная ошибка сервера')
    return res.status(500).json({ error: 'Ошибка сервера' })
  })
  return { app, database }
}
