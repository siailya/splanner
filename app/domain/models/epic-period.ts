import type { Epic, ISODate, Stage } from './types'

export interface EpicPeriod { startDate: ISODate; endDate: ISODate }

export function epicPeriod(epic: Epic, stages: Stage[]): EpicPeriod | undefined {
  // Manual dates set a minimum period; stage boundaries can extend either edge.
  const manualPeriod = epic.startDate && epic.endDate ? { startDate: epic.startDate, endDate: epic.endDate } : undefined
  const ownStages = stages.filter(stage => stage.epicId === epic.id)
  if (!ownStages.length) return manualPeriod
  return {
    startDate: ownStages.reduce((earliest, stage) => stage.startDate < earliest ? stage.startDate : earliest, manualPeriod?.startDate ?? ownStages[0]!.startDate),
    endDate: ownStages.reduce((latest, stage) => stage.endDate > latest ? stage.endDate : latest, manualPeriod?.endDate ?? ownStages[0]!.endDate),
  }
}

export function periodOverlaps(period: EpicPeriod, range: EpicPeriod): boolean {
  return period.startDate <= range.endDate && period.endDate >= range.startDate
}

export function epicVisibleInRange(epic: Epic, visibleStages: Stage[], range: EpicPeriod): boolean {
  if (visibleStages.some(stage => stage.epicId === epic.id)) return true
  return Boolean(epic.startDate && epic.endDate && periodOverlaps({ startDate: epic.startDate, endDate: epic.endDate }, range))
}
