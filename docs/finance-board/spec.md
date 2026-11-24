# ТЗ: Командная доска по расходам (Finance Board)

> Статус: **черновик на утверждение**. После утверждения — реализация по этапам (§11). Макеты:
> `docs/finance-board/mockups/index.html` (открывается в браузере).

## 1. Цель

Расширить TuckTuck до командной доски учёта финансов: помимо учёта оплачиваемых ресурсов (уже есть)
— учёт расходов и доходов команды, проектов и участников, с балансами трёх уровней: **команда →
проект → участник**. Конвертация валют — на существующем `src/lib/rates.ts`.

## 2. Термины

| Термин                                        | Определение                                                                                                                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Тиммейт** (`TeamMember`)                    | Участник команды. Может существовать без учётной записи. Учётку (`User`) можно привязать позже — и в обе стороны: создать тиммейта → привязать юзера, или взять существующего юзера → привязать к тиммейту |
| **Проект** (`Project`)                        | Рабочая единица с участниками и долями (% дохода). Имеет собственный баланс                                                                                                                                |
| **Расход** (`Expense`)                        | Трата. Два вида: `EXPENSE` (расход) и `PAYOUT` (выплата участнику). Вешается на команду, проект или участника                                                                                              |
| **Периодический расход** (`RecurringExpense`) | Шаблон расхода с расписанием; порождает `Expense` автоматически                                                                                                                                            |
| **Доход** (`Income`)                          | Поступление на команду или проект. Может быть сразу (частично) распределён участникам в %                                                                                                                  |
| **Распределение** (`Distribution`)            | Начисление суммы участнику с баланса команды/проекта (по % или фиксированной суммой)                                                                                                                       |
| **Базовая валюта**                            | Валюта отчётности из настроек панели; все суммы хранят исходную валюту + пересчёт `amountBase`                                                                                                             |

## 3. Доменная модель (черновик Prisma)

```prisma
model TeamMember {
  id        String  @id @default(cuid())
  name      String
  position  String?              // роль/должность, свободный текст
  userId    String? @unique      // связь с учёткой, опционально
  user      User?   @relation(fields: [userId], references: [id])
  active    Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  projectMemberships ProjectMember[]
  distributions      Distribution[]
  expenses           Expense[]
}

model Project {
  id          String  @id @default(cuid())
  name        String
  description String?
  archived    Boolean @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members       ProjectMember[]
  incomes       Income[]
  expenses      Expense[]
  distributions Distribution[]
  recurring     RecurringExpense[]
}

model ProjectMember {
  projectId String
  memberId  String
  percent   Decimal? @db.Decimal(5, 2)  // доля дохода; null = без доли
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  member    TeamMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  @@id([projectId, memberId])
}

enum ExpenseKind { EXPENSE PAYOUT }
enum ExpenseStatus { PENDING APPROVED REJECTED }
enum FinanceScope { TEAM PROJECT MEMBER }

model Expense {
  id          String      @id @default(cuid())
  kind        ExpenseKind @default(EXPENSE)
  status      ExpenseStatus @default(APPROVED) // через бота/USER — PENDING
  title       String
  description String?
  amount      Decimal     @db.Decimal(14, 2)
  currency    String
  amountBase  Decimal     @db.Decimal(14, 2)  // пересчёт на момент создания
  date        DateTime    @default(now())
  scope       FinanceScope
  projectId   String?
  project     Project?    @relation(fields: [projectId], references: [id])
  memberId    String?
  member      TeamMember? @relation(fields: [memberId], references: [id])
  tags        String[]                         // быстрые теги (настраиваются в панели)
  recurringId String?                          // порождён шаблоном
  recurring   RecurringExpense? @relation(fields: [recurringId], references: [id])
  createdById String?
  approvedById String?                         // финансист, утвердивший расход
  approvedAt   DateTime?
  // Контекст Telegram-источника: куда слать аппрув (группа или ЛС)
  sourceChatId    String?
  sourceMessageId Int?
  createdAt   DateTime @default(now())
}

enum RecurringFrequency { DAILY WEEKLY MONTHLY YEARLY }

model RecurringExpense {
  id          String  @id @default(cuid())
  title       String
  description String?
  amount      Decimal @db.Decimal(14, 2)
  currency    String
  scope       FinanceScope
  projectId   String?
  project     Project? @relation(fields: [projectId], references: [id])
  memberId    String?
  member      TeamMember? @relation(fields: [memberId], references: [id])
  frequency   RecurringFrequency
  interval    Int     @default(1)        // каждые N дней/недель/месяцев/лет
  dayOfMonth  Int?                       // для MONTHLY/YEARLY
  nextRunAt   DateTime
  active      Boolean @default(true)
  expenses    Expense[]
  createdAt   DateTime @default(now())
}

model Income {
  id          String   @id @default(cuid())
  title       String
  description String?
  amount      Decimal  @db.Decimal(14, 2)
  currency    String
  amountBase  Decimal  @db.Decimal(14, 2)
  date        DateTime @default(now())
  projectId   String?                    // null = доход команды в целом
  project     Project? @relation(fields: [projectId], references: [id])
  distributions Distribution[]
  createdById String?
  createdAt   DateTime @default(now())
}

model Distribution {
  id        String   @id @default(cuid())
  memberId  String
  member    TeamMember @relation(fields: [memberId], references: [id])
  incomeId  String?                    // если распределено сразу из дохода
  income    Income?  @relation(fields: [incomeId], references: [id])
  projectId String?                    // null = с командного баланса
  project   Project? @relation(fields: [projectId], references: [id])
  amountBase Decimal @db.Decimal(14, 2) // начислено на баланс участника
  percent   Decimal? @db.Decimal(5, 2)
  note      String?
  createdAt DateTime @default(now())
}

// Особый лог всех изменений финансовых операций (ответ на вопрос №4):
// редактирование/удаление/аппрув фиксируется со снимками «было → стало».
model FinanceAuditLog {
  id        String   @id @default(cuid())
  actorId   String?                    // кто (User); null = бот/система
  action    String                     // CREATE | UPDATE | DELETE | APPROVE | REJECT
  entity    String                     // expense | income | distribution | recurring | ...
  entityId  String
  before    Json?
  after     Json?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
}

// Привязка Telegram к учётке (вопрос бота, см. §6а): код генерируется кнопкой
// «Привязать Telegram» в профиле, живёт короткое время, сгорает после /start.
// В User добавляются поля:
//   telegramUserId   BigInt? @unique   — привязанный TG-аккаунт
//   telegramLinkCode String? @unique   — одноразовый код для deep-link
//
// В AppSettings добавляются поля:
//   financeQuickCurrencies Json — кнопки валют бота (дефолт ["USD","EUR","RUB","USDT","BTC","ETH","XMR"])
//   financeQuickTags       Json — 5–8 популярных тегов для кнопок
//   financierUserId        String? — финансист по умолчанию (получает аппрувы в ЛС)
```

Инварианты:

- `scope=TEAM` → `projectId` и `memberId` пусты; `scope=PROJECT` → `projectId` обязателен;
  `scope=MEMBER` → `memberId` обязателен (+ опционально `projectId` для контекста).
- `PAYOUT` всегда имеет `memberId` (выплата конкретному участнику).
- Сумма долей проекта (`ProjectMember.percent`) не обязана быть 100% — остаток остаётся на балансе
  проекта.

## 4. Балансы (вычисляемые, не хранимые)

Считаются в базовой валюте агрегациями Prisma (при необходимости — SQL view позже). **В балансы
входят только `Expense` со статусом `APPROVED`** — `PENDING`/`REJECTED` видны в списках, но на цифры
не влияют.

| Баланс       | Формула                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Участник** | Σ `Distribution.amountBase` − Σ `Expense(PAYOUT, memberId).amountBase`                                                                                   |
| **Проект**   | Σ `Income(projectId).amountBase` − Σ `Distribution(projectId).amountBase` − Σ `Expense(EXPENSE, scope→project).amountBase`                               |
| **Команда**  | Σ всех `Income.amountBase` − Σ всех `Distribution` − Σ всех `Expense(EXPENSE)` − Σ всех `Expense(PAYOUT)` — т.е. «живых денег» после начислений и выплат |

Выплата (`PAYOUT`) уменьшает и баланс участника, и баланс команды — это движение «начислено →
выплачено».

`amountBase` фиксируется на момент создания операции (курс из `rates.ts`), чтобы история не плясала
при смене курса.

## 5. Периодические расходы

- Шаблон `RecurringExpense` с `nextRunAt`; порождает `Expense` и сдвигает `nextRunAt` по
  `frequency`+`interval` (+`dayOfMonth`).
- Генерация — тем же механизмом, что рассылка напоминаний: воркер дёргает
  `POST /api/finance/recurring/run` (добавить тик в `notify-worker.mjs`) + ручной прогон из UI.
  Дедуп — по `(recurringId, date)` на уровне БД, как `ReminderDispatch`.
- Вешается на команду, проект или участника (`scope`).
- На доске — блок «предстоящие периодические списания» с ближайшими `nextRunAt`.

## 5а. Утверждение расходов (approve-воркфлоу)

- Расход, созданный пользователем без `finance.approve` (из UI или через бота), рождается в статусе
  `PENDING`.
- Утверждает **финансист** — пользователь с `finance.approve` и привязанным Telegram. Финансист по
  умолчанию назначается в настройках панели (`financierUserId`); аппрув может дать любой обладатель
  `finance.approve`.
- Кнопки ✅ Утвердить / ❌ Отклонить приходят **туда же, где создан расход**: из группы TG —
  карточкой в ту же группу, из ЛС — финансисту в ЛС. Решение редактирует карточку (статус + кем
  решено) и уведомляет автора.
- `REJECTED` остаётся в списке с бейджем (не удаляется), `PENDING` можно отредактировать автором до
  решения.
- Каждое решение и правка пишется в `FinanceAuditLog`.

## 5б. Telegram-бот: быстрые действия

Расширение существующего бота (`lib/telegram.ts`, вебхук `api/notify/webhook/[botId]`). FSM диалога
— в Redis (ключ `chatId:userId`, TTL ~10 мин, fail-soft на память).

**Привязка учётки:** кнопка «Привязать Telegram» в профиле генерирует одноразовый код → ссылка
`t.me/<bot>?start=<code>` → бот по `/start <code>` привязывает `telegramUserId` к `User`. Если
`telegramUserId` уже есть — бот сразу показывает меню быстрых действий.

**Флоу «Добавить расход»** (`/expense` или кнопка меню; в группе — по команде/упоминанию, бот
реагирует на конкретного юзера):

1. **Сумма** — текстом.
2. **Валюта** — инлайн-кнопки по 3–4 в ряд из настраиваемого списка панели (дефолт: `USD EUR RUB` /
   `USDT BTC ETH` / `XMR`), плюс кнопка «Другая» (ввод вручную).
3. **Куда** — кнопки: Команда / Проект / Участник; затем выбор конкретного проекта или участника
   кнопками (список с пагинацией при >8).
4. **Название + описание** — одним сообщением (`Название — описание`, описание опционально).
5. **Теги** (опционально) — кнопки 5–8 популярных из настроек (мультивыбор + «Готово») или ввод
   вручную, или «Пропустить».
6. **Подтверждение** — карточка с итогом: «Отправить на утверждение» / «Отмена».
7. Расход `PENDING` → карточка финансисту по правилам §5а. Если у автора есть `finance.approve` —
   сразу `APPROVED`, без карточки.

Дальше (после MVP): быстрые действия «добавить доход», «мой баланс», «баланс проекта».

**Вход в приложение через бота (Telegram WebApp).** У активированного юзера с привязанным
`telegramUserId` в меню бота — кнопка «Открыть панель» (WebApp на `TUCKTUCK_PUBLIC_URL`).
Авторизация без пароля: WebApp шлёт `initData` на `POST /api/auth/telegram`; сервер проверяет
подпись (`HMAC-SHA256`, ключ `HMAC("WebAppData", botToken)`), свежесть `auth_date` (≤24ч), находит
активного `User` по `telegramUserId`, создаёт обычную `Session` и ставит те же cookie — дальше
работа как в вебе. Связки TG↔учётки нет — WebApp открывает страницу логина.

**Неизвестные пользователи.** Юзер TG без привязки к учётке получает всегда одинаковую заглушку:
«Доступ ограничен. Обратитесь к администратору.» Без кнопок, без намёков на состояние системы,
логируется.

**Группы — только после одобрения в админке.** Бот в неподтверждённой группе молчит (не отвечает, не
реагирует). При добавлении в группу бот фиксирует её (`TelegramApprovedGroup`, `active=false`) и
уведомляет админов; админ одобряет в панели (список групп с переключателем). Отключение группы
мгновенно глушит бота в ней.

```prisma
model TelegramApprovedGroup {
  id           String   @id @default(cuid())
  chatId       BigInt   @unique
  title        String?
  active       Boolean  @default(false) // одобряется через админку
  approvedById String?
  createdAt    DateTime @default(now())
}
```

## 6. Права (в стиле проекта: permission, не роль)

Новые permission в `src/lib/permissions.ts`:

- `finance.view` — просмотр раздела и балансов;
- `finance.submit` — создание расходов на утверждение (в т.ч. через бота);
- `finance.approve` — утверждение/отклонение расходов (финансист), ручное распределение балансов;
- `finance.manage` — добавление/редактирование операций, периодики;
- `finance.admin` — управление проектами, участниками, привязка учёток, настройки валют/тегов,
  финансист по умолчанию.

Роли получают наборы одной строкой в `ROLE_PERMISSIONS`: ADMIN — всё; USER — `finance.submit`
(утверждено: юзер может добавить расход на аппрув). `finance.approve` выдаётся точечно финансисту
независимо от роли.

## 7. UX / структура раздела

Новая группа в сайдбаре **«Финансы»** (иконка `wallet`), страницы:

| Страница            | Содержимое                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/finance`          | **Доска**: карточки балансов (команда / к выплате участникам / расходы за месяц / доходы за месяц), таблица балансов участников, таблица балансов проектов, лента последних операций, предстоящие периодические списания |
| `/finance/expenses` | Таблица расходов и выплат (фильтры: период, вид, scope, проект, участник; поиск), быстрый диалог «Добавить расход», вкладка «Периодические»                                                                              |
| `/finance/income`   | Таблица доходов + диалог «Добавить доход» с мгновенным распределением по %                                                                                                                                               |
| `/finance/projects` | Карточки/таблица проектов: баланс, участники с долями, действия (добавить участника, распределить баланс, архив)                                                                                                         |
| `/finance/team`     | Таблица тиммейтов: баланс, учётка (привязать/отвязать), активность                                                                                                                                                       |

Принципы UX (минимум действий):

- **Стилизация — только существующая дизайн-система проекта**: компоненты `src/components/ui/*`
  (shadcn), `data-table.tsx`, `confirm-dialog.tsx`, тема Tailwind v4 приложения. Макеты в `mockups/`
  задают композицию и флоу, не стили.
- **Кнопка «+» на доске** — универсальный диалог добавления операции (расход/выплата/доход
  переключаются сегментом), поля подтягиваются по выбранному scope; 3–4 обязательных поля максимум.
- Доход: чекбокс «распределить сразу по долям проекта» — по умолчанию включён, суммы считаются
  живьём, остаток уходит на баланс проекта; ручная правка сумм/процентов тут же.
- Проект: кнопка «Распределить баланс» — диалог с % (подставлены доли) или суммами; две вкладки.
- Тиммейт: привязка учётки — селект существующих юзеров без тиммейта, либо «создать учётку» (переход
  в `/users` с предзаполнением).
- Все таблицы — на существующем `data-table.tsx`; подтверждения — `confirm-dialog.tsx`; ошибки —
  `sonner`; i18n — ru/en словари.

Дополнения к UI (утверждение и бот):

- Таблица расходов: колонка и фильтр статуса (`На утверждении`/`Утверждён`/`Отклонён`), кнопки ✅/❌
  в строке для обладателя `finance.approve`.
- `/settings` — блок «Финансы и бот»: редактор быстрых валют (чипы), редактор популярных тегов
  (5–8), выбор финансиста по умолчанию, список TG-групп с одобрением/отключением.
- `/profile` — кнопка «Привязать Telegram» (генерирует код + deep-link ссылку, показывает статус
  привязки, «Отвязать»).
- `/finance/audit` — журнал `FinanceAuditLog`: фильтры по сущности/действию/актору, раскрытие строки
  с diff «было → стало».

## 8. API (черновик)

```
GET/POST            /api/finance/expenses            # POST: PENDING без finance.approve
PATCH/DELETE        /api/finance/expenses/[id]       # правки — в FinanceAuditLog
POST                /api/finance/expenses/[id]/approve
POST                /api/finance/expenses/[id]/reject
GET/POST            /api/finance/recurring
PATCH/DELETE        /api/finance/recurring/[id]
POST                /api/finance/recurring/run        # воркер + ручной прогон
GET/POST            /api/finance/incomes
PATCH/DELETE        /api/finance/incomes/[id]
GET/POST            /api/finance/distributions        # распределение баланса
GET/POST            /api/finance/projects
GET/PATCH/DELETE    /api/finance/projects/[id]
PUT                 /api/finance/projects/[id]/members  # состав и доли
GET/POST            /api/finance/members
PATCH/DELETE        /api/finance/members/[id]
POST                /api/finance/members/[id]/link-user # { userId | null }
GET                 /api/finance/summary              # балансы для доски
GET                 /api/finance/audit                # журнал изменений

# Telegram / бот
POST                /api/auth/telegram                # вход по WebApp initData → Session
POST/DELETE         /api/profile/telegram-link        # код привязки / отвязка
GET/PATCH           /api/settings/finance             # быстрые валюты, теги, финансист
GET                 /api/settings/telegram-groups     # список групп
POST                /api/settings/telegram-groups/[id]/approve   # { active }
# существующий webhook api/notify/webhook/[botId] — расширяется FSM-командами бота
```

Каркас хендлеров — по устоявшемуся паттерну: `requirePermission` → `parseBody` → `try/catch` →
`toApiError`; списки — через `parseListParams` (`list-query.ts`).

## 9. Конвертация валют

- Используем `src/lib/rates.ts` (фиат+крипта, Redis-кеш, fallback-источники).
- При создании операции считается `amountBase` в валюте из настроек панели; в UI показываем обе
  (исходная + базовая, как в ресурсах).
- Курс на дату операции исторически не хранится — фиксация курса в момент ввода (см. §4).
  Отображение в другой валюте — текущим курсом, пересчёт «на лету» только для просмотра.

## 10. Тесты

Новые `tests/unit/finance-*.test.ts` (добавить в `test:unit`):

- `finance-balance.test.ts` — формулы балансов (участник/проект/команда), граничные случаи; только
  `APPROVED` влияет на баланс;
- `finance-recurring.test.ts` — сдвиг `nextRunAt`, `dayOfMonth`, дедуп;
- `finance-distribute.test.ts` — распределение по %, остаток на проект, фиксированные суммы;
- `finance-scope.test.ts` — инварианты scope/kind (валидация parseBody);
- `finance-approval.test.ts` — переходы статусов, кто может аппрувить, маршрутизация карточки
  (группа vs ЛС);
- `tg-auth.test.ts` — валидация WebApp `initData` (подпись, свежесть), отказ
  неизвестному/неактивному;
- `tg-bot-flow.test.ts` — шаги FSM, парсинг суммы/валюты, заглушка неизвестному, молчание в
  неподтверждённой группе;
- `finance-audit.test.ts` — правки/удаления/аппрувы пишут «было → стало».

## 11. Этапы внедрения

1. **Миграции + домен**: Prisma-модели (включая `FinanceAuditLog`, `TelegramApprovedGroup`, поля
   `User.telegram*`), permissions, seed-данные для разработки.
2. **API**: expenses (со статусами и аппрувом)/incomes/projects/members/distributions + summary;
   аудит-лог; юнит-тесты формул и статусов.
3. **UI раздела**: доска + таблицы на `data-table`, диалоги; статусы и кнопки аппрува; настройки
   бота; привязка TG в профиле; i18n.
4. **Telegram-бот**: привязка по `/start <code>`, FSM «добавить расход», карточки аппрува
   (группа/ЛС), заглушки, одобрение групп, вход через WebApp (`/api/auth/telegram`).
5. **Периодика**: модель, генерация через воркер, вкладка в UI.
6. **Полировка**: сводки/графики на доске (простые бары на div'ах, без новых зависимостей),
   ре-индекс графа, обновление `memory/*`.

## 12. Решённые вопросы (утверждено)

1. **Права по ролям**: ADMIN — всё; USER — `finance.submit` (расход на аппрув); финансист получает
   `finance.approve` точечно. ✅
2. **Доход команды без проекта** — ручное распределение с командного баланса, без долей команды. ✅
3. **Отрицательные балансы** — разрешены, подсвечиваются красным. ✅
4. **Редактирование прошлых операций** — разрешено, каждая правка пишется в `FinanceAuditLog` (было
   → стало). ✅
5. **Удаление участника** — не удаляем, деактивируем (`active=false`). ✅
6. **Описание репозитория/позиционирование** — обновить после релиза и тестов, отдельной задачей
   (занесено в `memory/dev-progress.md`). ⏳
