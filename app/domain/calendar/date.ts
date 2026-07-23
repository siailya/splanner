import type { ISODate, WorkingCalendar } from '../models/types'

const DAY_MS = 86_400_000
const epochDayCache = new Map<ISODate, number>()

export function assertISODate(value: string): asserts value is ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Некорректная дата: ${value}`)
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Некорректная дата: ${value}`)
  }
}

export function toEpochDay(value: ISODate): number {
  const cached = epochDayCache.get(value)
  if (cached !== undefined) return cached
  assertISODate(value)
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const result = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
  epochDayCache.set(value, result)
  return result
}

export function fromEpochDay(value: number): ISODate {
  const date = new Date(value * DAY_MS)
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}` as ISODate
}

export function addCalendarDays(date: ISODate, amount: number): ISODate {
  return fromEpochDay(toEpochDay(date) + amount)
}

export function compareDates(left: ISODate, right: ISODate): number {
  return toEpochDay(left) - toEpochDay(right)
}

export function weekday(date: ISODate): number {
  const jsDay = new Date(toEpochDay(date) * DAY_MS).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

export function isWorkingDay(date: ISODate, calendar: WorkingCalendar): boolean {
  if (calendar.extraWorkingDays.includes(date)) return true
  if (calendar.holidays.includes(date)) return false
  return calendar.workingWeekdays.includes(weekday(date))
}

export function nextWorkingDay(date: ISODate, calendar: WorkingCalendar): ISODate {
  let cursor = addCalendarDays(date, 1)
  for (let guard = 0; guard < 3_660; guard += 1) {
    if (isWorkingDay(cursor, calendar)) return cursor
    cursor = addCalendarDays(cursor, 1)
  }
  throw new Error('В рабочем календаре не найден следующий рабочий день')
}

export function previousWorkingDay(date: ISODate, calendar: WorkingCalendar): ISODate {
  let cursor = addCalendarDays(date, -1)
  for (let guard = 0; guard < 3_660; guard += 1) {
    if (isWorkingDay(cursor, calendar)) return cursor
    cursor = addCalendarDays(cursor, -1)
  }
  throw new Error('В рабочем календаре не найден предыдущий рабочий день')
}

export function addWorkingDays(date: ISODate, amount: number, calendar: WorkingCalendar): ISODate {
  if (amount === 0) return date
  let cursor = date
  const step = Math.sign(amount)
  let remaining = Math.abs(amount)
  while (remaining > 0) {
    cursor = step > 0 ? nextWorkingDay(cursor, calendar) : previousWorkingDay(cursor, calendar)
    remaining -= 1
  }
  return cursor
}

export function workingDaysBetween(start: ISODate, end: ISODate, calendar: WorkingCalendar): number {
  const comparison = compareDates(start, end)
  if (comparison > 0) return -workingDaysBetween(end, start, calendar)
  let count = 0
  const endEpochDay = toEpochDay(end)
  for (let cursor = toEpochDay(start); cursor <= endEpochDay; cursor += 1) {
    if (isWorkingDay(fromEpochDay(cursor), calendar)) count += 1
  }
  return count
}

export function workingDayDelta(from: ISODate, to: ISODate, calendar: WorkingCalendar): number {
  if (from === to) return 0
  if (compareDates(from, to) < 0) {
    let cursor = from
    let count = 0
    while (compareDates(cursor, to) < 0) {
      cursor = nextWorkingDay(cursor, calendar)
      count += 1
    }
    return count
  }
  return -workingDayDelta(to, from, calendar)
}

export function toLocalDate(value: ISODate): Date {
  assertISODate(value)
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  // DHTMLX positions tasks using the time component as well as the calendar
  // date. Date-only values must therefore land exactly on a local-day
  // boundary; noon would shift every bar by half a timeline cell.
  return new Date(year, month - 1, day)
}

export function fromLocalDate(value: Date): ISODate {
  return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}` as ISODate
}
