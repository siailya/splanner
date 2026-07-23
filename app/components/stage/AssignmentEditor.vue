<template>
  <section class="detail-section assignment-editor">
    <div class="detail-section__title">
      <div><strong>Назначения</strong><span v-if="stage">{{ personDays }} человеко-дн.</span></div>
      <span v-if="stage?.kind === 'milestone'" class="info-chip">Веха · 0 нагрузки</span>
    </div>
    <div v-if="!stageId" class="inline-empty">Сначала создайте этап, затем добавьте назначения.</div>
    <div v-else-if="stage?.kind === 'milestone'" class="inline-empty">Milestone не участвует в capacity.</div>
    <template v-else>
      <div v-if="doubleCountWarning" class="compact-warning"><UIcon name="i-lucide-triangle-alert" />Есть person и role assignments одной роли — обе нагрузки будут учтены.</div>
      <div class="assignment-list">
        <div v-for="assignment in assignments" :key="assignment.id" class="assignment-row">
          <span class="assignment-row__type"><UIcon :name="assignment.targetType === 'person' ? 'i-lucide-user' : 'i-lucide-users'" /></span>
          <div><strong>{{ targetName(assignment) }}</strong><span>{{ assignment.targetType === 'role' ? `${assignment.units} × ` : '' }}{{ assignment.allocationFte }} FTE</span></div>
          <UButton color="error" variant="ghost" icon="i-lucide-trash-2" size="xs" aria-label="Удалить назначение" @click="perform(() => planner.deleteAssignment(assignment.id))" />
        </div>
      </div>
      <div class="assignment-add">
        <select v-model="form.targetType"><option value="person">Сотрудник</option><option value="role">Потребность по роли</option></select>
        <select v-model="form.targetId"><option value="" disabled>Выберите…</option><option v-for="target in targets" :key="target.id" :value="target.id">{{ target.name }}</option></select>
        <input v-if="form.targetType === 'role'" v-model.number="form.units" type="number" min="1" max="20" step="1" title="Units" />
        <input v-model.number="form.allocationFte" type="number" min="0.1" max="2" step="0.1" title="Allocation FTE" />
        <UButton label="Добавить" size="xs" :disabled="!form.targetId" @click="add" />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { Assignment } from '../../domain/models/types'
import { usePlannerStore } from '../../stores/planner'

const props = defineProps<{ stageId?: string }>()
const planner = usePlannerStore()
const toast = useToast()
const stage = computed(() => planner.data?.stages.find(item => item.id === props.stageId))
const assignments = computed(() => planner.data?.assignments.filter(item => item.stageId === props.stageId) ?? [])
const form = reactive({ targetType: 'person' as 'person' | 'role', targetId: '', units: 1, allocationFte: 1 })
const targets = computed(() => form.targetType === 'person'
  ? (planner.data?.people.filter(person => person.isActive) ?? [])
  : (planner.data?.roles.filter(role => role.isActive) ?? []))
watch(() => form.targetType, () => { form.targetId = ''; form.units = 1 })
const personDays = computed(() => {
  if (!stage.value || stage.value.kind === 'milestone') return 0
  return Math.round(assignments.value.reduce((sum, item) => sum + item.allocationFte * item.units, 0) * stage.value.durationWorkdays * 100) / 100
})
const doubleCountWarning = computed(() => {
  const roleIds = new Set(assignments.value.filter(item => item.targetType === 'role').map(item => item.targetId))
  return assignments.value.some(item => item.targetType === 'person' && roleIds.has(planner.data?.people.find(person => person.id === item.targetId)?.primaryRoleId ?? ''))
})
function targetName(assignment: Assignment) {
  return assignment.targetType === 'person'
    ? planner.data?.people.find(person => person.id === assignment.targetId)?.name ?? 'Удалённый сотрудник'
    : planner.data?.roles.find(role => role.id === assignment.targetId)?.name ?? 'Удалённая роль'
}
async function perform(action: () => Promise<unknown>) { try { await action() } catch (error) { toast.add({ title: 'Назначение не сохранено', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
async function add() {
  await perform(async () => {
    await planner.upsertAssignment({ stageId: props.stageId!, ...form })
    form.targetId = ''; form.units = 1; form.allocationFte = 1
  })
}
</script>
