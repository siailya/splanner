# HTTP API: эпики и этапы

API позволяет читать и изменять эпики и этапы (task, scope, milestone) без загрузки и отправки всего плана. Workspace по-прежнему создаёт администратор через CLI. Базовый путь: `/api/workspaces/:code`.

## Доступ и версия workspace

Чтение доступно по коду workspace без PIN. Для POST, PATCH и DELETE нужна сессия редактирования:

1. Выполнить `POST /edit-session` с JSON `{ "pin": "0042" }`. PIN — строка из четырёх цифр, включая ведущие нули.
2. Сохранить cookie `planner_edit` и передавать её в следующих запросах. Cookie действует только для API выбранного workspace; срок по умолчанию — 8 часов.
3. Для завершения выполнить `DELETE /edit-session`. Смена PIN администратором также отзывает сессии.

Тело изменяющих запросов — JSON, `Content-Type: application/json`. Если клиент отправляет `Origin`, он должен совпадать с `PUBLIC_ORIGIN` сервера (или origin запроса, если настройка не задана). CLI-клиенты могут не отправлять этот заголовок. Production cookie требует HTTPS при HTTPS `PUBLIC_ORIGIN`.

Каждая операция создания, редактирования или удаления требует `expectedRevision`: текущее целое неотрицательное значение версии **всего workspace**, а не отдельной сущности. Версию можно взять из ответа любой новой CRUD-ручки, `GET /revision` или `GET /` (`data.workspace.revision`). Успешная запись увеличивает её на один. Эта же версия используется SPA и существующим `PUT /`.

При `409` сервер возвращает `currentRevision`. Загрузите актуальные данные и проверьте свои изменения перед новым запросом. Не подставляйте новую версию и не повторяйте запись автоматически. После разрыва связи результат записи также может быть неизвестен: сначала проверьте серверное состояние.

## Маршруты и ответы

Все пути в таблице относительны `/api/workspaces/:code`.

| Метод и путь | Действие | Доступ | Успех |
|---|---|---|---|
| `GET /epics` | Все эпики | Просмотр | `200` |
| `POST /epics` | Создать эпик | Редактирование | `201` |
| `GET /epics/:epicId` | Один эпик | Просмотр | `200` |
| `PATCH /epics/:epicId` | Изменить эпик | Редактирование | `200` |
| `DELETE /epics/:epicId` | Удалить эпик | Редактирование | `200` |
| `GET /epics/:epicId/stages` | Этапы эпика | Просмотр | `200` |
| `POST /epics/:epicId/stages` | Создать этап в эпике | Редактирование | `201` |
| `GET /stages` | Все этапы | Просмотр | `200` |
| `GET /stages/:stageId` | Один этап | Просмотр | `200` |
| `PATCH /stages/:stageId` | Изменить этап | Редактирование | `200` |
| `DELETE /stages/:stageId` | Удалить этап | Редактирование | `200` |

Создание и PATCH принимают `{ "expectedRevision": 12, "data": { ... } }`. PATCH изменяет только переданные поля; пустой `data` отклоняется. DELETE принимает JSON-тело `{ "expectedRevision": 12 }`.

Ответы имеют общий формат:

```json
{
  "data": {},
  "revision": 13,
  "updatedAt": "2026-09-30T12:00:00.000Z"
}
```

`data` — полная сущность, массив сущностей для коллекции или `{ "deletedId": "..." }` после удаления. `revision` и `updatedAt` относятся к workspace. Ответы используют `Cache-Control: no-store`.

Коллекции возвращаются целиком, без пагинации и без фильтрации по кварталу или статусу, включая завершённые и архивные эпики. Порядок: `sortOrder`, затем ID по возрастанию. Этапы одного эпика можно получить отдельной вложенной ручкой. ID ищется только внутри workspace из URL; чужой или отсутствующий ID возвращает `404`.

## Поля эпика

| Поле | Создание / PATCH | Правила |
|---|---|---|
| `title` | Да | Непустая строка; края обрезаются. Обязательно при создании |
| `code` | Да | Строка; `null` удаляет поле |
| `descriptionMarkdown` | Да | Обычный текст, несмотря на историческое имя; по умолчанию `""` |
| `status` | Да | `active`, `paused`, `done`, `archived`; по умолчанию `active` |
| `startDate`, `endDate` | Да | Даты `YYYY-MM-DD` либо `null` для очистки |
| `marker` | Да | Строка цвета; по умолчанию `#2563eb`; `null` удаляет поле |
| `sortOrder` | Да | Неотрицательное конечное число; по умолчанию после последнего эпика |
| `id`, `workspaceId`, `createdAt`, `updatedAt` | Только чтение | Задаются сервером |
| `effectivePeriod` | Только чтение | Вычисленный период либо `null` |

При создании без обеих дат сервер ставит начало сегодня в часовом поясе своего процесса и окончание через **три календарных дня**. Например, `2026-09-30` → `2026-10-03`. Для автоматического периода при создании передайте обе даты `null`.

При PATCH пропущенные поля сохраняются. Итоговые даты должны либо обе присутствовать, либо обе отсутствовать; начало не может быть позже окончания. Для перехода к автоматическому периоду передайте `{ "startDate": null, "endDate": null }`. В ответе очищенные необязательные поля отсутствуют.

`effectivePeriod` учитывает ручной период и границы всех этапов эпика:

```json
{
  "startDate": "2026-11-09",
  "endDate": "2026-11-20",
  "durationWorkdays": 10
}
```

Рабочая длительность рассчитывается по календарю workspace, с включением обеих дат. Этапы могут расширять ручной период; сами ручные `startDate` и `endDate` при этом не переписываются. Если нет ни ручного периода, ни этапов, `effectivePeriod` равен `null`. Вычисляемое поле не попадает в сохранённый workspace или экспорт.

## Поля этапа

| Поле | Создание / PATCH | Правила |
|---|---|---|
| `title` | Да | Непустая строка; края обрезаются. Обязательно при создании |
| `activityTypeId` | Да | ID существующего типа активности; обязательно при создании |
| `startDate` | Да | Реальная дата `YYYY-MM-DD`; обязательна при создании |
| `endDate` | Да | Реальная дата; по умолчанию равна началу |
| `kind` | Да | `task`, `scope`, `milestone`; по умолчанию `task` |
| `status` | Да | `planned`, `in_progress`, `done`, `blocked`; по умолчанию `planned` |
| `descriptionMarkdown` | Да | Обычный текст; по умолчанию `""` |
| `locked` | Да | Boolean; по умолчанию `false` |
| `sortOrder` | Да | Неотрицательное конечное число; по умолчанию после последнего этапа этого эпика |
| `externalUrl` | Да | HTTP/HTTPS URL; `null` удаляет поле |
| `epicId` | Только чтение | Определяется URL при создании; перенос между эпиками не поддерживается |
| `durationWorkdays`, `quarterIds` | Только чтение | Вычисляются сервером по датам и календарю |
| `id`, `workspaceId`, `createdAt`, `updatedAt` | Только чтение | Задаются сервером |

Для task/scope начало не позже окончания, а интервал должен содержать хотя бы один рабочий день. Сервер сохраняет указанные даты без переноса с выходных; рабочая длительность учитывает праздники и дополнительные рабочие дни календаря. Отсутствующие кварталы автоматически добавляются в workspace.

Для milestone достаточно `startDate`: окончание всегда совпадает с началом, длительность равна нулю. Веха может находиться в выходной. Если явно передать отличающийся `endDate`, запрос отклоняется. PATCH начала существующей вехи также меняет её окончание. При преобразовании task/scope в milestone без `endDate` окончание становится равным началу; назначения этого этапа удаляются.

Сроки заблокированного этапа менять нельзя (`423`). Изменение `kind` также запрещено, поскольку оно может изменить сроки. Сначала отдельным PATCH установите `locked: false`, затем используйте новую версию для изменения дат или вида. Описания и статусы можно редактировать при блокировке.

CRUD меняет только выбранную сущность: даты соседних этапов не пересчитываются, зависимости и назначения автоматически не создаются, даже если в настройках workspace включён `autoLinkNewStages`. Временное ограничение зависимости может стать нарушенным и будет отображаться интерфейсом; корректность ссылок и отсутствие циклов проверяются существующей валидацией.

## Удаление и резервные копии

- Перед удалением создаётся снимок `before_delete` в той же транзакции, что и запись новой версии.
- При удалении этапа удаляются его зависимости и назначения. Задачи `workItems` остаются в эпике, их `stageId` очищается.
- При удалении эпика удаляются его этапы, их зависимости и назначения, а также задачи этого эпика. ID эпика удаляется из `baseline.epicIds`; исторические `baselineStages` сохраняются.
- Остальные сущности и workspace не меняются. Блокировка сроков не запрещает удаление.
- Снимки можно получить и восстановить существующим API: `GET /backups`, `GET /backups/:id`, `POST /backups/:id/restore` с `{ "expectedRevision": ... }`. Восстановление увеличивает версию, а не возвращает её назад.

## Примеры curl

Следующие блоки выполняются последовательно в Bash; нужны `curl` и `jq`. Подставьте свой origin и код workspace. Для локальной разработки через Nuxt используйте порт `3000`; для Express по умолчанию — `3101`.

### Вход по PIN и чтение

```bash
set -euo pipefail
PLANNER_ORIGIN='http://127.0.0.1:3101'
PLANNER_CODE='ваш-код-workspace'
PLANNER_API="${PLANNER_ORIGIN}/api/workspaces/${PLANNER_CODE}"
PLANNER_COOKIE=$(mktemp)

read -r -s -p 'PIN (4 цифры): ' PLANNER_PIN
printf '\n'
printf '%s' "$PLANNER_PIN" | jq -Rs '{pin: .}' |
  curl --fail-with-body -sS -c "$PLANNER_COOKIE" \
    -H 'Content-Type: application/json' \
    --data-binary @- "$PLANNER_API/edit-session"
unset PLANNER_PIN

curl --fail-with-body -sS "$PLANNER_API/epics" | jq
curl --fail-with-body -sS "$PLANNER_API/stages" | jq

# Справочник типов активности находится в существующем GET workspace.
curl --fail-with-body -sS "$PLANNER_API" |
  jq '.data.activityTypes[] | {id, name, isActive}'
```

### Создание эпика и этапа

```bash
PLANNER_REVISION=$(curl --fail-with-body -sS "$PLANNER_API/revision" | jq -r '.revision')
PLANNER_EPIC_RESPONSE=$(jq -n --argjson revision "$PLANNER_REVISION" \
  '{expectedRevision: $revision, data: {title: "Новый релиз", descriptionMarkdown: "Обычное текстовое описание", startDate: "2026-11-09", endDate: "2026-11-12"}}' |
  curl --fail-with-body -sS -b "$PLANNER_COOKIE" \
    -H 'Content-Type: application/json' --data-binary @- "$PLANNER_API/epics")
PLANNER_EPIC_ID=$(printf '%s' "$PLANNER_EPIC_RESPONSE" | jq -r '.data.id')
PLANNER_REVISION=$(printf '%s' "$PLANNER_EPIC_RESPONSE" | jq -r '.revision')

# activity-development — ID стандартного типа; для своего типа возьмите ID из справочника.
PLANNER_STAGE_RESPONSE=$(jq -n --argjson revision "$PLANNER_REVISION" \
  '{expectedRevision: $revision, data: {title: "Разработка", activityTypeId: "activity-development", startDate: "2026-11-09", endDate: "2026-11-12"}}' |
  curl --fail-with-body -sS -b "$PLANNER_COOKIE" \
    -H 'Content-Type: application/json' --data-binary @- "$PLANNER_API/epics/$PLANNER_EPIC_ID/stages")
PLANNER_STAGE_ID=$(printf '%s' "$PLANNER_STAGE_RESPONSE" | jq -r '.data.id')
PLANNER_REVISION=$(printf '%s' "$PLANNER_STAGE_RESPONSE" | jq -r '.revision')

curl --fail-with-body -sS "$PLANNER_API/epics/$PLANNER_EPIC_ID/stages" | jq
curl --fail-with-body -sS "$PLANNER_API/epics/$PLANNER_EPIC_ID" | jq
```

### Изменение сроков, описания и статуса

```bash
PLANNER_UPDATED=$(jq -n --argjson revision "$PLANNER_REVISION" \
  '{expectedRevision: $revision, data: {startDate: "2026-11-10", endDate: "2026-11-13", descriptionMarkdown: "Уточнённое описание", status: "in_progress"}}' |
  curl --fail-with-body -sS -X PATCH -b "$PLANNER_COOKIE" \
    -H 'Content-Type: application/json' --data-binary @- "$PLANNER_API/stages/$PLANNER_STAGE_ID")
PLANNER_REVISION=$(printf '%s' "$PLANNER_UPDATED" | jq -r '.revision')
printf '%s' "$PLANNER_UPDATED" | jq
```

Для эпика PATCH имеет такой же формат; используйте `/epics/$PLANNER_EPIC_ID` и разрешённые поля эпика. Чтобы создать веху, передайте `kind: "milestone"`, `activityTypeId` и `startDate` при POST этапа.

### Удаление и завершение сессии

```bash
PLANNER_DELETED=$(jq -n --argjson revision "$PLANNER_REVISION" '{expectedRevision: $revision}' |
  curl --fail-with-body -sS -X DELETE -b "$PLANNER_COOKIE" \
    -H 'Content-Type: application/json' --data-binary @- "$PLANNER_API/stages/$PLANNER_STAGE_ID")
PLANNER_REVISION=$(printf '%s' "$PLANNER_DELETED" | jq -r '.revision')

jq -n --argjson revision "$PLANNER_REVISION" '{expectedRevision: $revision}' |
  curl --fail-with-body -sS -X DELETE -b "$PLANNER_COOKIE" \
    -H 'Content-Type: application/json' --data-binary @- "$PLANNER_API/epics/$PLANNER_EPIC_ID"

curl --fail-with-body -sS -X DELETE -b "$PLANNER_COOKIE" "$PLANNER_API/edit-session"
rm "$PLANNER_COOKIE"
```

### Конфликт версии

Если между чтением и записью другой редактор сохранил план, ответ будет, например:

```json
{
  "error": "Workspace изменён в другом браузере",
  "currentRevision": 14
}
```

`curl --fail-with-body` сохраняет JSON ошибки в выводе и завершает команду с ненулевым кодом. Для проверки актуального состояния используйте:

```bash
curl --fail-with-body -sS "$PLANNER_API/revision" | jq
curl --fail-with-body -sS "$PLANNER_API/stages/$PLANNER_STAGE_ID" | jq
```

После проверки изменений сформируйте новый PATCH осознанно, с актуальной версией. CRUD не поддерживает принудительное перезаписывание или автоматическое объединение.

## Ошибки

| HTTP | Причина |
|---|---|
| `400` | Некорректный JSON или отсутствующая/неверная `expectedRevision` |
| `403` | Нет действующей сессии выбранного workspace, неверный PIN или запрещённый Origin |
| `404` | Workspace, эпик, этап или endpoint не найден |
| `409` | Версия workspace изменилась; ответ содержит `currentRevision` |
| `413` | Превышен лимит JSON-запроса (`JSON_LIMIT`, по умолчанию `10mb`) |
| `422` | Неверные поля, даты, ссылки, пустой PATCH или нарушение целостности данных |
| `423` | Попытка изменить сроки или вид заблокированного этапа |
| `429` | Превышен лимит попыток PIN; время ожидания в `Retry-After` |
| `503` | SQLite временно недоступен |

Общий формат — `{ "error": "Сообщение" }`. Ошибки схемы дополнительно содержат `issues: [{ "path": "title", "message": "..." }]`; ошибки целостности могут возвращать только сообщение. Неизвестные поля отклоняются, включая попытку записать ID, вычисленные значения или timestamps. При ошибке записи workspace, его версия и резервные копии не изменяются.

Текущий `GET /`, `PUT /`, импорт и backup API продолжают работать с прежними форматами. Данные сохраняются как PlannerData schema v3; дополнительные CRUD-ответы не меняют формат экспорта. См. также [схему данных](DATA_SCHEMA.md) и [руководство backup](BACKUP_GUIDE.md).
