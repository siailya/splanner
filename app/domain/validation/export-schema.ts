import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestamp = z.string().datetime()

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: z.number().int().nonnegative(),
  settings: z.object({
    locale: z.literal('ru-RU'),
    firstDayOfWeek: z.literal(1),
    defaultTimelineScale: z.enum(['day', 'week', 'month']),
    defaultMoveMode: z.enum(['cascade', 'free']),
    autoLinkNewStages: z.boolean(),
    capacityWarningThreshold: z.number().min(0).max(1),
    theme: z.enum(['system', 'light', 'dark']),
  }),
})

export const plannerDataSchema = z.object({
  workspace: workspaceSchema,
  quarters: z.array(z.object({
    id: z.string().regex(/^\d{4}-Q[1-4]$/),
    workspaceId: z.string(),
    year: z.number().int(),
    number: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    startDate: isoDate,
    endDate: isoDate,
  })),
  epics: z.array(z.object({
    id: z.string(), workspaceId: z.string(), title: z.string().min(1), code: z.string().optional(),
    descriptionMarkdown: z.string(), status: z.enum(['active', 'paused', 'done', 'archived', 'blocked']),
    startDate: isoDate.optional(), endDate: isoDate.optional(),
    marker: z.string().optional(), fillStyle: z.enum(['solid', 'striped']).optional(), sortOrder: z.number(), createdAt: timestamp, updatedAt: timestamp,
  })),
  stages: z.array(z.object({
    id: z.string(), workspaceId: z.string(), epicId: z.string(), title: z.string().min(1),
    kind: z.enum(['task', 'scope', 'milestone']), activityTypeId: z.string(),
    status: z.enum(['planned', 'in_progress', 'done', 'blocked']), descriptionMarkdown: z.string(),
    startDate: isoDate, endDate: isoDate, durationWorkdays: z.number().int().nonnegative(),
    locked: z.boolean(), sortOrder: z.number(), quarterIds: z.array(z.string().regex(/^\d{4}-Q[1-4]$/)),
    externalUrl: z.string().url().refine(value => /^https?:/.test(value)).optional(),
    createdAt: timestamp, updatedAt: timestamp,
  })),
  dependencies: z.array(z.object({
    id: z.string(), workspaceId: z.string(), epicId: z.string(), predecessorStageId: z.string(), successorStageId: z.string(),
    type: z.literal('finish_to_start'), lagWorkdays: z.number().int().nonnegative(), createdAt: timestamp,
  })),
  activityTypes: z.array(z.object({
    id: z.string(), workspaceId: z.string(), name: z.string().min(1), slug: z.string(), colorToken: z.string(),
    sortOrder: z.number(), isActive: z.boolean(),
  })),
  roles: z.array(z.object({
    id: z.string(), workspaceId: z.string(), name: z.string().min(1), marker: z.string().optional(),
    sortOrder: z.number(), isActive: z.boolean(), createdAt: timestamp, updatedAt: timestamp,
  })).default([]),
  people: z.array(z.object({
    id: z.string(), workspaceId: z.string(), name: z.string().min(1), primaryRoleId: z.string(),
    roleIds: z.array(z.string()), baseCapacityFte: z.number().positive().max(2), isActive: z.boolean(),
    sortOrder: z.number(), createdAt: timestamp, updatedAt: timestamp,
  })).default([]),
  assignments: z.array(z.object({
    id: z.string(), workspaceId: z.string(), stageId: z.string(), targetType: z.enum(['person', 'role']),
    targetId: z.string(), units: z.number().positive(), allocationFte: z.number().positive().max(2),
  })).default([]),
  workItems: z.array(z.object({
    id: z.string(), workspaceId: z.string(), epicId: z.string(), stageId: z.string().optional(),
    title: z.string().min(1), status: z.enum(['todo', 'in_progress', 'done']), personId: z.string().optional(),
    externalUrl: z.string().url().refine(value => /^https?:/.test(value)).optional(), sortOrder: z.number(),
    createdAt: timestamp, updatedAt: timestamp,
  })).default([]),
  baselines: z.array(z.object({
    id: z.string(), workspaceId: z.string(), name: z.string().min(1),
    comment: z.string().optional(),
    quarterIds: z.array(z.string().regex(/^\d{4}-Q[1-4]$/)),
    epicIds: z.array(z.string()).optional(), createdAt: timestamp,
  })).default([]),
  baselineStages: z.array(z.object({
    id: z.string(), baselineId: z.string(), stageId: z.string(), epicId: z.string(), title: z.string().min(1),
    kind: z.enum(['task', 'scope', 'milestone']), activityTypeId: z.string(),
    status: z.enum(['planned', 'in_progress', 'done', 'blocked']),
    startDate: isoDate, endDate: isoDate, durationWorkdays: z.number().int().nonnegative(),
  })).default([]),
  calendar: z.object({
    id: z.string(), workspaceId: z.string(), workingWeekdays: z.array(z.number().int().min(1).max(7)).min(1),
    holidays: z.array(isoDate), extraWorkingDays: z.array(isoDate), revision: z.number().int().nonnegative(),
  }),
})

export const workspaceExportSchema = z.object({
  format: z.literal('delivery-planner-workspace'),
  application: z.literal('delivery-planner'),
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  appVersion: z.string(),
  exportedAt: timestamp,
  workspace: plannerDataSchema,
})
