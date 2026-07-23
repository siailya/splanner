# Схема данных v3

Dexie database: `delivery-planner`.

| Table | Основные индексы | Назначение |
|---|---|---|
| `workspaces` | `id, updatedAt` | настройки, revision, schemaVersion |
| `quarters` | `id, workspaceId, year, number` | индексы квартальных окон |
| `epics` | `id, workspaceId, [workspaceId+status], sortOrder` | проекты |
| `stages` | `id, workspaceId, epicId, *quarterIds, startDate, endDate, status, activityTypeId` | canonical этапы |
| `dependencies` | `id, epicId, predecessorStageId, successorStageId` | FS links |
| `activityTypes` | `id, workspaceId, sortOrder` | словарь деятельности |
| `roles` | `id, workspaceId, sortOrder, isActive` | роли |
| `people` | `id, workspaceId, primaryRoleId, *roleIds, sortOrder, isActive` | сотрудники |
| `assignments` | `id, stageId, [targetType+targetId]` | person/role allocation |
| `workItems` | `id, epicId, stageId, status, personId, sortOrder` | backlog/checklist |
| `calendars` | `id, workspaceId` | рабочая неделя и исключения |
| `baselines` | `id, workspaceId, createdAt, *quarterIds` | именованные снимки |
| `baselineStages` | `id, baselineId, stageId, epicId` | неизменяемые даты baseline |
| `backups` | `id, workspaceId, createdAt, reason` | rolling recovery payload |
| `integrityMetadata` | `id, workspaceId` | last save/check/export |
| `settings` | `key` | infrastructure/UI metadata |

`Stage` хранится один раз даже при пересечении кварталов. `quarterIds` — вычисляемый индекс. `BaselineStageSnapshot` не удаляется вслед за текущим stage: это позволяет показать `Removed since baseline`.

Экспорт v3 имеет `format`, `application`, `schemaVersion`, `appVersion`, `exportedAt`, `workspace`. Backup payload хранит сериализованный `PlannerData`; при скачивании преобразуется в обычный импортируемый workspace export.
