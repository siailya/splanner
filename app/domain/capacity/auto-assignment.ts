import type { ActivityType, Role, StageKind } from '../models/types'

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU')
}

function findRole(roles: Role[], aliases: string[]): Role | undefined {
  const active = roles.filter(role => role.isActive)
  return active.find(role => aliases.includes(normalized(role.name)))
    ?? active.find(role => aliases.some(alias => normalized(role.name).includes(alias)))
}

export function autoRoleForStage(
  kind: StageKind,
  activityType: ActivityType | undefined,
  roles: Role[],
): Role | undefined {
  if (kind === 'milestone' || !activityType) return
  const activity = `${normalized(activityType.slug)} ${normalized(activityType.name)}`

  if (/(^|\s)(testing|test|qa|тест)/.test(activity)) {
    return findRole(roles, ['qa', 'quality assurance', 'тестирование', 'тестировщик'])
  }
  if (/(^|\s)(development|backend|back-end|бэкенд|бэкэнд|разработка)/.test(activity)) {
    return findRole(roles, ['backend', 'back-end', 'бэкенд', 'бэкэнд'])
  }
}
