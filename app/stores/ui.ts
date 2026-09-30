import type { MoveMode, QuarterId, StageKind, StageStatus, TimelineScale } from '../domain/models/types'

export type QuarterViewMode = 'current' | 'next' | 'combined' | 'archive'

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
      quarterView.value = 'combined'; selectedQuarterId.value = undefined; scale.value = 'day'; moveMode.value = 'cascade'
      gridWidth.value = 360; collapsedEpicIds.value = []; clearFilters(); hydrate()
    })
    watch([quarterView, selectedQuarterId, scale, moveMode, gridWidth, collapsedEpicIds, capacityOpen, capacityHeight, capacityScope, expandedCapacityRoleIds, () => ({ ...filters })], persist, { deep: true })
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
    capacityOpen, capacityHeight, capacityScope, expandedCapacityRoleIds,
    hydrate, persist, toggleEpic, clearFilters,
  }
})
