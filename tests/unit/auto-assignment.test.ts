import { describe, expect, it } from 'vitest'
import { autoRoleForStage } from '../../app/domain/capacity/auto-assignment'
import type { ActivityType, Role } from '../../app/domain/models/types'

const role = (id: string, name: string, isActive = true): Role => ({
  id,
  workspaceId: 'workspace',
  name,
  isActive,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const activity = (slug: string, name: string): ActivityType => ({
  id: `activity-${slug}`,
  workspaceId: 'workspace',
  slug,
  name,
  colorToken: '#000000',
  sortOrder: 0,
  isActive: true,
})

describe('automatic role demand', () => {
  const backend = role('backend', 'Backend')
  const qa = role('qa', 'QA')

  it('maps development to Backend and testing to QA', () => {
    expect(autoRoleForStage('task', activity('development', 'Разработка'), [backend, qa])?.id).toBe('backend')
    expect(autoRoleForStage('task', activity('testing', 'Тестирование'), [backend, qa])?.id).toBe('qa')
  })

  it('supports custom localized activity names and ignores inactive roles', () => {
    expect(autoRoleForStage('scope', activity('custom', 'Бэкенд разработка'), [backend, qa])?.id).toBe('backend')
    expect(autoRoleForStage('task', activity('custom', 'QA проверка'), [backend, qa])?.id).toBe('qa')
    expect(autoRoleForStage('task', activity('custom', 'QA проверка'), [backend, role('inactive-qa', 'QA', false)])).toBeUndefined()
  })

  it('never assigns capacity to milestones or unrelated activities', () => {
    expect(autoRoleForStage('milestone', activity('testing', 'Тестирование'), [qa])).toBeUndefined()
    expect(autoRoleForStage('task', activity('research', 'Исследование'), [backend, qa])).toBeUndefined()
  })
})
