import type { MoveMode, QuarterId, StageKind, StageStatus, TimelineScale } from '../domain/models/types'

export type QuarterViewMode = 'current' | 'next' | 'combined' | 'archive'
const timelineZoomLevels = [0.25, 0.35, 0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export interface TimelineFilters {
  query: string
  epicIds: string[]
  kinds: StageKind[]
  activityTypeIds: string[]
  statuses: StageStatus[]
  roleIds: string[]
  personIds: string[]
  overloadedOnly: boolean
  conflictsOnly: boolean
  dateFrom: string
  dateTo: string
  showArchived: boolean
}


export const useUiStore = defineStore('ui', () => {
  const route = useRoute()
  const storageKey = () => `delivery-planner:${String(route.params.code || '')}:ui-preferences:v1`
  const quarterView = ref<QuarterViewMode>('combined')
  const selectedQuarterId = ref<QuarterId>()
  const scale = ref<TimelineScale>('day')
  const timelineZoom = ref(1)
  const timelineColumnWidth = computed(() => Math.round(({ day: 34, week: 64, month: 92 }[scale.value]) * timelineZoom.value))
  const canZoomIn = computed(() => timelineZoom.value < timelineZoomLevels.at(-1)!)
  const canZoomOut = computed(() => timelineZoom.value > timelineZoomLevels[0]!)

  function zoomTimeline(direction: -1 | 1): void {
    const index = timelineZoomLevels.indexOf(timelineZoom.value)
    timelineZoom.value = timelineZoomLevels[Math.max(0, Math.min(timelineZoomLevels.length - 1, index + direction))]!
  }
  const moveMode = ref<MoveMode>('cascade')
  const gridWidth = ref(360)
  const collapsedEpicIds = ref<string[]>([])
  const capacityOpen = ref(true)
  const capacityHeight = ref(230)
  const capacityScope = ref<'workspace' | 'visible'>('workspace')
  const expandedCapacityRoleIds = ref<string[]>([])
  const filters = reactive<TimelineFilters>({
    query: '', epicIds: [], kinds: [], activityTypeIds: [], statuses: [], roleIds: [], personIds: [],
    overloadedOnly: false, conflictsOnly: false, dateFrom: '', dateTo: '', showArchived: false,
  })

  function hydrate(): void {
    if (!import.meta.client) return
    const raw = localStorage.getItem(storageKey())
    if (!raw) return
    try {
      const value = JSON.parse(raw) as Partial<{
        quarterView: QuarterViewMode
        selectedQuarterId: QuarterId
        scale: TimelineScale
        timelineZoom: number
        moveMode: MoveMode
        gridWidth: number
        collapsedEpicIds: string[]
        filters: TimelineFilters
        capacityOpen: boolean
        capacityHeight: number
        capacityScope: 'workspace' | 'visible'
        expandedCapacityRoleIds: string[]
      }>
      if (value.quarterView) quarterView.value = value.quarterView
      if (value.selectedQuarterId) selectedQuarterId.value = value.selectedQuarterId
      if (value.scale) scale.value = value.scale
      if (value.timelineZoom !== undefined && timelineZoomLevels.includes(value.timelineZoom)) timelineZoom.value = value.timelineZoom
      if (value.moveMode) moveMode.value = value.moveMode
      if (value.gridWidth) gridWidth.value = value.gridWidth
      if (value.collapsedEpicIds) collapsedEpicIds.value = value.collapsedEpicIds
      if (value.filters) Object.assign(filters, value.filters)
      if (value.capacityOpen !== undefined) capacityOpen.value = value.capacityOpen
      if (value.capacityHeight) capacityHeight.value = value.capacityHeight
      if (value.capacityScope) capacityScope.value = value.capacityScope
      if (value.expandedCapacityRoleIds) expandedCapacityRoleIds.value = value.expandedCapacityRoleIds
    } catch {
      localStorage.removeItem(storageKey())
    }
  }

  function persist(): void {
    if (!import.meta.client) return
    localStorage.setItem(storageKey(), JSON.stringify({
      quarterView: quarterView.value,
      selectedQuarterId: selectedQuarterId.value,
      scale: scale.value,
      timelineZoom: timelineZoom.value,
      moveMode: moveMode.value,
      gridWidth: gridWidth.value,
      collapsedEpicIds: collapsedEpicIds.value,
      filters: { ...filters },
      capacityOpen: capacityOpen.value,
      capacityHeight: capacityHeight.value,
      capacityScope: capacityScope.value,
      expandedCapacityRoleIds: expandedCapacityRoleIds.value,
    }))
  }

  if (import.meta.client) {
    hydrate()
    watch(() => route.params.code, () => {
      quarterView.value = 'combined'; selectedQuarterId.value = undefined; scale.value = 'day'; timelineZoom.value = 1; moveMode.value = 'cascade'
      gridWidth.value = 360; collapsedEpicIds.value = []; clearFilters(); hydrate()
    })
    watch([quarterView, selectedQuarterId, scale, timelineZoom, moveMode, gridWidth, collapsedEpicIds, capacityOpen, capacityHeight, capacityScope, expandedCapacityRoleIds, () => ({ ...filters })], persist, { deep: true })
  }

  function toggleEpic(id: string): void {
    collapsedEpicIds.value = collapsedEpicIds.value.includes(id)
      ? collapsedEpicIds.value.filter(item => item !== id)
      : [...collapsedEpicIds.value, id]
  }

  function clearFilters(): void {
    Object.assign(filters, { query: '', epicIds: [], kinds: [], activityTypeIds: [], statuses: [], roleIds: [], personIds: [], overloadedOnly: false, conflictsOnly: false, dateFrom: '', dateTo: '', showArchived: false })
  }

  return {
    quarterView, selectedQuarterId, scale, moveMode, gridWidth, collapsedEpicIds, filters,
    timelineZoom, timelineColumnWidth, canZoomIn, canZoomOut, zoomTimeline,
    capacityOpen, capacityHeight, capacityScope, expandedCapacityRoleIds,
    hydrate, persist, toggleEpic, clearFilters,
  }
})
