<template>
  <div class="content-page projects-page">
    <div class="content-toolbar"><div><strong>{{ epics.length }} проектов</strong><span>Эпик и проект — один объект планирования</span></div><NuxtLink v-if="!planner.readOnly" :to="workspacePath('/timeline')"><UButton icon="i-lucide-plus" label="Создать на Timeline" /></NuxtLink></div>
    <div v-if="!epics.length" class="page-empty"><UIcon name="i-lucide-folder-kanban" /><h3>Проектов пока нет</h3><p>Создайте первый эпик на Timeline.</p><NuxtLink :to="workspacePath('/timeline')">Открыть Timeline</NuxtLink></div>
    <div v-else class="project-grid">
      <NuxtLink v-for="epic in epics" :key="epic.id" :to="workspacePath(`/projects/${epic.id}`)" class="project-card">
        <span class="project-card__marker" :style="{ background: epic.marker ?? '#2563eb' }" />
        <div class="project-card__head"><span>{{ epic.code || 'PROJECT' }}</span><b :class="`status-${epic.status}`">{{ epic.status }}</b></div>
        <h2>{{ epic.title }}</h2><p>{{ epic.descriptionMarkdown || 'Описание пока не добавлено.' }}</p>
        <div class="project-card__stats"><span><b>{{ stages(epic.id).length }}</b> этапов</span><span><b>{{ done(epic.id) }}/{{ workItems(epic.id).length }}</b> задач</span><span>{{ period(epic.id) }}</span></div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import { usePlannerStore } from '../../stores/planner'
import { epicPeriod } from '../../domain/models/epic-period'
const planner = usePlannerStore(); await planner.initialize()
const epics = computed(() => [...(planner.data?.epics ?? [])].sort((a, b) => a.sortOrder - b.sortOrder))
function stages(id: string) { return planner.data?.stages.filter(stage => stage.epicId === id) ?? [] }
function workItems(id: string) { return planner.data?.workItems.filter(item => item.epicId === id) ?? [] }
function done(id: string) { return workItems(id).filter(item => item.status === 'done').length }
function period(id: string) { const epic = epics.value.find(item => item.id === id); const value = epic && epicPeriod(epic, stages(id)); return value ? `${value.startDate} — ${value.endDate}` : 'Без дат' }
</script>
