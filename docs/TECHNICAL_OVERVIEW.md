# Технический обзор

## Стек и поставка

- Bun 1.3+ — package manager и runtime команд разработки;
- Nuxt 4, Vue 3, TypeScript strict, SPA (`ssr: false`);
- Nuxt UI и единая light/dark token-система;
- Pinia — application state и use cases;
- Dexie — транзакционная работа с IndexedDB;
- DHTMLX Gantt Community — визуальный timeline;
- Zod — структурная валидация import;
- Vitest и Playwright — unit, domain, migration, performance и browser E2E.

`bun run generate` создаёт статическое приложение в `.output/public`. Сервер приложения не требуется.

## Модель

`Workspace` содержит кварталы, эпики, этапы, зависимости, типы деятельности, рабочий календарь, команду, назначения, work items и baselines. Этап — canonical object: пересечение кварталов отражается индексом `quarterIds`, а не копиями.

Даты хранятся как локальные календарные значения `YYYY-MM-DD`. Domain-код не преобразует их в UTC и не полагается на ISO timestamp для календарной арифметики. Интервал этапа включительный; milestone имеет одну дату, нулевую длительность и не создаёт capacity.

## Поток изменения

```text
UI / DHTMLX event
  → application command
  → pure domain calculation
  → validation and patch
  → one Dexie transaction
  → Pinia commit
  → UI projection
```

DHTMLX не является источником истины. Его drag, resize и link events преобразуются в команды приложения; после успешной транзакции timeline получает новое состояние. Поэтому каскадный перенос нескольких этапов остаётся одной атомарной командой и одним undo.

## Scheduling

Поддерживаются Finish-to-Start зависимости, несколько predecessors/successors, lag в рабочих днях, проверка DAG, Cascade и Free. Cascade применяет изменения в topological order. Free разрешает локальное перемещение, но сохраняет видимый конфликт. Заблокированные successors не сдвигаются неявно.

## Capacity

Capacity engine — чистый domain-расчёт. Person load берётся из person assignments; role load включает сотрудников роли и незакреплённый role demand. Распределение равномерно по рабочим дням этапа. Фильтрация Timeline не меняет workspace load, пока пользователь явно не выбрал режим «только видимые эпики».

## Persistence и переносимость

Рабочие таблицы находятся в IndexedDB `delivery-planner`; UI preferences — в versioned key `delivery-planner:ui-preferences:v1`. Изменения связанных сущностей записываются одной транзакцией. Autosave показывает `Сохранение / Сохранено / Ошибка`.

Полный JSON export содержит `schemaVersion`, `appVersion`, `application`, `exportedAt` и workspace. Import сначала разбирается, мигрируется и проходит structural/semantic validation в памяти; только затем выполняется atomic replace. Перед заменой создаётся backup.

## Безопасность и приватность

Приложение не отправляет workspace, PNG или JSON во внешние API. Описания отображаются как обычный текст; при вставке в HTML-подсказки он экранируется. DHTMLX fonts поставляются локально; runtime не зависит от Google Fonts. Пользовательские URL допускают только `http` и `https`.

## Основные каталоги

| Каталог | Ответственность |
|---|---|
| `app/domain` | модели, календарь, scheduling, capacity, history |
| `app/stores` | use cases, команды, состояние UI и сохранения |
| `app/infrastructure/db` | Dexie schema и upgrades |
| `app/infrastructure/repositories` | транзакции, backup, integrity |
| `app/infrastructure/files` | JSON schema, migration, validation |
| `app/components/gantt` | адаптер визуального timeline |
| `tests/unit` | domain, persistence и migration regressions |
| `tests/performance` | согласованные бюджеты |
| `tests/e2e` | production browser flows |
