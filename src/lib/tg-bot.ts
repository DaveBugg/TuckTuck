// Основной обработчик входящих обновлений Telegram-бота для Finance Board.
//
// Расширяет существующий webhook напоминаний: вызывается из
// api/notify/webhook/[botId]/route.ts для сообщений, callback-запросов по
// финансовым префиксам и событий my_chat_member.

import type { NotifyBot, User, Expense } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { hasPermission } from "./auth";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  esc,
  type InlineButton,
} from "./telegram";
import { makeT, type TFunc } from "./i18n/translate";
import { getSettings } from "./settings";
import { getRates } from "./rates";
import { memberBalance, canTransitionStatus } from "./finance";
import { prepareExpenseData, createExpense } from "./finance-service";
import { writeAudit } from "./finance-audit";
import { publicBaseUrl } from "./notify-webhook";
import {
  parseAmountText,
  normalizeCurrency,
  splitTitleDescription,
  buildCurrencyKeyboard,
  buildScopeKeyboard,
  buildProjectKeyboard,
  buildMemberKeyboard,
  buildTagsKeyboard,
  buildConfirmKeyboard,
  decideApprovalTarget,
  isFinanceCallback,
  type FsmState,
  type ProjectItem,
  type MemberItem,
  type ApprovalTarget,
} from "./tg-bot-fsm";
import { getFsmState, setFsmState, clearFsmState } from "./tg-bot-state";
import { canPressButtons } from "./notify-chat-access";

const RESTRICTED_TEXT = "finance.bot.restricted";

function tgUserId(n: number | string): bigint {
  return BigInt(String(n));
}

async function findUserByTg(id: number | string): Promise<User | null> {
  return prisma.user.findUnique({ where: { telegramUserId: tgUserId(id) } });
}

async function ensureGroup(chatId: number, title?: string) {
  const existing = await prisma.telegramApprovedGroup.findUnique({
    where: { chatId: tgUserId(chatId) },
  });
  if (existing) return existing;
  return prisma.telegramApprovedGroup.create({
    data: { chatId: tgUserId(chatId), title: title || "", active: false },
  });
}

function menuButtons(t: TFunc, publicUrl: string | null): InlineButton[][] {
  const rows: InlineButton[][] = [
    [{ text: t("finance.bot.btn.expense"), callback_data: "finmenu-expense" }],
    [{ text: t("finance.bot.btn.balance"), callback_data: "finmenu-balance" }],
  ];
  if (publicUrl) {
    rows.push([
      {
        text: t("finance.bot.btn.openPanel"),
        web_app: { url: `${publicUrl}/tg-app` },
      },
    ]);
  }
  return rows;
}

async function sendMenu(
  token: string,
  chatId: string,
  user: User,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  const publicUrl = publicBaseUrl();
  await sendMessage(
    token,
    chatId,
    t("finance.bot.welcome", { name: esc(user.name || user.email) }),
    menuButtons(t, publicUrl),
    proxy
  );
}

async function sendRestricted(token: string, chatId: string, proxy: string) {
  const t = makeT((await getSettings()).notifyLocale);
  await sendMessage(token, chatId, t(RESTRICTED_TEXT), [], proxy);
}

async function startExpense(
  token: string,
  chatId: string,
  userId: number | string,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  await setFsmState(chatId, userId, { step: "awaitAmount" });
  await sendMessage(
    token,
    chatId,
    t("finance.bot.expense.enterAmount"),
    [],
    proxy
  );
}

async function showCurrencies(
  token: string,
  chatId: string,
  userId: number | string,
  amount: number,
  proxy: string
) {
  const settings = await getSettings();
  const t = makeT(settings.notifyLocale);
  const currencies = Array.isArray(settings.financeQuickCurrencies)
    ? (settings.financeQuickCurrencies as string[]).filter(
        (c): c is string => typeof c === "string"
      )
    : [];
  await setFsmState(chatId, userId, { step: "awaitCurrency", amount });
  await sendMessage(
    token,
    chatId,
    t("finance.bot.expense.selectCurrency"),
    buildCurrencyKeyboard(currencies, t("finance.bot.currency.other")),
    proxy
  );
}

async function showScopes(
  token: string,
  chatId: string,
  userId: number | string,
  amount: number,
  currency: string,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  await setFsmState(chatId, userId, {
    step: "awaitScope",
    amount,
    currency,
  });
  await sendMessage(
    token,
    chatId,
    t("finance.bot.expense.selectScope"),
    buildScopeKeyboard({
      team: t("finance.bot.scope.TEAM"),
      project: t("finance.bot.scope.PROJECT"),
      member: t("finance.bot.scope.MEMBER"),
    }),
    proxy
  );
}

async function showProjects(
  token: string,
  chatId: string,
  userId: number | string,
  state: Extract<FsmState, { step: "awaitProject" }>,
  page: number,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  const projects: ProjectItem[] = await prisma.project
    .findMany({
      where: { archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
    .then(rows => rows.map(r => ({ id: r.id, name: r.name })));
  await sendMessage(
    token,
    chatId,
    t("finance.bot.expense.selectProject"),
    buildProjectKeyboard(projects, page),
    proxy
  );
}

async function showMembers(
  token: string,
  chatId: string,
  userId: number | string,
  state: Extract<FsmState, { step: "awaitMember" }>,
  page: number,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  const members: MemberItem[] = await prisma.teamMember
    .findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
    .then(rows => rows.map(r => ({ id: r.id, name: r.name })));
  await sendMessage(
    token,
    chatId,
    t("finance.bot.expense.selectMember"),
    buildMemberKeyboard(members, page),
    proxy
  );
}

async function askTitle(
  token: string,
  chatId: string,
  userId: number | string,
  state: Omit<Extract<FsmState, { step: "awaitTitle" }>, "step">,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  await setFsmState(chatId, userId, { ...state, step: "awaitTitle" });
  await sendMessage(
    token,
    chatId,
    `${t("finance.bot.expense.enterTitle")}\n${t(
      "finance.bot.expense.titleHint"
    )}`,
    [],
    proxy
  );
}

async function askTags(
  token: string,
  chatId: string,
  userId: number | string,
  state: Omit<
    Extract<FsmState, { step: "awaitTags" }>,
    "step" | "selectedTags"
  >,
  selectedTags: string[],
  proxy: string
) {
  const settings = await getSettings();
  const t = makeT(settings.notifyLocale);
  const tags = Array.isArray(settings.financeQuickTags)
    ? (settings.financeQuickTags as string[]).filter(
        (c): c is string => typeof c === "string"
      )
    : [];
  await setFsmState(chatId, userId, {
    ...state,
    step: "awaitTags",
    selectedTags,
  });
  await sendMessage(
    token,
    chatId,
    t("finance.bot.expense.selectTags"),
    buildTagsKeyboard(
      tags,
      new Set(selectedTags),
      t("finance.bot.tags.done"),
      t("finance.bot.tags.skip")
    ),
    proxy
  );
}

async function showConfirm(
  token: string,
  chatId: string,
  userId: number | string,
  state: Omit<Extract<FsmState, { step: "confirm" }>, "step">,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  await setFsmState(chatId, userId, { ...state, step: "confirm" });
  const scopeLabel = t(`finance.scope.${state.scope}`);
  const target = state.projectId
    ? (
        await prisma.project.findUnique({
          where: { id: state.projectId },
          select: { name: true },
        })
      )?.name || scopeLabel
    : state.memberId
      ? (
          await prisma.teamMember.findUnique({
            where: { id: state.memberId },
            select: { name: true },
          })
        )?.name || scopeLabel
      : scopeLabel;

  const lines = [
    t("finance.bot.expense.confirmTitle"),
    "",
    `<b>${t("finance.operation.amount")}</b>: ${state.amount} ${state.currency}`,
    `<b>${t("finance.operation.scope")}</b>: ${scopeLabel} ${
      state.projectId || state.memberId ? `(${esc(target)})` : ""
    }`,
    `<b>${t("finance.operation.name")}</b>: ${esc(state.title)}`,
  ];
  if (state.description) {
    lines.push(
      `<b>${t("finance.operation.description")}</b>: ${esc(state.description)}`
    );
  }
  if (state.tags.length) {
    lines.push(
      `<b>${t("finance.operation.tags")}</b>: ${state.tags.map(esc).join(", ")}`
    );
  }

  await sendMessage(
    token,
    chatId,
    lines.join("\n"),
    buildConfirmKeyboard(
      t("finance.bot.expense.send"),
      t("finance.bot.expense.cancel")
    ),
    proxy
  );
}

async function submitExpense(
  token: string,
  chatId: string,
  userId: number | string,
  user: User,
  state: Extract<FsmState, { step: "confirm" }>,
  proxy: string
) {
  const settings = await getSettings();
  const t = makeT(settings.notifyLocale);
  const rates = await getRates();
  const isGroup = chatId.startsWith("-");

  const data = prepareExpenseData(
    {
      title: state.title,
      description: state.description,
      amount: state.amount,
      currency: state.currency,
      kind: "EXPENSE",
      scope: state.scope,
      projectId: state.projectId,
      memberId: state.memberId,
      tags: state.tags,
    },
    t,
    settings.displayCurrency,
    rates.perUsd
  );
  if ("error" in data) {
    await sendMessage(token, chatId, esc(data.error), [], proxy);
    return;
  }

  const row = await createExpense({
    me: user,
    data,
    sourceChatId: isGroup ? chatId : "",
  });

  await clearFsmState(chatId, userId);

  if (row.status === "PENDING") {
    await sendMessage(token, chatId, t("finance.bot.expense.sent"), [], proxy);
    await sendApprovalCard(token, row, user, proxy);
  } else {
    await sendMessage(
      token,
      chatId,
      t("finance.bot.expense.created"),
      [],
      proxy
    );
  }
}

async function sendApprovalCard(
  token: string,
  expense: Expense,
  author: User,
  proxy: string
) {
  const settings = await getSettings();
  const t = makeT(settings.notifyLocale);
  const target = decideApprovalTarget(expense);

  const lines = [
    t("finance.bot.approval.title"),
    "",
    `<b>${t("finance.bot.approval.amount")}</b>: ${expense.amount} ${expense.currency}`,
    `<b>${t("finance.bot.approval.scope")}</b>: ${t(
      `finance.scope.${expense.scope}`
    )}`,
    `<b>${t("finance.bot.approval.author")}</b>: ${esc(
      author.name || author.email
    )}`,
  ];
  if (expense.title)
    lines.push(`<b>${t("finance.operation.name")}</b>: ${esc(expense.title)}`);

  const keyboard: InlineButton[][] = [
    [
      {
        text: t("finance.bot.btn.approve"),
        callback_data: `fina:${expense.id}`,
      },
      {
        text: t("finance.bot.btn.reject"),
        callback_data: `finr:${expense.id}`,
      },
    ],
  ];

  if ("dm" in target) {
    // ЛС финансисту: financierUserId → его telegramUserId, либо всем с finance.approve.
    const financierTgIds: bigint[] = [];
    if (settings.financierUserId) {
      const financier = await prisma.user.findUnique({
        where: { id: settings.financierUserId },
        select: { telegramUserId: true },
      });
      if (financier?.telegramUserId) {
        financierTgIds.push(financier.telegramUserId);
      }
    }
    if (!financierTgIds.length) {
      const approvers = await prisma.user.findMany({
        where: { isActive: true, telegramUserId: { not: null } },
        select: { id: true, telegramUserId: true, role: true },
      });
      for (const u of approvers) {
        if (u.telegramUserId && hasPermission(u.role, "finance.approve")) {
          financierTgIds.push(u.telegramUserId);
        }
      }
    }
    if (!financierTgIds.length) {
      // Некому аппрувить в ЛС — пишем в исходный чат, если он есть.
      if (expense.sourceChatId) {
        await sendMessage(
          token,
          expense.sourceChatId,
          lines.join("\n"),
          keyboard,
          proxy
        );
      }
      return;
    }
    for (const tid of financierTgIds) {
      await sendMessage(token, String(tid), lines.join("\n"), keyboard, proxy);
    }
  } else {
    await sendMessage(token, target.chatId, lines.join("\n"), keyboard, proxy);
  }
}

async function notifyAuthorDecision(
  token: string,
  expense: Expense,
  decisionText: string,
  proxy: string
) {
  const settings = await getSettings();
  const t = makeT(settings.notifyLocale);
  if (!expense.createdById) return;
  const author = await prisma.user.findUnique({
    where: { id: expense.createdById },
  });
  const text = `${decisionText}\n\n${esc(expense.title)}: ${expense.amount} ${expense.currency}`;
  if (author?.telegramUserId) {
    await sendMessage(token, String(author.telegramUserId), text, [], proxy);
  } else if (expense.sourceChatId) {
    await sendMessage(token, expense.sourceChatId, text, [], proxy);
  }
}

async function handleMyBalance(
  token: string,
  chatId: string,
  user: User,
  proxy: string
) {
  const t = makeT((await getSettings()).notifyLocale);
  const member = await prisma.teamMember.findUnique({
    where: { userId: user.id },
  });
  if (!member) {
    await sendMessage(token, chatId, t("finance.bot.balance.none"), [], proxy);
    return;
  }
  const [distributions, payouts] = await Promise.all([
    prisma.distribution.findMany({
      where: { memberId: member.id },
      select: { amountBase: true },
    }),
    prisma.expense.findMany({
      where: {
        memberId: member.id,
        kind: "PAYOUT",
        status: "APPROVED",
      },
      select: { amountBase: true },
    }),
  ]);
  const balance = memberBalance(distributions, payouts);
  const settings = await getSettings();
  await sendMessage(
    token,
    chatId,
    t("finance.bot.balance.title", {
      amount: `${balance.toFixed(2)} ${settings.displayCurrency}`,
    }),
    [],
    proxy
  );
}

async function handleStart(
  token: string,
  chatId: string,
  from: { id: number; username?: string; first_name?: string },
  text: string,
  proxy: string,
  user?: User | null
) {
  const args = text.trim().split(/\s+/);
  const code = args[1];

  if (code) {
    const ttlMs = 10 * 60 * 1000;
    const minCreatedAt = new Date(Date.now() - ttlMs);
    const linkResult = await prisma.user.updateMany({
      where: {
        telegramLinkCode: code,
        telegramLinkCodeAt: { gte: minCreatedAt },
      },
      data: {
        telegramUserId: tgUserId(from.id),
        telegramLinkCode: null,
        telegramLinkCodeAt: null,
      },
    });
    if (linkResult.count !== 1) {
      const t = makeT((await getSettings()).notifyLocale);
      await sendMessage(
        token,
        chatId,
        t("finance.bot.link.invalidCode"),
        [],
        proxy
      );
      return;
    }
    const linkUser = await prisma.user.findUnique({
      where: { telegramUserId: tgUserId(from.id) },
    });
    const t = makeT((await getSettings()).notifyLocale);
    if (!linkUser) {
      await sendMessage(
        token,
        chatId,
        t("finance.bot.error.general"),
        [],
        proxy
      );
      return;
    }
    await sendMessage(token, chatId, t("finance.bot.link.ok"), [], proxy);
    await sendMenu(token, chatId, linkUser, proxy);
    return;
  }

  if (!user) {
    await sendRestricted(token, chatId, proxy);
    return;
  }
  await sendMenu(token, chatId, user, proxy);
}

async function handleMessage(
  bot: NotifyBot,
  token: string,
  proxy: string,
  msg: any
) {
  const chat = msg.chat as { id: number; type: string; title?: string };
  const from = msg.from as {
    id: number;
    username?: string;
    first_name?: string;
  };
  const text = msg.text || "";
  const chatId = String(chat.id);
  const userId = from.id;

  const isGroup = chat.type === "group" || chat.type === "supergroup";
  if (isGroup) {
    const group = await ensureGroup(chat.id, chat.title);
    if (!group.active) return; // молчим в неподтверждённой группе
  }

  const user = await findUserByTg(from.id);

  if (text.startsWith("/start")) {
    await handleStart(token, chatId, from, text, proxy, user);
    return;
  }

  if (!user) {
    if (!isGroup) {
      await sendRestricted(token, chatId, proxy);
    }
    return;
  }

  const state = await getFsmState(chatId, userId);

  if (text === "/expense" || text === "＋ Расход") {
    await startExpense(token, chatId, userId, proxy);
    return;
  }

  if (text === "💰 Мой баланс") {
    await handleMyBalance(token, chatId, user, proxy);
    return;
  }

  switch (state.step) {
    case "awaitAmount": {
      const amount = parseAmountText(text);
      if (amount === null) {
        const t = makeT((await getSettings()).notifyLocale);
        await sendMessage(
          token,
          chatId,
          t("finance.err.amountRequired"),
          [],
          proxy
        );
        return;
      }
      await showCurrencies(token, chatId, userId, amount, proxy);
      return;
    }
    case "awaitCurrency": {
      const currency = normalizeCurrency(text);
      if (!currency) {
        const t = makeT((await getSettings()).notifyLocale);
        await sendMessage(
          token,
          chatId,
          t("finance.err.currencyRequired"),
          [],
          proxy
        );
        return;
      }
      await showScopes(token, chatId, userId, state.amount, currency, proxy);
      return;
    }
    case "awaitTitle": {
      const { title, description } = splitTitleDescription(text);
      if (!title) {
        const t = makeT((await getSettings()).notifyLocale);
        await sendMessage(
          token,
          chatId,
          t("finance.err.titleRequired"),
          [],
          proxy
        );
        return;
      }
      await askTags(
        token,
        chatId,
        userId,
        { ...state, title, description },
        [],
        proxy
      );
      return;
    }
  }

  // Если дошли сюди — неизвестная команда вне диалога. Молчим, как в группах.
}

async function handleCallback(
  bot: NotifyBot,
  token: string,
  proxy: string,
  cq: any
) {
  const from = cq.from as {
    id: number;
    username?: string;
    first_name?: string;
  };
  const message = cq.message as {
    chat: { id: number; type: string; title?: string };
    message_id: number;
  } | null;
  const data = String(cq.data || "");
  const chatId = message ? String(message.chat.id) : String(from.id);
  const userId = from.id;

  const isGroup =
    message &&
    (message.chat.type === "group" || message.chat.type === "supergroup");
  if (isGroup) {
    const group = await ensureGroup(message.chat.id, message.chat.title);
    if (!group.active) {
      await answerCallbackQuery(token, cq.id, undefined, false, proxy);
      return;
    }
  }

  // Финансовые аппрув-кнопки могут жать финансисты, не обязательно автор.
  const user = await findUserByTg(from.id);

  if (data === "finmenu-expense") {
    if (!user) {
      await sendRestricted(token, chatId, proxy);
      await answerCallbackQuery(token, cq.id, undefined, false, proxy);
      return;
    }
    await startExpense(token, chatId, userId, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data === "finmenu-balance") {
    if (!user) {
      await sendRestricted(token, chatId, proxy);
      await answerCallbackQuery(token, cq.id, undefined, false, proxy);
      return;
    }
    await handleMyBalance(token, chatId, user, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("fina:") || data.startsWith("finr:")) {
    await handleApprovalCallback(bot, token, proxy, cq, user);
    return;
  }

  if (!user) {
    await sendRestricted(token, chatId, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  const state = await getFsmState(chatId, userId);

  if (data.startsWith("fincr:")) {
    if (state.step !== "awaitCurrency") return;
    const currency = data.slice(6);
    await showScopes(token, chatId, userId, state.amount, currency, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data === "fincuro") {
    // "Другая" — просто ждём текст валюты.
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("finsc:")) {
    if (state.step !== "awaitScope") return;
    const scope = data.slice(6) as "TEAM" | "PROJECT" | "MEMBER";
    if (scope === "PROJECT") {
      await setFsmState(chatId, userId, {
        step: "awaitProject",
        amount: state.amount,
        currency: state.currency,
      });
      await showProjects(
        token,
        chatId,
        userId,
        {
          step: "awaitProject",
          amount: state.amount,
          currency: state.currency,
        },
        0,
        proxy
      );
    } else if (scope === "MEMBER") {
      await setFsmState(chatId, userId, {
        step: "awaitMember",
        amount: state.amount,
        currency: state.currency,
      });
      await showMembers(
        token,
        chatId,
        userId,
        {
          step: "awaitMember",
          amount: state.amount,
          currency: state.currency,
        },
        0,
        proxy
      );
    } else {
      await askTitle(
        token,
        chatId,
        userId,
        {
          amount: state.amount,
          currency: state.currency,
          scope,
        },
        proxy
      );
    }
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("finpr:")) {
    if (state.step !== "awaitProject") return;
    const projectId = data.slice(6);
    await askTitle(
      token,
      chatId,
      userId,
      {
        amount: state.amount,
        currency: state.currency,
        scope: "PROJECT",
        projectId,
      },
      proxy
    );
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("finprp:")) {
    if (state.step !== "awaitProject") return;
    const page = Number(data.slice(7)) || 0;
    await showProjects(token, chatId, userId, state, page, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("finme:")) {
    if (state.step !== "awaitMember") return;
    const memberId = data.slice(6);
    await askTitle(
      token,
      chatId,
      userId,
      {
        amount: state.amount,
        currency: state.currency,
        scope: "MEMBER",
        memberId,
        projectId: state.projectId,
      },
      proxy
    );
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("finmep:")) {
    if (state.step !== "awaitMember") return;
    const page = Number(data.slice(7)) || 0;
    await showMembers(token, chatId, userId, state, page, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data.startsWith("finta:")) {
    if (state.step !== "awaitTags") return;
    const tag = data.slice(6);
    const selected = new Set(state.selectedTags);
    if (selected.has(tag)) selected.delete(tag);
    else selected.add(tag);
    await askTags(
      token,
      chatId,
      userId,
      {
        amount: state.amount,
        currency: state.currency,
        scope: state.scope,
        projectId: state.projectId,
        memberId: state.memberId,
        title: state.title,
        description: state.description,
      },
      Array.from(selected),
      proxy
    );
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data === "fintags-done" || data === "fintags-skip") {
    if (state.step !== "awaitTags") return;
    const tags = data === "fintags-done" ? state.selectedTags : [];
    await showConfirm(
      token,
      chatId,
      userId,
      {
        amount: state.amount,
        currency: state.currency,
        scope: state.scope,
        projectId: state.projectId,
        memberId: state.memberId,
        title: state.title,
        description: state.description,
        tags,
      },
      proxy
    );
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data === "finconfirm") {
    if (state.step !== "confirm") return;
    await submitExpense(token, chatId, userId, user, state, proxy);
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  if (data === "fintg-cancel") {
    await clearFsmState(chatId, userId);
    const t = makeT((await getSettings()).notifyLocale);
    await sendMessage(
      token,
      chatId,
      t("finance.bot.expense.cancelled"),
      [],
      proxy
    );
    await answerCallbackQuery(token, cq.id, undefined, false, proxy);
    return;
  }

  await answerCallbackQuery(token, cq.id, undefined, false, proxy);
}

async function handleApprovalCallback(
  bot: NotifyBot,
  token: string,
  proxy: string,
  cq: any,
  user: User | null
) {
  const data = String(cq.data || "");
  const message = cq.message as {
    chat: { id: number; type: string };
    message_id: number;
  } | null;
  const from = cq.from as { id: number };
  const chatId = message ? String(message.chat.id) : undefined;

  const t = makeT((await getSettings()).notifyLocale);
  if (!user || !hasPermission(user.role, "finance.approve")) {
    await answerCallbackQuery(token, cq.id, t("bot.noRights"), true, proxy);
    return;
  }

  // В группах проверяем, что нажавший может жать кнопки этого чата.
  if (chatId) {
    const chat = await prisma.notifyBotChat.findFirst({
      where: { botId: bot.id, chatId },
      select: {
        allowedMode: true,
        allowedProjectId: true,
        allowedUserIds: true,
      },
    });
    if (chat && !(await canPressButtons(chat, from.id))) {
      await answerCallbackQuery(token, cq.id, t("bot.noRights"), true, proxy);
      return;
    }
  }

  const expenseId = data.startsWith("fina:") ? data.slice(5) : data.slice(5);
  const toStatus: "APPROVED" | "REJECTED" = data.startsWith("fina:")
    ? "APPROVED"
    : "REJECTED";
  const action = toStatus === "APPROVED" ? "APPROVE" : "REJECT";

  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
  });
  if (!existing) {
    await answerCallbackQuery(token, cq.id, t("err.notFound"), true, proxy);
    return;
  }
  if (!canTransitionStatus(existing.status, toStatus)) {
    await answerCallbackQuery(
      token,
      cq.id,
      t("finance.err.cannotTransition"),
      true,
      proxy
    );
    return;
  }

  // Атомарный захват: только один callback обработает PENDING → решение.
  const captured = await prisma.expense.updateMany({
    where: { id: expenseId, status: "PENDING" },
    data: {
      status: toStatus,
      approvedById: user.id,
      approvedAt: new Date(),
    },
  });
  if (captured.count !== 1) {
    await answerCallbackQuery(
      token,
      cq.id,
      t("finance.err.alreadyApproved"),
      true,
      proxy
    );
    return;
  }

  const row = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!row) {
    await answerCallbackQuery(token, cq.id, t("err.notFound"), true, proxy);
    return;
  }
  await writeAudit(user.id, action, "expense", expenseId, existing, row);

  const decisionText =
    toStatus === "APPROVED"
      ? t("finance.bot.approval.approved", { by: esc(user.name || user.email) })
      : t("finance.bot.approval.rejected", {
          by: esc(user.name || user.email),
        });

  if (chatId && message) {
    const lines = [
      decisionText,
      "",
      `<b>${t("finance.bot.approval.amount")}</b>: ${row.amount} ${row.currency}`,
      `<b>${t("finance.bot.approval.scope")}</b>: ${t(
        `finance.scope.${row.scope}`
      )}`,
      `<b>${t("finance.operation.name")}</b>: ${esc(row.title)}`,
    ];
    await editMessageText(
      token,
      chatId,
      String(message.message_id),
      lines.join("\n"),
      [],
      proxy
    );
  }

  await notifyAuthorDecision(token, row, decisionText, proxy);
  await answerCallbackQuery(token, cq.id, undefined, false, proxy);
}

async function handleMyChatMember(
  _bot: NotifyBot,
  _token: string,
  _proxy: string,
  update: any
) {
  const chat = update.my_chat_member.chat as {
    id: number;
    type: string;
    title?: string;
  };
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  if (!isGroup) return;
  await ensureGroup(chat.id, chat.title);
}

/**
 * Точка входа из webhook.
 *
 * Возвращает true, если обновление было обработано как финансовое (и
 * существующий код webhook не должен пытаться обработать его как кнопку
 * напоминания).
 */
export async function handleUpdate(
  bot: NotifyBot,
  token: string,
  proxy: string,
  update: any
): Promise<boolean> {
  try {
    if (update.my_chat_member) {
      await handleMyChatMember(bot, token, proxy, update);
      return true;
    }

    if (update.callback_query) {
      const data = String(update.callback_query.data || "");
      if (isFinanceCallback(data)) {
        await handleCallback(bot, token, proxy, update.callback_query);
        return true;
      }
      return false;
    }

    if (update.message) {
      await handleMessage(bot, token, proxy, update.message);
      return true;
    }

    return false;
  } catch (e) {
    console.error("[tg-bot]", e);
    return true;
  }
}
