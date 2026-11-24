# Обзор проекта

**TuckTuck** — self-hosted панель учёта платежей: серверы, VPN, прокси, домены, SaaS-подписки в
одном списке, отсортированном по дате следующего платежа, с напоминаниями в Telegram. Для одного
человека или маленькой команды. Установка одной командой (`setup.sh` через `curl | sh`).

## Стек

- **Next.js 16.1.6** (App Router, `output: standalone`), React 19, TypeScript 5
- **Prisma 6.19** + PostgreSQL 17
- **Redis 7** (ioredis) — кеш курсов валют и rate-cache, не хранилище
- **Tailwind CSS v4** + shadcn/ui (Radix) — `src/components/ui/` принадлежит репо
- Auth: JWT (jose) в cookie + middleware на edge; TOTP (otplib) для 2FA; Turnstile-капча
- SSH (ssh2) — установка агента мониторинга; socks — прокси до Telegram
- **Caddy** — обратный прокси с авто-HTTPS (Let's Encrypt или свои сертификаты)

## Топология (прод)

Контейнеры из готовых образов GHCR (`docker-compose.yml`, префикс имён — `TUCKTUCK_PREFIX`): `pg`
(порт наружу не опубликован) → `migrate` (профиль tools, разовый) → `redis` → `tucktuck`
(127.0.0.1:3000, монтирует хостовые `/proc` и `/` ro для метрик сервера) → `notify` (профиль
workers, `node notify-worker.mjs`, интервал `NOTIFY_INTERVAL_SEC`=300с) → `proxy` (Caddy, 80/443).

Локально: `docker-compose.dev.yml` поднимает инфра, приложение — `npm run dev`.

## Ключевые архитектурные решения

- Всё оплачиваемое — **одна строка `Resource` с `kind`** (не 5 моделей): единый список, общие
  платежи/напоминания/креды/теги.
- Проверка **permission, не роли**; `src/lib/permissions.ts` изоморфна (edge middleware, API, UI).
- Язык интерфейса — из cookie (БД читается раз, при входе): иначе это был бы самый частый запрос.
- Повторные отправки напоминаний заблокированы на уровне БД — будить воркер чаще безопасно.
- `NEXT_PUBLIC_*` запекаются при сборке → живут в переменных репозитория (CI), не в `.env` сервера.

## Команды

`npm run dev` · `build` · `test` (tsx --test, юнит в `tests/unit/`) · `type-check` (должен быть
чист) · `lint` / `format:check` · `db:migrate` / `db:deploy` / `db:seed` (печатает пароль админа
один раз).

CI (`.github/workflows/ci.yml`): юнит-тесты на каждый push; на `main` — сборка и публикация образов
app+migrate в GHCR (`latest`, `sha-<short>`, semver по тегам).
