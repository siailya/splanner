import { compareDates } from '../calendar/date'
import type { ISODate, Quarter, QuarterId } from '../models/types'

export function quarterIdForDate(date: ISODate): QuarterId {
  const [year, month] = date.split('-').map(Number) as [number, number]
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}` as QuarterId
}

export function createQuarter(id: QuarterId, workspaceId: string): Quarter {
  const [yearPart, numberPart] = id.split('-Q')
  const year = Number(yearPart)
  const number = Number(numberPart) as 1 | 2 | 3 | 4
  const startMonth = (number - 1) * 3 + 1
  const endMonth = startMonth + 2
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  return {
    id,
    workspaceId,
    year,
    number,
    startDate: `${year}-${String(startMonth).padStart(2, '0')}-01` as ISODate,
    endDate: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}` as ISODate,
  }
}

export function nextQuarterId(id: QuarterId): QuarterId {
  const quarter = createQuarter(id, '')
  return quarter.number === 4 ? `${quarter.year + 1}-Q1` : `${quarter.year}-Q${quarter.number + 1}` as QuarterId
}

export function quarterIdsForRange(start: ISODate, end: ISODate): QuarterId[] {
  if (compareDates(start, end) > 0) throw new Error('Дата начала позже даты окончания')
  const result: QuarterId[] = []
  let id = quarterIdForDate(start)
  const last = quarterIdForDate(end)
  while (true) {
    result.push(id)
    if (id === last) return result
    id = nextQuarterId(id)
  }
}
