# Текущий фокус и следующие шаги

> Рабочий журнал задач. Новое — сверху. Закрытое удалять/сжимать, не раздувать.

## 2026-11-24 — Система памяти агентов

- [x] `CLAUDE.md` (общий управляющий документ) + `AGENTS.md` (тонкий указатель для Kimi)
- [x] Мозг `memory/*.md`: overview, workflow, environment, known-issues
- [x] `.cbmignore`, индексация codebase-memory (fast, persistence)
- [x] Serena: проект активен (`.serena/project.yml`, typescript), memories — тонкие указатели
- [ ] Дальше: реальные задачи по ROADMAP (файл локальный, вне репо)

## 2026-11-25 — Finance Board: UI (этап 3)

- [x] Навигация: группа «Финансы» в `nav-items.ts`/`app-shell.tsx`, иконка `Wallet`, дочерние пункты
- [x] i18n: блок `finance.*` + `nav.finance*` в `ru.ts`/`en.ts` (~100 ключей), плейсхолдеры синхронны
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
