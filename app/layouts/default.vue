<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand">
        <div class="brand__mark">DP</div>
        <div>
          <strong>Delivery Planner</strong>
          <span>Локальный workspace</span>
        </div>
      </div>

      <nav class="app-nav" aria-label="Основная навигация">
        <NuxtLink to="/timeline" class="app-nav__item" active-class="app-nav__item--active">
          <UIcon name="i-lucide-gantt-chart" />
          <span>Таймлайн</span>
        </NuxtLink>
        <NuxtLink to="/projects" class="app-nav__item" active-class="app-nav__item--active">
          <UIcon name="i-lucide-folder-kanban" /><span>Проекты</span>
        </NuxtLink>
        <NuxtLink to="/team" class="app-nav__item" active-class="app-nav__item--active">
          <UIcon name="i-lucide-users" /><span>Команда</span>
        </NuxtLink>
        <NuxtLink to="/table" class="app-nav__item" active-class="app-nav__item--active">
          <UIcon name="i-lucide-table-2" /><span>Таблица</span>
        </NuxtLink>
        <NuxtLink to="/settings/data" class="app-nav__item" active-class="app-nav__item--active">
          <UIcon name="i-lucide-settings-2" /><span>Настройки</span>
        </NuxtLink>
      </nav>

      <div class="app-sidebar__footer">
        <div class="storage-note">
          <UIcon name="i-lucide-hard-drive" />
          <span>Данные остаются<br>в этом браузере</span>
        </div>
      </div>
    </aside>

    <main class="app-main">
      <header class="app-header">
        <div>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
        <div class="app-header__actions">
          <SaveIndicator />
          <UTooltip text="Сменить тему">
            <UButton color="neutral" variant="ghost" :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'" aria-label="Сменить тему" @click="toggleTheme" />
          </UTooltip>
          <div class="avatar">ИА</div>
        </div>
      </header>
      <slot />
    </main>

    <div class="width-warning">
      Для работы с таймлайном требуется ширина окна от 1280 px.
    </div>

    <div v-if="planner.recoveryRequired" class="recovery-overlay" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title">
      <section>
        <UIcon name="i-lucide-shield-alert" />
        <h2 id="recovery-title">Требуется восстановление данных</h2>
        <p>{{ planner.lastIntegrityCheck?.message }}</p>
        <div v-if="planner.backups.length" class="recovery-backups">
          <button v-for="backup in planner.backups" :key="backup.id" @click="restoreRecovery(backup.id)">
            <strong>{{ new Date(backup.createdAt).toLocaleString('ru-RU') }}</strong><span>{{ backup.reason }} · {{ backup.entityCount }} сущностей</span>
          </button>
        </div>
        <div class="recovery-actions"><UButton color="neutral" variant="outline" label="Проверить повторно" @click="planner.runIntegrityCheck()" /><UButton color="error" variant="soft" label="Безопасный сброс" @click="resetRecovery" /></div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()
const planner = usePlannerStore()
const title = computed(() => route.path === '/timeline' ? 'План поставки' : route.path === '/team' ? 'Команда и роли' : route.path === '/table' ? 'Табличное представление' : route.path.startsWith('/settings') ? 'Настройки и данные' : route.path.startsWith('/projects') ? 'Проекты' : 'Delivery Planner')
const subtitle = computed(() => route.path === '/timeline' ? 'Эпики, этапы, зависимости и capacity в одном рабочем окне' : route.path === '/team' ? 'Сотрудники, роли и доступная ёмкость' : route.path === '/table' ? 'Тот же план: сортировка, фильтры и inline-редактирование' : route.path.startsWith('/settings') ? 'Локальное хранение, backup и переносимость workspace' : route.path.startsWith('/projects') ? 'Delivery-контекст, этапы и внутренние задачи' : '')

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
async function restoreRecovery(id: string) { if (confirm('Восстановить выбранную резервную копию?')) await planner.restoreBackup(id) }
async function resetRecovery() { if (confirm('Создать backup повреждённого состояния и сбросить workspace?')) await planner.resetWorkspace() }
</script>
