# Delivery Planner — план разработки в 3 последовательные итерации

**Основание:** `delivery_planner_product_technical_spec.md`  
**Дата:** 22.07.2026  
**Стек:** Bun + Nuxt SPA (`ssr: false`) + Nuxt UI + Pinia + Dexie/IndexedDB + DHTMLX Gantt Community  
**Целевая платформа:** Desktop Web, macOS и Windows

---

## 1. Принцип декомпозиции

Три итерации должны давать не три набора разрозненных экранов, а три последовательно расширяемые версии продукта:

1. **Итерация 1 — Planning Core:** рабочий локальный Gantt-планировщик, которым уже можно заменить Excel для управления сроками и зависимостями.
2. **Итерация 2 — Capacity & Delivery Details:** управление командой, загрузкой, содержанием этапов и массовыми операциями.
3. **Итерация 3 — Control & Release:** baseline, табличное представление, безопасный обмен данными, экспорт и production-hardening.

Каждая итерация должна завершаться:

- демонстрируемым пользовательским сценарием;
- миграцией локальной схемы данных без потери существующего workspace;
- набором unit/component/E2E тестов;
- production build;
- обновлением документации;
- отсутствием критических дефектов в уже реализованных функциях.

### 1.1. Что нельзя откладывать «на потом»

Следующие архитектурные решения закладываются в первой итерации, даже если соответствующий UI появится позже:

- единый domain-слой планирования;
- версионирование схемы данных;
- repository-слой над IndexedDB;
- command-based операции с возможностью undo/redo;
- разделение канонического состояния приложения и состояния Gantt-widget;
- квартальная партиция данных;
- расширяемая модель `assignments`, `baseline`, `workItems`;
- безопасная обработка календарных дат без времени суток.

Это необходимо, чтобы во второй и третьей итерациях не переписывать ядро приложения.

---

# 5. Матрица распределения исходных требований

| Блок исходного ТЗ | Итерация 1 | Итерация 2 | Итерация 3 |
|---|---:|---:|---:|
| Workspace и кварталы | Основная реализация | Улучшения UX | Hardening/export |
| Эпики | CRUD и Timeline | Полная карточка | Полировка |
| Этапы | Основной CRUD, drag, resize | Массовые операции | Полировка/table |
| Markdown и work items | Модель-заготовка | Полная реализация | Hardening |
| Dependencies/scheduling | Основное ядро | Repair/compact и bulk | Property tests/hardening |
| Рабочий календарь | Полная базовая реализация | Capacity integration | Edge cases |
| Ресурсы/назначения | Модель-заготовка | Полная реализация | Hardening |
| Capacity panel | — | Полная реализация | Performance/accessibility |
| Baseline | Модель-заготовка | — | Полная реализация |
| Table view | — | — | Полная реализация |
| Фильтры/поиск | Базовые | Расширенные | Table/baseline filters |
| Undo/redo | Основные операции | Bulk operations | Final regression |
| Persistence | IndexedDB/autosave | Новые таблицы/migration v2 | Snapshots/migration v3 |
| JSON import/export | Минимальный Replace | Совместимость новых сущностей | Full/quarter/preview/merge decision |
| PNG/PDF | Spike | — | Полная реализация |
| Security/validation | Базовая | Markdown sanitization | Полная data hardening |
| Performance | Spike + basic target | Capacity target | Финальная оптимизация |
| Cross-browser/a11y | Smoke | Регрессия | Полная приёмка |

---

# 6. Схема версий данных

Рекомендуемая схема миграций:

### Schema v1 — итерация 1

- workspace;
- calendar;
- quarters;
- activity types;
- epics;
- stages;
- dependencies;
- UI preferences отдельно.

### Schema v2 — итерация 2

- roles;
- people;
- assignments;
- Markdown fields;
- work items;
- дополнительные индексы capacity;
- migration v1 → v2 с пустыми коллекциями и default values.

### Schema v3 — итерация 3

- baselines;
- snapshots;
- export metadata;
- data integrity metadata;
- migration v2 → v3 без изменения существующего schedule.

Каждая миграция должна быть:

- идемпотентной там, где это возможно;
- транзакционной;
- покрытой тестом;
- проверенной на копии реального sample workspace;
- необратимой только после создания backup.

---

# 7. Общие quality gates между итерациями

Следующая итерация не начинается, пока предыдущая не выполняет свои acceptance criteria.

## Gate после итерации 1

- подтверждён visual engine;
- нет двух источников истины;
- schedule engine покрыт unit/property tests;
- persistence и export/import надёжны;
- реальный план можно вести без Excel.

## Gate после итерации 2

- capacity считается детерминированно;
- нет двойного учёта без явного отображения;
- массовые операции атомарны;
- Markdown безопасен;
- work items не стали вторым скрытым Gantt.

## Gate после итерации 3

- выполнены AC-001—AC-022;
- пройдены cross-browser E2E;
- пройдена проверка export/import/restore;
- подтверждены performance budgets;
- подготовлена документация и production build.

---

# 8. Приоритеты при сокращении сроков

Если внутри итерации необходимо уменьшить scope, сокращать функции следует в таком порядке.

## Итерация 1

Сначала можно отложить:

1. перенос этапа между эпиками drag-and-drop;
2. lag editor в графическом виде — оставить поле в drawer;
3. архивные кварталы — оставить current/next/combined;
4. расширенные filters.

Нельзя откладывать:

- IndexedDB;
- календарный engine;
- Cascade/Free;
- зависимости и cycle detection;
- autosave;
- базовый JSON export/import;
- undo каскада.

## Итерация 2

Сначала можно отложить:

1. role-only demand, оставив person assignments;
2. drag work items между этапами, оставив select в форме;
3. copy dependencies при paste;
4. highlight bars из capacity drill-down;
5. массовое изменение нескольких полей.

Нельзя откладывать:

- FTE-модель;
- person/role capacity;
- daily/weekly panel;
- overload;
- Markdown;
- epic aggregate work items;
- атомарность массовых переносов.

## Итерация 3

Сначала можно отложить:

1. merge import;
2. экспорт произвольного очень длинного диапазона;
3. несколько вариантов оформления PNG;
4. ручные именованные snapshots, сохранив автоматические;
5. отдельные baseline filters.

Нельзя откладывать:

- baseline core;
- table synchronization;
- backup перед import;
- schema migrations;
- full JSON restore;
- print/PDF;
- performance и cross-browser hardening.

---

# 9. Итоговый Definition of Done продукта

Продукт считается завершённым после трёх итераций, когда:

- он полностью работает без backend;
- пользователь может планировать эпики и этапы на дневном Gantt;
- зависимости поддерживают Cascade и Free scheduling;
- параллельные ветки работают корректно;
- рабочий календарь учитывается во всех расчётах;
- роли, сотрудники и FTE формируют дневной и недельный capacity;
- Markdown и work items доступны на уровне этапа и эпика;
- baseline позволяет сравнивать текущий и согласованный план;
- Timeline и Table используют один источник истины;
- данные сохраняются в IndexedDB и мигрируют между версиями;
- JSON полностью восстанавливает workspace;
- snapshots защищают от ошибок;
- PNG и print/PDF создаются локально;
- current/next/archive quarters работают без дублей;
- workspace до 30 эпиков и 500 этапов соответствует performance budgets;
- приложение протестировано на desktop macOS/Windows в целевых браузерах.
