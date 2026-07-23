# ADR-0001: DHTMLX Gantt Community как visual engine

- Статус: принято
- Дата: 2026-07-22
- Версия spike: DHTMLX Gantt Community 10.0.0 (MIT)

## Контекст

Iteration 1 требует дневную шкалу, иерархические строки, drag/resize, dependency links, sticky grid и smart rendering. Scheduling, история команд и persistence при этом должны оставаться независимыми от widget.

## Решение

DHTMLX Gantt Community используется только как visual interaction engine. Канонические даты и связи находятся в domain state/IndexedDB. Поток данных однонаправленный:

```text
DHTMLX event → application command → scheduling patch → Pinia → Dexie transaction → DHTMLX re-render
```

Widget не использует `dataProcessor` и не выполняет финальный auto-scheduling. `onBeforeTaskChanged` и link events отменяют внутренний commit DHTMLX; после успешной команды adapter получает новый view model.

## Результаты spike

Проверено в Chromium на viewport 1400×800:

- 500 task records и 1 500 Finish-to-Start links загружены корректно;
- init + parse + два animation frames: **59,9 мс**;
- smart rendering включён: при 500 records в DOM находились 22 видимые строки, 18 task bars и 54 видимые link elements;
- средний animation-frame interval в спокойном viewport: **8,55 мс** (частота среды 120 Гц; запас выше целевых 45 FPS);
- domain cascade для 500 этапов / 1 500 links проходит budget `<100 мс`; полный Vitest case занял 80 мс;
- на реальном timeline проверены drag, day snapping, атомарный Cascade/undo, Free conflict state, custom templates/styles и русская локаль;
- adapter обрабатывает resize, создание/удаление links, vertical reorder и перенос между эпиками тем же command flow.

Метрики являются локальным smoke budget, а не универсальным benchmark. Их следует повторять на целевых macOS/Windows устройствах после обновления DHTMLX.

## Ограничения Community Edition

В Community Edition отсутствуют необходимые продукту advanced PM-возможности: auto-scheduling, critical path и resource management. Baseline/capacity и бизнес-правила также не могут становиться состоянием widget. Поэтому:

- Cascade/Free, lag, locked-stage handling и cycle validation реализованы в чистом TypeScript domain layer;
- capacity и baseline реализованы собственными engines; baseline рисуется в Community-compatible overlay layer;
- экспорт и persistence не используют сервисы DHTMLX;
- сложный multi-select и некоторые расширенные interaction helpers требуют собственной реализации.

## Последствия

Решение DHTMLX подтверждено для Iteration 1. Риск vendor coupling ограничен adapter-компонентом. Обновление visual engine требует adapter contract/browser smoke tests, но не меняет domain, repositories или JSON schema.
