# Архитектура

## Поток изменений

```text
Vue / DHTMLX event
  → application command (Pinia)
  → pure domain engine
  → cloned PlannerData
  → Dexie transaction
  → Pinia commit
  → DHTMLX/table render
```

Источник истины — domain-модель, сохранённая в IndexedDB. DHTMLX отменяет собственный commit drag/link и получает состояние заново после успешной команды. Table вызывает те же `move`, `resize`, `updateStage` и bulk commands.

## Слои

- `app/domain`: date-only calendar, DAG, Cascade/Free, capacity, baseline diff, модели и command history. Нет Vue, DOM и IndexedDB.
- `app/stores`: use cases, атомарная session history на 100 команд, save status, recovery state.
- `app/infrastructure/db`: Dexie schema v1→v2→v3.
- `app/infrastructure/repositories`: транзакционный repository, rolling backups и integrity metadata.
- `app/infrastructure/files`: Zod, migrations, semantic validation, full/quarter JSON.
- `app/infrastructure/screenshots`: локальный Canvas PNG.
- `app/components/gantt`: Community-compatible adapter, calendar styles, ghost cascade, baseline DOM overlay.

## Scheduling

Плановые даты — `YYYY-MM-DD`, интервалы включительны. Finish-to-Start с lag 0 означает начало successor в следующий рабочий день после end predecessor. Cascade строит транзитивных successors, сдвигает их в topological order и нормализует ограничения нескольких predecessors. Free сохраняет конфликт как вычисляемое состояние.

`updateDerived` не читает системные часы: это гарантирует детерминированный patch. Timestamp меняется на application layer.

## Capacity

Person load равен allocation FTE. Role load равен person load основной роли плюс `units × allocation` незакреплённого role demand. Milestone исключается. Расчёт всегда использует все активные эпики workspace, если пользователь явно не включил scope «только видимые».

Кэш ключуется revision и диапазоном. Полный O(stages × days) recompute оставлен намеренно: он укладывается в 150 мс для 500 этапов и не создаёт риск частично инвалидированного кэша.

## Privacy

Нет сетевого persistence и export. DHTMLX fonts не загружаются извне: remote `@font-face` удаляется build plugin. PNG создаётся Canvas API, PDF — системной печатью браузера.
