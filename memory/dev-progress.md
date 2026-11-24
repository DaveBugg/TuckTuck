# Текущий фокус и следующие шаги

> Рабочий журнал задач. Новое — сверху. Закрытое удалять/сжимать, не раздувать.

## 2026-11-24 — Система памяти агентов

- [x] `CLAUDE.md` (общий управляющий документ) + `AGENTS.md` (тонкий указатель для Kimi)
- [x] Мозг `memory/*.md`: overview, workflow, environment, known-issues
- [x] `.cbmignore`, индексация codebase-memory (fast, persistence)
- [x] Serena: проект активен (`.serena/project.yml`, typescript), memories — тонкие указатели
- [ ] Дальше: реальные задачи по ROADMAP (файл локальный, вне репо)

## 2026-11-25 — Finance Board: Telegram-бот (этап 4)

- [x] `src/lib/tg-auth.ts` — валидация WebApp initData (HMAC_SHA256, свежесть `auth_date`)
- [x] `src/app/api/auth/telegram` + `/tg-app` — вход без пароля по WebApp, редирект на `/dashboard`
- [x] `src/app/api/profile/telegram-link` + UI в `/profile` — привязка/отвязка Telegram с deep-link
- [x] `src/lib/finance-service.ts` — общее создание Expense для API и бота; роут
      `/api/finance/expenses` переведён на сервис
- [x] FSM-бот: `tg-bot-fsm.ts` (чистые функции), `tg-bot-state.ts` (Redis + in-memory fallback),
      `tg-bot.ts` (обработчик update)
- [x] `/start <code>` — привязка TG-аккаунта; `/start`, `/expense`, «＋ Расход», «💰 Мой баланс»,
      WebApp-кнопка; заглушка для неизвестных пользователей
- [x] Аппрув-карточка PENDING-расхода: группа → в группу, ЛС → финансисту или всем с
      `finance.approve`; кнопки ✅/❌; уведомление автору
- [x] Группы Telegram: `TelegramApprovedGroup`, создание при первом апдейте, переключатель active в
      настройках; неподтверждённые группы — молчание
- [x] `src/lib/telegram.ts` — `setWebhook` теперь запрашивает
      `allowed_updates: [callback_query, message, my_chat_member]`
- [x] `src/app/api/settings/finance` + `settings/telegram-groups` + UI в `/settings`: валюты, теги,
      финансист, список групп
- [x] i18n: блок `finance.bot.*`, `finance.settings.*`, `profile.telegram.*` в `ru.ts`/`en.ts`
- [x] Unit-тесты: `tests/unit/tg-auth.test.ts`, `tests/unit/tg-bot-flow.test.ts`; добавлены в
      `test:unit`
- [x] Проверки: `npm run type-check`, `npm run lint`, `npm test` (154 passed/1 skipped),
      `npm run build` — все чисто

## 2026-11-25 — Finance Board: UI (этап 3)

- [x] Навигация: группа «Финансы» в `nav-items.ts`/`app-shell.tsx`, иконка `Wallet`, дочерние пункты
- [x] i18n: блок `finance.*` + `nav.finance*` в `ru.ts`/`en.ts` (~100 ключей), плейсхолдеры
      синхронны
- [x] Общий UI-код: `src/app/(with-layout)/finance/types.ts`, `helpers.tsx` (формат денег, бейджи)
- [x] `OperationDialog.tsx` — универсальный диалог создания/правки расхода/выплаты/дохода с
      распределением по долям проекта
- [x] `/finance` — доска: карточки, балансы участников/проектов, последние операции, предстоящая
      периодика
- [x] `/finance/expenses` — фильтры, inline approve/reject, правка/удаление по правам
- [x] `/finance/income` — доходы с распределённой суммой и остатком, фильтры по периоду/проекту
- [x] `/finance/projects` — карточки проектов, баланс, участники, доли, архив; диалоги
      `ProjectForm`, `MembersEditDialog`, `DistributionDialog`
- [x] `/finance/team` — таблица участников, начислено/выплачено/баланс, привязка/отвязка учётки,
      деактивация; диалоги `MemberForm`, `LinkUserDialog`
- [x] `/finance/audit` — журнал с фильтрами по сущности/действию, диалог diff before/after
- [x] Проверки: `npm run lint`, `npm test` (134 passed/1 skipped), `npm run build` — все чисто

## 2026-11-24 — Finance Board (командная доска по расходам)

- [x] ТЗ: `docs/finance-board/spec.md` (домен, балансы, периодика, права, API, UX, этапы, открытые
      вопросы §12)
- [x] Макеты: `docs/finance-board/mockups/*.html` (index/expenses/income/projects/team/bot-flow),
      визуально проверены
- [x] Утверждено пользователем с доработками: approve-воркфлоу (финансист,
      PENDING/APPROVED/REJECTED), TG-бот (FSM расхода, быстрые валюты/теги, аппрув в группе или ЛС),
      вход через WebApp (`/api/auth/telegram`), заглушка неизвестным, одобрение групп через админку,
      `FinanceAuditLog` для правок — всё внесено в spec §3/§5а/§5б/§6/§7/§8/§10/§11/§12
- [x] **Этап 1 §11**: Prisma-модели (`TeamMember`, `Project`, `ProjectMember`, `Expense`,
      `RecurringExpense`, `Income`, `Distribution`, `FinanceAuditLog`, `TelegramApprovedGroup`),
      поля `User.telegram*`, `AppSettings.finance*`, миграция `20261124231913_finance_board`,
      permissions (`finance.view/submit/approve/manage/admin`), dev-seed
- [x] Инфра линта (побочно): `next lint` удалён в Next 16 → `eslint .`; `eslint-config-next` — flat
      config, FlatCompat выкинут; `prettier --write` по всему репо (линт до этого никогда не
      работал); мёртвый `src/lib/react-apexcharts-safe.tsx` удалён (ссылался на несуществующий
      `react-apexcharts-original`, ломал type-check); новые compiler-правила react-hooks v6
      (`set-state-in-effect`, `static-components`) выключены — код писался до них
- [x] **Этап 2 §11**: API (expenses/incomes/projects/members/distributions + summary), аудит-лог,
      юнит-тесты формул и статусов
- [ ] После релиза и тестов: обновить описание репозитория под новое направление проекта

## Ближайшие задачи

- Брать из `ROADMAP.md` / запросов пользователя. После каждой вехи — обновлять этот файл и
  затронутые `memory/*.md`.
