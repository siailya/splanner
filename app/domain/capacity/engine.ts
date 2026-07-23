import { addCalendarDays, compareDates, isWorkingDay, weekday } from '../calendar/date'
import type { Assignment, Epic, ISODate, Person, Role, Stage, WorkingCalendar } from '../models/types'

export type CapacityState = 'normal' | 'high' | 'overloaded' | 'unavailable'
export type CapacityRowKind = 'role' | 'person' | 'unassigned'

export interface CapacityContribution {
  assignmentId: string
  stageId: string
  epicId: string
  targetType: 'person' | 'role'
  targetId: string
  allocationFte: number
}

export interface CapacityCell {
  key: string
  startDate: ISODate
  endDate: ISODate
  usedFte: number
  availableFte: number
  freeFte: number
  utilization: number | null
  assignedPersonDays: number
  availablePersonDays: number
  state: CapacityState
  contributions: CapacityContribution[]
}

export interface CapacityRow {
  id: string
  kind: CapacityRowKind
  name: string
  roleId?: string
  cells: CapacityCell[]
}

export interface CapacityResult {
  mode: 'day' | 'week'
  periods: Array<{ key: string; label: string; startDate: ISODate; endDate: ISODate }>
  rows: CapacityRow[]
  overloadedStageIds: string[]
}

export interface CapacityInput {
  startDate: ISODate
  endDate: ISODate
  mode: 'day' | 'week'
  calendar: WorkingCalendar
  roles: Role[]
  people: Person[]
  epics: Epic[]
  stages: Stage[]
  assignments: Assignment[]
  warningThreshold?: number
  epicIds?: ReadonlySet<string>
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function stateFor(used: number, available: number, working: boolean, warningThreshold: number): CapacityState {
  if (!working && used === 0) return 'unavailable'
  if (available === 0) return used > 0 ? 'overloaded' : 'unavailable'
  const utilization = used / available
  if (utilization > 1) return 'overloaded'
  if (utilization > warningThreshold) return 'high'
  return 'normal'
}

function datesBetween(startDate: ISODate, endDate: ISODate): ISODate[] {
  const result: ISODate[] = []
  for (let date = startDate; compareDates(date, endDate) <= 0; date = addCalendarDays(date, 1)) result.push(date)
  return result
}

function dayCell(date: ISODate, availableFte: number, working: boolean, warningThreshold: number): CapacityCell {
  const available = working ? availableFte : 0
  return {
    key: date, startDate: date, endDate: date, usedFte: 0, availableFte: available,
    freeFte: available, utilization: available > 0 ? 0 : null,
    assignedPersonDays: 0, availablePersonDays: available,
    state: stateFor(0, available, working, warningThreshold), contributions: [],
  }
}

function addContribution(cell: CapacityCell, contribution: CapacityContribution, amount: number, working: boolean, warningThreshold: number): void {
  cell.usedFte = round(cell.usedFte + amount)
  cell.assignedPersonDays = cell.usedFte
  cell.freeFte = round(cell.availableFte - cell.usedFte)
  cell.utilization = cell.availableFte > 0 ? cell.usedFte / cell.availableFte : null
  cell.state = stateFor(cell.usedFte, cell.availableFte, working, warningThreshold)
  cell.contributions.push({ ...contribution, allocationFte: amount })
}

function weekPeriods(startDate: ISODate, endDate: ISODate): CapacityResult['periods'] {
  const firstMonday = addCalendarDays(startDate, -(weekday(startDate) - 1))
  const periods: CapacityResult['periods'] = []
  for (let monday = firstMonday; compareDates(monday, endDate) <= 0; monday = addCalendarDays(monday, 7)) {
    const start = compareDates(monday, startDate) < 0 ? startDate : monday
    const sunday = addCalendarDays(monday, 6)
    const end = compareDates(sunday, endDate) > 0 ? endDate : sunday
    periods.push({ key: monday, label: `Нед. ${monday.slice(5)}`, startDate: start, endDate: end })
  }
  return periods
}

function aggregateWeeks(rows: CapacityRow[], periods: CapacityResult['periods'], calendar: WorkingCalendar, warningThreshold: number): CapacityRow[] {
  return rows.map(row => ({
    ...row,
    cells: periods.map((period) => {
      const cells = row.cells.filter(cell => compareDates(cell.startDate, period.startDate) >= 0 && compareDates(cell.startDate, period.endDate) <= 0)
      const assignedPersonDays = round(cells.reduce((sum, cell) => sum + cell.usedFte, 0))
      const availablePersonDays = round(cells.reduce((sum, cell) => sum + cell.availableFte, 0))
      const workingDays = datesBetween(period.startDate, period.endDate).filter(date => isWorkingDay(date, calendar)).length
      const usedFte = workingDays ? round(assignedPersonDays / workingDays) : 0
      const availableFte = workingDays ? round(availablePersonDays / workingDays) : 0
      const contributions = [...new Map(cells.flatMap(cell => cell.contributions).map(item => [`${item.assignmentId}:${item.stageId}`, item])).values()]
      return {
        key: period.key, startDate: period.startDate, endDate: period.endDate,
        usedFte, availableFte, freeFte: round(availableFte - usedFte),
        utilization: availablePersonDays > 0 ? assignedPersonDays / availablePersonDays : null,
        assignedPersonDays, availablePersonDays,
        state: stateFor(assignedPersonDays, availablePersonDays, workingDays > 0, warningThreshold),
        contributions,
      }
    }),
  }))
}

export function calculateCapacity(input: CapacityInput): CapacityResult {
  const warningThreshold = input.warningThreshold ?? 0.8
  const activeRoleIds = new Set(input.roles.filter(role => role.isActive).map(role => role.id))
  const activePeople = input.people.filter(person => person.isActive && activeRoleIds.has(person.primaryRoleId))
  const peopleById = new Map(input.people.map(person => [person.id, person]))
  const activeEpicIds = new Set(input.epics.filter(epic => epic.status !== 'archived' && (!input.epicIds || input.epicIds.has(epic.id))).map(epic => epic.id))
  const stagesById = new Map(input.stages.filter(stage => activeEpicIds.has(stage.epicId) && stage.kind !== 'milestone').map(stage => [stage.id, stage]))
  const dates = datesBetween(input.startDate, input.endDate)
  const workingByIndex = dates.map(date => isWorkingDay(date, input.calendar))

  const roleRows = input.roles.filter(role => role.isActive).map<CapacityRow>((role) => {
    const available = activePeople.filter(person => person.primaryRoleId === role.id).reduce((sum, person) => sum + person.baseCapacityFte, 0)
    return { id: `role:${role.id}`, kind: 'role', name: role.name, roleId: role.id, cells: dates.map((date, index) => dayCell(date, available, workingByIndex[index]!, warningThreshold)) }
  })
  const personRows = activePeople.map<CapacityRow>(person => ({
    id: `person:${person.id}`, kind: 'person', name: person.name, roleId: person.primaryRoleId,
    cells: dates.map((date, index) => dayCell(date, person.baseCapacityFte, workingByIndex[index]!, warningThreshold)),
  }))
  const unassignedRows = input.roles.filter(role => role.isActive).map<CapacityRow>(role => ({
    id: `unassigned:${role.id}`, kind: 'unassigned', name: 'Незакреплённая потребность', roleId: role.id,
    cells: dates.map((date, index) => dayCell(date, 0, workingByIndex[index]!, warningThreshold)),
  }))
  const rows = [...roleRows, ...personRows, ...unassignedRows]
  const rowById = new Map(rows.map(row => [row.id, row]))

  for (const assignment of input.assignments) {
    const stage = stagesById.get(assignment.stageId)
    if (!stage) continue
    const contribution: CapacityContribution = {
      assignmentId: assignment.id, stageId: stage.id, epicId: stage.epicId,
      targetType: assignment.targetType, targetId: assignment.targetId, allocationFte: 0,
    }
    const startIndex = Math.max(0, compareDates(stage.startDate, input.startDate))
    const endIndex = Math.min(dates.length - 1, compareDates(stage.endDate, input.startDate))
    for (let index = startIndex; index <= endIndex; index += 1) {
      if (!workingByIndex[index]) continue
      if (assignment.targetType === 'person') {
        const person = peopleById.get(assignment.targetId)
        if (!person?.isActive) continue
        addContribution(rowById.get(`person:${person.id}`)!.cells[index]!, contribution, assignment.allocationFte, true, warningThreshold)
        const roleRow = rowById.get(`role:${person.primaryRoleId}`)
        if (roleRow) addContribution(roleRow.cells[index]!, contribution, assignment.allocationFte, true, warningThreshold)
      } else {
        const total = assignment.units * assignment.allocationFte
        const roleRow = rowById.get(`role:${assignment.targetId}`)
        const demandRow = rowById.get(`unassigned:${assignment.targetId}`)
        if (roleRow) addContribution(roleRow.cells[index]!, contribution, total, true, warningThreshold)
        if (demandRow) addContribution(demandRow.cells[index]!, contribution, total, true, warningThreshold)
      }
    }
  }

  const periods = input.mode === 'day'
    ? dates.map(date => ({ key: date, label: date.slice(8), startDate: date, endDate: date }))
    : weekPeriods(input.startDate, input.endDate)
  const outputRows = input.mode === 'day' ? rows : aggregateWeeks(rows, periods, input.calendar, warningThreshold)
  const overloadedStageIds = [...new Set(outputRows.flatMap(row => row.cells.filter(cell => cell.state === 'overloaded').flatMap(cell => cell.contributions.map(item => item.stageId))))]
  return { mode: input.mode, periods, rows: outputRows, overloadedStageIds }
}

export class CapacityCache {
  private readonly entries = new Map<string, CapacityResult>()

  get(key: string, calculate: () => CapacityResult): CapacityResult {
    const cached = this.entries.get(key)
    if (cached) return cached
    const result = calculate()
    this.entries.clear()
    this.entries.set(key, result)
    return result
  }

  invalidate(): void {
    this.entries.clear()
  }
}
