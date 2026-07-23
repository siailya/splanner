import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  addWorkingDays,
  fromLocalDate,
  isWorkingDay,
  nextWorkingDay,
  toLocalDate,
  workingDaysBetween,
} from '../../app/domain/calendar/date'
import type { ISODate, WorkingCalendar } from '../../app/domain/models/types'

const calendar: WorkingCalendar = {
  id: 'cal', workspaceId: 'workspace', workingWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2026-11-04'], extraWorkingDays: ['2026-11-07'], revision: 0,
}

describe('working calendar', () => {
  it('distinguishes weekends, holidays and extra working days', () => {
    expect(isWorkingDay('2026-11-02', calendar)).toBe(true)
    expect(isWorkingDay('2026-11-04', calendar)).toBe(false)
    expect(isWorkingDay('2026-11-07', calendar)).toBe(true)
    expect(isWorkingDay('2026-11-08', calendar)).toBe(false)
  })

  it('counts inclusive working duration', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-06', calendar)).toBe(4)
    expect(workingDaysBetween('2026-11-07', '2026-11-07', calendar)).toBe(1)
  })

  it('moves across holidays, weekends, years and leap day', () => {
    expect(nextWorkingDay('2026-11-03', calendar)).toBe('2026-11-05')
    expect(addWorkingDays('2026-11-06', 1, calendar)).toBe('2026-11-07')
    expect(addWorkingDays('2026-12-31', 1, calendar)).toBe('2027-01-01')
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('round-trips date-only values without timezone drift', () => {
    const dates: ISODate[] = ['2026-01-01', '2026-03-29', '2026-10-25', '2028-02-29']
    for (const date of dates) {
      const localDate = toLocalDate(date)
      expect(localDate.getHours()).toBe(0)
      expect(localDate.getMinutes()).toBe(0)
      expect(fromLocalDate(localDate)).toBe(date)
    }
  })
})
