# Документация Delivery Planner

Delivery Planner — локальное SPA для квартального delivery-планирования. Backend отсутствует: рабочие данные хранятся в IndexedDB текущего браузерного профиля, а `localStorage` используется только для UI-настроек.

## Для пользователей

- [Руководство пользователя](USER_GUIDE.md)
- [Backup и восстановление](BACKUP_GUIDE.md)
- [Диагностика](TROUBLESHOOTING.md)

## Для разработки и сопровождения

- [Технический обзор](TECHNICAL_OVERVIEW.md)
- [Архитектура](ARCHITECTURE.md)
- [Схема данных](DATA_SCHEMA.md)
- [Обратная совместимость](BACKWARD_COMPATIBILITY.md)
- [Миграции](MIGRATIONS.md)
- [Production-эксплуатация](PRODUCTION_OPERATIONS.md)
- [Performance](PERFORMANCE.md)
- [Compatibility matrix](COMPATIBILITY.md)

## Релиз

- [Acceptance matrix](release/ACCEPTANCE_MATRIX.md)
- [Release checklist](release/RELEASE_CHECKLIST.md)
- [ADR: DHTMLX Gantt Community](adr/0001-dhtmlx-gantt-community.md)

Нормативное правило проекта: сохранённые workspace и ранее выгруженные JSON-файлы являются production-данными. Любое изменение модели или persistence должно следовать [контракту обратной совместимости](BACKWARD_COMPATIBILITY.md) и иметь миграцию и regression-тесты до релиза.
