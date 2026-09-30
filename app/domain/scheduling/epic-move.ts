import { addCalendarDays, workingDaysBetween } from '../calendar/date'
import type { Epic, Stage, WorkingCalendar } from '../models/types'
import { quarterIdsForRange } from '../quarters/quarters'

/** Translate the whole epic in calendar days without rescheduling its dependencies. */
export function moveEpicSchedule(epic: Epic, stages: Stage[], deltaCalendarDays: number, calendar: WorkingCalendar): { epic: Epic; stages: Stage[] } {
  if (!Number.isInteger(deltaCalendarDays)) throw new Error('Сдвиг эпика должен быть целым числом дней')
  if (deltaCalendarDays === 0) return { epic, stages }
  const locked = stages.find(stage => stage.epicId === epic.id && stage.locked)
  if (locked) throw new Error(`Нельзя перенести эпик: этап «${locked.title}» заблокирован`)
  const movedEpic = { ...epic }
  if (epic.startDate && epic.endDate) {
    movedEpic.startDate = addCalendarDays(epic.startDate, deltaCalendarDays)
    movedEpic.endDate = addCalendarDays(epic.endDate, deltaCalendarDays)
  }
  const movedStages = stages.map((stage) => {
    if (stage.epicId !== epic.id) return stage
    const startDate = addCalendarDays(stage.startDate, deltaCalendarDays)
    const endDate = stage.kind === 'milestone' ? startDate : addCalendarDays(stage.endDate, deltaCalendarDays)
    return {
      ...stage, startDate, endDate,
      durationWorkdays: stage.kind === 'milestone' ? 0 : workingDaysBetween(startDate, endDate, calendar),
      quarterIds: quarterIdsForRange(startDate, endDate),
    }
  })
  return { epic: movedEpic, stages: movedStages }
}
