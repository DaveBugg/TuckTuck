# Карта архитектуры: «где найти X»

Next.js 16 App Router. Страницы — `src/app`, API — `src/app/api`, логика — `src/lib`, UI —
`src/components`.

## Страницы (`src/app`)

| Путь                          | Роль                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `/`                           | Лендинг / редирект на дашборд или логин               |
| `/auth/login`, `/auth/logout` | Вход/выход (группа `(with-nonlayout)` — без сайдбара) |
| `/dashboard`                  | Ближайшие оплаты, расход, здоровье серверов           |
| `/resources`                  | Единый список оплачиваемых ресурсов                   |
| `/users`                      | Пользователи и сессии (ADMIN)                         |
| `/settings`                   | Прокси, TZ, retention, валюта, капча, финансы/бот     |
| `/notifications`              | Telegram-боты, чаты, фильтры, тестовая отправка       |
| `/profile`                    | Смена пароля, 2FA, язык, сессии, привязка Telegram    |
| `/tg-app`                     | Точка входа Telegram WebApp                           |
| `/finance`                    | Доска: балансы, операции, предстоящая периодика       |
| `/finance`                    | Доска: балансы, операции, предстоящая периодика       |
| `/finance/expenses`           | Расходы/выплаты, статусы, апрув                       |
| `/finance/income`             | Доходы и распределения                                |
| `/finance/projects`           | Проекты, участники, доли, архив                       |
| `/finance/team`               | Тиммейты, привязка учёток                             |
| `/finance/audit`              | Журнал изменений с diff before/after                  |

## API (`src/app/api`) — по подсистемам

- **auth**: `auth/login` (rate-limit+Turnstile+2FA→JWT-куки), `auth/logout`, `auth/sessions`,
  `auth/me`, `auth/2fa/{setup,verify,disable}`, `auth/change-password`, `auth/telegram` (вход по
  WebApp initData)
- **resources**: `resources` (GET список с фильтрами/сортировкой, POST создание+дефолтные
  напоминания), `resources/totals`, `resources/[id]` (PATCH/DELETE), `resources/[id]/pay` (сдвиг
  `nextPaymentAt`), `resources/[id]/agent` (токен), `resources/[id]/agent/install` (SSH,
  NDJSON-стрим)
- **monitoring**: `monitoring`, `monitoring/[id]`, `monitoring/[id]/history` (1/7/14/30д),
  `monitoring/self` (+`/enable`), `monitoring/rollup`, `ingest/metrics` (приём от агента по токену)
- **notify**: `notify/bots` (+`[id]`, `[id]/test`, `[id]/webhook`), `notify/check`, `notify/run`
  (воркер/ручной прогон), `notify/webhook/[botId]` (callback-кнопки напоминаний + FSM-бот)
- **profile**: `profile/telegram-link` (GET/POST/DELETE — привязка/отвязка Telegram)
- **settings**: `settings/finance` (GET/PATCH — валюты/теги/финансист),
  `settings/telegram-groups` (+`[id]/approve` — одобрение групп)
- **finance**: `finance/expenses` (GET/POST + `[id]` PATCH/DELETE + `[id]/approve|reject`),
  `finance/incomes` (GET/POST + `[id]` PATCH/DELETE, мгновенное распределение),
  `finance/distributions` (ручное распределение с проверкой остатка), `finance/projects` (+`[id]`,
  `[id]/members`), `finance/members` (+`[id]/link-user`), `finance/summary`, `finance/audit`
- **прочее**: `catalog`, `config` (публичный ключ Turnstile), `settings`, `rates`, `users`
  (+`[id]/reset-password`), `health` (Docker/деплой)

## `src/lib` — модули

| Файл                                             | Назначение                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `auth.ts`                                        | JWT (jose), сессии в БД, `requirePermission`, `getAuthUser`                 |
| `permissions.ts`                                 | Матрица прав, изоморфная (edge/server/client); проверка permission, не роли |
| `prisma.ts`                                      | Singleton PrismaClient                                                      |
| `resources.ts`                                   | Видимость по группам, сдвиг периода, типы/валюты                            |
| `spend.ts`                                       | Распределение платежей по календарным месяцам                               |
| `rates.ts`                                       | Курсы фиата/крипты, два fallback-источника                                  |
| `settings.ts`                                    | Глобальные настройки, двухуровневый кеш (Redis/память)                      |
| `redis.ts`                                       | Ленивый singleton Redis, fail-soft                                          |
| `rate-limit.ts`                                  | Лимитер входа (Redis + in-memory fallback)                                  |
| `turnstile.ts`                                   | Проверка Cloudflare Turnstile                                               |
| `secret-crypto.ts`                               | AES-256-GCM для токенов ботов/кредов/прокси                                 |
| `telegram.ts`                                    | Тонкий клиент Bot API: send/edit/webhook                                    |
| `notify.ts`                                      | Отбор напоминаний, фильтры ботов, тексты                                    |
| `notify-proxy.ts`                                | Выбор прокси: бота → глобальный → env                                       |
| `notify-webhook.ts`                              | Секрет вебхука, публичный адрес                                             |
| `proxy-dispatcher.ts`                            | HTTP/SOCKS5-прокси для fetch/undici                                         |
| `ssh-install.ts`                                 | SSH-установка агента (ssh2, TOFU, ключ не хранится)                         |
| `monitoring.ts`                                  | Статус здоровья, пороги — чистые функции                                    |
| `self-metrics.ts`                                | Метрики хоста из `/host/proc`                                               |
| `metrics-history.ts` / `metrics-rollup.ts`       | История метрик, SQL-свёртка и чистка                                        |
| `panel-url.ts`                                   | Публичный адрес панели                                                      |
| `finance.ts`                                     | Чистые функции: балансы, `splitIncome`, scope/kind, approve-статусы         |
| `finance-api.ts`                                 | Хелперы API Finance: парсинг тел, конвертация в `amountBase`                |
| `finance-audit.ts`                               | `writeAudit` + сериализация снимков Decimal/Date/bigint                     |
| `finance-service.ts`                             | Создание Expense: подготовка данных + запись + аудит (общее для API и бота) |
| `tg-auth.ts`                                     | Чистая валидация Telegram WebApp initData (HMAC, свежесть)                 |
| `tg-bot-fsm.ts`                                  | Чистые функции бота: парсинг сумм, клавиатуры, маршрутизация аппрува       |
| `tg-bot-state.ts`                                | Состояние FSM-диалога: Redis + in-memory fallback, TTL 10 мин               |
| `tg-bot.ts`                                      | Обработчик входящих update: /start, FSM расхода, аппрув, баланс, группы     |
| `list-query.ts`                                  | `parseListParams`, `toApiError` — общий каркас CRUD-роутов                  |
| `client-api.ts`                                  | Клиентский fetch (`apiFetch`/`apiJson`), 401 → логин                        |
| `i18n/*`                                         | Словари ru/en, Intl-plurals, форматы дат/чисел                              |
| `date-value.ts`, `timezone.ts`, `quiet-hours.ts` | Даты, пояса, окна оповещений                                                |

**Паттерн:** тяжёлых классов-сервисов нет; модули чистых функций + небольшие async-хелперы;
singletons — prisma, redis, кеш настроек. Новую логику с состоянием/вариантами поведения оформлять
классом — не плодить копии функций.

## `src/components`

`app-shell.tsx`+`nav-items.ts` (оболочка/меню) · `data-table.tsx` (server-driven таблица:
поиск/сорт/фильтры/действия) · `monitoring/{metrics,history}.tsx` · `ui/*` (shadcn, собственность
репо) · `confirm-dialog.tsx` (свои окна вместо `confirm()`) · `i18n-provider.tsx`,
`theme-provider.tsx` · `captcha/turnstile.tsx`

## `src/app/(with-layout)/finance` — UI Finance Board

`page.tsx` (server, `displayCurrency` из `getSettings()`) → `FinanceDashboard.tsx`;
`expenses/page.tsx` → `ExpenseList.tsx` + фильтры/inline-действия; `income/page.tsx` →
`IncomeList.tsx`; `projects/page.tsx` → `ProjectList.tsx` + диалоги `ProjectForm`,
`MembersEditDialog`, `DistributionDialog`; `team/page.tsx` → `TeamList.tsx` + диалоги `MemberForm`,
`LinkUserDialog`; `audit/page.tsx` → `AuditLogList.tsx` + диалог diff. Общий код: `types.ts`,
`helpers.tsx`, `OperationDialog.tsx` (создание/правка расхода/выплаты/дохода).

## Prisma (`prisma/schema.prisma`)

`User`, `Session` (мультисессии по `jti`, ревокация), `Group`/`GroupMember`, `Provider`,
`Tag`/`ResourceTag`, **`Resource`** (SERVER/VPN/PROXY/DOMAIN/SERVICE — одна модель на всё
оплачиваемое), `ResourceCredential`, `CredentialReveal` (журнал просмотров), `ResourcePayment`,
`PaymentReminder`, `ReminderDispatch` (дедуп отправок), `NotifyBot`, `NotifyBotChat`
(`allowedUserIds` для кнопок), `NotifyBotTag`, `NotifyMessage`, `ResourceMetric` (минутные),
`ResourceMetricRollup` (час/сутки), `AppSettings` (singleton: прокси/TZ/retention/валюта/язык/
`financeQuickCurrencies`/`financeQuickTags`/`financierUserId`).

## Интеграции

Telegram → `lib/telegram.ts`, `lib/notify.ts`, `notify-worker.mjs`, `api/notify/*` · ssh2 →
`lib/ssh-install.ts`, `api/resources/[id]/agent/install`, `public/{agent.sh,install.sh}` · Redis →
`lib/redis.ts` (rate-limit, курсы, настройки) · Caddy → `caddy/Caddyfile` · Turnstile →
`lib/turnstile.ts`, `components/captcha/turnstile.tsx`

## Аутентификация

Edge `src/middleware.ts`: подпись/срок JWT через jose, `PUBLIC_PATHS`, гейт по `ROUTE_PERMISSIONS`.
Server `lib/auth.ts`: сессия по `jti`, `revokedAt`/`isActive`, `lastSeenAt`. Куки: `tt_token`
(HttpOnly), `tt_user` (display), `tt_lang` (язык). Rate-limit по IP и логину до проверки пароля.

## Соглашения кода

- Файлы kebab-case; именованные экспорты, `export default` только у страниц.
- API-роут: `requirePermission(...)` в начале → локальный `parseBody` → `try/catch` →
  `toApiError(e, t)`; Prisma-коды: P2002→409, P2025/P2023→404, P2003→400.
- Клиент: `apiFetch`/`apiJson`, ошибки через `sonner`.
- i18n: ключи словаря, plural `key_one/few/many/other`, формат через `Intl`.

## Тесты (`tests/unit/`)

23 файла: notify, monitoring, worst-level, spend, totals, rate-limit, quiet-hours, permissions,
timezone, server-timezone, i18n, secret-crypto, panel-url, ssh-install, robots, list-query,
finance-balance, finance-distribute, finance-scope, finance-approval, finance-audit, tg-auth,
tg-bot-flow. Новый файл — добавить в скрипт `test:unit` в `package.json`.
