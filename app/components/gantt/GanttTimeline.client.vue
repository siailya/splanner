<template>
  <div class="gantt-frame">
    <div ref="container" class="gantt-container" />
    <div v-if="previewCount > 1" class="cascade-preview-note">
      <UIcon name="i-lucide-git-branch" />
      Каскад затронет этапов: {{ previewCount }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ActivityType, BaselineStageSnapshot, Dependency, Epic, ISODate, Stage, TimelineScale, WorkingCalendar, WorkItem } from '../../domain/models/types'
import { addCalendarDays, addWorkingDays, fromLocalDate, isWorkingDay, toLocalDate, workingDayDelta } from '../../domain/calendar/date'
import { transitiveSuccessors } from '../../domain/scheduling/graph'

const props = defineProps<{
  epics: Epic[]
  stages: Stage[]
  activityTypes?: ActivityType[]
  dependencies: Dependency[]
  calendar: WorkingCalendar
  rangeStart: ISODate
  rangeEnd: ISODate
  scale: TimelineScale
  gridWidth: number
  collapsedEpicIds: string[]
  mode: 'cascade' | 'free'
  conflictStageIds: string[]
  selectedStageIds?: string[]
  highlightedStageIds?: string[]
  workItems?: WorkItem[]
  baselineSnapshots?: BaselineStageSnapshot[]
  baselineNewStageIds?: string[]
}>()

const emit = defineEmits<{
  taskChange: [payload: { id: string; startDate: ISODate; endDate: ISODate; action: 'move' | 'resize'; alternateMode: boolean }]
  linkAdd: [payload: { source: string; target: string }]
  linkDelete: [id: string]
  editStage: [id: string]
  editEpic: [id: string]
  moveStage: [payload: { id: string; epicId: string }]
  reorderStage: [payload: { id: string; epicId: string; index: number }]
  epicCollapsed: [payload: { id: string; collapsed: boolean }]
  editDependency: [id: string]
  rangeCreate: [payload: { epicId: string; startDate: ISODate; endDate: ISODate }]
  stageSelect: [payload: { id: string; additive: boolean; range: boolean }]
  viewportChange: [payload: { x: number; y: number }]
}>()

const container = ref<HTMLElement>()
const previewCount = ref(0)
let instance: import('dhtmlx-gantt').GanttStatic | undefined
let eventIds: string[] = []
let dragCreateStart: { x: number; rowId: string } | undefined
let alternateDuringDrag = false
let worktimeOverrideDates: ISODate[] = []
let renderedViewKey: string | undefined
let viewportRestoreFrame: number | undefined

function viewKey(): string {
  return [props.rangeStart, props.rangeEnd, props.scale, props.gridWidth].join('|')
}

function taskData() {
  const epicRows = props.epics.map(epic => ({
    id: `epic:${epic.id}`,
    text: epic.title,
    type: 'project',
    open: !props.collapsedEpicIds.includes(epic.id),
    readonly: true,
    epicId: epic.id,
    marker: epic.marker,
    sortOrder: epic.sortOrder,
    workDone: props.workItems?.filter(item => item.epicId === epic.id && item.status === 'done').length ?? 0,
    workTotal: props.workItems?.filter(item => item.epicId === epic.id).length ?? 0,
  }))
  const stageRows = props.stages.map(stage => ({
    id: stage.id,
    text: stage.title,
    start_date: toLocalDate(stage.startDate),
    end_date: toLocalDate(addCalendarDays(stage.endDate, 1)),
    duration: stage.kind === 'milestone' ? 0 : stage.durationWorkdays,
    durationWorkdays: stage.durationWorkdays,
    type: stage.kind === 'milestone' ? 'milestone' : 'task',
    parent: `epic:${stage.epicId}`,
    sortOrder: stage.sortOrder,
    kind: stage.kind,
    status: stage.status,
    activityTypeId: stage.activityTypeId,
    locked: stage.locked,
    readonly: stage.locked,
    color: props.activityTypes?.find(type => type.id === stage.activityTypeId)?.colorToken,
    workDone: props.workItems?.filter(item => item.stageId === stage.id && item.status === 'done').length ?? 0,
    workTotal: props.workItems?.filter(item => item.stageId === stage.id).length ?? 0,
  }))
  return {
    data: [...epicRows, ...stageRows],
    links: props.dependencies.map(link => ({
      id: link.id, source: link.predecessorStageId, target: link.successorStageId, type: '0', lag: link.lagWorkdays,
    })),
  }
}

function configure(gantt: import('dhtmlx-gantt').GanttStatic) {
  gantt.i18n.setLocale('ru')
  gantt.config.date_format = '%Y-%m-%d'
  gantt.config.xml_date = '%Y-%m-%d'
  gantt.config.duration_unit = 'day'
  gantt.config.work_time = true
  gantt.config.correct_work_time = true
  gantt.config.skip_off_time = false
  gantt.config.smart_rendering = true
  gantt.config.preserve_scroll = true
  gantt.config.initial_scroll = false
  gantt.config.order_branch = true
  gantt.config.order_branch_free = true
  gantt.config.grid_width = props.gridWidth
  gantt.config.row_height = 42
  gantt.config.bar_height = 24
  gantt.config.scale_height = props.scale === 'day' ? 72 : 56
  gantt.config.min_column_width = props.scale === 'day' ? 34 : props.scale === 'week' ? 64 : 92
  gantt.config.start_date = toLocalDate(props.rangeStart)
  gantt.config.end_date = toLocalDate(addCalendarDays(props.rangeEnd, 1))
  gantt.config.fit_tasks = false
  gantt.config.show_unscheduled = true
  gantt.config.drag_links = true
  gantt.config.drag_move = true
  gantt.config.drag_resize = true
  gantt.config.drag_progress = false
  gantt.config.details_on_dblclick = false
  gantt.config.columns = [
    { name: 'text', label: 'Эпик / этап', tree: true, width: '*', min_width: 190, template: (task: Record<string, unknown>) => `${String(task.text)}${Number(task.workTotal) > 0 ? ` <span class="gantt-work-count">${String(task.workDone)}/${String(task.workTotal)}</span>` : ''}` },
    { name: 'duration', label: 'Дни', align: 'center', width: 54, template: (task: Record<string, unknown>) => task.type === 'project' ? '' : task.kind === 'milestone' ? '—' : String(task.durationWorkdays ?? '') },
    { name: 'lock', label: '', align: 'center', width: 38, template: (task: Record<string, unknown>) => task.locked ? '🔒' : '' },
  ]
  gantt.config.scales = props.scale === 'day'
    ? [
        { unit: 'month', step: 1, format: '%F %Y' },
        { unit: 'day', step: 1, format: '%d' },
        { unit: 'day', step: 1, format: '%D' },
      ]
    : props.scale === 'week'
      ? [{ unit: 'month', step: 1, format: '%F %Y' }, { unit: 'week', step: 1, format: date => `Нед. ${gantt.date.date_to_str('%W')(date)}` }]
      : [{ unit: 'year', step: 1, format: '%Y' }, { unit: 'month', step: 1, format: '%F' }]

  for (const date of worktimeOverrideDates) gantt.unsetWorkTime({ date: toLocalDate(date) })
  for (let day = 0; day <= 6; day += 1) {
    const domainDay = day === 0 ? 7 : day
    gantt.setWorkTime({ day, hours: props.calendar.workingWeekdays.includes(domainDay) })
  }
  for (const holiday of props.calendar.holidays) gantt.setWorkTime({ date: toLocalDate(holiday), hours: false })
  for (const extra of props.calendar.extraWorkingDays) gantt.setWorkTime({ date: toLocalDate(extra), hours: true })
  worktimeOverrideDates = [...new Set([...props.calendar.holidays, ...props.calendar.extraWorkingDays])]

  gantt.templates.timeline_cell_class = (_task, date) => {
    const value = fromLocalDate(date)
    const classes = []
    if (!isWorkingDay(value, props.calendar)) classes.push('non-working-cell')
    if (value === fromLocalDate(new Date())) classes.push('today-cell')
    return classes.join(' ')
  }
  gantt.templates.scale_cell_class = date => !isWorkingDay(fromLocalDate(date), props.calendar) ? 'non-working-scale' : ''
  gantt.templates.task_class = (_start, _end, task: Record<string, unknown>) => {
    const classes = [`stage-${task.kind ?? 'task'}`, `status-${String(task.status ?? 'planned').replace('_', '-')}`]
    const activitySlug = props.activityTypes?.find(type => type.id === task.activityTypeId)?.slug
    if (activitySlug) classes.push(`activity-${activitySlug}`)
    if (props.conflictStageIds.includes(String(task.id))) classes.push('has-conflict')
    if (props.selectedStageIds?.includes(String(task.id))) classes.push('is-selected')
    if (props.highlightedStageIds?.includes(String(task.id))) classes.push('is-contributor')
    if (props.baselineNewStageIds?.includes(String(task.id))) classes.push('is-new-since-baseline')
    if (task.locked) classes.push('is-locked')
    return classes.join(' ')
  }
  gantt.templates.link_class = (link: Record<string, unknown>) => props.conflictStageIds.includes(String(link.target)) ? 'conflict-link' : ''
  gantt.templates.tooltip_text = (_start, _end, task: Record<string, unknown>) => {
    if (task.type === 'project') return `<strong>${String(task.text)}</strong>`
    const stage = props.stages.find(item => item.id === task.id)
    if (!stage) return ''
    const activity = stage.activityTypeId.replace('activity-', '')
    return `<div class="planner-tooltip"><strong>${stage.title}</strong><span>${stage.kind} · ${activity}</span><span>${stage.startDate} — ${stage.endDate}</span><span>${stage.kind === 'milestone' ? 'Веха' : `${stage.durationWorkdays} раб. дн.`}</span>${props.conflictStageIds.includes(stage.id) ? '<b>⚠ Нарушена зависимость</b>' : ''}</div>`
  }
}

function attachEvents(gantt: import('dhtmlx-gantt').GanttStatic) {
  eventIds = [
    gantt.attachEvent('onBeforeTaskChanged', (id, mode, _originalTask) => {
      if (String(id).startsWith('epic:')) return false
      const changedTask = gantt.getTask(id)
      const startDate = fromLocalDate(changedTask.start_date as Date)
      const rawEnd = fromLocalDate(changedTask.end_date as Date)
      const stage = props.stages.find(item => item.id === String(id))
      const endDate = stage?.kind === 'milestone' ? startDate : addCalendarDays(rawEnd, -1)
      emit('taskChange', {
        id: String(id), startDate, endDate,
        action: mode === 'resize' ? 'resize' : 'move',
        alternateMode: alternateDuringDrag,
      })
      alternateDuringDrag = false
      previewCount.value = 0
      clearCascadeGhosts()
      return false
    }),
    gantt.attachEvent('onTaskDrag', (id, mode, _task, _original, event) => {
      alternateDuringDrag = (event as MouseEvent).altKey
      if (mode === 'move' && (props.mode === 'cascade') !== (event as MouseEvent).altKey) {
        const successors = transitiveSuccessors([String(id)], props.dependencies)
        previewCount.value = 1 + successors.size
        renderCascadeGhosts(String(id), successors)
      } else {
        previewCount.value = 1
        clearCascadeGhosts()
      }
    }),
    gantt.attachEvent('onBeforeLinkAdd', (_id, link) => {
      emit('linkAdd', { source: String(link.source), target: String(link.target) })
      return false
    }),
    gantt.attachEvent('onBeforeLinkDelete', (id) => {
      emit('linkDelete', String(id))
      return false
    }),
    gantt.attachEvent('onBeforeTaskMove', (id, parent, index) => {
      const target = String(parent)
      if (!String(id).startsWith('epic:') && target.startsWith('epic:')) {
        const stage = props.stages.find(item => item.id === String(id))
        const epicId = target.slice(5)
        if (stage?.epicId === epicId) emit('reorderStage', { id: String(id), epicId, index })
        else emit('moveStage', { id: String(id), epicId })
      }
      return false
    }),
    gantt.attachEvent('onTaskClosed', (id) => {
      const value = String(id)
      if (value.startsWith('epic:')) emit('epicCollapsed', { id: value.slice(5), collapsed: true })
    }),
    gantt.attachEvent('onTaskOpened', (id) => {
      const value = String(id)
      if (value.startsWith('epic:')) emit('epicCollapsed', { id: value.slice(5), collapsed: false })
    }),
    gantt.attachEvent('onLinkDblClick', (id) => {
      emit('editDependency', String(id))
      return false
    }),
    gantt.attachEvent('onTaskClick', (id, event) => {
      const value = String(id)
      if (!value.startsWith('epic:')) emit('stageSelect', { id: value, additive: (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey, range: (event as MouseEvent).shiftKey })
      return true
    }),
    gantt.attachEvent('onGanttScroll', (x, y) => {
      emit('viewportChange', { x, y })
    }),
  ]
}

function clearCascadeGhosts() {
  container.value?.querySelectorAll('.gantt-cascade-ghost').forEach(node => node.remove())
}

function renderCascadeGhosts(draggedId: string, successorIds: Set<string>) {
  if (!instance || !container.value || !instance.isTaskExists(draggedId)) return
  clearCascadeGhosts()
  const dragged = props.stages.find(item => item.id === draggedId)
  const draggedTask = instance.getTask(draggedId)
  const layer = container.value.querySelector<HTMLElement>('.gantt_bars_area')
  if (!dragged || !layer) return
  const delta = workingDayDelta(dragged.startDate, fromLocalDate(draggedTask.start_date as Date), props.calendar)
  for (const id of successorIds) {
    const stage = props.stages.find(item => item.id === id)
    if (!stage || !instance.isTaskExists(id)) continue
    const task = instance.getTask(id)
    const start = toLocalDate(addWorkingDays(stage.startDate, delta, props.calendar))
    const endDate = stage.kind === 'milestone' ? start : toLocalDate(addCalendarDays(addWorkingDays(stage.endDate, delta, props.calendar), 1))
    const position = instance.getTaskPosition(task, start, endDate)
    const ghost = document.createElement('div')
    ghost.className = `gantt-cascade-ghost${stage.locked ? ' gantt-cascade-ghost--locked' : ''}`
    ghost.style.left = `${position.left}px`
    ghost.style.top = `${position.top}px`
    ghost.style.width = `${stage.kind === 'milestone' ? 14 : Math.max(position.width, 4)}px`
    ghost.style.height = `${position.height}px`
    ghost.title = stage.locked ? `Заблокирован: ${stage.title}` : `Будет перемещён: ${stage.title}`
    layer.append(ghost)
  }
}

function render() {
  if (!instance) return
  const nextViewKey = viewKey()
  // clearAll() resets DHTMLX's internal scroll state. Keep the viewport for
  // data-only updates (drag, resize, cascade, undo/redo), but reset it when
  // the visible date range, scale or grid geometry intentionally changes.
  const viewport = renderedViewKey === nextViewKey ? instance.getScrollState() : undefined
  configure(instance)
  instance.clearAll()
  instance.parse(taskData())
  instance.render()
  syncVisualState()
  scheduleBaselineOverlays()
  renderedViewKey = nextViewKey

  if (viewport) {
    instance.scrollTo(viewport.x, viewport.y)
    if (viewportRestoreFrame !== undefined) cancelAnimationFrame(viewportRestoreFrame)
    viewportRestoreFrame = requestAnimationFrame(() => {
      instance?.scrollTo(viewport.x, viewport.y)
      viewportRestoreFrame = undefined
    })
  }
}

function syncVisualState() {
  if (!instance || !container.value) return
  for (const node of container.value.querySelectorAll<HTMLElement>('.gantt_task_line.is-selected, .gantt_task_line.is-contributor')) {
    node.classList.remove('is-selected', 'is-contributor')
  }
  for (const id of props.selectedStageIds ?? []) instance.getTaskNode(id)?.classList.add('is-selected')
  for (const id of props.highlightedStageIds ?? []) instance.getTaskNode(id)?.classList.add('is-contributor')
}

function renderBaselineOverlays() {
  if (!instance || !container.value) return
  const dataArea = container.value.querySelector<HTMLElement>('.gantt_task_baselines')
  if (!dataArea) return
  dataArea.querySelectorAll('.gantt-baseline').forEach(node => node.remove())
  for (const snapshot of props.baselineSnapshots ?? []) {
    if (!instance.isTaskExists(snapshot.stageId)) continue
    const task = instance.getTask(snapshot.stageId)
    const start = toLocalDate(snapshot.startDate)
    const end = toLocalDate(addCalendarDays(snapshot.endDate, 1))
    const position = instance.getTaskPosition(task, start, snapshot.kind === 'milestone' ? start : end)
    const node = document.createElement('div')
    node.className = snapshot.kind === 'milestone' ? 'gantt-baseline gantt-baseline--milestone' : 'gantt-baseline'
    node.style.left = `${position.left}px`
    node.style.top = `${position.top + position.height - 2}px`
    node.style.width = `${snapshot.kind === 'milestone' ? 10 : Math.max(position.width, 2)}px`
    node.title = `Baseline: ${snapshot.startDate} — ${snapshot.endDate}`
    dataArea.append(node)
  }
}

function scheduleBaselineOverlays() {
  requestAnimationFrame(() => requestAnimationFrame(renderBaselineOverlays))
}

function pointerPosition(event: PointerEvent): { x: number; rowId: string } | undefined {
  if (!instance || !container.value) return
  const target = event.target as HTMLElement
  if (!target.closest('.gantt_task_cell')) return
  const row = target.closest<HTMLElement>('.gantt_task_row')
  const dataArea = container.value.querySelector<HTMLElement>('.gantt_task_data')
  const rowId = row?.getAttribute('task_id')
  if (!dataArea || !rowId) return
  return { x: event.clientX - dataArea.getBoundingClientRect().left + instance.getScrollState().x, rowId }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  dragCreateStart = pointerPosition(event)
}

function onPointerUp(event: PointerEvent) {
  if (!instance || !dragCreateStart) return
  const end = pointerPosition(event)
  const start = dragCreateStart
  dragCreateStart = undefined
  if (!end || end.rowId !== start.rowId || Math.abs(end.x - start.x) < 12) return
  const rowId = start.rowId
  const stage = props.stages.find(item => item.id === rowId)
  const epicId = rowId.startsWith('epic:') ? rowId.slice(5) : stage?.epicId
  if (!epicId) return
  const first = fromLocalDate(instance.dateFromPos(Math.min(start.x, end.x)))
  const lastExclusive = fromLocalDate(instance.dateFromPos(Math.max(start.x, end.x)))
  emit('rangeCreate', { epicId, startDate: first, endDate: addCalendarDays(lastExclusive, -1) })
}

function onDoubleClick(event: MouseEvent) {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[task_id]')
  const value = row?.getAttribute('task_id')
  if (!value) return
  if (value.startsWith('epic:')) emit('editEpic', value.slice(5))
  else emit('editStage', value)
  event.preventDefault()
}

function scrollToToday() {
  instance?.showDate(new Date())
}

function scrollToX(x: number) {
  instance?.scrollTo(x, null)
}

function focusStage(id: string) {
  if (!instance?.isTaskExists(id)) return
  instance.showTask(id)
  instance.selectTask(id)
}

function visibleDateRange(): { startDate: ISODate; endDate: ISODate } | undefined {
  if (!instance || !container.value) return
  const timeline = container.value.querySelector<HTMLElement>('.gantt_task')
  if (!timeline) return
  const scroll = instance.getScrollState()
  const startDate = fromLocalDate(instance.dateFromPos(scroll.x))
  const exclusiveEnd = fromLocalDate(instance.dateFromPos(scroll.x + timeline.clientWidth))
  return { startDate, endDate: addCalendarDays(exclusiveEnd, -1) }
}

defineExpose({ scrollToToday, scrollToX, focusStage, visibleDateRange })

onMounted(async () => {
  const { Gantt } = await import('dhtmlx-gantt')
  instance = Gantt.getGanttInstance()
  instance.plugins({ tooltip: true })
  configure(instance)
  attachEvents(instance)
  instance.init(container.value!)
  instance.parse(taskData())
  scheduleBaselineOverlays()
  renderedViewKey = viewKey()
  container.value?.addEventListener('pointerdown', onPointerDown)
  container.value?.addEventListener('pointerup', onPointerUp)
  container.value?.addEventListener('dblclick', onDoubleClick)
})

watch(() => [props.epics, props.stages, props.dependencies, props.calendar, props.rangeStart, props.rangeEnd, props.scale, props.gridWidth, props.collapsedEpicIds, props.conflictStageIds, props.workItems, props.baselineSnapshots, props.baselineNewStageIds], render, { deep: true })
watch(() => [props.selectedStageIds, props.highlightedStageIds], syncVisualState, { deep: true })

onBeforeUnmount(() => {
  if (!instance) return
  if (viewportRestoreFrame !== undefined) cancelAnimationFrame(viewportRestoreFrame)
  clearCascadeGhosts()
  for (const id of eventIds) instance.detachEvent(id)
  container.value?.removeEventListener('pointerdown', onPointerDown)
  container.value?.removeEventListener('pointerup', onPointerUp)
  container.value?.removeEventListener('dblclick', onDoubleClick)
  instance.destructor()
  instance = undefined
})
</script>
