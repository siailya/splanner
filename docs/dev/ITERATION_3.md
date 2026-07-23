# 4. Итерация 3 — Control, Sharing & Production Release

## 4.1. Цель

Довести приложение до стабильного рабочего инструмента для регулярного delivery-management: добавить контроль отклонений от согласованного плана, альтернативное табличное представление, полноценную защиту данных, экспорт для коммуникации и production-hardening.

После итерации версия считается завершённым MVP/1.0.

## 4.2. Пользовательский результат

Пользователь может:

1. Зафиксировать согласованный baseline.
2. Сравнить текущий план с исходным.
3. Редактировать и анализировать этапы в таблице.
4. Создавать и восстанавливать локальные snapshots.
5. Безопасно импортировать разные версии конфигурации.
6. Экспортировать весь workspace или отдельный квартал.
7. Получить PNG и print-friendly PDF-представление.
8. Работать со стабильной производительностью на целевом объёме.
9. Использовать приложение в Chrome/Edge, Firefox и Safari на macOS/Windows.

## 4.3. Объём работ

### 4.3.1. Baseline

Реализовать:

- создание именованного baseline;
- timestamp и необязательный комментарий;
- immutable snapshot;
- сохранение stage dates, duration, kind, epic relation и activity type;
- несколько baseline на workspace;
- выбор активного baseline;
- удаление baseline с подтверждением;
- overlay под актуальными bars;
- baseline milestone;
- start variance;
- finish variance;
- duration variance;
- состояния `new after baseline`, `removed after baseline`, `changed`;
- фильтр по отклонениям;
- отсутствие влияния baseline на scheduling/capacity.

### 4.3.2. Table view

Добавить `/table`:

- эпик;
- этап;
- kind;
- activity type;
- status;
- start;
- finish;
- working duration;
- predecessors;
- assignments;
- total FTE;
- person-days;
- conflict state;
- baseline variance;
- sorting;
- column filters;
- global search;
- column visibility;
- inline edit разрешённых полей;
- multi-select;
- bulk actions;
- переход к Timeline;
- синхронизацию изменений через application commands;
- отсутствие отдельного источника истины.

### 4.3.3. Backup snapshots

Реализовать:

- ручное создание именованного snapshot;
- автоматический snapshot перед import;
- автоматический snapshot перед массовой destructive operation;
- ограниченную ротацию автоматических snapshots;
- список snapshots с датой и размером;
- preview метаданных;
- восстановление с подтверждением;
- transactional restore;
- защиту от восстановления повреждённого snapshot;
- экспорт отдельного snapshot в JSON.

### 4.3.4. Полный import/export

Расширить data portability:

- полный workspace export;
- export выбранного квартала с необходимыми связанными сущностями;
- export current + next;
- schemaVersion;
- migrations старых форматов;
- структурную и семантическую валидацию;
- preview импортируемого содержимого;
- количество эпиков, этапов, зависимостей, ресурсов, baseline;
- режим `Replace`;
- опциональный режим `Merge` только после отдельного подтверждённого алгоритма разрешения ID-конфликтов;
- отчёт о миграциях;
- понятные ошибки с указанием проблемных сущностей;
- гарантированное отсутствие частично применённого импорта.

Если merge нельзя сделать предсказуемо без чрезмерной сложности, его необходимо явно исключить из 1.0, а не выпускать ненадёжную реализацию.

### 4.3.5. PNG и print/PDF export

Реализовать полностью client-side:

- экспорт текущего viewport в PNG;
- экспорт выбранного диапазона;
- экспорт current quarter;
- export current + next с ограничением размера;
- заголовок, дата экспорта и легенда;
- возможность включить/исключить capacity panel;
- возможность включить baseline;
- предупреждение о слишком большом canvas;
- разбиение или scale-down по согласованной стратегии;
- print-friendly route;
- корректные page breaks;
- системное сохранение в PDF через browser print;
- отсутствие внешних серверов и передачи данных.

### 4.3.6. Data safety и browser storage

Добавить:

- проверку `navigator.storage.persist()`;
- отображение статуса persistent storage;
- предупреждение о риске очистки данных браузером;
- предложение экспортировать JSON;
- обработку quota errors;
- понятный recovery screen при ошибке IndexedDB;
- журнал последней успешной операции сохранения;
- проверку целостности связей при старте;
- автоматическое восстановление индексов/derived cache;
- безопасный reset с обязательным подтверждением и экспортом по предложению.

### 4.3.7. Hardening scheduling/capacity

Завершить:

- property-based tests для графа зависимостей;
- property-based tests календаря;
- property-based tests capacity aggregation;
- cross-quarter regression suite;
- большие каскады;
- multiple predecessor corner cases;
- locked stage corner cases;
- duplicate/paste/import ID collisions;
- deterministic output;
- cache invalidation;
- проверку эквивалентности после export/import.

### 4.3.8. Производительность

Достичь и зафиксировать бюджеты для workspace до 30 эпиков и 500 этапов:

- первый usable render активного квартала — в согласованном бюджете на обычном рабочем ноутбуке;
- drag preview без заметных зависаний;
- пересчёт обычной цепочки — практически мгновенный;
- каскад по 500 этапам — не блокирует UI дольше согласованного порога;
- capacity recalc использует incremental invalidation;
- в DOM не рендерится весь многоквартальный диапазон без необходимости;
- архивные кварталы загружаются лениво;
- экспорт не приводит к безусловному падению вкладки;
- profiling results сохраняются в документации.

Конкретные числа должны быть подтверждены spike и финальным профилированием; ориентир из исходного ТЗ: scheduling до 100 мс для 500 этапов там, где это достижимо.

### 4.3.9. Совместимость и доступность

Проверить:

- актуальные desktop Chrome/Edge;
- актуальный Firefox;
- актуальный Safari на macOS;
- macOS и Windows;
- keyboard navigation для toolbar, drawer, forms и table;
- видимый focus;
- доступные labels;
- контраст;
- non-color overload/conflict indicators;
- корректные горячие клавиши на macOS/Windows;
- graceful message на мобильных устройствах вместо сломанного editor UI.

Полноценное мобильное редактирование не требуется.

### 4.3.10. Документация и release

Подготовить:

- README для запуска через Bun;
- описание архитектуры;
- ADR по DHTMLX;
- описание data schema;
- migration guide;
- руководство пользователя;
- руководство по backup/import/export;
- список горячих клавиш;
- troubleshooting;
- sample workspace;
- release checklist;
- production static build;
- инструкции по размещению на статическом hosting.

## 4.4. Критерии приёмки итерации 3

1. Именованный baseline создаётся и не изменяется вслед за планом.
2. Timeline показывает baseline overlay и отклонения.
3. Новые и удалённые относительно baseline этапы различимы.
4. Table view отображает те же данные, что и Timeline.
5. Inline edit в таблице проходит через общий application/domain слой.
6. Изменение в таблице сразу отражается на Timeline и capacity.
7. Snapshot создаётся и полностью восстанавливает workspace.
8. Перед import автоматически создаётся backup.
9. Некорректный JSON не повреждает текущие данные.
10. Импорт старой поддерживаемой schemaVersion проходит через миграцию.
11. Полный export/import создаёт семантически эквивалентный workspace.
12. Quarter export содержит все необходимые зависимости и справочники.
13. PNG создаётся локально без сетевых запросов.
14. Print view позволяет сохранить читаемый PDF.
15. Current + next quarter export корректно обрабатывает этапы на границе.
16. Persistent storage status отображается пользователю.
17. Quota/IndexedDB errors не приводят к молчаливой потере данных.
18. E2E suite проходит в Chrome/Chromium, Firefox и WebKit/Safari-профиле.
19. Приложение выдерживает 30 эпиков и 500 этапов в согласованных бюджетах.
20. Все исходные MVP acceptance criteria AC-001—AC-022 выполнены.

## 4.5. Демонстрационный сценарий

Открыть заполненный workspace, сохранить baseline, сдвинуть несколько цепочек и показать variance. Отредактировать даты в Table view, убедиться в синхронизации Timeline и capacity. Создать snapshot, экспортировать квартал в JSON и PNG, выполнить импорт повреждённого файла и показать отсутствие потери данных, затем восстановить snapshot и сохранить print view в PDF.
