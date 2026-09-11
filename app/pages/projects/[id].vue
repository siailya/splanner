<template>
  <div v-if="epic" class="content-page epic-page">
    <div class="epic-hero" :class="{ archived: epic.status === 'archived' }">
      <span class="epic-hero__marker" :style="{ background: epic.marker ?? '#2563eb' }" />
      <div><NuxtLink to="/projects" class="back-link"><UIcon name="i-lucide-arrow-left" />Все проекты</NuxtLink><span class="eyebrow">{{ epic.code || 'PROJECT' }}</span><h2>{{ epic.title }}</h2><p>{{ period }}</p></div>
      <div class="epic-hero__actions"><select :value="epic.status" @change="planner.updateEpic(epic.id, { status: ($event.target as HTMLSelectElement).value as any })"><option value="active">Активен</option><option value="paused">На паузе</option><option value="done">Завершён</option><option value="archived">Архив</option></select><NuxtLink to="/timeline"><UButton color="neutral" variant="outline" icon="i-lucide-gantt-chart" label="Timeline" /></NuxtLink></div>
    </div>

    <div class="epic-kpis"><article><span>Этапы</span><strong>{{ stages.length }}</strong></article><article><span>Трудоёмкость</span><strong>{{ personDays }} чел.-дн.</strong></article><article><span>Задачи</span><strong>{{ doneItems }}/{{ items.length }}</strong></article><article><span>Прогресс</span><strong>{{ progress }}%</strong></article></div>

    <div class="epic-layout">
      <main>
        <section class="content-card"><div class="section-heading"><div><span class="eyebrow">Контекст</span><h2>Описание</h2></div><span class="autosave-state">{{ descriptionSaving ? 'Сохранение…' : 'Автосохранено' }}</span></div><MarkdownEditor v-model="description" /></section>
        <section class="content-card"><div class="section-heading"><div><span class="eyebrow">Delivery</span><h2>Этапы</h2></div><UButton size="sm" icon="i-lucide-plus" label="Этап" @click="toggleStageForm" /></div>
          <form v-if="showStageForm" class="quick-stage" @submit.prevent="addStage"><input v-model="newStage.title" required placeholder="Название этапа" /><select v-model="newStage.kind"><option value="task">Task</option><option value="scope">Scope</option><option value="milestone">Milestone</option></select><input v-model="newStage.startDate" type="date" required /><input v-if="newStage.kind !== 'milestone'" v-model="newStage.endDate" type="date" required /><UButton type="submit" label="Создать" size="sm" /></form>
          <div class="epic-stage-list"><article v-for="stage in stages" :key="stage.id"><i :style="{ background: activity(stage.activityTypeId)?.colorToken }" /><div><strong>{{ stage.title }}</strong><span>{{ stage.startDate }} — {{ stage.endDate }} · {{ stage.durationWorkdays }} раб. дн.</span></div><span>{{ stageAssignments(stage.id) }} FTE</span><span>{{ stageItems(stage.id).filter(item => item.status === 'done').length }}/{{ stageItems(stage.id).length }}</span><NuxtLink :to="`/timeline?stage=${stage.id}`" aria-label="Показать на Timeline"><UIcon name="i-lucide-arrow-up-right" /></NuxtLink></article></div>
        </section>
      </main>

      <aside class="content-card work-board"><div class="section-heading"><div><span class="eyebrow">Checklist</span><h2>Задачи эпика</h2></div><select v-model="groupMode" aria-label="Группировка задач"><option value="stage">По этапам</option><option value="status">По статусу</option><option value="person">По исполнителю</option></select><span>{{ doneItems }}/{{ items.length }}</span></div>
        <div v-for="group in groups" :key="group.id" class="work-group" @dragover.prevent @drop="dropItem(group.id)">
          <header><strong>{{ group.title }}</strong><span>{{ group.items.filter(item => item.status === 'done').length }}/{{ group.items.length }}</span></header>
          <div v-for="item in group.items" :key="item.id" class="work-card" draggable="true" @dragstart="draggedItemId = item.id"><input type="checkbox" :checked="item.status === 'done'" @change="planner.updateWorkItem(item.id, { status: item.status === 'done' ? 'todo' : 'done' })" /><div><span :class="{ done: item.status === 'done' }">{{ item.title }}</span><small>{{ personName(item.personId) }}</small></div><a v-if="item.externalUrl" :href="item.externalUrl" target="_blank" rel="noopener noreferrer" aria-label="Открыть внешнюю ссылку"><UIcon name="i-lucide-external-link" /></a><button @click="planner.deleteWorkItem(item.id)"><UIcon name="i-lucide-x" /></button></div>
          <form v-if="groupMode === 'stage'" class="work-group__add" @submit.prevent="addItem(group.id || undefined)"><input v-model="draftTitles[group.id]" :placeholder="group.id ? 'Задача этапа…' : 'Задача backlog…'" /><button aria-label="Добавить"><UIcon name="i-lucide-plus" /></button></form>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="content-page page-empty"><h2>Проект не найден</h2><NuxtLink to="/projects">Вернуться к проектам</NuxtLink></div>
</template>

<script setup lang="ts">
import { addWorkingDays, fromLocalDate } from '../../domain/calendar/date'
import type { ISODate, StageKind } from '../../domain/models/types'
import { usePlannerStore } from '../../stores/planner'
const route = useRoute(); const planner = usePlannerStore(); await planner.initialize()
const epic = computed(() => planner.data?.epics.find(item => item.id === route.params.id))
const stages = computed(() => planner.data?.stages.filter(stage => stage.epicId === epic.value?.id).sort((a, b) => a.sortOrder - b.sortOrder) ?? [])
const items = computed(() => planner.data?.workItems.filter(item => item.epicId === epic.value?.id) ?? [])
const doneItems = computed(() => items.value.filter(item => item.status === 'done').length)
const progress = computed(() => items.value.length ? Math.round(doneItems.value / items.value.length * 100) : 0)
const period = computed(() => stages.value.length ? `${stages.value.map(stage => stage.startDate).sort()[0]} — ${stages.value.map(stage => stage.endDate).sort().at(-1)}` : 'Этапы пока не запланированы')
const personDays = computed(() => Math.round(stages.value.reduce((sum, stage) => sum + stage.durationWorkdays * stageAssignments(stage.id), 0) * 100) / 100)
const description = ref(epic.value?.descriptionMarkdown ?? ''); const descriptionSaving = ref(false); let descriptionTimer: ReturnType<typeof setTimeout> | undefined
watch(description, (value) => { if (!epic.value || value === epic.value.descriptionMarkdown) return; descriptionSaving.value = true; clearTimeout(descriptionTimer); descriptionTimer = setTimeout(async () => { await planner.updateEpic(epic.value!.id, { descriptionMarkdown: value }); descriptionSaving.value = false }, 650) })
const start = fromLocalDate(new Date())
const showStageForm = ref(false); const newStage = reactive({ title: '', kind: 'task' as StageKind, startDate: start, endDate: addWorkingDays(start, 4, planner.data!.calendar) })
const draggedItemId = ref(''); const draftTitles = reactive<Record<string, string>>({ '': '' })
const groupMode = ref<'stage' | 'status' | 'person'>('stage')
const groups = computed(() => {
  if (groupMode.value === 'status') return [
    { id: 'status:todo', title: 'To do', items: items.value.filter(item => item.status === 'todo') },
    { id: 'status:in_progress', title: 'In progress', items: items.value.filter(item => item.status === 'in_progress') },
    { id: 'status:done', title: 'Done', items: items.value.filter(item => item.status === 'done') },
  ]
  if (groupMode.value === 'person') return [
    { id: 'person:', title: 'Без исполнителя', items: items.value.filter(item => !item.personId) },
    ...(planner.data?.people.map(person => ({ id: `person:${person.id}`, title: person.name, items: items.value.filter(item => item.personId === person.id) })) ?? []),
  ]
  return [{ id: '', title: 'Backlog', items: items.value.filter(item => !item.stageId) }, ...stages.value.map(stage => ({ id: stage.id, title: stage.title, items: items.value.filter(item => item.stageId === stage.id) }))]
})
function activity(id: string) { return planner.data?.activityTypes.find(type => type.id === id) }
function stageAssignments(id: string) { return Math.round((planner.data?.assignments.filter(item => item.stageId === id).reduce((sum, item) => sum + item.units * item.allocationFte, 0) ?? 0) * 100) / 100 }
function stageItems(id: string) { return items.value.filter(item => item.stageId === id) }
function personName(id?: string) { return id ? planner.data?.people.find(person => person.id === id)?.name ?? 'Удалён' : 'Без исполнителя' }
function toggleStageForm() {
  if (showStageForm.value) {
    showStageForm.value = false
    return
  }
  const today = fromLocalDate(new Date())
  Object.assign(newStage, { title: '', kind: 'task', startDate: today, endDate: addWorkingDays(today, 4, planner.data!.calendar) })
  showStageForm.value = true
}
async function addStage() { await planner.addStage({ epicId: epic.value!.id, title: newStage.title, kind: newStage.kind, activityTypeId: planner.data!.activityTypes.find(type => type.slug === 'development')!.id, startDate: newStage.startDate as ISODate, endDate: newStage.kind === 'milestone' ? undefined : newStage.endDate as ISODate }); newStage.title = ''; showStageForm.value = false }
async function addItem(stageId?: string) { const key = stageId ?? ''; const title = draftTitles[key]?.trim(); if (!title) return; await planner.addWorkItem({ epicId: epic.value!.id, stageId, title }); draftTitles[key] = '' }
async function dropItem(groupId: string) {
  if (!draggedItemId.value) return
  if (groupMode.value === 'status') await planner.updateWorkItem(draggedItemId.value, { status: groupId.slice(7) as any })
  else if (groupMode.value === 'person') await planner.updateWorkItem(draggedItemId.value, { personId: groupId.slice(7) || undefined })
  else await planner.updateWorkItem(draggedItemId.value, { stageId: groupId || undefined })
  draggedItemId.value = ''
}
onBeforeUnmount(() => clearTimeout(descriptionTimer))
</script>
