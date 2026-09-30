import type { BackupReason, BackupSnapshot, PlannerData } from '../../domain/models/types'

export class ServerError extends Error {
  constructor(message: string, public status: number, public currentRevision?: number) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  } catch {
    throw new ServerError('Нет соединения с сервером. Изменения не подтверждены.', 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; currentRevision?: number; issues?: Array<{ path: string; message: string }> }
    const detail = body.issues?.map(item => `${item.path}: ${item.message}`).join('; ')
    throw new ServerError(detail || body.error || `HTTP ${response.status}`, response.status, body.currentRevision)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

export class ServerPlannerRepository {
  constructor(public readonly code: string) {}
  private path(suffix = '') { return `/api/workspaces/${encodeURIComponent(this.code)}${suffix}` }
  async load(): Promise<PlannerData> { return (await request<{ data: PlannerData }>(this.path())).data }
  async revision(): Promise<{ revision: number; updatedAt: string }> { return request(this.path('/revision')) }
  async canEdit(): Promise<boolean> { return (await request<{ canEdit: boolean }>(this.path('/edit-session'))).canEdit }
  async unlock(pin: string): Promise<void> { await request(this.path('/edit-session'), { method: 'POST', body: JSON.stringify({ pin }) }) }
  async lock(): Promise<void> { await request(this.path('/edit-session'), { method: 'DELETE' }) }
  async save(data: PlannerData, expectedRevision: number, backupReason?: BackupReason): Promise<PlannerData> {
    return (await request<{ data: PlannerData }>(this.path(), { method: 'PUT', body: JSON.stringify({ data, expectedRevision, backupReason }) })).data
  }
  async importJson(json: string, expectedRevision: number): Promise<PlannerData> {
    return (await request<{ data: PlannerData }>(this.path('/import'), { method: 'POST', body: JSON.stringify({ json, expectedRevision }) })).data
  }
  async listBackups(): Promise<BackupSnapshot[]> { return (await request<{ backups: BackupSnapshot[] }>(this.path('/backups'))).backups }
  async getBackup(id: string): Promise<BackupSnapshot> { return (await request<{ backup: BackupSnapshot }>(this.path(`/backups/${encodeURIComponent(id)}`))).backup }
  async createBackup(reason: BackupReason, name?: string): Promise<BackupSnapshot> {
    return (await request<{ backup: BackupSnapshot }>(this.path('/backups'), { method: 'POST', body: JSON.stringify({ reason, name }) })).backup
  }
  async deleteBackup(id: string): Promise<void> { await request(this.path(`/backups/${encodeURIComponent(id)}`), { method: 'DELETE' }) }
  async restoreBackup(id: string, expectedRevision: number): Promise<PlannerData> {
    return (await request<{ data: PlannerData }>(this.path(`/backups/${encodeURIComponent(id)}/restore`), { method: 'POST', body: JSON.stringify({ expectedRevision }) })).data
  }
}
