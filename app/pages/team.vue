<template>
  <div class="content-page team-page">
    <div class="content-toolbar">
      <div><strong>{{ activePeople.length }} активных сотрудников</strong><span>{{ totalCapacity }} FTE общего capacity</span></div>
      <div v-if="!planner.readOnly"><UButton color="neutral" variant="outline" icon="i-lucide-badge-plus" label="Роль" @click="openRole()" /><UButton icon="i-lucide-user-plus" label="Сотрудник" :disabled="!activeRoles.length" @click="openPerson()" /></div>
    </div>

    <section class="team-summary">
      <article v-for="role in activeRoles" :key="role.id" class="role-card" :style="{ '--role-color': role.marker ?? '#2563eb' }">
        <button v-if="!planner.readOnly" class="role-card__edit" aria-label="Изменить роль" @click="openRole(role.id)"><UIcon name="i-lucide-pencil" /></button>
        <span class="role-card__marker" />
        <div><strong>{{ role.name }}</strong><span>{{ peopleForRole(role.id).length }} сотрудников</span></div>
        <b>{{ roleCapacity(role.id) }} FTE</b>
      </article>
      <button v-if="!planner.readOnly" class="role-card role-card--add" @click="openRole()"><UIcon name="i-lucide-plus" />Добавить роль</button>
    </section>

    <section class="people-section">
      <div class="section-heading"><div><span class="eyebrow">Ресурсы</span><h2>Сотрудники</h2></div><label><input v-model="showArchived" type="checkbox" /> Показать архивных</label></div>
      <div v-if="!visiblePeople.length" class="page-empty"><UIcon name="i-lucide-users" /><h3>Команда пока пуста</h3><p>Создайте роль, затем добавьте сотрудников и их capacity.</p></div>
      <div v-else class="people-table">
        <div class="people-table__head"><span>Сотрудник</span><span>Основная роль</span><span>Доп. роли</span><span>Capacity</span><span>Назначения</span><span /></div>
        <div v-for="person in visiblePeople" :key="person.id" class="people-row" :class="{ archived: !person.isActive }">
          <div class="person-name"><span class="person-avatar">{{ initials(person.name) }}</span><div><strong>{{ person.name }}</strong><small v-if="!person.isActive">Архив</small></div></div>
          <span>{{ roleName(person.primaryRoleId) }}</span>
          <span>{{ person.roleIds.filter(id => id !== person.primaryRoleId).map(roleName).join(', ') || '—' }}</span>
          <strong>{{ person.baseCapacityFte }} FTE</strong>
          <span>{{ planner.personUsage(person.id) }}</span>
          <UButton v-if="!planner.readOnly" color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Изменить сотрудника" @click="openPerson(person.id)" />
        </div>
      </div>
    </section>

    <AppModal :open="modal === 'role'" :title="roleForm.id ? 'Изменить роль' : 'Новая роль'" eyebrow="Команда" @close="modal = undefined">
      <form id="role-form" class="form-grid" @submit.prevent="saveRole">
        <label class="field field--wide"><span>Название *</span><input v-model="roleForm.name" required autofocus placeholder="Backend" /></label>
        <label class="field"><span>Цвет</span><input v-model="roleForm.marker" type="color" /></label>
        <label v-if="roleForm.id" class="switch-field"><input v-model="roleForm.isActive" type="checkbox" /><span><b>Активная роль</b></span></label>
      </form>
      <template #footer><UButton v-if="roleForm.id" color="error" variant="ghost" label="Удалить" class="mr-auto" @click="removeRole" /><UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" /><UButton type="submit" form="role-form" label="Сохранить" /></template>
    </AppModal>

    <AppModal :open="modal === 'person'" :title="personForm.id ? 'Карточка сотрудника' : 'Новый сотрудник'" eyebrow="Ресурс" description="Capacity задаётся в FTE и применяется ко всем рабочим дням." @close="modal = undefined">
      <form id="person-form" class="form-grid" @submit.prevent="savePerson">
        <label class="field field--wide"><span>Имя *</span><input v-model="personForm.name" required autofocus /></label>
        <label class="field"><span>Основная роль *</span><select v-model="personForm.primaryRoleId" required><option v-for="role in activeRoles" :key="role.id" :value="role.id">{{ role.name }}</option></select></label>
        <label class="field"><span>Capacity FTE *</span><input v-model.number="personForm.baseCapacityFte" type="number" min="0.1" max="2" step="0.1" required /></label>
        <fieldset class="role-checks field--wide"><legend>Дополнительные роли</legend><label v-for="role in activeRoles" :key="role.id"><input v-model="personForm.roleIds" type="checkbox" :value="role.id" :disabled="role.id === personForm.primaryRoleId" />{{ role.name }}</label></fieldset>
        <div v-if="personForm.id && planner.personUsage(personForm.id)" class="calendar-impact field--wide"><UIcon name="i-lucide-info" /><div><strong>Активных назначений: {{ planner.personUsage(personForm.id) }}</strong><span>Архивация сохранит назначения в истории, но исключит сотрудника из доступного capacity.</span></div></div>
      </form>
      <template #footer>
        <UButton v-if="personForm.id" color="error" variant="ghost" label="Удалить" class="mr-auto" @click="removePerson" />
        <UButton v-if="personForm.id" color="warning" variant="ghost" :label="personForm.isActive ? 'Архивировать' : 'Вернуть из архива'" @click="toggleArchive" />
        <UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" /><UButton type="submit" form="person-form" label="Сохранить" />
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { usePlannerStore } from '../stores/planner'
const planner = usePlannerStore(); const toast = useToast(); await planner.initialize()
const modal = ref<'role' | 'person'>(); const showArchived = ref(false)
const roleForm = reactive({ id: '', name: '', marker: '#2563eb', isActive: true })
const personForm = reactive({ id: '', name: '', primaryRoleId: '', roleIds: [] as string[], baseCapacityFte: 1, isActive: true })
const activeRoles = computed(() => planner.data?.roles.filter(role => role.isActive).sort((a, b) => a.sortOrder - b.sortOrder) ?? [])
const activePeople = computed(() => planner.data?.people.filter(person => person.isActive) ?? [])
const visiblePeople = computed(() => planner.data?.people.filter(person => showArchived.value || person.isActive).sort((a, b) => a.sortOrder - b.sortOrder) ?? [])
const totalCapacity = computed(() => Math.round(activePeople.value.reduce((sum, person) => sum + person.baseCapacityFte, 0) * 100) / 100)
function peopleForRole(id: string) { return activePeople.value.filter(person => person.primaryRoleId === id) }
function roleCapacity(id: string) { return Math.round(peopleForRole(id).reduce((sum, person) => sum + person.baseCapacityFte, 0) * 100) / 100 }
function roleName(id: string) { return planner.data?.roles.find(role => role.id === id)?.name ?? '—' }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() }
function openRole(id = '') { const role = planner.data?.roles.find(item => item.id === id); Object.assign(roleForm, role ? { id, name: role.name, marker: role.marker ?? '#2563eb', isActive: role.isActive } : { id: '', name: '', marker: '#2563eb', isActive: true }); modal.value = 'role' }
function openPerson(id = '') { const person = planner.data?.people.find(item => item.id === id); Object.assign(personForm, person ? { id, name: person.name, primaryRoleId: person.primaryRoleId, roleIds: [...person.roleIds], baseCapacityFte: person.baseCapacityFte, isActive: person.isActive } : { id: '', name: '', primaryRoleId: activeRoles.value[0]?.id ?? '', roleIds: [], baseCapacityFte: 1, isActive: true }); modal.value = 'person' }
async function perform(action: () => Promise<unknown>) { try { await action(); modal.value = undefined } catch (error) { toast.add({ title: 'Действие не выполнено', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
async function saveRole() { await perform(() => roleForm.id ? planner.updateRole(roleForm.id, { name: roleForm.name, marker: roleForm.marker, isActive: roleForm.isActive }) : planner.addRole(roleForm.name, roleForm.marker)) }
async function removeRole() { const usage = planner.roleUsage(roleForm.id); if (!confirm(`Удалить роль? Сотрудников: ${usage.people}, назначений: ${usage.assignments}`)) return; await perform(() => planner.deleteRole(roleForm.id)) }
async function savePerson() { await perform(() => personForm.id ? planner.updatePerson(personForm.id, { name: personForm.name, primaryRoleId: personForm.primaryRoleId, roleIds: personForm.roleIds, baseCapacityFte: personForm.baseCapacityFte }) : planner.addPerson(personForm)) }
async function toggleArchive() { const count = planner.personUsage(personForm.id); if (personForm.isActive && !confirm(`Архивировать сотрудника? Активных назначений: ${count}`)) return; await perform(() => planner.updatePerson(personForm.id, { isActive: !personForm.isActive })) }
async function removePerson() { if (!confirm(`Удалить сотрудника? Активных назначений: ${planner.personUsage(personForm.id)}`)) return; await perform(() => planner.deletePerson(personForm.id)) }
</script>
