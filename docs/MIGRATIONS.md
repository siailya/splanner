# Миграции

Production-правила, требования к тестам и политика прекращения поддержки описаны в [контракте обратной совместимости](BACKWARD_COMPATIBILITY.md). Уже опубликованную migration нельзя переписывать: исправление выпускается следующей версией схемы.

## IndexedDB

- v1: workspace, quarters, epics, stages, dependencies, activity types, calendar, settings.
- v2: roles, people, assignments, work items; workspace schemaVersion обновляется до 2.
- v3: baselines, baseline stage snapshots, backups, integrity metadata; schedule не изменяется.

Dexie выполняет upgrade транзакционно. Тест создаёт реальную v2 database, открывает её `PlannerDatabase` v3 и проверяет сохранение workspace и пустые новые таблицы.

При добавлении v4 необходимо сохранить declarations v1–v3, добавить `version(4)` и проверить прямые переходы v1→v4, v2→v4 и v3→v4. Проверяется не только номер схемы, но и эквивалентность дат, графа, assignments, work items и baselines.

## JSON

Импорт принимает schema 1, 2 и 3. Для старых файлов добавляются пустые collections v2/v3, затем workspace получает schemaVersion 3. До записи выполняются:

1. лимит 20 МБ и JSON parse;
2. Zod structural validation;
3. migration;
4. unique IDs, workspace scope и references;
5. URL `http/https`, dates/duration/quarterIds;
6. milestone/assignment constraints;
7. DAG validation;
8. preview и backup;
9. atomic replace и post-load state.

Merge отсутствует намеренно: конфликтное объединение IDs и графов недостаточно надёжно для локального MVP.

## Порядок выпуска новой схемы

1. Обновить domain types и current validation schema.
2. Добавить Dexie upgrade и JSON migration.
3. Зафиксировать legacy fixtures без их последующего редактирования.
4. Проверить migration, reload, export и повторный import.
5. Обновить `DATA_SCHEMA.md`, compatibility contract и release notes.
6. До rollout создать внешний JSON backup production workspace.
