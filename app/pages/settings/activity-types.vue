<template>
  <div class="settings-page">
    <nav class="settings-tabs"><NuxtLink :to="workspacePath('/settings/data')">Данные и backup</NuxtLink><NuxtLink :to="workspacePath('/settings/calendar')">Календарь</NuxtLink><NuxtLink :to="workspacePath('/settings/activity-types')">Activity types</NuxtLink><NuxtLink :to="workspacePath('/settings/appearance')">Внешний вид</NuxtLink></nav>
    <section class="settings-card">
      <div class="settings-card__heading"><div><span class="eyebrow">Dictionary</span><h2>Типы деятельности</h2></div></div>
      <div class="activity-list">
        <article v-for="item in planner.data?.activityTypes" :key="item.id">
          <input type="color" :disabled="planner.readOnly" :value="item.colorToken" :aria-label="`Цвет ${item.name}`" @change="update(item.id, { colorToken: ($event.target as HTMLInputElement).value })" />
          <input :disabled="planner.readOnly" :value="item.name" :aria-label="`Название ${item.name}`" @change="update(item.id, { name: ($event.target as HTMLInputElement).value })" />
          <code>{{ item.slug }}</code>
          <label class="table-toggle"><input type="checkbox" :disabled="planner.readOnly" :checked="item.isActive" @change="update(item.id, { isActive: ($event.target as HTMLInputElement).checked })" /> Активен</label>
          <UButton :disabled="planner.readOnly" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить" @click="remove(item.id)" />
        </article>
      </div>
      <form v-if="!planner.readOnly" class="activity-create" @submit.prevent="create">
        <input v-model="draft.name" required placeholder="Название" aria-label="Название нового типа" />
        <input v-model="draft.slug" required placeholder="slug" aria-label="Slug нового типа" />
        <input v-model="draft.colorToken" type="color" aria-label="Цвет нового типа" />
        <UButton :disabled="planner.readOnly" type="submit" icon="i-lucide-plus" label="Добавить" />
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import type { ActivityType } from '../../domain/models/types'
import { usePlannerStore } from '../../stores/planner'
const planner = usePlannerStore()
const toast = useToast()
await planner.initialize()
const draft = reactive({ name: '', slug: '', colorToken: '#64748b' })
async function perform(action: () => Promise<unknown>) { try { await action() } catch (error) { toast.add({ title: 'Ошибка', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
async function create() { await perform(() => planner.addActivityType(draft)); Object.assign(draft, { name: '', slug: '', colorToken: '#64748b' }) }
async function update(id: string, changes: Partial<Pick<ActivityType, 'name' | 'colorToken' | 'isActive'>>) { await perform(() => planner.updateActivityType(id, changes)) }
async function remove(id: string) { if (confirm('Удалить activity type?')) await perform(() => planner.deleteActivityType(id)) }
</script>
