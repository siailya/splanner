<template>
  <section class="detail-section">
    <div class="detail-section__title"><div><strong>Задачи этапа</strong><span>{{ done }}/{{ items.length }} выполнено</span></div></div>
    <div class="work-item-add"><input v-model="title" placeholder="Новая задача…" @keydown.enter.prevent="add" /><UButton icon="i-lucide-plus" size="xs" aria-label="Добавить задачу" :disabled="!stageId || !title.trim()" @click="add" /></div>
    <div v-if="!stageId" class="inline-empty">Список задач станет доступен после создания этапа.</div>
    <div v-else-if="!items.length" class="inline-empty">Задач пока нет. Они не влияют на даты и capacity.</div>
    <div class="work-item-list">
      <div v-for="item in items" :key="item.id" class="work-item-row">
        <input type="checkbox" :checked="item.status === 'done'" @change="planner.updateWorkItem(item.id, { status: item.status === 'done' ? 'todo' : 'done' })" />
        <span :class="{ done: item.status === 'done' }">{{ item.title }}</span>
        <select :value="item.personId ?? ''" @change="planner.updateWorkItem(item.id, { personId: ($event.target as HTMLSelectElement).value || undefined })"><option value="">Без исполнителя</option><option v-for="person in planner.data?.people" :key="person.id" :value="person.id">{{ person.name }}</option></select>
        <input class="work-item-url" type="url" :value="item.externalUrl ?? ''" placeholder="https://…" aria-label="Внешняя ссылка задачи" @change="saveUrl(item.id, $event)" />
        <button type="button" aria-label="Удалить задачу" @click="planner.deleteWorkItem(item.id)"><UIcon name="i-lucide-x" /></button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { usePlannerStore } from '../../stores/planner'
const props = defineProps<{ stageId?: string; epicId: string }>()
const planner = usePlannerStore()
const title = ref('')
const items = computed(() => planner.data?.workItems.filter(item => item.stageId === props.stageId) ?? [])
const done = computed(() => items.value.filter(item => item.status === 'done').length)
async function add() { if (!props.stageId || !title.value.trim()) return; await planner.addWorkItem({ epicId: props.epicId, stageId: props.stageId, title: title.value }); title.value = '' }
async function saveUrl(id: string, event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  if (value && !/^https?:\/\//i.test(value)) return
  await planner.updateWorkItem(id, { externalUrl: value || undefined })
}
</script>
