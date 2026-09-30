<template>
  <div class="app-shell" :class="{ 'app-shell--readonly': planner.readOnly }">
    <aside class="app-sidebar">
      <div class="brand">
        <div class="brand__mark">DP</div>
        <div><strong>Delivery Planner</strong><span>{{ planner.data?.workspace.name || 'Workspace' }}</span></div>
      </div>
      <nav class="app-nav" aria-label="Основная навигация">
        <NuxtLink :to="workspacePath('/timeline')" class="app-nav__item" active-class="app-nav__item--active"><UIcon name="i-lucide-gantt-chart" /><span>Таймлайн</span></NuxtLink>
        <NuxtLink :to="workspacePath('/projects')" class="app-nav__item" active-class="app-nav__item--active"><UIcon name="i-lucide-folder-kanban" /><span>Проекты</span></NuxtLink>
        <NuxtLink :to="workspacePath('/team')" class="app-nav__item" active-class="app-nav__item--active"><UIcon name="i-lucide-users" /><span>Команда</span></NuxtLink>
        <NuxtLink :to="workspacePath('/table')" class="app-nav__item" active-class="app-nav__item--active"><UIcon name="i-lucide-table-2" /><span>Таблица</span></NuxtLink>
        <NuxtLink :to="workspacePath('/settings/data')" class="app-nav__item" active-class="app-nav__item--active"><UIcon name="i-lucide-settings-2" /><span>Настройки</span></NuxtLink>
      </nav>
      <div class="app-sidebar__footer"><NuxtLink to="/">Сменить workspace</NuxtLink></div>
    </aside>
    <main class="app-main">
      <header class="app-header">
        <div><h1>{{ title }}</h1><p>{{ subtitle }}</p></div>
        <div class="app-header__actions">
          <SaveIndicator />
          <UButton color="neutral" variant="ghost" label="Поделиться" @click="share" />
          <UButton v-if="planner.mode === 'edit' && planner.canEdit" color="neutral" variant="outline" label="Завершить редактирование" @click="finishEditing" />
          <UButton v-else-if="planner.mode === 'view'" color="primary" variant="outline" label="Редактировать" @click="navigateTo(workspacePath(sectionPath, 'edit'))" />
          <UTooltip text="Сменить тему"><UButton color="neutral" variant="ghost" :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'" aria-label="Сменить тему" @click="toggleTheme" /></UTooltip>
        </div>
      </header>
      <div v-if="planner.saveStatus === 'conflict'" class="warning-card"><p>План изменён в другом браузере. Скачайте черновик при необходимости и загрузите актуальную версию.</p><UButton v-if="planner.pendingDraft" label="Скачать черновик" @click="planner.downloadPending" /><UButton label="Загрузить новую версию" @click="planner.reloadLatest" /></div>
      <div v-if="planner.saveStatus === 'offline'" class="warning-card"><p>Связь с сервером потеряна. Результат последней записи неизвестен.</p><UButton v-if="planner.pendingDraft" label="Скачать черновик" @click="planner.downloadPending" /><UButton v-if="planner.pendingDraft" label="Повторить сохранение" @click="retrySave" /><UButton label="Загрузить с сервера" @click="planner.reloadLatest" /></div>
      <slot />
    </main>
    <AppModal :open="Boolean(shareLink)" title="Ссылка на просмотр" @close="shareLink = ''">
      <p>Эта ссылка всегда открывает workspace в режиме просмотра.</p>
      <input aria-label="Ссылка на просмотр" :value="shareLink" readonly @focus="($event.target as HTMLInputElement).select()">
      <template #footer><UButton label="Закрыть" @click="shareLink = ''" /></template>
    </AppModal>
    <div class="width-warning">Для работы с таймлайном требуется ширина окна от 1280 px.</div>
    <div v-if="planner.mode === 'edit' && !planner.canEdit && planner.initialized" class="recovery-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <section>
        <h2 id="pin-title">Редактирование workspace</h2>
        <p>Введите четырёхзначный PIN.</p>
        <form @submit.prevent="submitPin"><input v-model="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="PIN"><UButton type="submit" label="Открыть редактирование" :loading="pinBusy" /></form>
        <p v-if="pinError" role="alert">{{ pinError }}</p>
        <UButton color="neutral" variant="ghost" label="Вернуться к просмотру" @click="navigateTo(workspacePath(sectionPath, 'view'))" />
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()
const planner = usePlannerStore()
const workspacePath = useWorkspacePath()
const toast = useToast()
const pin = ref('')
const shareLink = ref('')
const pinError = ref('')
const pinBusy = ref(false)
const sectionPath = computed(() => route.path.replace(/^\/w\/[^/]+\/(view|edit)/, '') || '/timeline')
const title = computed(() => sectionPath.value.startsWith('/timeline') ? 'План поставки' : sectionPath.value.startsWith('/team') ? 'Команда и роли' : sectionPath.value.startsWith('/table') ? 'Табличное представление' : sectionPath.value.startsWith('/settings') ? 'Настройки и данные' : sectionPath.value.startsWith('/projects') ? 'Проекты' : 'Delivery Planner')
const subtitle = computed(() => planner.mode === 'view' ? 'Режим просмотра' : 'Режим редактирования')
function toggleTheme() { colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark' }
async function submitPin() {
  pinBusy.value = true; pinError.value = ''
  try { await planner.unlock(pin.value); pin.value = '' }
  catch (error) { pinError.value = error instanceof Error ? error.message : 'Неверный PIN' }
  finally { pinBusy.value = false }
}
async function retrySave() { try { await planner.retryPending() } catch (error) { toast.add({ title: 'Сохранение не подтверждено', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
async function finishEditing() { await planner.lock(); await navigateTo(workspacePath(sectionPath.value, 'view')) }
async function share() {
  const url = new URL(workspacePath(sectionPath.value, 'view'), location.origin)
  shareLink.value = url.href
  try { await navigator.clipboard.writeText(url.href); toast.add({ title: 'Ссылка на просмотр скопирована', color: 'success' }) }
  catch { /* The selectable link remains available in the dialog. */ }
}
let timer: ReturnType<typeof setInterval> | undefined
function onVisibility() { if (!document.hidden) void planner.checkForUpdates() }
onMounted(() => { timer = setInterval(() => { if (!document.hidden) void planner.checkForUpdates() }, 15000); document.addEventListener('visibilitychange', onVisibility); window.addEventListener('focus', onVisibility) })
onBeforeUnmount(() => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('focus', onVisibility) })
watch(() => route.params.code, () => { void planner.initialize() })
</script>
