<template>
  <div class="timeline-page">
    <div class="timeline-toolbar">
      <div class="segmented" aria-label="Диапазон кварталов">
        <button v-for="option in quarterModes" :key="option.value" :class="{ active: ui.quarterView === option.value }" @click="ui.quarterView = option.value">
          {{ option.label }}
        </button>
      </div>

      <select v-if="ui.quarterView === 'archive'" v-model="ui.selectedQuarterId" class="toolbar-select" aria-label="Архивный квартал">
        <option v-for="quarter in sortedQuarters" :key="quarter.id" :value="quarter.id">{{ quarter.id }}</option>
      </select>

      <div class="toolbar-divider" />
      <div class="segmented segmented--compact" aria-label="Масштаб">
        <button v-for="item in scales" :key="item.value" :class="{ active: ui.scale === item.value }" @click="ui.scale = item.value">
          {{ item.label }}
        </button>
      </div>

      <div class="timeline-zoom" role="group" aria-label="Горизонтальный масштаб таймлайна">
        <button type="button" aria-label="Уменьшить масштаб таймлайна" title="Уменьшить ширину временных ячеек" :disabled="!ui.canZoomOut" @click="ui.zoomTimeline(-1)"><UIcon name="i-lucide-minus" /></button>
        <button type="button" class="timeline-zoom__reset" aria-label="Сбросить масштаб таймлайна" title="Вернуть масштаб 100%" @click="ui.timelineZoom = 1">{{ Math.round(ui.timelineZoom * 100) }}%</button>
        <button type="button" aria-label="Увеличить масштаб таймлайна" title="Увеличить ширину временных ячеек" :disabled="!ui.canZoomIn" @click="ui.zoomTimeline(1)"><UIcon name="i-lucide-plus" /></button>
      </div>

      <UTooltip text="Показать сегодня (T)">
        <UButton color="neutral" variant="ghost" icon="i-lucide-calendar-days" label="Сегодня" size="sm" @click="ganttRef?.scrollToToday()" />
      </UTooltip>

      <div class="toolbar-divider" />
      <div v-if="!planner.readOnly" class="move-toggle">
        <button :class="{ active: ui.moveMode === 'cascade' }" @click="ui.moveMode = 'cascade'"><UIcon name="i-lucide-git-branch" />Каскад</button>
        <button :class="{ active: ui.moveMode === 'free' }" @click="ui.moveMode = 'free'"><UIcon name="i-lucide-move-horizontal" />Свободно</button>
      </div>
      <span v-if="!planner.readOnly" class="alt-hint">⌥ временно меняет режим</span>

      <select v-model="planner.activeBaselineId" class="toolbar-select" aria-label="Baseline для сравнения">
        <option :value="undefined">Без baseline</option>
        <option v-for="baseline in planner.data?.baselines" :key="baseline.id" :value="baseline.id">{{ baseline.name }}</option>
      </select>
      <UTooltip v-if="!planner.readOnly" text="Зафиксировать согласованный план">
        <UButton color="neutral" variant="ghost" icon="i-lucide-git-compare" size="sm" aria-label="Создать baseline" @click="modal = 'baseline'" />
      </UTooltip>

      <div class="toolbar-spacer" />
      <UTooltip :text="planner.canUndo ? 'Отменить (⌘Z)' : 'Нет действий для отмены'">
        <UButton color="neutral" variant="ghost" icon="i-lucide-undo-2" size="sm" :disabled="!planner.canUndo" aria-label="Отменить" @click="perform(planner.undo)" />
      </UTooltip>
      <UTooltip :text="planner.canRedo ? 'Повторить (⌘⇧Z)' : 'Нет действий для повтора'">
        <UButton color="neutral" variant="ghost" icon="i-lucide-redo-2" size="sm" :disabled="!planner.canRedo" aria-label="Повторить" @click="perform(planner.redo)" />
      </UTooltip>

      <button class="filter-button" :class="{ active: hasFilters }" @click="modal = 'filters'">
        <UIcon name="i-lucide-list-filter" />
        Фильтры
        <span v-if="filterCount">{{ filterCount }}</span>
      </button>
      <label class="timeline-search">
        <UIcon name="i-lucide-search" />
        <input v-model="ui.filters.query" placeholder="Поиск этапов…" />
        <button v-if="ui.filters.query" aria-label="Очистить поиск" @click="ui.filters.query = ''"><UIcon name="i-lucide-x" /></button>
      </label>

      <UButton v-if="!planner.readOnly" color="primary" icon="i-lucide-plus" label="Эпик" size="sm" @click="openNewEpic" />
      <UButton v-if="!planner.readOnly" color="neutral" variant="outline" icon="i-lucide-list-plus" label="Этап" size="sm" :disabled="!activeEpics.length" @click="openNewStage" />
      <div class="data-menu-wrap">
        <UButton color="neutral" variant="outline" icon="i-lucide-ellipsis" size="sm" aria-label="Действия с данными" @click="dataMenuOpen = !dataMenuOpen" />
        <div v-if="dataMenuOpen" class="data-menu">
          <button @click="planner.exportJson(); dataMenuOpen = false"><UIcon name="i-lucide-download" />Экспорт JSON</button>
          <button v-if="!planner.readOnly" @click="importInput?.click(); dataMenuOpen = false"><UIcon name="i-lucide-upload" />Импорт JSON</button>
          <button @click="modal = 'png'; dataMenuOpen = false"><UIcon name="i-lucide-image-down" />Экспорт PNG…</button>
          <button @click="navigateTo(workspacePath('/print')); dataMenuOpen = false"><UIcon name="i-lucide-printer" />Печать / PDF</button>
          <button v-if="!planner.readOnly" @click="openCalendar"><UIcon name="i-lucide-calendar-cog" />Рабочий календарь</button>
          <button v-if="!planner.readOnly" class="danger" @click="modal = 'clear'; dataMenuOpen = false"><UIcon name="i-lucide-trash-2" />Очистить план</button>
        </div>
      </div>
      <input ref="importInput" type="file" accept="application/json,.json" hidden @change="readImport" />
    </div>

    <div v-if="planner.conflicts.length" class="conflict-banner">
      <div><UIcon name="i-lucide-triangle-alert" /><strong>Нарушено зависимостей: {{ planner.conflicts.length }}</strong><span>Свободный перенос сохранён, но расписание требует внимания.</span></div>
      <UButton v-if="!planner.readOnly" color="warning" variant="soft" label="Исправить расписание" size="sm" @click="perform(planner.fixSchedule)" />
    </div>

    <section class="timeline-workspace" :class="{ 'timeline-workspace--with-banner': planner.conflicts.length }">
      <div class="timeline-gantt">
      <div v-if="planner.loading || !planner.data" class="timeline-state">
        <UIcon name="i-lucide-loader-circle" class="save-indicator__spin" />
        <span>Открываем workspace…</span>
      </div>
      <div v-else-if="!planner.data.epics.length" class="timeline-empty">
        <div class="timeline-empty__illustration"><UIcon name="i-lucide-gantt-chart-square" /></div>
        <span class="eyebrow">Первый план</span>
        <h2>Замените Excel живым таймлайном</h2>
        <p>Создайте эпик и разложите работу по этапам или откройте готовый сценарий с двумя параллельными ветками.</p>
        <div>
          <UButton v-if="!planner.readOnly" label="Создать эпик" icon="i-lucide-plus" @click="openNewEpic" />
          <UButton v-if="!planner.readOnly" label="Загрузить демо" icon="i-lucide-sparkles" color="neutral" variant="outline" @click="perform(planner.loadDemo)" />
        </div>
      </div>
      <GanttTimeline
        :read-only="planner.readOnly"
        v-else
        ref="ganttRef"
        :epics="visibleEpics"
        :stages="visibleStages"
        :all-stages="planner.data.stages"
        :activity-types="planner.data.activityTypes"
        :dependencies="visibleDependencies"
        :calendar="planner.data.calendar"
        :range-start="range.startDate"
        :range-end="range.endDate"
        :scale="ui.scale"
        :column-width="ui.timelineColumnWidth"
        :periods="capacityResult.periods"
        :grid-width="ui.gridWidth"
        :collapsed-epic-ids="ui.collapsedEpicIds"
        :mode="ui.moveMode"
        :conflict-stage-ids="conflictStageIds"
        :selected-stage-ids="selectedStageIds"
        :highlighted-stage-ids="highlightedStageIds"
        :work-items="planner.data.workItems"
        :baseline-snapshots="activeBaselineSnapshots"
        :baseline-new-stage-ids="baselineNewStageIds"
        @task-change="handleTaskChange"
        @epic-move="payload => perform(() => planner.moveEpic(payload.id, payload.deltaCalendarDays))"
        @link-add="handleLinkAdd"
        @link-delete="id => perform(() => planner.removeDependency(id))"
        @edit-stage="openEditStage"
        @edit-epic="openEditEpic"
        @move-stage="handleMoveBetweenEpics"
        @reorder-stage="payload => perform(() => planner.reorderStage(payload.id, payload.epicId, payload.index))"
        @epic-collapsed="handleEpicCollapsed"
        @edit-dependency="openDependency"
        @range-create="openRangeStage"
        @stage-select="handleStageSelect"
        @stage-context-menu="openStageContextMenu"
        @epic-context-menu="openEpicContextMenu"
        @epic-select="handleEpicSelect"
        @selection-clear="clearStageSelection"
        @viewport-change="payload => timelineScrollX = payload.x"
        @geometry-change="payload => timelineGeometry = payload"
      />
      </div>
      <CapacityPanel
        v-if="planner.data && planner.data.epics.length"
        :result="capacityResult"
        :roles="planner.data.roles"
        :grid-width="ui.gridWidth"
        :scroll-x="timelineScrollX"
        :geometry="timelineGeometry"
        @scroll="x => ganttRef?.scrollToX(x)"
        @highlight="ids => capacityHighlightStageIds = ids"
        @drilldown="openCapacityDrilldown"
      />
    </section>

    <div class="timeline-statusbar">
      <span><b>{{ visibleEpics.length }}</b> эпиков</span>
      <span><b>{{ visibleStages.length }}</b> этапов</span>
      <span><b>{{ visibleDependencies.length }}</b> связей</span>
      <span class="timeline-statusbar__range"><UIcon name="i-lucide-calendar-range" />{{ range.startDate }} — {{ range.endDate }}</span>
      <span class="timeline-statusbar__help">Drag по пустому диапазону создаёт этап · Double-click открывает карточку · ПКМ по эпику или этапу открывает действия</span>
    </div>

    <Teleport to="body">
      <div
        v-if="epicContextMenu && contextEpic && !planner.readOnly"
        ref="epicContextMenuElement"
        class="stage-context-menu epic-context-menu"
        :style="{ left: `${epicContextMenu.x}px`, top: `${epicContextMenu.y}px` }"
        role="dialog"
        aria-label="Действия с эпиком"
        tabindex="-1"
      >
        <div class="stage-context-menu__heading epic-context-menu__heading">{{ contextEpic.title }}</div>
        <button class="stage-context-menu__action" @click="addStageFromEpicMenu"><UIcon name="i-lucide-plus" />Добавить этап</button>
        <button class="stage-context-menu__action" @click="editEpicFromMenu"><UIcon name="i-lucide-pencil" />Редактировать эпик</button>
        <div class="stage-context-menu__divider" />
        <button class="stage-context-menu__action" :disabled="contextEpicIndex <= 0" @click="reorderEpicFromMenu(-1)"><UIcon name="i-lucide-arrow-up" />Поднять эпик</button>
        <button class="stage-context-menu__action" :disabled="contextEpicIndex < 0 || contextEpicIndex >= visibleEpics.length - 1" @click="reorderEpicFromMenu(1)"><UIcon name="i-lucide-arrow-down" />Опустить эпик</button>
      </div>
      <div
        v-if="stageContextMenu && !planner.readOnly"
        ref="stageContextMenuElement"
        class="stage-context-menu"
        :style="{ left: `${stageContextMenu.x}px`, top: `${stageContextMenu.y}px` }"
        role="dialog"
        aria-label="Действия с выбранными этапами"
        tabindex="-1"
      >
        <div class="stage-context-menu__heading">Выбрано этапов: {{ selectedStageIds.length }}</div>
        <div class="stage-context-menu__move">
          <label for="stage-context-delta">Сдвиг, раб. дн.</label>
          <input id="stage-context-delta" v-model.number="bulkDelta" type="number" step="1" />
          <button @click="runStageMenuAction(() => planner.move([...selectedStageIds], bulkDelta, ui.moveMode))">Перенести</button>
        </div>
        <label class="stage-context-menu__field">Статус
          <select v-model="bulkStatus" @change="applyBulkStatus"><option value="">Выберите статус…</option><option v-for="status in statuses" :key="status.value" :value="status.value">{{ status.label }}</option></select>
        </label>
        <label class="stage-context-menu__field">Тип активности
          <select v-model="bulkActivity" @change="applyBulkActivity"><option value="">Выберите тип…</option><option v-for="type in planner.data?.activityTypes" :key="type.id" :value="type.id">{{ type.name }}</option></select>
        </label>
        <div class="stage-context-menu__divider" />
        <button class="stage-context-menu__action" @click="runStageMenuAction(copySelection)"><UIcon name="i-lucide-copy" />Копировать</button>
        <button class="stage-context-menu__action" @click="runStageMenuAction(duplicateSelection)"><UIcon name="i-lucide-copy-plus" />Дублировать</button>
        <button class="stage-context-menu__action" @click="runStageMenuAction(() => planner.compactStages([...selectedStageIds]))"><UIcon name="i-lucide-minimize-2" />Сжать цепочку</button>
        <label class="stage-context-menu__checkbox"><input v-model="copyDependencies" type="checkbox" />Копировать связи при дублировании</label>
        <div class="stage-context-menu__divider" />
        <button class="stage-context-menu__action" @click="clearStageSelection"><UIcon name="i-lucide-x" />Снять выделение</button>
      </div>
    </Teleport>

    <AppModal :open="modal === 'epic'" :wide="true" :title="epicForm.id ? 'Карточка эпика' : 'Новый эпик'" eyebrow="Проект" description="Эпик объединяет этапы и параллельные ветки." @close="closeEpicModal">
      <form id="epic-form" class="form-grid" @submit.prevent="submitEpic"><fieldset class="read-only-fieldset" :disabled="planner.readOnly">
        <label class="field field--wide"><span>Название *</span><input v-model="epicForm.title" required autofocus placeholder="Например, CPM–CPA аукцион" /></label>
        <label class="field"><span>Короткий код</span><input v-model="epicForm.code" placeholder="ADS-01" /></label>
        <label class="field"><span>Статус</span><select v-model="epicForm.status"><option value="active">Активен</option><option value="paused">На паузе</option><option value="done">Завершён</option><option value="archived">Архив</option></select></label>
        <label class="field"><span>Цвет маркера</span><input v-model="epicForm.marker" type="color" /></label>
        <label class="field"><span>Начало эпика</span><input v-model="epicForm.startDate" type="date" /></label>
        <label class="field"><span>Окончание эпика</span><input v-model="epicForm.endDate" type="date" /></label>
        <p class="field field--wide">По умолчанию период эпика — с сегодня до даты через три дня. Если этапы выходят за указанный период, полоса эпика расширяется до их границ. Очистите обе даты, чтобы период полностью подстраивался под этапы.</p>
      </fieldset></form>
      <div class="detail-section"><div class="detail-section__title"><div><strong>Описание</strong><span v-if="epicDescriptionSaving">Сохранение…</span></div></div><PlainTextDescription v-model="epicForm.descriptionMarkdown" :read-only="planner.readOnly" /></div>
      <template #footer>
        <UButton v-if="epicForm.id && !planner.readOnly" color="error" variant="ghost" label="Удалить" class="mr-auto" @click="deleteCurrentEpic" />
        <UButton v-if="epicForm.id" color="neutral" variant="ghost" label="Выбрать все этапы" @click="selectEpicStages" />
        <div v-if="epicForm.id && !planner.readOnly" class="epic-order-actions"><UButton color="neutral" variant="ghost" icon="i-lucide-arrow-up" aria-label="Поднять эпик" @click="moveEpic(-1)" /><UButton color="neutral" variant="ghost" icon="i-lucide-arrow-down" aria-label="Опустить эпик" @click="moveEpic(1)" /></div>
        <UButton color="neutral" variant="ghost" label="Отмена" @click="closeEpicModal" />
        <UButton v-if="!planner.readOnly" type="submit" form="epic-form" :label="epicForm.id ? 'Сохранить' : 'Создать эпик'" />
      </template>
    </AppModal>

    <AppModal :open="modal === 'stage'" :wide="true" :title="stageForm.id ? 'Карточка этапа' : 'Новый этап'" eyebrow="Этап" description="Даты включительны; длительность считается по рабочему календарю." @close="closeStageModal">
      <form id="stage-form" class="form-grid" @submit.prevent="submitStage"><fieldset class="read-only-fieldset" :disabled="planner.readOnly">
        <label class="field field--wide"><span>Название *</span><input v-model="stageForm.title" required autofocus placeholder="Название этапа" /></label>
        <label class="field"><span>Эпик *</span><select v-model="stageForm.epicId" required><option v-for="epic in activeEpics" :key="epic.id" :value="epic.id">{{ epic.title }}</option></select></label>
        <label class="field"><span>Вид</span><select v-model="stageForm.kind"><option value="task">Task</option><option value="scope">Scope</option><option value="milestone">Milestone</option></select></label>
        <label class="field"><span>Activity type</span><select v-model="stageForm.activityTypeId"><option v-for="type in planner.data?.activityTypes" :key="type.id" :value="type.id">{{ type.name }}</option></select></label>
        <label class="field"><span>Статус</span><select v-model="stageForm.status"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="blocked">Blocked</option></select></label>
        <label class="field"><span>{{ stageForm.kind === 'milestone' ? 'Дата вехи' : 'Начало' }}</span><input v-model="stageForm.startDate" type="date" :disabled="stageForm.locked" required /></label>
        <label v-if="stageForm.kind !== 'milestone'" class="field"><span>Окончание</span><input v-model="stageForm.endDate" type="date" :disabled="stageForm.locked" required /></label>
        <label class="field field--wide"><span>Внешняя ссылка</span><input v-model="stageForm.externalUrl" type="url" placeholder="https://tracker.example/task/123" /></label>
        <label class="switch-field"><input v-model="stageForm.locked" type="checkbox" /><span><b>Заблокировать этап</b><small>Запретить drag, resize и неявный каскад</small></span></label>
      </fieldset></form>
      <div v-if="currentStageConflicts.length" class="compact-warning detail-section"><UIcon name="i-lucide-triangle-alert" /><span v-for="conflict in currentStageConflicts" :key="conflict.dependencyId">Требуется старт не раньше {{ conflict.minimumStart }}, сейчас {{ conflict.actualStart }}{{ conflict.locked ? ' · этап заблокирован' : '' }}.</span></div>
      <div v-if="stageForm.id" class="detail-section">
        <div class="detail-section__title"><div><strong>Зависимости Finish-to-Start</strong><span>{{ currentStageDependencies.length }}</span></div></div>
        <div v-for="link in currentStageDependencies" :key="link.id" class="dependency-inline">
          <span>{{ stageTitle(link.predecessorStageId) }} → {{ stageTitle(link.successorStageId) }}</span>
          <label>lag <input :disabled="planner.readOnly" :value="link.lagWorkdays" type="number" min="0" step="1" @change="perform(() => planner.updateDependency(link.id, Number(($event.target as HTMLInputElement).value)))" /></label>
          <UButton v-if="!planner.readOnly" color="error" variant="ghost" size="xs" icon="i-lucide-unlink" aria-label="Удалить зависимость" @click="perform(() => planner.removeDependency(link.id))" />
        </div>
        <div v-if="!planner.readOnly" class="dependency-add">
          <select v-model="newPredecessorId"><option value="">Выберите predecessor…</option><option v-for="stage in predecessorOptions" :key="stage.id" :value="stage.id">{{ stage.title }}</option></select>
          <label>Lag <input v-model.number="newPredecessorLag" type="number" min="0" step="1" /></label>
          <UButton size="xs" label="Связать" :disabled="!newPredecessorId" @click="addDrawerDependency" />
        </div>
      </div>
      <div class="detail-section"><div class="detail-section__title"><div><strong>Описание</strong><span v-if="stageDescriptionSaving">Сохранение…</span></div></div><PlainTextDescription v-model="stageForm.descriptionMarkdown" :read-only="planner.readOnly" /></div>
      <StageAssignmentEditor :stage-id="stageForm.id || undefined" />
      <WorkItemStageWorkItems :stage-id="stageForm.id || undefined" :epic-id="stageForm.epicId" />
      <template #footer>
        <UButton v-if="stageForm.id && !planner.readOnly" color="error" variant="ghost" label="Удалить" class="mr-auto" @click="deleteCurrentStage" />
        <UButton color="neutral" variant="ghost" label="Отмена" @click="closeStageModal" />
        <UButton v-if="!planner.readOnly" type="submit" form="stage-form" :label="stageForm.id ? 'Сохранить' : 'Создать этап'" />
      </template>
    </AppModal>

    <AppModal :open="modal === 'filters'" title="Фильтры таймлайна" eyebrow="Представление" description="Фильтры не изменяют данные плана." @close="modal = undefined">
      <div class="filter-groups">
        <fieldset class="filter-groups__wide"><legend>Эпик</legend><label v-for="epic in planner.data?.epics" :key="epic.id"><input v-model="ui.filters.epicIds" type="checkbox" :value="epic.id" /><i :style="{ background: epic.marker ?? '#64748b' }" />{{ epic.title }}</label></fieldset>
        <fieldset><legend>Вид этапа</legend><label v-for="kind in stageKinds" :key="kind.value"><input v-model="ui.filters.kinds" type="checkbox" :value="kind.value" />{{ kind.label }}</label></fieldset>
        <fieldset><legend>Статус</legend><label v-for="status in statuses" :key="status.value"><input v-model="ui.filters.statuses" type="checkbox" :value="status.value" />{{ status.label }}</label></fieldset>
        <fieldset class="filter-groups__wide"><legend>Activity type</legend><label v-for="type in planner.data?.activityTypes" :key="type.id"><input v-model="ui.filters.activityTypeIds" type="checkbox" :value="type.id" /><i :style="{ background: type.colorToken }" />{{ type.name }}</label></fieldset>
        <fieldset class="filter-groups__wide"><legend>Роли и сотрудники</legend><label v-for="role in planner.data?.roles" :key="role.id"><input v-model="ui.filters.roleIds" type="checkbox" :value="role.id" />{{ role.name }}</label><label v-for="person in planner.data?.people" :key="person.id"><input v-model="ui.filters.personIds" type="checkbox" :value="person.id" />{{ person.name }}</label></fieldset>
        <div class="form-grid filter-groups__wide"><label class="field"><span>Дата от</span><input v-model="ui.filters.dateFrom" type="date" /></label><label class="field"><span>Дата до</span><input v-model="ui.filters.dateTo" type="date" /></label></div>
        <label class="switch-field filter-groups__wide"><input v-model="ui.filters.overloadedOnly" type="checkbox" /><span><b>Только этапы с перегрузкой</b></span></label>
        <label class="switch-field filter-groups__wide"><input v-model="ui.filters.conflictsOnly" type="checkbox" /><span><b>Только dependency conflicts</b></span></label>
        <label class="switch-field filter-groups__wide"><input v-model="ui.filters.showArchived" type="checkbox" /><span><b>Показывать архивные эпики</b></span></label>
      </div>
      <template #footer><UButton color="neutral" variant="ghost" label="Сбросить" class="mr-auto" @click="ui.clearFilters()" /><UButton label="Готово" @click="modal = undefined" /></template>
    </AppModal>

    <AppModal :open="modal === 'capacity'" title="Из чего складывается нагрузка" eyebrow="Capacity drill-down" :description="capacitySelection ? `${capacitySelection.row.name} · ${capacitySelection.cell.startDate} — ${capacitySelection.cell.endDate}` : ''" @close="closeCapacityDrilldown">
      <div v-if="capacitySelection" class="capacity-drilldown">
        <div class="capacity-drilldown__summary"><div><span>Занято</span><strong>{{ capacitySelection.cell.usedFte }} FTE</strong></div><div><span>Доступно</span><strong>{{ capacitySelection.cell.availableFte }} FTE</strong></div><div><span>Свободно</span><strong>{{ capacitySelection.cell.freeFte }} FTE</strong></div><div><span>Загрузка</span><strong>{{ capacitySelection.cell.utilization === null ? 'нет capacity' : `${Math.round(capacitySelection.cell.utilization * 100)}%` }}</strong></div></div>
        <div v-if="!capacityContributions.length" class="inline-empty">Этапы не формируют нагрузку в этом периоде.</div>
        <button v-for="item in capacityContributions" :key="`${item.assignmentId}:${item.stageId}`" class="contribution-row" @click="focusContribution(item.stageId)"><i :style="{ background: activityForStage(item.stageId)?.colorToken }" /><div><strong>{{ stageTitle(item.stageId) }}</strong><span>{{ epicTitle(item.epicId) }} · {{ item.allocationFte }} FTE</span></div><UIcon name="i-lucide-locate-fixed" /></button>
      </div>
      <template #footer><UButton label="Закрыть" @click="closeCapacityDrilldown" /></template>
    </AppModal>

    <AppModal :open="modal === 'dependency'" title="Зависимость Finish-to-Start" eyebrow="Связь" description="Successor стартует не раньше следующего рабочего дня после predecessor с учётом lag." @close="modal = undefined">
      <div class="dependency-card" v-if="selectedDependency">
        <div><span>Предшественник</span><strong>{{ stageTitle(selectedDependency.predecessorStageId) }}</strong></div>
        <UIcon name="i-lucide-arrow-right" />
        <div><span>Последователь</span><strong>{{ stageTitle(selectedDependency.successorStageId) }}</strong></div>
      </div>
      <label class="field"><span>Lag, рабочих дней</span><input v-model.number="dependencyLag" type="number" min="0" step="1" /></label>
      <template #footer><UButton color="error" variant="ghost" label="Удалить связь" class="mr-auto" @click="deleteSelectedDependency" /><UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" /><UButton label="Сохранить" @click="saveDependency" /></template>
    </AppModal>

    <AppModal :open="modal === 'calendar'" title="Рабочий календарь" eyebrow="Настройки" description="Плановые даты хранятся без timezone и пересчитываются контролируемо." @close="modal = undefined">
      <div class="calendar-form">
        <div><span class="field-label">Рабочая неделя</span><div class="weekday-picker"><label v-for="day in weekdays" :key="day.value" :class="{ active: calendarForm.workingWeekdays.includes(day.value) }"><input v-model="calendarForm.workingWeekdays" type="checkbox" :value="day.value" />{{ day.label }}</label></div></div>
        <label class="field"><span>Нерабочие даты</span><textarea v-model="calendarForm.holidays" rows="3" placeholder="2026-11-04, 2026-12-31" /><small>Через запятую или с новой строки</small></label>
        <label class="field"><span>Дополнительные рабочие даты</span><textarea v-model="calendarForm.extraWorkingDays" rows="3" placeholder="2026-12-26" /><small>Выходные, которые считаются рабочими</small></label>
        <div v-if="calendarImpact" class="calendar-impact"><UIcon name="i-lucide-info" /><div><strong>Затронуто этапов: {{ calendarImpact.changedDurations }}</strong><span>Потенциальных конфликтов зависимостей: {{ calendarImpact.dependencyConflicts }}</span></div></div>
      </div>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" />
        <template v-if="calendarImpact"><UButton color="neutral" variant="outline" label="Сохранить даты" @click="commitCalendar(false)" /><UButton label="Пересчитать schedule" @click="commitCalendar(true)" /></template>
        <UButton v-else label="Проверить влияние" @click="previewCalendar" />
      </template>
    </AppModal>

    <AppModal :open="modal === 'import'" title="Заменить текущий workspace?" eyebrow="Импорт JSON" description="Файл полностью заменит текущий план. Перед записью будет создан persistent backup для отката." @close="modal = undefined">
      <div class="warning-card"><UIcon name="i-lucide-shield-alert" /><p><strong>Частичный импорт невозможен.</strong><br>Формат, ссылки, даты и циклы будут проверены до изменения IndexedDB.</p></div>
      <div v-if="importPreview" class="import-preview">
        <div><strong>{{ importPreview.workspaceName }}</strong><span>schema v{{ importPreview.schemaVersion }}<template v-if="importPreview.migratedFrom"> · миграция с v{{ importPreview.migratedFrom }}</template></span></div>
        <dl><template v-for="(count, key) in importPreview.counts" :key="key"><dt>{{ key }}</dt><dd>{{ count }}</dd></template></dl>
      </div>
      <template #footer><UButton color="neutral" variant="ghost" label="Отмена" @click="cancelImport" /><UButton color="warning" label="Заменить workspace" :disabled="!importPreview" @click="commitImport" /></template>
    </AppModal>

    <AppModal :open="modal === 'clear'" title="Очистить план?" eyebrow="Опасное действие" description="Будут удалены эпики, этапы и зависимости. Справочники и календарь останутся." @close="modal = undefined">
      <div class="warning-card"><UIcon name="i-lucide-trash-2" /><p>Операция попадёт в историю, поэтому её можно отменить через <strong>Cmd/Ctrl + Z</strong>.</p></div>
      <template #footer><UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" /><UButton color="error" label="Очистить план" @click="perform(async () => { await planner.clearPlan(); modal = undefined })" /></template>
    </AppModal>

    <AppModal :open="modal === 'baseline'" title="Baseline плана" eyebrow="Контроль сроков" description="Снимок неизменяем: после создания его можно только переименовать или удалить." @close="modal = undefined">
      <div class="form-grid">
        <label class="field field--wide"><span>Название</span><input v-model="baselineName" placeholder="Например, Согласовано 23 июля" /></label>
        <label class="field field--wide"><span>Комментарий (необязательно)</span><textarea v-model="baselineComment" rows="2" placeholder="Контекст согласования или номер решения" /></label>
        <label class="switch-field"><input v-model="baselineVisibleOnly" type="checkbox" /><span><b>Только видимые эпики</b><small>Иначе снимок охватит все эпики выбранного окна.</small></span></label>
      </div>
      <div v-if="activeBaselineDiff?.removed.length" class="detail-section">
        <div class="detail-section__title"><strong>Удалено после baseline</strong><span>{{ activeBaselineDiff.removed.length }}</span></div>
        <div v-for="item in activeBaselineDiff.removed" :key="item.snapshot.id" class="baseline-removed-item">
          <span>{{ item.snapshot.title }}</span><small>{{ item.snapshot.startDate }} — {{ item.snapshot.endDate }}</small>
        </div>
      </div>
      <div v-if="planner.data?.baselines.length" class="detail-section">
        <div class="detail-section__title"><strong>Сохранённые baseline</strong><span>{{ planner.data.baselines.length }}</span></div>
        <div v-for="item in planner.data.baselines" :key="item.id" class="baseline-removed-item">
          <span><b>{{ item.name }}</b><small>{{ new Date(item.createdAt).toLocaleString('ru-RU') }} · этапов {{ planner.data.baselineStages.filter(snapshot => snapshot.baselineId === item.id).length }}<template v-if="item.comment"> · {{ item.comment }}</template></small></span>
          <span><UButton color="neutral" variant="ghost" size="xs" label="Переименовать" @click="renameBaseline(item.id, item.name)" /><UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" aria-label="Удалить baseline" @click="removeBaseline(item.id, item.name)" /></span>
        </div>
      </div>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" />
        <UButton label="Создать snapshot" :disabled="!baselineName.trim()" @click="submitBaseline" />
      </template>
    </AppModal>

    <AppModal :open="modal === 'png'" title="Экспорт Timeline в PNG" eyebrow="Локальный export" description="Изображение создаётся Canvas API в браузере; данные не отправляются в сеть." @close="modal = undefined">
      <div class="form-grid">
        <label class="field"><span>Диапазон</span><select v-model="pngOptions.scope"><option value="viewport">Текущий viewport</option><option value="range">Выбранный квартальный диапазон</option></select></label>
        <label class="field"><span>Заголовок</span><input v-model="pngOptions.title" /></label>
        <label class="switch-field"><input v-model="pngOptions.selectedOnly" type="checkbox" :disabled="!selectedStageIds.length" /><span><b>Только эпики выбранных этапов</b><small v-if="!selectedStageIds.length">Сначала выделите этапы на Timeline.</small></span></label>
        <label class="switch-field"><input v-model="pngOptions.legend" type="checkbox" /><span><b>Добавить легенду activity types</b></span></label>
        <label class="switch-field"><input v-model="pngOptions.dependencies" type="checkbox" /><span><b>Показать зависимости</b></span></label>
        <label class="switch-field"><input v-model="pngOptions.capacity" type="checkbox" /><span><b>Добавить capacity panel</b><small>Строки ролей, сотрудников и незакреплённой потребности.</small></span></label>
        <label class="switch-field"><input v-model="pngOptions.baseline" type="checkbox" :disabled="!planner.activeBaselineId" /><span><b>Добавить активный baseline</b><small v-if="!planner.activeBaselineId">Сначала выберите baseline на toolbar.</small></span></label>
      </div>
      <template #footer><UButton color="neutral" variant="ghost" label="Отмена" @click="modal = undefined" /><UButton icon="i-lucide-image-down" label="Скачать PNG" @click="exportPng" /></template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
const workspacePath = useWorkspacePath()
import { addCalendarDays, addWorkingDays, compareDates, fromLocalDate, workingDayDelta } from '../domain/calendar/date'
import { compareBaseline } from '../domain/baseline/diff'
import { epicVisibleInRange } from '../domain/models/epic-period'
import { calculateCapacity, CapacityCache, type CapacityCell, type CapacityContribution, type CapacityRow } from '../domain/capacity/engine'
import type { EpicStatus, ISODate, QuarterId, StageKind, StageStatus, WorkingCalendar } from '../domain/models/types'
import { createQuarter, nextQuarterId, quarterIdForDate } from '../domain/quarters/quarters'
import { previewWorkspaceImport, type ImportPreview } from '../infrastructure/files/workspace-transfer'
import { downloadTimelinePng } from '../infrastructure/screenshots/timeline-png'
import { usePlannerStore } from '../stores/planner'
import { useUiStore } from '../stores/ui'

type ModalName = 'epic' | 'stage' | 'filters' | 'calendar' | 'dependency' | 'import' | 'clear' | 'capacity' | 'baseline' | 'png'
interface GanttExpose { scrollToToday(): void; scrollToX(x: number): void; focusStage(id: string): void; visibleDateRange(): { startDate: ISODate; endDate: ISODate } | undefined }

const planner = usePlannerStore()
const ui = useUiStore()
const toast = useToast()
const modal = ref<ModalName>()
const dataMenuOpen = ref(false)
const importInput = ref<HTMLInputElement>()
const importPayload = ref('')
const importPreview = ref<ImportPreview>()
const ganttRef = ref<GanttExpose>()
const calendarImpact = ref<{ changedDurations: number; dependencyConflicts: number }>()
const dependencyId = ref('')
const dependencyLag = ref(0)
const selectedStageIds = ref<string[]>([])
const stageContextMenu = ref<{ x: number; y: number }>()
const stageContextMenuElement = ref<HTMLElement>()
const epicContextMenu = ref<{ id: string; x: number; y: number }>()
const epicContextMenuElement = ref<HTMLElement>()
const selectionAnchorId = ref('')
const selectedEpicId = ref('')
const lastCreatedStageEpicId = ref('')
const clipboardStageIds = ref<string[]>([])
const copyDependencies = ref(true)
const bulkDelta = ref(1)
const bulkStatus = ref('')
const bulkActivity = ref('')
const timelineScrollX = ref(0)
const timelineGeometry = ref<{ gridWidth: number; offset: number; widths: number[] }>()
const capacityHighlightStageIds = ref<string[]>([])
const capacitySelection = ref<{ row: CapacityRow; cell: CapacityCell }>()
const capacityCache = markRaw(new CapacityCache())
const stageDescriptionSaving = ref(false)
const epicDescriptionSaving = ref(false)
const newPredecessorId = ref('')
const newPredecessorLag = ref(0)
const baselineName = ref('')
const baselineComment = ref('')
const baselineVisibleOnly = ref(false)
const pngOptions = reactive({ scope: 'viewport' as 'viewport' | 'range', title: 'Delivery plan', selectedOnly: false, legend: true, dependencies: true, capacity: false, baseline: true })
let stageDescriptionTimer: ReturnType<typeof setTimeout> | undefined
let epicDescriptionTimer: ReturnType<typeof setTimeout> | undefined

await planner.initialize()

const todayIso = fromLocalDate(new Date())
const currentQuarterId = quarterIdForDate(todayIso)
const followingQuarterId = nextQuarterId(currentQuarterId)
const quarterModes = [
  { label: 'Текущий', value: 'current' }, { label: 'Следующий', value: 'next' },
  { label: '2 квартала', value: 'combined' }, { label: 'Архив', value: 'archive' },
] as const
const scales = [{ label: 'День', value: 'day' }, { label: 'Неделя', value: 'week' }, { label: 'Месяц', value: 'month' }] as const
const stageKinds = [{ label: 'Task', value: 'task' }, { label: 'Scope', value: 'scope' }, { label: 'Milestone', value: 'milestone' }] as const
const statuses = [{ label: 'Planned', value: 'planned' }, { label: 'In progress', value: 'in_progress' }, { label: 'Done', value: 'done' }, { label: 'Blocked', value: 'blocked' }] as const
const weekdays = [{ label: 'Пн', value: 1 }, { label: 'Вт', value: 2 }, { label: 'Ср', value: 3 }, { label: 'Чт', value: 4 }, { label: 'Пт', value: 5 }, { label: 'Сб', value: 6 }, { label: 'Вс', value: 7 }]

const sortedQuarters = computed(() => [...(planner.data?.quarters ?? [])].sort((a, b) => b.id.localeCompare(a.id)))
if (!ui.selectedQuarterId) ui.selectedQuarterId = currentQuarterId

const viewQuarterIds = computed<QuarterId[]>(() => {
  if (ui.quarterView === 'current') return [currentQuarterId]
  if (ui.quarterView === 'next') return [followingQuarterId]
  if (ui.quarterView === 'archive') return [ui.selectedQuarterId ?? currentQuarterId]
  return [currentQuarterId, followingQuarterId]
})
const viewQuarters = computed(() => viewQuarterIds.value.map(id => planner.data?.quarters.find(quarter => quarter.id === id) ?? createQuarter(id, planner.data?.workspace.id ?? '')))
const range = computed(() => ({ startDate: viewQuarters.value[0]!.startDate, endDate: viewQuarters.value.at(-1)!.endDate }))
const activeEpics = computed(() => (planner.data?.epics ?? []).filter(epic => epic.status !== 'archived').sort((a, b) => a.sortOrder - b.sortOrder))
const capacityEpicIds = computed(() => ui.capacityScope === 'visible'
  ? new Set((planner.data?.epics ?? []).filter(epic => (ui.filters.showArchived || epic.status !== 'archived') && (!ui.filters.epicIds.length || ui.filters.epicIds.includes(epic.id))).map(epic => epic.id))
  : undefined)
const capacityResult = computed(() => {
  if (!planner.data) return calculateCapacity({ startDate: range.value.startDate, endDate: range.value.endDate, mode: ui.scale === 'day' ? 'day' : 'week', calendar: { id: '', workspaceId: '', workingWeekdays: [1, 2, 3, 4, 5], holidays: [], extraWorkingDays: [], revision: 0 }, roles: [], people: [], epics: [], stages: [], assignments: [] })
  const key = [planner.data.workspace.revision, range.value.startDate, range.value.endDate, ui.scale, ui.capacityScope, [...(capacityEpicIds.value ?? [])].join(',')].join('|')
  return capacityCache.get(key, () => calculateCapacity({
    startDate: range.value.startDate, endDate: range.value.endDate, mode: ui.scale === 'day' ? 'day' : 'week',
    calendar: planner.data!.calendar, roles: planner.data!.roles, people: planner.data!.people,
    epics: planner.data!.epics, stages: planner.data!.stages, assignments: planner.data!.assignments,
    warningThreshold: planner.data!.workspace.settings.capacityWarningThreshold, epicIds: capacityEpicIds.value,
  }))
})
const overloadedStageIds = computed(() => new Set(capacityResult.value.overloadedStageIds))
const visibleStages = computed(() => {
  if (!planner.data) return []
  const query = ui.filters.query.trim().toLocaleLowerCase('ru-RU')
  return planner.data.stages.filter((stage) => {
    if (!stage.quarterIds.some(id => viewQuarterIds.value.includes(id))) return false
    const epic = planner.data!.epics.find(item => item.id === stage.epicId)
    if (!epic || (epic.status === 'archived' && !ui.filters.showArchived)) return false
    if (ui.filters.epicIds.length && !ui.filters.epicIds.includes(stage.epicId)) return false
    if (ui.filters.kinds.length && !ui.filters.kinds.includes(stage.kind)) return false
    if (ui.filters.statuses.length && !ui.filters.statuses.includes(stage.status)) return false
    if (ui.filters.activityTypeIds.length && !ui.filters.activityTypeIds.includes(stage.activityTypeId)) return false
    const assignments = planner.data!.assignments.filter(item => item.stageId === stage.id)
    if (ui.filters.roleIds.length && !assignments.some(item => item.targetType === 'role' ? ui.filters.roleIds.includes(item.targetId) : ui.filters.roleIds.includes(planner.data!.people.find(person => person.id === item.targetId)?.primaryRoleId ?? ''))) return false
    if (ui.filters.personIds.length && !assignments.some(item => item.targetType === 'person' && ui.filters.personIds.includes(item.targetId))) return false
    if (ui.filters.overloadedOnly && !overloadedStageIds.value.has(stage.id)) return false
    if (ui.filters.conflictsOnly && !conflictStageIds.value.includes(stage.id)) return false
    if (ui.filters.dateFrom && compareDates(stage.endDate, ui.filters.dateFrom as ISODate) < 0) return false
    if (ui.filters.dateTo && compareDates(stage.startDate, ui.filters.dateTo as ISODate) > 0) return false
    const workText = planner.data!.workItems.filter(item => item.epicId === stage.epicId).map(item => item.title).join(' ')
    return !query || [stage.title, stage.descriptionMarkdown, epic.title, epic.descriptionMarkdown, workText].some(value => value.toLocaleLowerCase('ru-RU').includes(query))
  }).sort((a, b) => a.epicId.localeCompare(b.epicId) || a.sortOrder - b.sortOrder)
})
const visibleEpics = computed(() => {
  const visibleEpicIds = new Set(visibleStages.value.map(stage => stage.epicId))
  return (planner.data?.epics ?? []).filter(epic => {
    if (epic.status === 'archived' && !ui.filters.showArchived) return false
    if (ui.filters.epicIds.length && !ui.filters.epicIds.includes(epic.id)) return false
    if (!epicVisibleInRange(epic, visibleStages.value, range.value)) return false
    if (hasStageFilters.value || ui.filters.query) return visibleEpicIds.has(epic.id)
    return true
  }).sort((a, b) => a.sortOrder - b.sortOrder)
})
const visibleStageIds = computed(() => new Set(visibleStages.value.map(stage => stage.id)))
const contextEpic = computed(() => planner.data?.epics.find(epic => epic.id === epicContextMenu.value?.id))
const contextEpicIndex = computed(() => visibleEpics.value.findIndex(epic => epic.id === epicContextMenu.value?.id))
const visibleDependencies = computed(() => (planner.data?.dependencies ?? []).filter(link => visibleStageIds.value.has(link.predecessorStageId) && visibleStageIds.value.has(link.successorStageId)))
const conflictStageIds = computed(() => [...new Set(planner.conflicts.flatMap(conflict => [conflict.predecessorStageId, conflict.successorStageId]))])
const highlightedStageIds = computed(() => [...new Set([...capacityHighlightStageIds.value, ...(capacitySelection.value?.cell.contributions.map(item => item.stageId) ?? [])])])
const hasStageFilters = computed(() => Boolean(ui.filters.kinds.length || ui.filters.statuses.length || ui.filters.activityTypeIds.length || ui.filters.epicIds.length || ui.filters.roleIds.length || ui.filters.personIds.length || ui.filters.overloadedOnly || ui.filters.conflictsOnly || ui.filters.dateFrom || ui.filters.dateTo))
const filterCount = computed(() => ui.filters.kinds.length + ui.filters.statuses.length + ui.filters.activityTypeIds.length + ui.filters.epicIds.length + ui.filters.roleIds.length + ui.filters.personIds.length + Number(ui.filters.overloadedOnly) + Number(ui.filters.conflictsOnly) + Number(Boolean(ui.filters.dateFrom)) + Number(Boolean(ui.filters.dateTo)) + Number(ui.filters.showArchived))
const hasFilters = computed(() => filterCount.value > 0)
const selectedDependency = computed(() => planner.data?.dependencies.find(item => item.id === dependencyId.value))
const currentStageConflicts = computed(() => planner.conflicts.filter(conflict => conflict.successorStageId === stageForm.id))
const currentStageDependencies = computed(() => planner.data?.dependencies.filter(item => item.predecessorStageId === stageForm.id || item.successorStageId === stageForm.id) ?? [])
const predecessorOptions = computed(() => planner.data?.stages.filter(item => item.epicId === stageForm.epicId && item.id !== stageForm.id && !planner.data!.dependencies.some(link => link.predecessorStageId === item.id && link.successorStageId === stageForm.id)) ?? [])
const activeBaseline = computed(() => planner.data?.baselines.find(item => item.id === planner.activeBaselineId))
const activeBaselineSnapshots = computed(() => planner.data?.baselineStages.filter(item => item.baselineId === planner.activeBaselineId) ?? [])
const activeBaselineDiff = computed(() => activeBaseline.value && planner.data
  ? compareBaseline(activeBaseline.value, planner.data.baselineStages, planner.data.stages, planner.data.calendar)
  : undefined)
const baselineNewStageIds = computed(() => activeBaselineDiff.value?.variances.filter(item => item.state === 'new').map(item => item.stageId) ?? [])

const epicForm = reactive({ id: '', title: '', code: '', status: 'active' as EpicStatus, marker: '#2563eb', startDate: '', endDate: '', descriptionMarkdown: '' })
const stageForm = reactive({ id: '', epicId: '', title: '', kind: 'task' as StageKind, activityTypeId: '', status: 'planned' as StageStatus, startDate: todayIso, endDate: todayIso, locked: false, descriptionMarkdown: '', externalUrl: '' })
const calendarForm = reactive({ workingWeekdays: [1, 2, 3, 4, 5] as number[], holidays: '', extraWorkingDays: '' })

function openNewEpic() {
  const today = fromLocalDate(new Date())
  Object.assign(epicForm, { id: '', title: '', code: '', status: 'active', marker: '#2563eb', startDate: today, endDate: addCalendarDays(today, 3), descriptionMarkdown: '' })
  modal.value = 'epic'
}
function openEditEpic(id: string) { const epic = planner.data?.epics.find(item => item.id === id); if (!epic) return; Object.assign(epicForm, { id, title: epic.title, code: epic.code ?? '', status: epic.status, marker: epic.marker ?? '#2563eb', startDate: epic.startDate ?? '', endDate: epic.endDate ?? '', descriptionMarkdown: epic.descriptionMarkdown }); modal.value = 'epic' }
function openNewStage() {
  const today = fromLocalDate(new Date())
  const start = today < range.value.startDate ? range.value.startDate : today > range.value.endDate ? range.value.startDate : today
  const activeEpicIds = new Set(activeEpics.value.map(epic => epic.id))
  const parentEpicId = [selectedEpicId.value, lastCreatedStageEpicId.value, activeEpics.value[0]?.id]
    .find(epicId => epicId && activeEpicIds.has(epicId)) ?? ''
  Object.assign(stageForm, { id: '', epicId: parentEpicId, title: '', kind: 'task', activityTypeId: planner.data?.activityTypes.find(type => type.slug === 'development')?.id ?? '', status: 'planned', startDate: start, endDate: addWorkingDays(start, 4, planner.data!.calendar), locked: false, descriptionMarkdown: '', externalUrl: '' })
  modal.value = 'stage'
}
function openRangeStage(payload: { epicId: string; startDate: ISODate; endDate: ISODate }) { openNewStage(); Object.assign(stageForm, payload) }
function openEditStage(id: string) { const stage = planner.data?.stages.find(item => item.id === id); if (!stage) return; Object.assign(stageForm, { id, epicId: stage.epicId, title: stage.title, kind: stage.kind, activityTypeId: stage.activityTypeId, status: stage.status, startDate: stage.startDate, endDate: stage.endDate, locked: stage.locked, descriptionMarkdown: stage.descriptionMarkdown, externalUrl: stage.externalUrl ?? '' }); newPredecessorId.value = ''; newPredecessorLag.value = 0; modal.value = 'stage' }

async function submitEpic() {
  await perform(async () => {
    if (Boolean(epicForm.startDate) !== Boolean(epicForm.endDate)) throw new Error('Укажите обе даты эпика или оставьте обе пустыми')
    if (epicForm.startDate && epicForm.endDate && compareDates(epicForm.startDate as ISODate, epicForm.endDate as ISODate) > 0) throw new Error('Дата начала эпика позже окончания')
    const changes = { code: epicForm.code || undefined, status: epicForm.status, marker: epicForm.marker, descriptionMarkdown: epicForm.descriptionMarkdown, startDate: epicForm.startDate ? epicForm.startDate as ISODate : undefined, endDate: epicForm.endDate ? epicForm.endDate as ISODate : undefined }
    const created = epicForm.id ? undefined : await planner.addEpic(epicForm.title, changes)
    if (epicForm.id) await planner.updateEpic(epicForm.id, { title: epicForm.title, ...changes })
    modal.value = undefined
    if (created && !epicForm.startDate) { openNewStage(); stageForm.epicId = created.id }
  })
}

async function submitStage() {
  await perform(async () => {
    if (compareDates(stageForm.startDate as ISODate, stageForm.endDate as ISODate) > 0 && stageForm.kind !== 'milestone') throw new Error('Дата начала позже окончания')
    if (stageForm.externalUrl && !/^https?:\/\//i.test(stageForm.externalUrl)) throw new Error('Внешняя ссылка должна начинаться с http:// или https://')
    if (stageForm.id) await planner.updateStage(stageForm.id, { epicId: stageForm.epicId, title: stageForm.title, kind: stageForm.kind, activityTypeId: stageForm.activityTypeId, status: stageForm.status, startDate: stageForm.startDate as ISODate, endDate: stageForm.kind === 'milestone' ? stageForm.startDate as ISODate : stageForm.endDate as ISODate, locked: stageForm.locked, descriptionMarkdown: stageForm.descriptionMarkdown, externalUrl: stageForm.externalUrl || undefined })
    else { const created = await planner.addStage({ epicId: stageForm.epicId, title: stageForm.title, kind: stageForm.kind, activityTypeId: stageForm.activityTypeId, startDate: stageForm.startDate as ISODate, endDate: stageForm.kind === 'milestone' ? undefined : stageForm.endDate as ISODate }); lastCreatedStageEpicId.value = created.epicId; if (stageForm.descriptionMarkdown || stageForm.externalUrl) await planner.updateStage(created.id, { descriptionMarkdown: stageForm.descriptionMarkdown, externalUrl: stageForm.externalUrl || undefined }) }
    modal.value = undefined
  })
}

async function deleteCurrentEpic() { const epic = planner.data?.epics.find(item => item.id === epicForm.id); if (!epic) return; const count = planner.data?.stages.filter(stage => stage.epicId === epic.id).length ?? 0; if (!confirm(`Удалить «${epic.title}» и этапов: ${count}?`)) return; await perform(() => planner.deleteEpic(epic.id)); modal.value = undefined }
function selectEpicStages() { selectedStageIds.value = planner.data?.stages.filter(stage => stage.epicId === epicForm.id).map(stage => stage.id) ?? []; modal.value = undefined }
async function deleteCurrentStage() { const stage = planner.data?.stages.find(item => item.id === stageForm.id); if (!stage || !confirm(`Удалить этап «${stage.title}» и его зависимости?`)) return; await perform(() => planner.deleteStage(stage.id)); modal.value = undefined }

async function moveEpic(direction: -1 | 1, id = epicForm.id, neighbors = activeEpics.value) {
  const index = neighbors.findIndex(epic => epic.id === id)
  const neighbor = neighbors[index + direction]
  if (index < 0 || !neighbor) return
  const ids = [...(planner.data?.epics ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map(epic => epic.id)
  const sourceIndex = ids.indexOf(id)
  const targetIndex = ids.indexOf(neighbor.id)
  if (sourceIndex < 0 || targetIndex < 0) return
  ;[ids[sourceIndex], ids[targetIndex]] = [ids[targetIndex]!, ids[sourceIndex]!]
  await perform(() => planner.reorderEpics(ids))
}
function handleEpicCollapsed(payload: { id: string; collapsed: boolean }) { const exists = ui.collapsedEpicIds.includes(payload.id); if (payload.collapsed && !exists) ui.collapsedEpicIds = [...ui.collapsedEpicIds, payload.id]; if (!payload.collapsed && exists) ui.collapsedEpicIds = ui.collapsedEpicIds.filter(id => id !== payload.id) }
function openDependency(id: string) { const dependency = planner.data?.dependencies.find(item => item.id === id); if (!dependency) return; dependencyId.value = id; dependencyLag.value = dependency.lagWorkdays; modal.value = 'dependency' }
function stageTitle(id: string) { return planner.data?.stages.find(stage => stage.id === id)?.title ?? id }
async function saveDependency() { await perform(() => planner.updateDependency(dependencyId.value, dependencyLag.value)); modal.value = undefined }
async function deleteSelectedDependency() { await perform(() => planner.removeDependency(dependencyId.value)); modal.value = undefined }

async function handleTaskChange(payload: { id: string; startDate: ISODate; endDate: ISODate; action: 'move' | 'resize'; alternateMode: boolean }) {
  const stage = planner.data?.stages.find(item => item.id === payload.id); if (!stage) return
  const mode = payload.alternateMode ? (ui.moveMode === 'cascade' ? 'free' : 'cascade') : ui.moveMode
  if (payload.action === 'move') await perform(() => planner.move(selectedStageIds.value.includes(payload.id) ? selectedStageIds.value : [payload.id], workingDayDelta(stage.startDate, payload.startDate, planner.data!.calendar), mode))
  else await perform(() => planner.resize(payload.id, payload.startDate, payload.endDate, mode))
}

function handleStageSelect(payload: { id: string; additive: boolean; range: boolean }) {
  closeContextMenus()
  const stage = planner.data?.stages.find(item => item.id === payload.id)
  if (stage) selectedEpicId.value = stage.epicId
  if (payload.range && selectionAnchorId.value) {
    const ids = visibleStages.value.map(stage => stage.id); const from = ids.indexOf(selectionAnchorId.value); const to = ids.indexOf(payload.id)
    if (from >= 0 && to >= 0) selectedStageIds.value = ids.slice(Math.min(from, to), Math.max(from, to) + 1)
  } else if (payload.additive) {
    selectedStageIds.value = selectedStageIds.value.includes(payload.id) ? selectedStageIds.value.filter(id => id !== payload.id) : [...selectedStageIds.value, payload.id]
    selectionAnchorId.value = payload.id
  } else { selectedStageIds.value = [payload.id]; selectionAnchorId.value = payload.id }
}

function openStageContextMenu(payload: { id: string; x: number; y: number }) {
  if (planner.readOnly) return
  closeContextMenus()
  if (!selectedStageIds.value.includes(payload.id)) selectedStageIds.value = [payload.id]
  selectionAnchorId.value = payload.id
  selectedEpicId.value = planner.data?.stages.find(stage => stage.id === payload.id)?.epicId ?? ''
  bulkStatus.value = ''
  bulkActivity.value = ''
  stageContextMenu.value = { x: payload.x, y: payload.y }
  nextTick(() => {
    const menu = stageContextMenuElement.value
    if (!menu || !stageContextMenu.value) return
    const bounds = menu.getBoundingClientRect()
    stageContextMenu.value = {
      x: Math.max(8, Math.min(payload.x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(payload.y, window.innerHeight - bounds.height - 8)),
    }
    menu.focus()
  })
}

function openEpicContextMenu(payload: { id: string; x: number; y: number }) {
  if (planner.readOnly || !planner.data?.epics.some(epic => epic.id === payload.id)) return
  handleEpicSelect(payload.id)
  epicContextMenu.value = payload
  nextTick(() => {
    const menu = epicContextMenuElement.value
    if (!menu || !epicContextMenu.value) return
    const bounds = menu.getBoundingClientRect()
    epicContextMenu.value = {
      id: payload.id,
      x: Math.max(8, Math.min(payload.x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(payload.y, window.innerHeight - bounds.height - 8)),
    }
    menu.focus()
  })
}

function addStageFromEpicMenu() {
  const id = epicContextMenu.value?.id
  if (!id) return
  closeContextMenus()
  openNewStage()
  stageForm.epicId = id
}

function editEpicFromMenu() {
  const id = epicContextMenu.value?.id
  closeContextMenus()
  if (id) openEditEpic(id)
}

function reorderEpicFromMenu(direction: -1 | 1) {
  const id = epicContextMenu.value?.id
  closeContextMenus()
  if (id) void moveEpic(direction, id, visibleEpics.value)
}

function runStageMenuAction(action: () => void | Promise<void>) {
  stageContextMenu.value = undefined
  void perform(action)
}

function applyBulkStatus() {
  const status = bulkStatus.value as StageStatus
  bulkStatus.value = ''
  if (status) runStageMenuAction(() => planner.bulkUpdateStages([...selectedStageIds.value], { status }))
}

function applyBulkActivity() {
  const activityTypeId = bulkActivity.value
  bulkActivity.value = ''
  if (activityTypeId) runStageMenuAction(() => planner.bulkUpdateStages([...selectedStageIds.value], { activityTypeId }))
}

function closeStageContextMenuOnOutsideClick(event: PointerEvent) {
  if (!stageContextMenuElement.value?.contains(event.target as Node)) stageContextMenu.value = undefined
  if (!epicContextMenuElement.value?.contains(event.target as Node)) epicContextMenu.value = undefined
}

function closeContextMenus() { stageContextMenu.value = undefined; epicContextMenu.value = undefined }

function handleEpicSelect(id: string) {
  closeContextMenus()
  selectedEpicId.value = id
  selectedStageIds.value = []
  selectionAnchorId.value = ''
}

function clearStageSelection() {
  closeContextMenus()
  selectedStageIds.value = []
  selectedEpicId.value = ''
  selectionAnchorId.value = ''
}

function copySelection() { clipboardStageIds.value = [...selectedStageIds.value]; toast.add({ title: `Скопировано этапов: ${clipboardStageIds.value.length}` }) }
async function pasteSelection() {
  if (!clipboardStageIds.value.length || !planner.data) return
  const first = planner.data.stages.find(stage => stage.id === clipboardStageIds.value[0]); if (!first) return
  selectedStageIds.value = await planner.copyStages({ stageIds: clipboardStageIds.value, targetEpicId: first.epicId, includeDependencies: copyDependencies.value, includeWorkItems: true })
}
async function duplicateSelection() {
  if (!selectedStageIds.value.length || !planner.data) return
  const first = planner.data.stages.find(stage => stage.id === selectedStageIds.value[0]); if (!first) return
  selectedStageIds.value = await planner.copyStages({ stageIds: selectedStageIds.value, targetEpicId: first.epicId, includeDependencies: copyDependencies.value, includeWorkItems: true })
}

function openCapacityDrilldown(payload: { row: CapacityRow; cell: CapacityCell }) { capacitySelection.value = payload; capacityHighlightStageIds.value = payload.cell.contributions.map(item => item.stageId); modal.value = 'capacity' }
function closeCapacityDrilldown() { modal.value = undefined; capacitySelection.value = undefined; capacityHighlightStageIds.value = [] }
const capacityContributions = computed<CapacityContribution[]>(() => capacitySelection.value?.cell.contributions ?? [])
function epicTitle(id: string) { return planner.data?.epics.find(epic => epic.id === id)?.title ?? id }
function activityForStage(id: string) { const stage = planner.data?.stages.find(item => item.id === id); return planner.data?.activityTypes.find(type => type.id === stage?.activityTypeId) }
function focusContribution(id: string) { selectedStageIds.value = [id]; modal.value = undefined; capacitySelection.value = undefined; nextTick(() => ganttRef.value?.focusStage(id)) }

watch(() => stageForm.descriptionMarkdown, (value) => {
  const stored = planner.data?.stages.find(stage => stage.id === stageForm.id)?.descriptionMarkdown
  if (planner.readOnly || modal.value !== 'stage' || !stageForm.id || value === stored) return
  stageDescriptionSaving.value = true; clearTimeout(stageDescriptionTimer)
  stageDescriptionTimer = setTimeout(async () => { await planner.updateStage(stageForm.id, { descriptionMarkdown: value }); stageDescriptionSaving.value = false; stageDescriptionTimer = undefined }, 650)
})
watch(() => epicForm.descriptionMarkdown, (value) => {
  const stored = planner.data?.epics.find(epic => epic.id === epicForm.id)?.descriptionMarkdown
  if (planner.readOnly || modal.value !== 'epic' || !epicForm.id || value === stored) return
  epicDescriptionSaving.value = true; clearTimeout(epicDescriptionTimer)
  epicDescriptionTimer = setTimeout(async () => { await planner.updateEpic(epicForm.id, { descriptionMarkdown: value }); epicDescriptionSaving.value = false; epicDescriptionTimer = undefined }, 650)
})
async function closeStageModal() { if (stageDescriptionTimer && !confirm('Описание ещё сохраняется. Сохранить изменения и закрыть?')) return; if (stageDescriptionTimer && stageForm.id) { clearTimeout(stageDescriptionTimer); stageDescriptionTimer = undefined; await perform(() => planner.updateStage(stageForm.id, { descriptionMarkdown: stageForm.descriptionMarkdown })) }; stageDescriptionSaving.value = false; modal.value = undefined }
async function closeEpicModal() { if (epicDescriptionTimer && !confirm('Описание ещё сохраняется. Сохранить изменения и закрыть?')) return; if (epicDescriptionTimer && epicForm.id) { clearTimeout(epicDescriptionTimer); epicDescriptionTimer = undefined; await perform(() => planner.updateEpic(epicForm.id, { descriptionMarkdown: epicForm.descriptionMarkdown })) }; epicDescriptionSaving.value = false; modal.value = undefined }
async function handleLinkAdd(payload: { source: string; target: string }) { await perform(async () => { await planner.addDependency(payload.source, payload.target, 0, ui.moveMode) }) }
async function addDrawerDependency() {
  if (!newPredecessorId.value || !stageForm.id) return
  await perform(async () => { await planner.addDependency(newPredecessorId.value, stageForm.id, newPredecessorLag.value, ui.moveMode) })
  newPredecessorId.value = ''
  newPredecessorLag.value = 0
}
async function handleMoveBetweenEpics(payload: { id: string; epicId: string }) {
  const linked = planner.data?.dependencies.filter(link => link.predecessorStageId === payload.id || link.successorStageId === payload.id) ?? []
  const remove = linked.length ? confirm(`У этапа есть связей: ${linked.length}. Удалить их и переместить этап?`) : true
  if (remove) await perform(() => planner.moveStageBetweenEpics(payload.id, payload.epicId, linked.length > 0))
}

function openCalendar() {
  const calendar = planner.data!.calendar
  Object.assign(calendarForm, { workingWeekdays: [...calendar.workingWeekdays], holidays: calendar.holidays.join(', '), extraWorkingDays: calendar.extraWorkingDays.join(', ') })
  calendarImpact.value = undefined; dataMenuOpen.value = false; modal.value = 'calendar'
}
function parseDates(value: string): ISODate[] { return [...new Set(value.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean))] as ISODate[] }
function proposedCalendar(): WorkingCalendar { return { ...planner.data!.calendar, workingWeekdays: [...calendarForm.workingWeekdays].sort(), holidays: parseDates(calendarForm.holidays), extraWorkingDays: parseDates(calendarForm.extraWorkingDays) } }
function previewCalendar() { if (!calendarForm.workingWeekdays.length) return showError(new Error('Выберите хотя бы один рабочий день')); calendarImpact.value = planner.previewCalendar(proposedCalendar()) }
async function commitCalendar(recalculate: boolean) { await perform(() => planner.applyCalendar(proposedCalendar(), recalculate)); modal.value = undefined }

async function readImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    importPayload.value = await file.text()
    importPreview.value = previewWorkspaceImport(importPayload.value)
    modal.value = 'import'
  } catch (error) {
    importPayload.value = ''
    importPreview.value = undefined
    showError(error)
  } finally {
    input.value = ''
  }
}
function cancelImport() { importPayload.value = ''; importPreview.value = undefined; modal.value = undefined }
async function commitImport() { await perform(() => planner.importJson(importPayload.value)); cancelImport(); toast.add({ title: 'Workspace восстановлен', color: 'success' }) }
async function exportPng() {
  dataMenuOpen.value = false
  const selectedRange = pngOptions.scope === 'viewport' ? ganttRef.value?.visibleDateRange() ?? range.value : range.value
  const selectedEpics = pngOptions.selectedOnly
    ? [...new Set(planner.data!.stages.filter(item => selectedStageIds.value.includes(item.id)).map(item => item.epicId))]
    : visibleEpics.value.map(item => item.id)
  await perform(() => downloadTimelinePng(planner.data!, {
    startDate: selectedRange.startDate,
    endDate: selectedRange.endDate,
    epicIds: selectedEpics,
    title: pngOptions.title || planner.data!.workspace.name,
    includeLegend: pngOptions.legend,
    includeDependencies: pngOptions.dependencies,
    includeCapacity: pngOptions.capacity,
    baselineId: pngOptions.baseline ? planner.activeBaselineId : undefined,
  }))
  modal.value = undefined
}
async function submitBaseline() {
  await perform(async () => {
    await planner.createBaseline({
      name: baselineName.value,
      comment: baselineComment.value,
      quarterIds: viewQuarterIds.value,
      epicIds: baselineVisibleOnly.value ? visibleEpics.value.map(item => item.id) : undefined,
    })
    baselineName.value = ''
    baselineComment.value = ''
    modal.value = undefined
    toast.add({ title: 'Baseline создан', color: 'success' })
  })
}
async function renameBaseline(id: string, currentName: string) {
  const name = prompt('Новое название baseline', currentName)
  if (name && name.trim() !== currentName) await perform(() => planner.renameBaseline(id, name))
}
async function removeBaseline(id: string, name: string) {
  if (confirm(`Удалить baseline «${name}»? Текущий план не изменится.`)) await perform(() => planner.deleteBaseline(id))
}

function showError(error: unknown) { console.error('[Delivery Planner]', error); const message = error instanceof Error ? error.message : 'Неизвестная ошибка'; toast.add({ title: 'Действие не выполнено', description: message, color: 'error' }) }
async function perform(action: () => void | Promise<void>) { try { await action() } catch (error) { showError(error) } }

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (stageContextMenu.value || epicContextMenu.value)) { event.preventDefault(); closeContextMenus(); return }
  const target = event.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
  if (planner.readOnly && !['f', 't', 'Escape'].includes(event.key)) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); perform(event.shiftKey ? planner.redo : planner.undo); return }
  if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); perform(planner.redo); return }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedStageIds.value.length) { event.preventDefault(); copySelection(); return }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && clipboardStageIds.value.length) { event.preventDefault(); perform(pasteSelection); return }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedStageIds.value.length) { event.preventDefault(); perform(duplicateSelection); return }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedStageIds.value.length) { event.preventDefault(); if (confirm(`Удалить выбранных этапов: ${selectedStageIds.value.length}?`)) perform(async () => { await planner.deleteStages(selectedStageIds.value); selectedStageIds.value = [] }); return }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); modal.value = 'filters' }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); ganttRef.value?.scrollToToday() }
  if (event.key === 'Escape') { modal.value = undefined; dataMenuOpen.value = false }
}
watch(() => planner.readOnly, (readOnly) => { if (readOnly) closeContextMenus() })
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', closeStageContextMenuOnOutsideClick)
  window.addEventListener('scroll', closeContextMenus, true)
  const focusId = useRoute().query.stage
  if (typeof focusId === 'string') setTimeout(() => { selectedStageIds.value = [focusId]; ganttRef.value?.focusStage(focusId) }, 300)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', closeStageContextMenuOnOutsideClick)
  window.removeEventListener('scroll', closeContextMenus, true)
  clearTimeout(stageDescriptionTimer)
  clearTimeout(epicDescriptionTimer)
})
</script>
