# Обзор проекта

**TuckTuck** — self-hosted панель учёта платежей и командных финансов: серверы, VPN, прокси, домены,
SaaS-подписки в одном списке с напоминаниями в Telegram + **Finance Board** — доска расходов/доходов
команды с балансами (команда → проект → участник), approve-воркфлоу через Telegram-бота и входом в
панель через TG WebApp. Для одного человека или маленькой команды. Установка одной командой
(`setup.sh` через `curl | sh`).

## Finance Board (с 2026-11-25)

- ТЗ и макеты: `docs/finance-board/` (spec.md — источник правды по фиче).
- Домен: `TeamMember` (участник, опциональная связка с `User`), `Project`+`ProjectMember` (доли %),
  `Expense` (EXPENSE/PAYOUT; статусы PENDING→APPROVED/REJECTED; scope TEAM/PROJECT/MEMBER),
  `RecurringExpense` (генерация воркером), `Income`, `Distribution`, `FinanceAuditLog` (все мутации
  «было→стало»), `TelegramApprovedGroup`.
- Балансы вычисляемые (не хранятся): участник = начислено − выплачено; проект = доходы −
  распределённое − расходы; команда = всё входящее − начисления − расходы. Только APPROVED.
- `amountBase` фиксируется курсом из `rates.ts` на момент операции.
- TG-бот: FSM «добавить расход» (сумма→валюта→куда→название→теги→подтверждение), карточки аппрува
  финансисту (в группу или ЛС — куда создан расход), заглушка неизвестным, группы одобряются в
  админке, вход в панель через WebApp (`/api/auth/telegram`, HMAC initData).
- Права: `finance.view/submit/approve/manage/admin`; USER = `finance.submit`, финансист =
  `finance.approve` точечно.

## Стек

- **Next.js 16.1.6** (App Router, `output: standalone`), React 19, TypeScript 5
- **Prisma 7.10.1** + PostgreSQL 17 (generated client в `src/generated/prisma`, seed на `tsx prisma/seed.ts`)
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
