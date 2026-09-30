<template>
  <div class="table-page">
    <div class="table-toolbar">
      <label class="timeline-search table-search">
        <UIcon name="i-lucide-search" />
        <input v-model="query" placeholder="Эпик, этап, описание, задача…" aria-label="Поиск по таблице" />
      </label>
      <select v-model="statusFilter" class="toolbar-select" aria-label="Фильтр по статусу">
        <option value="">Все статусы</option>
        <option v-for="item in statuses" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <select v-model="activityFilter" class="toolbar-select" aria-label="Фильтр по activity type">
        <option value="">Все activity types</option>
        <option v-for="item in planner.data?.activityTypes" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
      <select v-model="quarterFilter" class="toolbar-select" aria-label="Фильтр по кварталу">
        <option value="">Все кварталы</option>
        <option v-for="item in planner.data?.quarters" :key="item.id" :value="item.id">{{ item.id }}</option>
      </select>
      <select v-model="resourceFilter" class="toolbar-select" aria-label="Фильтр по роли или сотруднику">
        <option value="">Все ресурсы</option>
        <optgroup label="Роли"><option v-for="item in planner.data?.roles" :key="item.id" :value="`role:${item.id}`">{{ item.name }}</option></optgroup>
        <optgroup label="Сотрудники"><option v-for="item in planner.data?.people" :key="item.id" :value="`person:${item.id}`">{{ item.name }}</option></optgroup>
      </select>
      <select v-model="groupBy" class="toolbar-select" aria-label="Группировка">
        <option value="">Без группировки</option><option value="epic">По эпику</option><option value="status">По статусу</option><option value="activity">По activity type</option>
      </select>
      <label class="table-toggle"><input v-model="conflictsOnly" type="checkbox" /> Только конфликты</label>
      <label class="table-toggle"><input v-model="overloadedOnly" type="checkbox" /> Только перегрузка</label>
      <label class="table-toggle"><input v-model="deviationsOnly" type="checkbox" /> Только отклонения</label>
      <details class="column-picker">
        <summary>Колонки</summary>
        <label v-for="column in optionalColumns" :key="column.key"><input v-model="visibleColumns" type="checkbox" :value="column.key" /> {{ column.label }}</label>
      </details>
      <span class="toolbar-spacer" />
      <UButton color="neutral" variant="outline" icon="i-lucide-gantt-chart" label="Таймлайн" :to="workspacePath('/timeline')" />
    </div>

    <div v-if="selectedIds.length && !planner.readOnly" class="bulk-toolbar">
      <strong>Выбрано: {{ selectedIds.length }}</strong>
      <select v-model="bulkStatus" @change="applyBulkStatus">
        <option value="">Статус…</option>
        <option v-for="item in statuses" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <select v-model="bulkActivity" @change="applyBulkActivity">
        <option value="">Activity…</option>
        <option v-for="item in planner.data?.activityTypes" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
      <UButton color="error" variant="soft" size="xs" icon="i-lucide-trash-2" label="Удалить" @click="deleteSelected" />
      <button class="bulk-toolbar__close" aria-label="Снять выделение" @click="selectedIds = []"><UIcon name="i-lucide-x" /></button>
    </div>

    <div class="delivery-table-wrap">
      <table class="delivery-table">
        <thead>
          <tr>
            <th class="check-column"><input type="checkbox" :checked="allSelected" aria-label="Выбрать все видимые этапы" @change="toggleAll" /></th>
            <th><button @click="setSort('epic')">Эпик <span>{{ sortMark('epic') }}</span></button></th>
            <th><button @click="setSort('title')">Этап <span>{{ sortMark('title') }}</span></button></th>
            <th>Kind</th>
            <th>Activity type</th>
            <th><button @click="setSort('status')">Status <span>{{ sortMark('status') }}</span></button></th>
            <th><button @click="setSort('startDate')">Start <span>{{ sortMark('startDate') }}</span></button></th>
            <th>End</th>
            <th>Дни</th>
            <th v-if="isVisible('assignments')">Assignments</th>
            <th v-if="isVisible('work')">Person-days</th>
            <th v-if="isVisible('dependencies')">Predecessors</th>
            <th v-if="isVisible('dependencies')">Successors</th>
            <th v-if="isVisible('checklist')">Checklist</th>
            <th v-if="isVisible('variance')">Baseline Δ</th>
            <th>Lock</th>
            <th aria-label="Действия" />
          </tr>
        </thead>
        <tbody v-if="rows.length">
          <template v-for="group in groupedRows" :key="group.key">
          <tr v-if="groupBy" class="table-group-row"><td :colspan="17"><strong>{{ group.label }}</strong><span>{{ group.rows.length }}</span></td></tr>
          <tr v-for="row in group.rows" :key="row.stage.id" :class="{ 'table-row--warning': row.conflict || row.overloaded }">
            <td class="check-column"><input type="checkbox" :checked="selectedIds.includes(row.stage.id)" :aria-label="`Выбрать ${row.stage.title}`" @change="toggleRow(row.stage.id)" /></td>
            <td><span class="epic-cell"><i :style="{ background: row.epic.marker }" />{{ row.epic.title }}</span></td>
            <td><NuxtLink :to="{ path: workspacePath('/timeline'), query: { stage: row.stage.id } }">{{ row.stage.title }}</NuxtLink><span v-if="row.conflict" class="state-icon" title="Dependency conflict">⚠</span><span v-if="row.overloaded" class="state-icon" title="Capacity overload">!</span></td>
            <td>{{ row.stage.kind }}</td>
            <td>
              <select :disabled="planner.readOnly" :value="row.stage.activityTypeId" aria-label="Activity type" @change="updateActivity(row.stage.id, $event)">
                <option v-for="item in planner.data?.activityTypes" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </td>
            <td>
              <select :disabled="planner.readOnly" :value="row.stage.status" aria-label="Статус" @change="updateStatus(row.stage.id, $event)">
                <option v-for="item in statuses" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </td>
            <td><input :value="row.stage.startDate" type="date" aria-label="Дата начала" :disabled="planner.readOnly || row.stage.locked" @change="updateDate(row.stage.id, 'startDate', $event)" /></td>
            <td><input :value="row.stage.endDate" type="date" aria-label="Дата окончания" :disabled="planner.readOnly || row.stage.locked || row.stage.kind === 'milestone'" @change="updateDate(row.stage.id, 'endDate', $event)" /></td>
            <td class="numeric">{{ row.stage.kind === 'milestone' ? '—' : row.stage.durationWorkdays }}</td>
            <td v-if="isVisible('assignments')">{{ row.assignmentText || '—' }}</td>
            <td v-if="isVisible('work')" class="numeric">{{ row.personDays.toFixed(1) }}</td>
            <td v-if="isVisible('dependencies')">{{ row.predecessors || '—' }}</td>
            <td v-if="isVisible('dependencies')">{{ row.successors || '—' }}</td>
            <td v-if="isVisible('checklist')">{{ row.done }}/{{ row.total }}</td>
            <td v-if="isVisible('variance')"><span v-if="row.variance" :class="{ 'variance-changed': row.variance.state !== 'unchanged' }">{{ varianceText(row.variance) }}</span><span v-else>—</span></td>
            <td><input type="checkbox" :disabled="planner.readOnly" :checked="row.stage.locked" :aria-label="`Блокировка ${row.stage.title}`" @change="toggleLock(row.stage.id, $event)" /></td>
            <td><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-external-link" aria-label="Открыть на таймлайне" :to="{ path: workspacePath('/timeline'), query: { stage: row.stage.id } }" /></td>
          </tr>
          </template>
        </tbody>
      </table>
      <div v-if="!rows.length" class="table-empty">По заданным условиям этапы не найдены.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import { compareBaseline, type BaselineVariance } from '../domain/baseline/diff'
import { calculateCapacity } from '../domain/capacity/engine'
import type { ISODate, StageStatus } from '../domain/models/types'
import { usePlannerStore } from '../stores/planner'
import { useUiStore } from '../stores/ui'

const planner = usePlannerStore()
const ui = useUiStore()
const toast = useToast()
await planner.initialize()

const query = ref('')
const statusFilter = ref('')
const activityFilter = ref('')
const quarterFilter = ref('')
const resourceFilter = ref('')
const groupBy = ref<'' | 'epic' | 'status' | 'activity'>('')
const conflictsOnly = ref(false)
const overloadedOnly = ref(false)
const deviationsOnly = ref(false)
const selectedIds = ref<string[]>([])
const bulkStatus = ref('')
const bulkActivity = ref('')
const sort = reactive<{ key: 'epic' | 'title' | 'status' | 'startDate'; direction: 1 | -1 }>({ key: 'startDate', direction: 1 })
const optionalColumns = [
  { key: 'assignments', label: 'Assignments' }, { key: 'work', label: 'Person-days' },
  { key: 'dependencies', label: 'Dependencies' }, { key: 'checklist', label: 'Checklist' },
  { key: 'variance', label: 'Baseline variance' },
]
const visibleColumns = ref(optionalColumns.map(item => item.key))
const statuses = [
  { label: 'Planned', value: 'planned' }, { label: 'In progress', value: 'in_progress' },
  { label: 'Done', value: 'done' }, { label: 'Blocked', value: 'blocked' },
] as const

const baseline = computed(() => planner.data?.baselines.find(item => item.id === planner.activeBaselineId) ?? planner.data?.baselines[0])
const baselineDiff = computed(() => planner.data && baseline.value
  ? compareBaseline(baseline.value, planner.data.baselineStages, planner.data.stages, planner.data.calendar)
  : undefined)
const varianceByStage = computed(() => new Map(baselineDiff.value?.variances.map(item => [item.stageId, item]) ?? []))
const conflictIds = computed(() => new Set(planner.conflicts.flatMap(item => [item.predecessorStageId, item.successorStageId])))
const overloadIds = computed(() => {
  if (!planner.data || !planner.data.stages.length) return new Set<string>()
  const startDate = planner.data.stages.reduce((value, item) => item.startDate < value ? item.startDate : value, planner.data.stages[0]!.startDate)
  const endDate = planner.data.stages.reduce((value, item) => item.endDate > value ? item.endDate : value, planner.data.stages[0]!.endDate)
  return new Set(calculateCapacity({ startDate, endDate, mode: 'day', calendar: planner.data.calendar, roles: planner.data.roles, people: planner.data.people, epics: planner.data.epics, stages: planner.data.stages, assignments: planner.data.assignments }).overloadedStageIds)
})

const rows = computed(() => {
  if (!planner.data) return []
  const normalized = query.value.trim().toLocaleLowerCase('ru-RU')
  return planner.data.stages.map((stage) => {
    const epic = planner.data!.epics.find(item => item.id === stage.epicId)!
    const assignments = planner.data!.assignments.filter(item => item.stageId === stage.id)
    const assignmentText = assignments.map((item) => {
      const target = item.targetType === 'person'
        ? planner.data!.people.find(person => person.id === item.targetId)?.name
        : planner.data!.roles.find(role => role.id === item.targetId)?.name
      return `${target ?? item.targetId}: ${(item.units * item.allocationFte).toFixed(1)} FTE`
    }).join(', ')
    const personDays = stage.kind === 'milestone' ? 0 : assignments.reduce((sum, item) => sum + item.units * item.allocationFte * stage.durationWorkdays, 0)
    const workItems = planner.data!.workItems.filter(item => item.stageId === stage.id)
    const predecessors = planner.data!.dependencies.filter(item => item.successorStageId === stage.id).map(item => planner.data!.stages.find(stageItem => stageItem.id === item.predecessorStageId)?.title).filter(Boolean).join(', ')
    const successors = planner.data!.dependencies.filter(item => item.predecessorStageId === stage.id).map(item => planner.data!.stages.find(stageItem => stageItem.id === item.successorStageId)?.title).filter(Boolean).join(', ')
    return { stage, epic, assignments, assignmentText, personDays, predecessors, successors, total: workItems.length, done: workItems.filter(item => item.status === 'done').length, conflict: conflictIds.value.has(stage.id), overloaded: overloadIds.value.has(stage.id), variance: varianceByStage.value.get(stage.id) }
  }).filter((row) => {
    if (statusFilter.value && row.stage.status !== statusFilter.value) return false
    if (activityFilter.value && row.stage.activityTypeId !== activityFilter.value) return false
    if (quarterFilter.value && !row.stage.quarterIds.includes(quarterFilter.value as never)) return false
    if (resourceFilter.value) {
      const [kind, id] = resourceFilter.value.split(':')
      if (kind === 'person' && !row.assignments.some(item => item.targetType === 'person' && item.targetId === id)) return false
      if (kind === 'role' && !row.assignments.some(item => item.targetType === 'role'
        ? item.targetId === id
        : planner.data!.people.find(person => person.id === item.targetId)?.primaryRoleId === id)) return false
    }
    if (conflictsOnly.value && !row.conflict) return false
    if (overloadedOnly.value && !row.overloaded) return false
    if (deviationsOnly.value && (!row.variance || row.variance.state === 'unchanged')) return false
    if (!normalized) return true
    const workText = planner.data!.workItems.filter(item => item.epicId === row.epic.id).map(item => item.title).join(' ')
    return [row.epic.title, row.epic.descriptionMarkdown, row.stage.title, row.stage.descriptionMarkdown, workText].some(value => value.toLocaleLowerCase('ru-RU').includes(normalized))
  }).sort((a, b) => {
    const av = sort.key === 'epic' ? a.epic.title : a.stage[sort.key]
    const bv = sort.key === 'epic' ? b.epic.title : b.stage[sort.key]
    return String(av).localeCompare(String(bv), 'ru') * sort.direction
  })
})
const groupedRows = computed(() => {
  if (!groupBy.value) return [{ key: 'all', label: '', rows: rows.value }]
  const groups = new Map<string, typeof rows.value>()
  for (const row of rows.value) {
    const key = groupBy.value === 'epic' ? row.epic.id : groupBy.value === 'status' ? row.stage.status : row.stage.activityTypeId
    const values = groups.get(key) ?? []
    values.push(row)
    groups.set(key, values)
  }
  return [...groups].map(([key, groupRows]) => ({
    key,
    label: groupBy.value === 'epic'
      ? groupRows[0]!.epic.title
      : groupBy.value === 'status'
        ? statuses.find(item => item.value === key)?.label ?? key
        : planner.data?.activityTypes.find(item => item.id === key)?.name ?? key,
    rows: groupRows,
  }))
})

const allSelected = computed(() => rows.value.length > 0 && rows.value.every(row => selectedIds.value.includes(row.stage.id)))
function isVisible(key: string) { return visibleColumns.value.includes(key) }
function setSort(key: typeof sort.key) { if (sort.key === key) sort.direction = sort.direction === 1 ? -1 : 1; else { sort.key = key; sort.direction = 1 } }
function sortMark(key: typeof sort.key) { return sort.key === key ? (sort.direction === 1 ? '↑' : '↓') : '' }
function toggleAll() { selectedIds.value = allSelected.value ? [] : rows.value.map(row => row.stage.id) }
function toggleRow(id: string) { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(item => item !== id) : [...selectedIds.value, id] }
async function perform(action: () => Promise<void>) { try { await action() } catch (error) { toast.add({ title: 'Действие не выполнено', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
async function updateStatus(id: string, event: Event) { await perform(() => planner.updateStage(id, { status: (event.target as HTMLSelectElement).value as StageStatus })) }
async function updateActivity(id: string, event: Event) { await perform(() => planner.updateStage(id, { activityTypeId: (event.target as HTMLSelectElement).value })) }
async function updateDate(id: string, field: 'startDate' | 'endDate', event: Event) {
  const stage = planner.data?.stages.find(item => item.id === id)
  if (!stage) return
  const value = (event.target as HTMLInputElement).value as ISODate
  await perform(() => planner.resize(id, field === 'startDate' ? value : stage.startDate, field === 'endDate' ? value : stage.endDate, ui.moveMode))
}
async function toggleLock(id: string, event: Event) { await perform(() => planner.updateStage(id, { locked: (event.target as HTMLInputElement).checked })) }
async function applyBulkStatus() { if (!bulkStatus.value) return; await perform(() => planner.bulkUpdateStages(selectedIds.value, { status: bulkStatus.value as StageStatus })); bulkStatus.value = '' }
async function applyBulkActivity() { if (!bulkActivity.value) return; await perform(() => planner.bulkUpdateStages(selectedIds.value, { activityTypeId: bulkActivity.value })); bulkActivity.value = '' }
async function deleteSelected() { if (!confirm(`Удалить выбранных этапов: ${selectedIds.value.length}?`)) return; await perform(() => planner.deleteStages(selectedIds.value)); selectedIds.value = [] }
function varianceText(value: BaselineVariance) { return value.state === 'new' ? 'Новый' : `S ${value.startVariance > 0 ? '+' : ''}${value.startVariance} · F ${value.finishVariance > 0 ? '+' : ''}${value.finishVariance} · D ${value.durationVariance > 0 ? '+' : ''}${value.durationVariance}` }
</script>
