# Окружение и деплой

> Секреты здесь не храним — только где что лежит. Значения — в `.env` (локально) и в `.env`
> установки на сервере.

## Локальная разработка

```bash
cp .env.example .env          # минимум TUCKTUCK_JWT_SECRET
docker compose -f docker-compose.dev.yml up -d
npm install && npm run db:deploy && npm run db:seed   # seed печатает пароль админа один раз
npm run dev                   # http://localhost:3000
```

## Прод

- Серверу нужен только Docker. Образы готовые из GHCR (`ghcr.io/davebugg/tucktuck{,-migrate}`),
  сборка — в CI.
- Установка/обновление: `curl -fsSL .../setup.sh | TUCKTUCK_DOMAIN=... sh` — оставляет каталог с
  `docker-compose.yml`, `.env`, `deploy.sh`. Обновление — та же команда без переменных.
- Деплой вручную: `docker compose pull && ./scripts/deploy.sh` (миграции управляемо, профиль
  `tools`).
- Воркер напоминаний: `docker compose --profile workers up -d tucktuck-notify` (тот же образ,
  `node notify-worker.mjs`).
- HTTPS: Caddy на 80/443. Два режима — Let's Encrypt сам (`TUCKTUCK_TLS_DIRECTIVE` пусто) или свои
  сертификаты в `caddy/certs` (напр. Cloudflare Origin).

## Env-переменные (см. `.env.example`)

| Переменная                                            | Назначение                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `POSTGRES_*`                          | PostgreSQL (порт наружу не публикуется; снаружи — только ssh-туннель)                                     |
| `TUCKTUCK_JWT_SECRET`                                 | подпись JWT-сессий                                                                                        |
| `TUCKTUCK_ENCRYPTION_KEY`                             | шифрование кредов серверов в БД                                                                           |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`         | капча; site key публичен, отдаётся через `/api/config`                                                    |
| `TELEGRAM_PROXY_URL`                                  | прокси до Telegram API                                                                                    |
| `TUCKTUCK_PUBLIC_URL`                                 | публичный https — нужен вебхуку Telegram (кнопки под напоминаниями); без него напоминания идут без кнопок |
| `TUCKTUCK_WORKER_TOKEN`                               | токен внутренних вызовов воркера                                                                          |
| `TUCKTUCK_DOMAIN`, `TUCKTUCK_PORT`, `TUCKTUCK_PREFIX` | домен, порт (127.0.0.1:3000→3000), префикс имён контейнеров                                               |
| `NOTIFY_INTERVAL_SEC`                                 | интервал воркера (дефолт 300)                                                                             |
| `REDIS_URL`                                           | кеш курсов валют; недоступность не фатальна                                                               |
| `TUCKTUCK_HOST_PROC` / `TUCKTUCK_HOST_ROOT`           | хостовые `/proc` и `/` (ro) — метрики сервера, не контейнера                                              |
| `NEXT_PUBLIC_*`                                       | запекаются при сборке → задаются переменными репозитория в CI, не на сервере                              |

## CI

`.github/workflows/ci.yml`: юнит-тесты на каждый push; на `main` — сборка и публикация образов app +
migrator в GHCR (теги `latest`, `sha-<short>`, semver из git-тегов).
