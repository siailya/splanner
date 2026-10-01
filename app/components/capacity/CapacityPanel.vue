<template>
  <section class="capacity-panel" :class="{ 'capacity-panel--collapsed': !ui.capacityOpen }" :style="ui.capacityOpen ? { height: `${ui.capacityHeight}px` } : undefined">
    <div v-if="ui.capacityOpen" class="capacity-resizer" @pointerdown="startResize" />
    <header class="capacity-header">
      <button class="capacity-collapse" type="button" @click="ui.capacityOpen = !ui.capacityOpen"><UIcon :name="ui.capacityOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" /></button>
      <div><strong>Capacity</strong><span>{{ result.mode === 'day' ? 'Дневная загрузка, FTE' : 'Недельная загрузка, человеко-дни' }}</span></div>
      <span class="scope-badge" :class="{ warning: ui.capacityScope === 'visible' }">{{ ui.capacityScope === 'workspace' ? 'Весь workspace' : 'Только видимые эпики' }}</span>
      <div class="capacity-header__tools">
        <select v-model="roleFilter"><option value="">Все роли</option><option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option></select>
        <select v-model="personFilter"><option value="">Все сотрудники</option><option v-for="row in result.rows.filter(item => item.kind === 'person')" :key="row.id" :value="row.id.slice(7)">{{ row.name }}</option></select>
        <label><input v-model="overloadOnly" type="checkbox" /> Только перегрузка</label>
        <label><input v-model="freeOnly" type="checkbox" /> Только свободный capacity</label>
        <button type="button" @click="ui.capacityScope = ui.capacityScope === 'workspace' ? 'visible' : 'workspace'">Сменить расчёт</button>
      </div>
    </header>
    <div v-if="ui.capacityOpen && !roles.length" class="capacity-empty"><UIcon name="i-lucide-users" /><span>Добавьте роли и сотрудников в разделе «Команда».</span><NuxtLink :to="workspacePath('/team')">Открыть команду</NuxtLink></div>
    <div v-else-if="ui.capacityOpen" ref="scrollElement" class="capacity-scroll" @scroll="onScroll">
      <div class="capacity-table" :style="tableStyle">
        <div class="capacity-row capacity-row--periods" :style="tableStyle">
          <div class="capacity-label capacity-label--header">Роль / сотрудник</div>
          <div v-if="props.geometry?.offset" class="capacity-period" aria-hidden="true" />
          <div v-for="(period, index) in result.periods" :key="period.key" class="capacity-period" :class="{ 'capacity-period--compact': result.mode === 'day' && periodWidths[index]! < 16 }" :title="`${period.startDate} — ${period.endDate}`"><span>{{ periodLabel(period, index) }}</span></div>
        </div>
        <div v-for="row in visibleRows" :key="row.id" class="capacity-row" :class="`capacity-row--${row.kind}`" :style="tableStyle">
          <button class="capacity-label" type="button" @click="toggleRole(row)">
            <UIcon v-if="row.kind === 'role'" :name="ui.expandedCapacityRoleIds.includes(row.roleId!) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
            <span>{{ row.name }}</span>
          </button>
          <div v-if="props.geometry?.offset" class="capacity-period" aria-hidden="true" />
          <button
            v-for="(cell, index) in row.cells" :key="cell.key" type="button" class="capacity-cell" :class="[`capacity-cell--${cell.state}`, { 'capacity-cell--compact': periodWidths[index]! < 24 }]"
            :title="tooltip(cell)" @click="$emit('drilldown', { row, cell })" @mouseenter="$emit('highlight', cell.contributions.map(item => item.stageId))" @mouseleave="$emit('highlight', [])"
          >
            <template v-if="result.mode === 'day'">
              <strong>{{ cell.usedFte }}/{{ cell.availableFte }}</strong>
              <span>{{ percent(cell) }}</span>
            </template>
            <template v-else>
              <strong>{{ cell.assignedPersonDays }} дн.</strong>
              <span>{{ percent(cell) }}</span>
            </template>
            <UIcon v-if="cell.state === 'overloaded'" name="i-lucide-triangle-alert" aria-label="Перегрузка" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import type { CapacityCell, CapacityResult, CapacityRow } from '../../domain/capacity/engine'
import type { Role } from '../../domain/models/types'
import { weekday } from '../../domain/calendar/date'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ result: CapacityResult; roles: Role[]; gridWidth: number; scrollX: number; geometry?: { gridWidth: number; offset: number; widths: number[] } }>()
const emit = defineEmits<{
  scroll: [x: number]
  drilldown: [payload: { row: CapacityRow; cell: CapacityCell }]
  highlight: [stageIds: string[]]
}>()
const ui = useUiStore()
const scrollElement = ref<HTMLElement>()
const roleFilter = ref('')
const personFilter = ref('')
const overloadOnly = ref(false)
const freeOnly = ref(false)
const syncing = ref(false)
const periodWidths = computed(() => props.geometry?.widths.length === props.result.periods.length
  ? props.geometry.widths : props.result.periods.map(() => props.result.mode === 'day' ? ui.timelineColumnWidth : 76))
const tableStyle = computed(() => {
  const gridWidth = props.geometry?.gridWidth ?? props.gridWidth
  const offset = props.geometry?.offset ?? 0
  const widths = periodWidths.value
  return {
    gridTemplateColumns: `${gridWidth}px ${offset ? `${offset}px ` : ''}${widths.map(width => `${width}px`).join(' ')}`,
    minWidth: `${gridWidth + offset + widths.reduce((sum, width) => sum + width, 0)}px`,
  }
})
function periodLabel(period: CapacityResult['periods'][number], index: number): string {
  return props.result.mode === 'day' && periodWidths.value[index]! < 16 && weekday(period.startDate) !== 1 ? '' : period.label
}
const visibleRows = computed(() => {
  const expanded = new Set(ui.expandedCapacityRoleIds)
  return props.result.rows.filter((row) => {
    if (roleFilter.value && row.roleId !== roleFilter.value) return false
    if (personFilter.value) {
      const personRow = props.result.rows.find(item => item.id === `person:${personFilter.value}`)
      if (row.kind === 'role' && row.roleId !== personRow?.roleId) return false
      if (row.kind === 'person' && row.id !== `person:${personFilter.value}`) return false
      if (row.kind === 'unassigned') return false
    } else if (row.kind !== 'role' && !expanded.has(row.roleId!)) return false
    if (overloadOnly.value && !row.cells.some(cell => cell.state === 'overloaded')) return false
    if (freeOnly.value && !row.cells.some(cell => cell.freeFte > 0)) return false
    return true
  }).sort((a, b) => {
    if (a.roleId === b.roleId) return ({ role: 0, person: 1, unassigned: 2 }[a.kind] - { role: 0, person: 1, unassigned: 2 }[b.kind])
    return props.roles.findIndex(role => role.id === a.roleId) - props.roles.findIndex(role => role.id === b.roleId)
  })
})
watch(() => [props.scrollX, props.geometry, ui.capacityOpen], async () => {
  await nextTick()
  const value = props.scrollX
  if (!scrollElement.value || Math.abs(scrollElement.value.scrollLeft - value) < 1) return
  syncing.value = true; scrollElement.value.scrollLeft = value; requestAnimationFrame(() => { syncing.value = false })
}, { deep: true })
function onScroll() { if (!syncing.value && scrollElement.value) emit('scroll', scrollElement.value.scrollLeft) }
function toggleRole(row: CapacityRow) { if (row.kind !== 'role' || !row.roleId) return; ui.expandedCapacityRoleIds = ui.expandedCapacityRoleIds.includes(row.roleId) ? ui.expandedCapacityRoleIds.filter(id => id !== row.roleId) : [...ui.expandedCapacityRoleIds, row.roleId] }
function percent(cell: CapacityCell) { return cell.utilization === null ? (cell.usedFte > 0 ? 'нет capacity' : '—') : `${Math.round(cell.utilization * 100)}%` }
function tooltip(cell: CapacityCell) { return `Занято: ${cell.usedFte} FTE\nДоступно: ${cell.availableFte} FTE\nСвободно: ${cell.freeFte} FTE\nВкладов: ${cell.contributions.length}` }
function startResize(event: PointerEvent) {
  const startY = event.clientY; const startHeight = ui.capacityHeight
  const move = (moveEvent: PointerEvent) => { ui.capacityHeight = Math.max(150, Math.min(440, startHeight + startY - moveEvent.clientY)) }
  const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
}
</script>
