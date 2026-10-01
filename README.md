# Delivery Planner

Delivery Planner — сетевой планировщик с таймлайном, эпиками, зависимостями, FTE, задачами и baseline. Интерфейс остаётся Nuxt SPA; Express хранит каждый workspace в SQLite. Для просмотра достаточно ссылки с кодом, для изменения нужен четырёхзначный PIN.

[HTTP API эпиков и этапов](docs/HTTP_API.md): CRUD, изменение сроков и описаний, PIN-сессии, контроль версий и примеры `curl`.

## Локальная разработка

Нужны Node.js 24 и Bun 1.3.14.

```bash
bun install --frozen-lockfile
PUBLIC_ORIGIN=http://127.0.0.1:3000 bun run dev:server
# в другом терминале
bun run dev --host 127.0.0.1 --port 3000
```

Создайте workspace (PIN вводится без отображения):

```bash
DB_PATH=./data/planner.sqlite PUBLIC_ORIGIN=http://127.0.0.1:3000 bun run admin workspace:create --name "Мой план"
```

В браузере откройте `http://127.0.0.1:3000/` и введите выданный код. `/w/:code/view/timeline` открывает просмотр; кнопка «Редактировать» ведёт к `/w/:code/edit/timeline` и запрашивает PIN. Ссылка «Поделиться» всегда ведёт к просмотру. Остальные разделы используют тот же префикс: `projects`, `team`, `table`, `settings/*`, `print`.

## Выпуск и Docker

GitHub Actions workflow `.github/workflows/publish-container.yml` собирает Dockerfile и публикует образ `ghcr.io/siailya/splanner` при push в `main`, push тега `v*` или ручном запуске. Ветка `main` обновляет `latest`, теги публикуются с исходным именем (например, `v1.0.0`), каждый запуск также создаёт тег `sha-<полный SHA коммита>`. Сборка выполняется для `linux/amd64` с кешем GitHub Actions.

Workflow должен запускаться из GitHub-репозитория владельца `siailya`. Для авторизации используется встроенный `GITHUB_TOKEN` с правом `packages: write`; отдельный секрет не нужен. Если пакет уже существует, предоставьте этому репозиторию доступ к нему в настройках пакета **Manage Actions access**.

```bash
bun run typecheck
bun run lint
bun run test
bun run test:performance
bun run test:e2e
bun run build
PUBLIC_ORIGIN=https://planner.example.internal docker compose up -d --build
```

Разместите приложение за HTTPS reverse proxy, проксирующим на порт 3101. SQLite должен находиться на локальном persistent volume, не на сетевой файловой системе. Один экземпляр приложения работает с одним файлом БД. Код workspace создаётся только администратором:

```bash
docker compose exec planner node .output/server/cli.mjs workspace:create --name "Команда A"
docker compose exec planner node .output/server/cli.mjs workspace:create --name "Команда A" --import /data/old-export.json
docker compose exec planner node .output/server/cli.mjs workspace:list
docker compose exec planner node .output/server/cli.mjs workspace:reset-pin --code CODE
```

Импорт через CLI требует, чтобы файл экспорта был доступен внутри контейнера; его можно поместить в примонтированный каталог `/data`. PIN хранится как salted scrypt hash. Смена PIN отзывает все действующие сессии редактирования.

## Резервное копирование и перенос

Снимки отдельных workspace доступны редактору в настройках: ручные и автоматические перед импортом, восстановлением, удалениями и изменением календаря. История ограничена 10 снимками и 20 МиБ на workspace. Для всей SQLite-базы используйте согласованный backup API `better-sqlite3`:

```bash
docker compose exec planner node .output/server/cli.mjs backup:database --output /data/planner-$(date +%F).sqlite
```

Пример строки crontab на сервере (подставьте путь к проекту):

```cron
0 2 * * * cd /opt/splanner && docker compose exec -T planner node .output/server/cli.mjs backup:database --output /data/planner-$(date +\%F).sqlite
```

После создания копируйте файл за пределы volume, контролируйте место и срок хранения. Регулярно проверяйте восстановление на копии: остановите тестовый экземпляр, подмените его `DB_PATH` резервным файлом, запустите и проверьте `/health`, открытие двух workspace и запись в тестовом workspace.

Старые данные IndexedDB не удаляются. На прежнем origin откройте созданный администратором workspace, войдите в режим редактирования и в «Данные и backup» выберите «Найти локальный план». Предпросмотр позволяет скачать оригинал до переноса. При смене origin скачайте JSON в прежней версии и импортируйте файл в новом workspace. Экспорты v1/v2/v3 принимаются; код и PIN в JSON не входят.

## Переменные окружения

| Имя | Значение |
|---|---|
| `PORT` | HTTP-порт Express, по умолчанию `3101` |
| `DB_PATH` | Файл SQLite, по умолчанию `./data/planner.sqlite` |
| `PUBLIC_ORIGIN` | Точный browser origin для проверки изменяющих запросов и `Secure` cookie при HTTPS |
| `JSON_LIMIT` | Лимит JSON запроса, по умолчанию `10mb` |
| `SESSION_HOURS` | Срок разрешения на редактирование, по умолчанию 8 часов |
| `TRUST_PROXY` | `1` при одном доверенном reverse proxy |

`GET /health` проверяет БД. Сервер корректно закрывает HTTP и SQLite при SIGINT/SIGTERM. При конфликте версий клиент сообщает о новой версии; автоматического объединения изменений нет.
