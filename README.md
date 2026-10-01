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

## Стек Portainer из GHCR

Для Docker Standalone используйте `compose.portainer.yaml`. Он скачивает готовый образ из GHCR, публикует порт `3101`, проверяет `/health` и сохраняет SQLite (включая WAL/SHM), импорты и файлы backup в `/opt/splanner/data` на Docker-хосте. Каталог сохраняется при пересоздании или удалении стека. Контейнер работает как `node` (UID/GID `1000:1000`); подготовьте каталог на хосте выбранного Portainer environment:

```bash
sudo install -d -m 0750 -o 1000 -g 1000 /opt/splanner/data
```

В Portainer откройте **Stacks → Add stack**, укажите имя `splanner` и вставьте содержимое `compose.portainer.yaml` в **Web editor**. При загрузке из Git укажите этот файл в **Compose path**. В **Environment variables** задайте:

| Переменная | Значение |
|---|---|
| `DOMAIN` | Домен Traefik, по умолчанию `splanner.samolyev.ru` |
| `PUBLIC_ORIGIN` | По умолчанию `https://${DOMAIN}`; можно переопределить адресом без завершающего `/` |
| `TRAEFIK_NETWORK` | Внешняя Docker-сеть Traefik, по умолчанию `proxy_network` |
| `TRAEFIK_CERTRESOLVER` | Настроенный в Traefik ACME resolver, по умолчанию `letsencrypt` |
| `IMAGE_TAG` | По умолчанию `latest`; для фиксированной версии — `v1.0.0` или `sha-<полный SHA>` |
| `DATA_DIR` | Абсолютный каталог на Docker-хосте, по умолчанию `/opt/splanner/data`; создайте его с правами выше |
| `HOST_PORT` | По умолчанию `3101` |
| `BIND_ADDRESS` | По умолчанию `0.0.0.0`; `127.0.0.1`, если reverse proxy работает на этом же хосте вне Docker |
| `TRUST_PROXY` | По умолчанию `1` для одного reverse proxy; `0` при прямом доступе |
| `JSON_LIMIT` | По умолчанию `10mb` |
| `SESSION_HOURS` | По умолчанию `8` |

Стек подключается к существующей внешней сети `proxy_network`; Traefik должен быть подключён к той же сети и иметь entrypoint `websecure` и resolver `letsencrypt`. HTTPS-роутер отправляет запросы для `splanner.samolyev.ru` на порт контейнера `3101` и устанавливает `X-Forwarded-Proto=https`. Basic Auth и отдельный WebSocket-роутер не используются. DNS домена должен указывать на сервер Traefik.

Если образ приватный, добавьте в Portainer registry `ghcr.io` с пользователем `siailya` и GitHub PAT с `read:packages`, затем выберите этот registry при развёртывании. Секрет в Compose не нужен. Нажмите **Deploy the stack** и создайте workspace через **Containers → planner → Console**:

```bash
node .output/server/cli.mjs workspace:create --name "Команда A"
```

Для backup используйте ту же Console:

```bash
node .output/server/cli.mjs backup:database --output /data/planner-backup.sqlite
```

Файл появится в `DATA_DIR` на Docker-хосте. Для обновления измените `IMAGE_TAG` при необходимости и обновите стек с повторным скачиванием образа. Не запускайте несколько экземпляров с одним каталогом SQLite. При переносе с `compose.yaml` сначала остановите прежний контейнер и перенесите данные из его named volume в новый каталог с владельцем `1000:1000`.

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
