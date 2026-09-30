<template>
  <div class="settings-page">
    <nav class="settings-tabs"><NuxtLink :to="workspacePath('/settings/data')">Данные и backup</NuxtLink><NuxtLink :to="workspacePath('/settings/calendar')">Календарь</NuxtLink><NuxtLink :to="workspacePath('/settings/activity-types')">Activity types</NuxtLink><NuxtLink :to="workspacePath('/settings/appearance')">Внешний вид</NuxtLink></nav>
    <section class="settings-card">
      <div class="settings-card__heading"><div><span class="eyebrow">Working calendar</span><h2>Рабочая неделя и исключения</h2></div></div>
      <fieldset class="calendar-form" :disabled="planner.readOnly">
        <div><span class="field-label">Рабочие дни</span><div class="weekday-picker"><label v-for="day in weekdays" :key="day.value" :class="{ active: form.workingWeekdays.includes(day.value) }"><input v-model="form.workingWeekdays" type="checkbox" :value="day.value" />{{ day.label }}</label></div></div>
        <label class="field"><span>Нерабочие даты, через запятую</span><textarea v-model="form.holidays" rows="3" placeholder="2026-01-01, 2026-05-09" /></label>
        <label class="field"><span>Дополнительные рабочие даты</span><textarea v-model="form.extraWorkingDays" rows="3" placeholder="2026-12-26" /></label>
        <div v-if="impact" class="calendar-impact"><UIcon name="i-lucide-info" /><div><strong>Будет затронуто этапов: {{ impact.changedDurations }}</strong><span>Потенциальных dependency conflicts: {{ impact.dependencyConflicts }}</span></div></div>
        <div class="settings-actions"><UButton color="neutral" variant="outline" label="Рассчитать влияние" @click="preview" /><UButton label="Сохранить даты как есть" :disabled="!impact" @click="save(false)" /><UButton color="warning" variant="soft" label="Пересчитать schedule" :disabled="!impact" @click="save(true)" /></div>
      </fieldset>
    </section>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import type { ISODate, WorkingCalendar } from '../../domain/models/types'
import { usePlannerStore } from '../../stores/planner'
const planner = usePlannerStore()
const toast = useToast()
await planner.initialize()
const weekdays = [{ label: 'Пн', value: 1 }, { label: 'Вт', value: 2 }, { label: 'Ср', value: 3 }, { label: 'Чт', value: 4 }, { label: 'Пт', value: 5 }, { label: 'Сб', value: 6 }, { label: 'Вс', value: 7 }]
const calendar = planner.data!.calendar
const form = reactive({ workingWeekdays: [...calendar.workingWeekdays], holidays: calendar.holidays.join(', '), extraWorkingDays: calendar.extraWorkingDays.join(', ') })
const impact = ref<{ changedDurations: number; dependencyConflicts: number }>()
function dates(value: string): ISODate[] { return [...new Set(value.split(/[\s,;]+/).filter(Boolean))] as ISODate[] }
function proposed(): WorkingCalendar { return { ...calendar, workingWeekdays: [...form.workingWeekdays].sort(), holidays: dates(form.holidays), extraWorkingDays: dates(form.extraWorkingDays) } }
function preview() { if (!form.workingWeekdays.length) return toast.add({ title: 'Нужен хотя бы один рабочий день', color: 'error' }); impact.value = planner.previewCalendar(proposed()) }
async function save(recalculate: boolean) { try { await planner.applyCalendar(proposed(), recalculate); impact.value = undefined; toast.add({ title: 'Календарь сохранён', color: 'success' }) } catch (error) { toast.add({ title: 'Ошибка', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
</script>
