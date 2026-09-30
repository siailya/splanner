<template>
  <div class="settings-page">
    <nav class="settings-tabs" aria-label="Разделы настроек">
      <NuxtLink :to="workspacePath('/settings/data')">Данные и backup</NuxtLink>
      <NuxtLink :to="workspacePath('/settings/calendar')">Календарь</NuxtLink>
      <NuxtLink :to="workspacePath('/settings/activity-types')">Activity types</NuxtLink>
      <NuxtLink :to="workspacePath('/settings/appearance')">Внешний вид</NuxtLink>
    </nav>

    <section class="settings-card">
      <div class="settings-card__heading"><div><span class="eyebrow">Server storage</span><h2>Workspace на сервере</h2></div></div>
      <p>Данные хранятся в SQLite на сервере. Последнее сохранение: {{ planner.data ? formatDate(planner.data.workspace.updatedAt) : '—' }} · версия {{ planner.data?.workspace.revision ?? '—' }}.</p>
      <div class="integrity-line"><UIcon :name="planner.lastIntegrityCheck?.status === 'ok' ? 'i-lucide-badge-check' : 'i-lucide-triangle-alert'" /><span><b>Integrity:</b> {{ planner.lastIntegrityCheck?.message ?? 'Ещё не проверялось' }}</span><UButton color="neutral" variant="outline" size="xs" label="Проверить" @click="perform(() => planner.runIntegrityCheck())" /><UButton v-if="!planner.readOnly" color="neutral" variant="ghost" size="xs" label="Перестроить derived data" @click="perform(() => planner.runIntegrityCheck(true))" /></div>
    </section>

    <section v-if="!planner.readOnly" class="settings-card">
      <div class="settings-card__heading">
        <div><span class="eyebrow">Snapshots</span><h2>Резервные копии на сервере</h2></div>
        <div v-if="!planner.readOnly" class="snapshot-create"><input v-model="manualBackupName" placeholder="Название snapshot" @keyup.enter="createManualBackup" /><UButton icon="i-lucide-shield-plus" label="Создать backup" :disabled="!manualBackupName.trim()" @click="createManualBackup" /></div>
      </div>
      <p>Хранятся последние 10 копий, но не более 20 МБ. Перед импортом, массовым удалением, календарём и restore backup создаётся автоматически.</p>
      <div v-if="planner.backups.length" class="backup-list">
        <article v-for="backup in planner.backups" :key="backup.id" class="backup-row">
          <div class="backup-row__icon"><UIcon name="i-lucide-archive-restore" /></div>
          <div><strong>{{ backup.name || reasonLabel(backup.reason) }}</strong><span>{{ backup.name ? `${reasonLabel(backup.reason)} · ` : '' }}{{ formatDate(backup.createdAt) }} · {{ backup.entityCount }} сущностей · {{ formatBytes(backup.sizeBytes) }}</span></div>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-download" aria-label="Экспортировать backup" @click="perform(() => planner.exportBackup(backup.id))" />
          <UButton color="neutral" variant="outline" size="xs" label="Просмотр" @click="selectBackup(backup.id)" />
          <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" aria-label="Удалить backup" @click="removeBackup(backup.id)" />
        </article>
      </div>
      <div v-else class="inline-empty">Backup-копий пока нет.</div>
    </section>

    <section class="settings-card">
      <div class="settings-card__heading"><div><span class="eyebrow">Portability</span><h2>JSON import / export</h2></div></div>
      <div class="export-grid">
        <div>
          <strong>Полный workspace</strong>
          <p>Все эпики, ресурсы, назначения, задачи и baseline.</p>
          <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Экспортировать всё" @click="planner.exportJson()" />
        </div>
        <div>
          <strong>Один или два квартала</strong>
          <p>Только пересекающиеся этапы и связанные справочники.</p>
          <div class="quarter-checks">
            <label v-for="quarter in planner.data?.quarters" :key="quarter.id"><input v-model="exportQuarters" type="checkbox" :value="quarter.id" /> {{ quarter.id }}</label>
          </div>
          <label class="table-toggle"><input v-model="includeBaseline" type="checkbox" /> Включить активный baseline</label>
          <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Экспортировать выбор" :disabled="!exportQuarters.length || exportQuarters.length > 2" @click="exportSelection" />
        </div>
        <div>
          <strong>Replace import</strong>
          <p>Merge намеренно не поддерживается: импорт атомарно заменяет текущий workspace после preview.</p>
          <UButton v-if="!planner.readOnly" color="neutral" variant="outline" icon="i-lucide-upload" label="Выбрать JSON" @click="fileInput?.click()" />
          <input ref="fileInput" hidden type="file" accept=".json,application/json" @change="readImport" />
        </div>
      </div>
      <div v-if="importPreview" class="import-preview">
        <div><strong>{{ importPreview.workspaceName }}</strong><span>schema v{{ importPreview.schemaVersion }}<template v-if="importPreview.migratedFrom"> · миграция с v{{ importPreview.migratedFrom }}</template></span></div>
        <dl><template v-for="(count, key) in importPreview.counts" :key="key"><dt>{{ key }}</dt><dd>{{ count }}</dd></template></dl>
        <div class="warning-card"><UIcon name="i-lucide-triangle-alert" /><p>Текущий workspace будет заменён. Перед записью автоматически создастся backup.</p></div>
        <div class="import-preview__actions"><UButton color="neutral" variant="ghost" label="Отмена" @click="cancelImport" /><UButton color="error" label="Заменить workspace" @click="commitImport" /></div>
      </div>
    </section>

    <section v-if="!planner.readOnly" class="settings-card settings-card--danger">
      <div class="settings-card__heading"><div><span class="eyebrow">Recovery</span><h2>Безопасный сброс</h2></div></div>
      <p>Создаёт backup, затем очищает план, команду, задачи и baseline. Workspace можно вернуть из списка snapshots.</p>
      <UButton color="error" variant="soft" icon="i-lucide-rotate-ccw" label="Сбросить workspace" @click="resetWorkspace" />
    </section>

    <section class="settings-card">
      <div class="settings-card__heading"><div><span class="eyebrow">Migration</span><h2>Старый локальный план</h2></div></div>
      <p>Данные прежней версии приложения в IndexedDB остаются на этом устройстве.</p>
      <UButton color="neutral" variant="outline" label="Найти локальный план" @click="findLegacy" />
      <div v-if="legacyPreview" class="import-preview">
        <div><strong>{{ legacyPreview.workspaceName }}</strong><span>schema v{{ legacyPreview.schemaVersion }}</span></div>
        <dl><template v-for="(count, key) in legacyPreview.counts" :key="key"><dt>{{ key }}</dt><dd>{{ count }}</dd></template></dl>
        <div class="import-preview__actions"><UButton color="neutral" variant="outline" label="Скачать оригинал" @click="downloadLegacy" /><UButton v-if="!planner.readOnly" color="warning" label="Перенести в этот workspace" @click="commitLegacy" /></div>
      </div>
      <p v-if="legacyMessage">{{ legacyMessage }}</p>
      <div v-if="legacyBackups.length"><h3>Локальные backup</h3><UButton v-for="backup in legacyBackups" :key="backup.id" color="neutral" variant="ghost" :label="formatDate(backup.createdAt)" @click="downloadLegacyBackup(backup.id)" /></div>
    </section>

    <AppModal :open="Boolean(selectedBackupId)" title="Содержимое backup" eyebrow="Recovery preview" description="Проверьте снимок перед полной заменой текущего workspace." @close="selectedBackupId = undefined">
      <div v-if="selectedBackup && backupPreview" class="import-preview">
        <div><strong>{{ backupPreview.workspaceName }}</strong><span>revision {{ selectedBackup.workspaceRevision }} · schema v{{ selectedBackup.schemaVersion }}</span></div>
        <dl><template v-for="(count, key) in backupPreview.counts" :key="key"><dt>{{ key }}</dt><dd>{{ count }}</dd></template></dl>
        <small>{{ reasonLabel(selectedBackup.reason) }} · {{ formatDate(selectedBackup.createdAt) }} · {{ formatBytes(selectedBackup.sizeBytes) }}</small>
      </div>
      <div v-else-if="selectedBackup" class="warning-card"><UIcon name="i-lucide-triangle-alert" /><p>Payload этой копии повреждён и не может быть восстановлен.</p></div><p v-else>Загружаем копию…</p>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Закрыть" @click="selectedBackupId = undefined" />
        <UButton v-if="!planner.readOnly" color="warning" label="Восстановить эту копию" :disabled="!backupPreview" @click="restoreSelected" />
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import type { BackupReason, BackupSnapshot, PlannerData, QuarterId } from '../../domain/models/types'
import { previewWorkspaceImport, serializeWorkspace, type ImportPreview } from '../../infrastructure/files/workspace-transfer'
import { usePlannerStore } from '../../stores/planner'
import { usePlannerDatabase } from '../../infrastructure/db/database'
import { PlannerRepository } from '../../infrastructure/repositories/planner-repository'

const planner = usePlannerStore()
const toast = useToast()
await planner.initialize()

const exportQuarters = ref<QuarterId[]>([])
const includeBaseline = ref(false)
const fileInput = ref<HTMLInputElement>()
const importPayload = ref('')
const importPreview = ref<ImportPreview>()
const manualBackupName = ref('')
const selectedBackupId = ref<string>()
const selectedBackup = ref<BackupSnapshot>()
async function selectBackup(id: string) { selectedBackupId.value = id; selectedBackup.value = undefined; try { selectedBackup.value = await planner.getBackup(id) } catch (error) { selectedBackupId.value = undefined; toast.add({ title: 'Не удалось загрузить backup', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
const backupPreview = computed(() => {
  if (!selectedBackup.value) return undefined
  try {
    const data = JSON.parse(selectedBackup.value.payload) as PlannerData
    return {
      workspaceName: data.workspace.name,
      counts: {
        epics: data.epics?.length ?? 0,
        stages: data.stages?.length ?? 0,
        dependencies: data.dependencies?.length ?? 0,
        roles: data.roles?.length ?? 0,
        people: data.people?.length ?? 0,
        assignments: data.assignments?.length ?? 0,
        workItems: data.workItems?.length ?? 0,
        baselines: data.baselines?.length ?? 0,
      },
    }
  } catch {
    return undefined
  }
})
const legacyPayload = ref('')
const legacyPreview = ref<ImportPreview>()
const legacyMessage = ref('')
const legacyBackups = ref<BackupSnapshot[]>([])
async function findLegacy() {
  const db = usePlannerDatabase()
  const workspace = await db.workspaces.toCollection().first()
  if (!workspace) { legacyMessage.value = 'Локальный план не найден'; return }
  const repository = new PlannerRepository(db)
  const old = await repository.loadAll(workspace.id)
  legacyPayload.value = serializeWorkspace(old)
  legacyPreview.value = previewWorkspaceImport(legacyPayload.value)
  legacyBackups.value = await repository.listBackups(workspace.id)
  legacyMessage.value = ''
}
function downloadText(text: string, name: string) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url) }
function downloadLegacy() { downloadText(legacyPayload.value, 'delivery-planner-local-original.json') }
async function downloadLegacyBackup(id: string) { const backup = await new PlannerRepository(usePlannerDatabase()).getBackup(id); if (backup) downloadText(serializeWorkspace(JSON.parse(backup.payload) as PlannerData), `delivery-planner-local-backup-${id}.json`) }
async function commitLegacy() { if (!confirm('Заменить серверный workspace найденным локальным планом?')) return; await perform(() => planner.importJson(legacyPayload.value)) }

function formatBytes(value: number) { if (!value) return '0 Б'; const units = ['Б', 'КБ', 'МБ', 'ГБ']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}` }
function formatDate(value: string) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function reasonLabel(reason: BackupReason) { return ({ manual: 'Ручной backup', daily: 'Ежедневный backup', before_import: 'Перед импортом', before_delete: 'Перед удалением', before_calendar_change: 'Перед изменением календаря', before_restore: 'Перед восстановлением' })[reason] }
async function perform(action: () => Promise<unknown>) { try { await action(); toast.add({ title: 'Готово', color: 'success' }) } catch (error) { toast.add({ title: 'Операция не выполнена', description: error instanceof Error ? error.message : String(error), color: 'error' }) } }
async function createManualBackup() {
  const name = manualBackupName.value.trim()
  if (!name) return
  await perform(() => planner.createBackup('manual', name))
  manualBackupName.value = ''
}
async function restoreSelected() {
  const id = selectedBackupId.value
  if (!id || !confirm('Заменить текущий workspace этой копией? Перед восстановлением будет создан ещё один backup.')) return
  await perform(() => planner.restoreBackup(id))
  selectedBackupId.value = undefined
}
async function removeBackup(id: string) { if (!confirm('Удалить эту резервную копию без возможности восстановления?')) return; await perform(() => planner.deleteBackup(id)) }
function exportSelection() { planner.exportJson({ quarterIds: exportQuarters.value, includeBaselineId: includeBaseline.value ? planner.activeBaselineId : undefined }) }
async function readImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    importPayload.value = await file.text()
    importPreview.value = previewWorkspaceImport(importPayload.value)
  } catch (error) {
    toast.add({ title: 'Файл отклонён', description: error instanceof Error ? error.message : String(error), color: 'error' })
  }
  ;(event.target as HTMLInputElement).value = ''
}
function cancelImport() { importPayload.value = ''; importPreview.value = undefined }
async function commitImport() { await perform(() => planner.importJson(importPayload.value)); cancelImport() }
async function resetWorkspace() { if (!confirm('Сбросить весь workspace? Будет создана резервная копия.')) return; await perform(planner.resetWorkspace) }
</script>
