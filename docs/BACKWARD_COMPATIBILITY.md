# Контракт обратной совместимости

Этот документ обязателен для всех изменений после выхода `1.0.0`. Существующий IndexedDB workspace и ранее экспортированный JSON считаются невосстановимыми пользовательскими production-данными, пока не доказано обратное.

## Гарантии

1. Обновление приложения не удаляет и не сбрасывает workspace.
2. Поддерживаемый старый workspace открывается автоматически и сохраняет расписание, назначения, задачи и baseline.
3. Старый JSON либо импортируется через явную миграцию, либо отклоняется до записи с понятной ошибкой.
4. Ошибка migration/import не оставляет частично обновлённое состояние.
5. Новая версия не меняет смысл существующего поля молча.
6. Backup создаётся до рискованных replace/restore операций; восстановление остаётся доступным.

## Правила изменения модели

- Предпочитать additive changes: новое необязательное поле с безопасным default или новая таблица.
- Не переиспользовать старое имя поля с новым смыслом.
- Не менять формат дат `YYYY-MM-DD`, inclusive semantics и canonical stage без отдельного ADR и миграции.
- Удаление или переименование поля выполняется минимум в два релиза: сначала новое поле и dual-read, затем прекращение записи старого; физическое удаление — только после согласованного окна поддержки.
- Не менять существующий `schemaVersion` задним числом. Каждое несовместимое изменение увеличивает его ровно на один.
- Не удалять старые Dexie declarations: upgrade должен иметь непрерывную цепочку `version(1) → … → version(N)`.
- UI preferences versioned отдельно и не должны содержать рабочие данные.

## Требования к миграции

Каждая новая schema version должна иметь:

1. описание входной и выходной схемы;
2. Dexie `version(N).stores(...).upgrade(...)`;
3. JSON migration из всех заявленных поддерживаемых версий;
4. детерминированные defaults;
5. transactional или in-memory применение до commit;
6. structural и semantic validation после преобразования;
7. сохранение неизвестного не требуется, но потеря известного production-поля запрещена;
8. понятную ошибку и неизменённый исходный workspace при сбое.

Migration не должна зависеть от текущей даты, locale, порядка объектов или сети. Повторное применение к уже обновлённым данным не должно менять результат.

## Обязательные regression-тесты

Для изменения persistence релиз блокируется без:

- fixture предыдущей schema version;
- открытия реальной старой IndexedDB новой версией;
- импорта старого JSON;
- проверки ключевых business values до/после, а не только `schemaVersion`;
- проверки reload после upgrade;
- проверки corrupted/unsupported input без изменения текущих данных;
- проверки backup/restore, если затронут replace path;
- полного `typecheck`, `lint`, unit, performance, browser E2E и static generation.

Для scheduling/capacity изменения добавляется semantic regression: даты, граф и FTE до миграции должны остаться эквивалентны, если новая функция не требует явно документированного пересчёта.

## Политика поддержки JSON

Текущая версия принимает exports schema 1, 2 и 3. Поддерживаемые версии нельзя исключить без отдельного major release, migration utility и заранее опубликованного release note. `appVersion` информативен; решение о migration принимает `schemaVersion`.

Import работает как Replace:

```text
parse → validate old schema → migrate in memory → validate current schema
→ create backup → one transaction replace → integrity check
```

Любая ошибка до успешного commit оставляет текущий workspace без изменений.

## Checklist изменения

- [ ] Определено, меняется ли persisted shape или semantics.
- [ ] Увеличен schema version, если требуется.
- [ ] Реализованы IndexedDB и JSON migration.
- [ ] Добавлены defaults и post-migration validation.
- [ ] Добавлены старые fixtures и semantic assertions.
- [ ] Проверен rollback/atomicity.
- [ ] Обновлены `DATA_SCHEMA.md`, `MIGRATIONS.md` и release notes.
- [ ] Пользователю рекомендован внешний JSON backup перед rollout.
- [ ] Выполнен release checklist во всех целевых браузерах.
