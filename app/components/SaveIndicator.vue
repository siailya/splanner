<template>
  <div class="save-indicator" :class="`save-indicator--${planner.saveStatus}`" role="status">
    <UIcon :name="icon" :class="{ 'save-indicator__spin': planner.saveStatus === 'saving' }" />
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { usePlannerStore } from '../stores/planner'

const planner = usePlannerStore()
const label = computed(() => ({ saved: 'Сохранено', saving: 'Сохранение', error: 'Ошибка', conflict: 'Новая версия', offline: 'Нет связи' }[planner.saveStatus]))
const icon = computed(() => ({
  saved: 'i-lucide-cloud-check', saving: 'i-lucide-loader-circle', error: 'i-lucide-cloud-alert', conflict: 'i-lucide-cloud-alert', offline: 'i-lucide-cloud-alert',
}[planner.saveStatus]))
</script>
