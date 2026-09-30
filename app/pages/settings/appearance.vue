<template>
  <div class="settings-page">
    <nav class="settings-tabs"><NuxtLink :to="workspacePath('/settings/data')">Данные и backup</NuxtLink><NuxtLink :to="workspacePath('/settings/calendar')">Календарь</NuxtLink><NuxtLink :to="workspacePath('/settings/activity-types')">Activity types</NuxtLink><NuxtLink :to="workspacePath('/settings/appearance')">Внешний вид</NuxtLink></nav>
    <section class="settings-card">
      <div class="settings-card__heading"><div><span class="eyebrow">Preferences</span><h2>Планирование и отображение</h2></div></div>
      <fieldset class="form-grid" :disabled="planner.readOnly">
        <label class="field"><span>Масштаб по умолчанию</span><select v-model="form.defaultTimelineScale"><option value="day">День</option><option value="week">Неделя</option><option value="month">Месяц</option></select></label>
        <label class="field"><span>Режим переноса</span><select v-model="form.defaultMoveMode"><option value="cascade">Каскад</option><option value="free">Свободно</option></select></label>
        <label class="field"><span>Порог предупреждения capacity, %</span><input v-model.number="warningPercent" type="number" min="1" max="100" /></label>
        <label class="field"><span>Тема</span><select v-model="form.theme"><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
        <label class="switch-field"><input v-model="form.autoLinkNewStages" type="checkbox" /><span><b>Auto-link new stages</b><small>Новый этап связывается с предыдущим при последовательном создании.</small></span></label>
      </fieldset>
      <div v-if="!planner.readOnly" class="settings-actions"><UButton label="Сохранить настройки" @click="save" /></div>
    </section>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import type { WorkspaceSettings } from '../../domain/models/types'
import { usePlannerStore } from '../../stores/planner'
const planner = usePlannerStore()
const colorMode = useColorMode()
const toast = useToast()
await planner.initialize()
const form = reactive({ ...planner.data!.workspace.settings })
const warningPercent = ref(Math.round(form.capacityWarningThreshold * 100))
async function save() {
  form.capacityWarningThreshold = Math.max(0.01, Math.min(1, warningPercent.value / 100))
  await planner.updateWorkspaceSettings(form as WorkspaceSettings)
  colorMode.preference = form.theme
  toast.add({ title: 'Настройки сохранены', color: 'success' })
}
</script>
