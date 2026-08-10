// Рассылка напоминаний об оплате: подбор ресурсов, фильтрация по ботам,
// текст сообщения, отправка с защитой от повторов.
//
// Вызывается воркером (notify-worker.mjs) и вручную из панели («отправить
// сейчас» при отладке бота).

import { prisma } from "./prisma";
import { decryptSecret } from "./secret-crypto";
import { sendMessage, esc, type InlineButton } from "./telegram";
import { proxyForBot } from "./notify-proxy";
import { kindLabel, periodText, type Kind } from "./resources";
import { getSettings } from "./settings";
import { hourInTimezone, isWithinWindow, windowFor } from "./quiet-hours";
import { makeT, formatNumber, type TFunc } from "./i18n/translate";
import { DEFAULT_LOCALE, type Locale } from "./i18n/config";

/** Полночь сегодняшнего дня в UTC — общая точка отсчёта для всех сравнений дат. */
function todayUTC(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Текст напоминания. Отдельной функцией — чтобы проверять юнит-тестом без
 * сети и без БД.
 */
export function reminderText(
  r: {
    kind: string;
    name: string;
    amount: string;
    currency: string;
    periodValue: number;
    periodUnit: string;
    nextPaymentAt: Date;
    ip?: string;
    domain?: string;
    url?: string;
    providerName?: string | null;
    daysBefore: number;
  },
  t: TFunc = makeT(DEFAULT_LOCALE),
  locale: Locale = DEFAULT_LOCALE
): string {
  const when =
    r.daysBefore === 0
      ? t("notify.when.today")
      : r.daysBefore === 1
        ? t("notify.when.tomorrow")
        : t("notify.when.inDays", { count: r.daysBefore });

  const addr = r.domain || r.url || r.ip || "";
  const amount = formatNumber(Number(r.amount), locale, {
    minimumFractionDigits: 2,
  });

  const lines = [
    t("notify.title", { when }),
    "",
    `<b>${esc(r.name)}</b> — ${kindLabel(r.kind as Kind, t)}`,
    addr ? `<code>${esc(addr)}</code>` : "",
    `${amount} ${esc(r.currency)} · ${periodText(r.periodValue, r.periodUnit, t)}`,
    r.providerName ? t("notify.provider", { name: esc(r.providerName) }) : "",
    t("notify.date", { date: ymd(r.nextPaymentAt) }),
  ];
  return lines.filter(Boolean).join("\n");
}

/** Кнопки под напоминанием. Удаление подтверждается вторым нажатием. */
export function reminderButtons(
  messageKey: string,
  t: TFunc = makeT(DEFAULT_LOCALE)
): InlineButton[][] {
  return [
    [
      { text: t("notify.btn.paid"), callback_data: `paid:${messageKey}` },
      { text: t("notify.btn.cancel"), callback_data: `cancel:${messageKey}` },
    ],
    [{ text: t("notify.btn.delete"), callback_data: `del:${messageKey}` }],
  ];
}

/** Подходит ли ресурс боту: по типу и по тегам. Пустой фильтр = без ограничения. */
export function botMatches(
  bot: { kinds: string[]; tags: Array<{ tagId: string }> },
  resource: { kind: string; tags: Array<{ tagId: string }> }
): boolean {
  if (bot.kinds.length > 0 && !bot.kinds.includes(resource.kind)) return false;
  if (bot.tags.length > 0) {
    const want = new Set(bot.tags.map(t => t.tagId));
    if (!resource.tags.some(t => want.has(t.tagId))) return false;
  }
  return true;
}

export type RunResult = {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Отложено до открытия окна оповещений. Не потеряно — придёт позже. */
  deferred: number;
};

/**
 * Один проход рассылки.
 *
 * Идемпотентен: факт отправки пишется в ReminderDispatch с уникальностью по
 * (напоминание, дата оплаты), поэтому повторный запуск в тот же день ничего
 * не задублирует. Воркер можно будить хоть каждую минуту.
 */
export async function runNotify(now = new Date()): Promise<RunResult> {
  const today = todayUTC(now);
  const res: RunResult = { checked: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };

  // Язык сообщений — общий для установки, а не язык пользователя: сообщение
  // уходит в чат, где сидят разные люди, и «язык получателя» там не определён.
  const settings = await getSettings();
  const { notifyLocale } = settings;
  const t = makeT(notifyLocale);

  // Час в поясе из настроек: окно тишины задано местным временем, а сервер
  // почти всегда живёт в UTC.
  const localHour = hourInTimezone(now, settings.timezone);
  const awake = (bot: { notifyFromHour: number | null; notifyToHour: number | null }) => {
    const w = windowFor(bot, settings);
    return isWithinWindow(localHour, w.from, w.to);
  };

  const bots = await prisma.notifyBot.findMany({
    where: { isActive: true },
    include: { chats: true, tags: { select: { tagId: true } } },
  });
  // Прокси у ботов может отличаться, поэтому разрешаем его один раз на
  // проход, а не на каждое сообщение: это поход в БД за общими настройками.
  const proxyByBot = new Map<string, string>();
  for (const b of bots) proxyByBot.set(b.id, await proxyForBot(b.proxyUrlEnc));
  const usable = bots.filter(b => b.chats.length > 0);
  if (usable.length === 0) return res;

  // Максимальный горизонт среди всех напоминаний — дальше выбирать нет смысла.
  const maxDays = await prisma.paymentReminder.aggregate({
    where: { isActive: true },
    _max: { daysBefore: true },
  });
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + (maxDays._max.daysBefore ?? 0));

  const resources = await prisma.resource.findMany({
    where: {
      isActive: true,
      nextPaymentAt: { lte: horizon },
      reminders: { some: { isActive: true } },
    },
    include: {
      provider: { select: { name: true } },
      tags: { select: { tagId: true } },
      reminders: { where: { isActive: true } },
    },
  });

  for (const r of resources) {
    const dueDays = Math.round(
      (r.nextPaymentAt.getTime() - today.getTime()) / 86_400_000
    );

    for (const rem of r.reminders) {
      // Ровно тот день, на который настроено напоминание. Просроченное
      // (dueDays < 0) сюда не попадает намеренно: напоминать «за 2 дня» о том,
      // что просрочено неделю назад, бессмысленно — для этого есть панель.
      if (dueDays !== rem.daysBefore) continue;

      // Кому это напоминание вообще предназначено.
      const matching = usable.filter(bot =>
        botMatches({ kinds: bot.kinds as string[], tags: bot.tags }, { kind: r.kind, tags: r.tags })
      );
      if (matching.length === 0) continue;

      // Все получатели спят — откладываем ЦЕЛИКОМ и, главное, не заявляем
      // отправку: заявка отсекает повторы навсегда, и отложить после неё
      // значило бы не отложить, а потерять.
      //
      // Если часть ботов бодрствует, шлём им сейчас. Тому, у кого окно ещё не
      // открылось, это напоминание не достанется — но своё окно он и задавал
      // ради того, чтобы в это время молчать.
      const ready = matching.filter(awake);
      if (ready.length === 0) {
        res.deferred++;
        continue;
      }

      res.checked++;

      // Заявка на отправку ДО обращения к сети: уникальный индекс не даст
      // двум одновременно проснувшимся воркерам отправить одно и то же.
      try {
        await prisma.reminderDispatch.create({
          data: { reminderId: rem.id, dueDate: r.nextPaymentAt, ok: false },
        });
      } catch {
        res.skipped++; // уже отправляли за эту дату
        continue;
      }

      let anyOk = false;
      const errors: string[] = [];

      for (const bot of ready) {
        let token: string;
        try {
          token = decryptSecret(bot.tokenEnc);
        } catch {
          errors.push(`${bot.name}: ${t("notify.err.tokenUnreadable")}`);
          continue;
        }

        const text = reminderText(
          {
            kind: r.kind,
            name: r.name,
            amount: r.amount.toString(),
            currency: r.currency,
            periodValue: r.periodValue,
            periodUnit: r.periodUnit,
            nextPaymentAt: r.nextPaymentAt,
            ip: r.ip,
            domain: r.domain,
            url: r.url,
            providerName: r.provider?.name ?? null,
            daysBefore: rem.daysBefore,
          },
          t,
          notifyLocale
        );

        for (const chat of bot.chats) {
          // Сообщение заводим ДО отправки: иначе callback от быстро нажатой
          // кнопки прилетит раньше, чем мы запишем, о каком ресурсе речь.
          const msg = await prisma.notifyMessage.create({
            data: {
              botId: bot.id,
              chatId: chat.chatId,
              messageId: `pending:${rem.id}:${chat.chatId}:${ymd(r.nextPaymentAt)}`,
              resourceId: r.id,
              dueDate: r.nextPaymentAt,
            },
          });

          const sent = await sendMessage(
            token,
            chat.chatId,
            text,
            reminderButtons(msg.id, t),
            proxyByBot.get(bot.id) || ""
          );
          if (sent.ok) {
            await prisma.notifyMessage.update({
              where: { id: msg.id },
              data: { messageId: String(sent.result.message_id) },
            });
            anyOk = true;
            res.sent++;
          } else {
            await prisma.notifyMessage
              .delete({ where: { id: msg.id } })
              .catch(() => {});
            errors.push(`${bot.name}/${chat.chatId}: ${sent.error}`);
            res.failed++;
          }
        }
      }

      await prisma.reminderDispatch.updateMany({
        where: { reminderId: rem.id, dueDate: r.nextPaymentAt },
        data: { ok: anyOk, error: errors.join("; ").slice(0, 500) },
      });
    }
  }

  return res;
}
