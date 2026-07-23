<template>
  <div class="print-view">
    <div class="print-actions">
      <select v-model="rangeMode" aria-label="Диапазон печати"><option value="current">Текущий квартал</option><option value="next">Следующий квартал</option><option value="combined">Два квартала</option></select>
      <details><summary>Эпики: {{ selectedEpicIds.length || 'все' }}</summary><label v-for="epic in allEpics" :key="epic.id"><input v-model="selectedEpicIds" type="checkbox" :value="epic.id" />{{ epic.title }}</label></details>
      <UButton icon="i-lucide-printer" label="Печать / сохранить PDF" @click="printPage" /><UButton color="neutral" variant="outline" label="Вернуться" to="/timeline" />
    </div>
    <header><h1>{{ planner.data?.workspace.name }}</h1><p>{{ range.startDate }} — {{ range.endDate }} · сформировано {{ new Date().toLocaleString('ru-RU') }}</p></header>
    <section v-for="epic in epics" :key="epic.id" class="print-epic">
      <h2><i :style="{ background: epic.marker }" />{{ epic.title }}</h2>
      <p v-if="epic.descriptionMarkdown">{{ plainMarkdown(epic.descriptionMarkdown) }}</p>
      <table>
        <thead><tr><th>Этап</th><th>Kind</th><th>Status</th><th>Start</th><th>End</th><th>Раб. дни</th><th>Assignments</th></tr></thead>
        <tbody><tr v-for="stage in stagesFor(epic.id)" :key="stage.id"><td>{{ stage.title }}</td><td>{{ stage.kind }}</td><td>{{ stage.status }}</td><td>{{ stage.startDate }}</td><td>{{ stage.endDate }}</td><td>{{ stage.kind === 'milestone' ? '—' : stage.durationWorkdays }}</td><td>{{ assignmentsFor(stage.id) }}</td></tr></tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextQuarterId, quarterIdForDate } from '../domain/quarters/quarters'
import type { ISODate } from '../domain/models/types'
import { createQuarter } from '../domain/quarters/quarters'
import { usePlannerStore } from '../stores/planner'
definePageMeta({ layout: false })
const planner = usePlannerStore()
await planner.initialize()
const today = new Date()
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` as ISODate
const currentQuarterId = quarterIdForDate(iso)
const rangeMode = ref<'current' | 'next' | 'combined'>('combined')
const selectedEpicIds = ref<string[]>([])
const quarterIds = computed(() => rangeMode.value === 'current' ? [currentQuarterId] : rangeMode.value === 'next' ? [nextQuarterId(currentQuarterId)] : [currentQuarterId, nextQuarterId(currentQuarterId)])
const quarters = computed(() => quarterIds.value.map(id => planner.data?.quarters.find(item => item.id === id) ?? createQuarter(id, planner.data!.workspace.id)))
const range = computed(() => ({ startDate: quarters.value[0]!.startDate, endDate: quarters.value.at(-1)!.endDate }))
const allEpics = computed(() => planner.data?.epics.filter(item => item.status !== 'archived') ?? [])
const epics = computed(() => allEpics.value.filter(item => (!selectedEpicIds.value.length || selectedEpicIds.value.includes(item.id)) && planner.data!.stages.some(stage => stage.epicId === item.id && stage.quarterIds.some(id => quarterIds.value.includes(id)))))
function stagesFor(epicId: string) { return planner.data?.stages.filter(item => item.epicId === epicId && item.quarterIds.some(id => quarterIds.value.includes(id))).sort((a, b) => a.sortOrder - b.sortOrder) ?? [] }
function assignmentsFor(stageId: string) { return planner.data?.assignments.filter(item => item.stageId === stageId).map(item => `${item.targetType === 'person' ? planner.data?.people.find(person => person.id === item.targetId)?.name : planner.data?.roles.find(role => role.id === item.targetId)?.name}: ${item.units * item.allocationFte} FTE`).join(', ') || '—' }
function plainMarkdown(value: string) { return value.replace(/[#*_`>\-[\]()]/g, ' ').replace(/\s+/g, ' ').trim() }
function printPage() { window.print() }
</script>

<style>
.print-view { max-width: 1120px; margin: 0 auto; padding: 32px; color: #0f172a; background: white; font: 12px system-ui, sans-serif; }
.print-actions { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; background: white; padding: 8px 0; }
.print-actions select, .print-actions summary { border: 1px solid #cbd5e1; border-radius: 6px; background: white; padding: 7px 9px; }
.print-actions details { position: relative; }
.print-actions details label { display: block; min-width: 180px; padding: 5px; }
.print-view header { border-bottom: 2px solid #0f172a; margin-bottom: 24px; }
.print-view header h1 { margin-bottom: 4px; }
.print-view header p, .print-epic > p { color: #64748b; }
.print-epic { break-inside: avoid; margin-bottom: 24px; }
.print-epic h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.print-epic h2 i { width: 10px; height: 10px; border-radius: 50%; }
.print-epic table { width: 100%; border-collapse: collapse; }
.print-epic th, .print-epic td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; }
.print-epic th { background: #f1f5f9; }
@media print {
  @page { size: landscape; margin: 12mm; }
  .print-view { max-width: none; padding: 0; }
  .print-actions { display: none; }
  .print-epic { break-before: auto; break-after: auto; page-break-inside: avoid; }
}
</style>
