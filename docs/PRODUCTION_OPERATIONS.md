# Production-эксплуатация

## Развёртывание

Проверенный релиз собирается командой:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run test:performance
bun run test:e2e
bun run generate
```

Публикуется содержимое `.output/public` на статическом HTTPS-hosting. Для SPA hosting должен возвращать `index.html` на client routes (`/timeline`, `/projects/*`, `/settings/*`, `/print`). Необходимо разрешить загрузку собственных JS/CSS/assets и не добавлять внешние runtime-скрипты.

Релиз выполняется immutable-артефактом. Для отката хранится предыдущая `.output/public`; откат приложения не означает downgrade IndexedDB, поэтому старая сборка должна запускаться только если она совместима с уже применённой schema.

## Перед обновлением

1. Зафиксировать текущую и целевую `schemaVersion`.
2. Выполнить [контракт обратной совместимости](BACKWARD_COMPATIBILITY.md).
3. Проверить migration на копии production-like v1/v2/v3 exports.
4. Экспортировать внешний полный JSON из Settings → Data.
5. Развернуть сначала на отдельном browser profile и проверить reload/import/export.
6. После smoke-test распространить сборку остальным пользователям.

Если schema меняется, безопаснее сначала выпустить версию, которая умеет читать старую схему и создавать backup, и только затем включать новые записи.

## Backup

- IndexedDB и встроенные snapshots находятся в одном browser profile и не защищают от очистки данных сайта или потери профиля.
- Для рабочих планов нужен регулярный внешний JSON export: минимум перед каждым релизом и после существенного изменения плана.
- JSON хранится в контролируемом корпоративном хранилище согласно внутренней политике доступа.
- Restore сначала проверяется на отдельном профиле, затем применяется в рабочем.

## Наблюдаемость без telemetry

Приложение намеренно не отправляет аналитику. Операционное состояние контролируется локально:

- индикатор `Сохранено / Сохранение / Ошибка`;
- Settings → Data: persistent storage, integrity result и snapshots;
- DevTools Console при воспроизводимой ошибке;
- экспорт проблемного workspace только с разрешения владельца данных.

После релиза проверяются: открытие workspace, число эпиков/этапов, даты нескольких контрольных этапов, capacity, baseline, reload и JSON round-trip.

## Инциденты

### Ошибка сохранения

Не очищать site data и не закрывать вкладку до диагностики. Попробовать полный JSON export. Проверить quota/persistent storage. Если export доступен — сохранить файл, затем открыть чистый профиль и проверить import.

### Integrity check failed

Использовать recovery overlay и сначала просмотреть доступные snapshots. Restore создаёт `before_restore` backup. Если встроенные copies повреждены, импортировать последний внешний JSON.

### Ошибка после обновления

Не выполнять ручное редактирование IndexedDB. Зафиксировать версию сборки, browser и сообщение Console; сохранить export/backup. Rollback UI разрешён только после проверки совместимости с текущей DB version. Исправление выпускается новой schema migration, а не изменением уже опубликованной migration.

### Повреждённый import

Не подтверждать Replace, если preview не соответствует ожиданиям. Validation error до commit безопасна: текущий workspace остаётся неизменным.

## Release gates

Production-релиз запрещён, если:

- не проходит хотя бы одна автоматическая проверка;
- migration не проверена на предыдущей реальной схеме;
- импорт может частично изменить данные;
- отсутствует внешний backup для рабочего workspace;
- static hosting не поддерживает SPA fallback;
- целевой браузер не прошёл smoke checklist.

Полный список находится в [release checklist](release/RELEASE_CHECKLIST.md).
