# Delivery Planner

Локальный desktop-first SPA для квартального delivery-планирования. Приложение объединяет Gantt, Finish-to-Start scheduling, роли и FTE capacity, Markdown, внутренние задачи, baseline, табличное представление, backup и локальный export.

Данные хранятся в IndexedDB браузера. Backend, регистрация, аналитика и внешние export API не используются.

## Запуск

Требуется Bun 1.3+.

```bash
bun install
bun run dev
```

Откройте `http://localhost:3000/timeline`. Для первого знакомства нажмите «Загрузить демо»: будет создан эпик `CPM–CPA аукцион` с двумя параллельными ветками, зависимостями, Backend/QA, assignments, work items и намеренной перегрузкой.

Маршруты:

- `/timeline` — Gantt, зависимости, baseline overlay, массовые операции и capacity;
- `/table` — синхронное табличное представление с inline edit и фильтрами;
- `/projects`, `/projects/:id` — эпики, Markdown, backlog и work items;
- `/team` — роли, сотрудники и FTE;
- `/settings/data` — persistent storage, integrity, snapshots, import/export;
- `/settings/calendar`, `/settings/activity-types`, `/settings/appearance`;
- `/print` — print-friendly представление для системного «Сохранить как PDF».

## Проверки и release build

```bash
bun run typecheck
bun run lint
bun run test
bun run test:performance
bun run test:e2e
bun run generate
```

Playwright проверяет Chromium, Firefox и WebKit. Static output создаётся в `.output/public`.

## Горячие клавиши Timeline

- `Ctrl/Cmd + Z` — undo;
- `Ctrl/Cmd + Shift + Z`, `Ctrl + Y` — redo;
- `Ctrl/Cmd + C/V` — copy/paste;
- `Ctrl/Cmd + D` — duplicate;
- `Delete/Backspace` — удалить выделенное;
- `Shift + click` — range selection;
- `Ctrl/Cmd + click` — additive selection;
- `Alt/Option` во время drag — временно инвертировать Cascade/Free;
- `F` — фильтры, `T` — сегодня, `Esc` — закрыть overlay.

## Документация

- [Оглавление документации](docs/README.md)
- [Технический обзор](docs/TECHNICAL_OVERVIEW.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Схема данных](docs/DATA_SCHEMA.md)
- [Контракт обратной совместимости](docs/BACKWARD_COMPATIBILITY.md)
- [Миграции](docs/MIGRATIONS.md)
- [Production-эксплуатация](docs/PRODUCTION_OPERATIONS.md)
- [Руководство пользователя](docs/USER_GUIDE.md)
- [Backup и восстановление](docs/BACKUP_GUIDE.md)
- [Диагностика](docs/TROUBLESHOOTING.md)
- [Performance report](docs/PERFORMANCE.md)
- [Compatibility matrix](docs/COMPATIBILITY.md)
- [Acceptance matrix](docs/release/ACCEPTANCE_MATRIX.md)
- [Release checklist](docs/release/RELEASE_CHECKLIST.md)
- [ADR DHTMLX Community](docs/adr/0001-dhtmlx-gantt-community.md)

Рабочие данные не помещаются в `localStorage`: там находятся только UI preferences. Регулярно экспортируйте полный JSON, особенно перед очисткой данных сайта или сменой браузерного профиля.
