import { addCalendarDays, compareDates, weekday } from '../../domain/calendar/date'
import { calculateCapacity } from '../../domain/capacity/engine'
import type { Id, ISODate, PlannerData } from '../../domain/models/types'

export interface TimelinePngOptions {
  startDate: ISODate
  endDate: ISODate
  epicIds?: Id[]
  title?: string
  includeLegend?: boolean
  includeDependencies?: boolean
  includeCapacity?: boolean
  baselineId?: Id
}

const DAY_WIDTH = 28
const GRID_WIDTH = 300
const HEADER_HEIGHT = 74
const ROW_HEIGHT = 32
const LEGEND_HEIGHT = 44
const MAX_DIMENSION = 16_384
const MAX_AREA = 60_000_000

function enumerateDates(startDate: ISODate, endDate: ISODate): ISODate[] {
  const result: ISODate[] = []
  for (let date = startDate; compareDates(date, endDate) <= 0; date = addCalendarDays(date, 1)) result.push(date)
  return result
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Браузер не смог создать PNG'))
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}

export async function downloadTimelinePng(data: PlannerData, options: TimelinePngOptions): Promise<void> {
  const epicIds = new Set(options.epicIds ?? data.epics.map(item => item.id))
  const epics = data.epics.filter(item => epicIds.has(item.id) && item.status !== 'archived').sort((a, b) => a.sortOrder - b.sortOrder)
  const stages = data.stages.filter(stage =>
    epicIds.has(stage.epicId)
    && compareDates(stage.endDate, options.startDate) >= 0
    && compareDates(stage.startDate, options.endDate) <= 0,
  ).sort((a, b) => a.epicId.localeCompare(b.epicId) || a.sortOrder - b.sortOrder)
  const rows = epics.flatMap(epic => [{ type: 'epic' as const, epic }, ...stages.filter(stage => stage.epicId === epic.id).map(stage => ({ type: 'stage' as const, epic, stage }))])
  const dates = enumerateDates(options.startDate, options.endDate)
  const capacity = options.includeCapacity
    ? calculateCapacity({
        startDate: options.startDate,
        endDate: options.endDate,
        mode: 'day',
        calendar: data.calendar,
        roles: data.roles,
        people: data.people,
        epics: data.epics,
        stages: data.stages,
        assignments: data.assignments,
        warningThreshold: data.workspace.settings.capacityWarningThreshold,
        epicIds,
      })
    : undefined
  const capacityRows = capacity?.rows ?? []
  const capacityHeight = capacityRows.length ? (capacityRows.length + 1) * ROW_HEIGHT : 0
  const width = GRID_WIDTH + dates.length * DAY_WIDTH
  const height = HEADER_HEIGHT + rows.length * ROW_HEIGHT + capacityHeight + (options.includeLegend === false ? 0 : LEGEND_HEIGHT)
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_AREA) {
    throw new Error(`PNG слишком большой (${width}×${height}). Выберите один квартал или меньше эпиков; для полного плана используйте печать/PDF.`)
  }

  const canvas = document.createElement('canvas')
  const scale = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas API недоступен')
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.font = '12px system-ui, sans-serif'
  context.textBaseline = 'middle'

  context.fillStyle = '#f8fafc'
  context.fillRect(0, 0, width, HEADER_HEIGHT)
  context.fillStyle = '#0f172a'
  context.font = '700 16px system-ui, sans-serif'
  context.fillText(options.title || data.workspace.name, 16, 19)
  context.font = '11px system-ui, sans-serif'
  context.fillStyle = '#64748b'
  context.fillText(`${options.startDate} — ${options.endDate} · экспортировано локально ${new Date().toLocaleString('ru-RU')}`, 16, 41)

  dates.forEach((date, index) => {
    const x = GRID_WIDTH + index * DAY_WIDTH
    const day = weekday(date)
    if (day === 6 || day === 7) {
      context.fillStyle = '#f1f5f9'
      context.fillRect(x, 52, DAY_WIDTH, height - 52)
    }
    context.strokeStyle = '#e2e8f0'
    context.strokeRect(x, 52, DAY_WIDTH, height - 52)
    context.fillStyle = '#64748b'
    context.font = '9px system-ui, sans-serif'
    context.fillText(date.slice(8), x + 7, 64)
  })
  context.strokeStyle = '#cbd5e1'
  context.beginPath()
  context.moveTo(GRID_WIDTH, 52)
  context.lineTo(GRID_WIDTH, height)
  context.stroke()

  const rowY = new Map<string, number>()
  const baselineSnapshots = options.baselineId
    ? data.baselineStages.filter(item => item.baselineId === options.baselineId)
    : []
  rows.forEach((row, index) => {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT
    context.fillStyle = row.type === 'epic' ? '#eff6ff' : index % 2 ? '#ffffff' : '#fafafa'
    context.fillRect(0, y, width, ROW_HEIGHT)
    context.strokeStyle = '#e2e8f0'
    context.beginPath()
    context.moveTo(0, y + ROW_HEIGHT)
    context.lineTo(width, y + ROW_HEIGHT)
    context.stroke()
    context.fillStyle = '#0f172a'
    context.font = row.type === 'epic' ? '700 11px system-ui, sans-serif' : '10px system-ui, sans-serif'
    context.fillText(row.type === 'epic' ? row.epic.title : `  ${row.stage.title}`, 14, y + ROW_HEIGHT / 2)
    if (row.type === 'epic') return
    rowY.set(row.stage.id, y + ROW_HEIGHT / 2)
    const baseline = baselineSnapshots.find(item => item.stageId === row.stage.id)
    if (baseline && compareDates(baseline.endDate, options.startDate) >= 0 && compareDates(baseline.startDate, options.endDate) <= 0) {
      const baselineStart = compareDates(baseline.startDate, options.startDate) < 0 ? options.startDate : baseline.startDate
      const baselineEnd = compareDates(baseline.endDate, options.endDate) > 0 ? options.endDate : baseline.endDate
      const baselineX = GRID_WIDTH + dates.indexOf(baselineStart) * DAY_WIDTH + 4
      const baselineWidth = Math.max(DAY_WIDTH - 8, (dates.indexOf(baselineEnd) - dates.indexOf(baselineStart) + 1) * DAY_WIDTH - 8)
      context.save()
      context.strokeStyle = '#64748b'
      context.fillStyle = '#cbd5e1'
      context.lineWidth = 1
      if (baseline.kind === 'milestone') {
        context.translate(baselineX + DAY_WIDTH / 2, y + ROW_HEIGHT - 7)
        context.rotate(Math.PI / 4)
        context.strokeRect(-5, -5, 10, 10)
      } else {
        context.fillRect(baselineX, y + ROW_HEIGHT - 7, baselineWidth, 3)
      }
      context.restore()
    }
    const clippedStart = compareDates(row.stage.startDate, options.startDate) < 0 ? options.startDate : row.stage.startDate
    const clippedEnd = compareDates(row.stage.endDate, options.endDate) > 0 ? options.endDate : row.stage.endDate
    const startIndex = dates.indexOf(clippedStart)
    const endIndex = dates.indexOf(clippedEnd)
    const x = GRID_WIDTH + startIndex * DAY_WIDTH + 3
    const color = data.activityTypes.find(item => item.id === row.stage.activityTypeId)?.colorToken ?? '#64748b'
    context.fillStyle = color
    if (row.stage.kind === 'milestone') {
      context.save()
      context.translate(x + DAY_WIDTH / 2, y + ROW_HEIGHT / 2)
      context.rotate(Math.PI / 4)
      context.fillRect(-7, -7, 14, 14)
      context.restore()
    } else {
      context.beginPath()
      context.roundRect(x, y + 7, Math.max(DAY_WIDTH - 6, (endIndex - startIndex + 1) * DAY_WIDTH - 6), 18, 4)
      context.fill()
    }
  })

  if (options.includeDependencies) {
    context.strokeStyle = '#64748b'
    context.lineWidth = 1
    for (const link of data.dependencies) {
      const from = data.stages.find(item => item.id === link.predecessorStageId)
      const to = data.stages.find(item => item.id === link.successorStageId)
      const fromY = rowY.get(link.predecessorStageId)
      const toY = rowY.get(link.successorStageId)
      if (!from || !to || fromY === undefined || toY === undefined) continue
      const fromX = GRID_WIDTH + (dates.indexOf(from.endDate) + 1) * DAY_WIDTH
      const toX = GRID_WIDTH + dates.indexOf(to.startDate) * DAY_WIDTH
      context.beginPath()
      context.moveTo(fromX, fromY)
      context.lineTo((fromX + toX) / 2, fromY)
      context.lineTo((fromX + toX) / 2, toY)
      context.lineTo(toX, toY)
      context.stroke()
    }
  }

  if (capacityRows.length) {
    const capacityTop = HEADER_HEIGHT + rows.length * ROW_HEIGHT
    context.fillStyle = '#e2e8f0'
    context.fillRect(0, capacityTop, width, ROW_HEIGHT)
    context.fillStyle = '#334155'
    context.font = '700 10px system-ui, sans-serif'
    context.fillText('Capacity · used / available FTE', 14, capacityTop + ROW_HEIGHT / 2)
    capacityRows.forEach((row, rowIndex) => {
      const y = capacityTop + (rowIndex + 1) * ROW_HEIGHT
      context.fillStyle = row.kind === 'role' ? '#f8fafc' : '#ffffff'
      context.fillRect(0, y, width, ROW_HEIGHT)
      context.strokeStyle = '#e2e8f0'
      context.beginPath()
      context.moveTo(0, y + ROW_HEIGHT)
      context.lineTo(width, y + ROW_HEIGHT)
      context.stroke()
      context.fillStyle = row.kind === 'role' ? '#0f172a' : '#64748b'
      context.font = row.kind === 'role' ? '700 9px system-ui, sans-serif' : '9px system-ui, sans-serif'
      context.fillText(row.kind === 'role' ? row.name : `  ${row.name}`, 14, y + ROW_HEIGHT / 2)
      row.cells.forEach((cell, cellIndex) => {
        const x = GRID_WIDTH + cellIndex * DAY_WIDTH
        if (cell.state === 'overloaded') {
          context.fillStyle = '#fee2e2'
          context.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT)
        } else if (cell.state === 'high') {
          context.fillStyle = '#fef3c7'
          context.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT)
        }
        context.strokeStyle = '#e2e8f0'
        context.strokeRect(x, y, DAY_WIDTH, ROW_HEIGHT)
        context.fillStyle = cell.state === 'overloaded' ? '#b91c1c' : '#475569'
        context.font = '7px system-ui, sans-serif'
        const marker = cell.state === 'overloaded' ? '!' : ''
        context.fillText(`${marker}${cell.usedFte}/${cell.availableFte}`, x + 2, y + ROW_HEIGHT / 2)
      })
    })
  }

  if (options.includeLegend !== false) {
    const y = height - LEGEND_HEIGHT + 18
    let x = 16
    context.font = '9px system-ui, sans-serif'
    for (const activity of data.activityTypes.filter(item => item.isActive)) {
      context.fillStyle = activity.colorToken
      context.fillRect(x, y - 5, 10, 10)
      context.fillStyle = '#475569'
      context.fillText(activity.name, x + 15, y)
      x += 25 + context.measureText(activity.name).width
      if (x > width - 150) break
    }
  }
  await downloadCanvas(canvas, `delivery-plan-${options.startDate}-${options.endDate}.png`)
}
