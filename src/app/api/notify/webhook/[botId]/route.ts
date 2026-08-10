import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secret-crypto";
import { answerCallbackQuery, editMessageText, esc } from "@/lib/telegram";
import { addPeriod } from "@/lib/resources";
import { webhookSecret } from "@/lib/notify-webhook";
import { proxyForBot } from "@/lib/notify-proxy";
import { getSettings } from "@/lib/settings";
import { makeT } from "@/lib/i18n/translate";
import { reminderButtons } from "@/lib/notify";

type Ctx = { params: Promise<{ botId: string }> };

const ok = () => NextResponse.json({ ok: true });

/** Сравнение секрета за постоянное время. Длина утекает, значение — нет. */
function secretMatches(got: string, expected: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Приём нажатий на кнопки под напоминанием.
 *
 * Три уровня проверки, и каждый закрывает свою дыру:
 *   1. секретный заголовок — подтверждает, что запрос от Telegram, а не от
 *      того, кто узнал URL вебхука из логов прокси;
 *   2. сообщение ищется в связке с ЭТИМ ботом и ЭТИМ чатом — чтобы вебхук
 *      одного бота не действовал на сообщения другого;
 *   3. allowedUserIds чата — Telegram подтверждает, что нажатие настоящее, но
 *      не говорит, что нажавший имеет право. В групповом чате кнопку видит
 *      каждый участник, включая людей без аккаунта в панели.
 *
 * Telegram ждёт 200 практически на всё: на 5xx он ретраит тот же апдейт, и
 * разовая ошибка превращается в цикл. Поэтому тело обёрнуто в try/catch, а
 * причина уходит пользователю ответом на нажатие.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { botId } = await ctx.params;

  // Секрет проверяем ДО обращения к БД: иначе несуществующий botId отвечает
  // 200, а существующий с плохим секретом — 403, и это оракул на перебор.
  let expected: string;
  try {
    expected = webhookSecret(botId);
  } catch {
    return ok();
  }
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token") || "", expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const bot = await prisma.notifyBot.findUnique({ where: { id: botId } });
    if (!bot || !bot.isActive) return ok();

    const update = await req.json().catch(() => null);
    const cq = update?.callback_query;
    if (!cq?.id || !cq.data) return ok();

    let token: string;
    try {
      token = decryptSecret(bot.tokenEnc);
    } catch {
      return ok();
    }
    // Ответ и правка сообщения идут в Telegram, а он может быть доступен
    // только через прокси — тот же, которым бот отправлял напоминание.
    const proxy = await proxyForBot(bot.proxyUrlEnc);

    // Язык ответов бота — общий для установки: нажать кнопку может любой
    // участник чата, и его языка панель не знает.
    const t = makeT((await getSettings()).notifyLocale);

    const reply = (text: string, alert = false) =>
      answerCallbackQuery(token, cq.id, text, alert, proxy).then(ok);

    const [action, key] = String(cq.data).split(":");
    if (!key) return reply(t("bot.unknownButton"));

    const chatId = String(cq.message?.chat?.id ?? "");
    const who = String(cq.from?.id ?? "");

    // Сообщение — только этого бота и только этого чата.
    const msg = await prisma.notifyMessage.findFirst({
      where: { id: key, botId, chatId },
      include: { resource: true },
    });
    if (!msg) return reply(t("bot.messageStale"), true);

    // Кому в этом чате можно нажимать. Пустой список = всем (личный чат).
    const chat = await prisma.notifyBotChat.findFirst({
      where: { botId, chatId },
      select: { allowedUserIds: true },
    });
    if (!chat) return reply(t("bot.chatGone"), true);
    if (chat.allowedUserIds.length > 0 && !chat.allowedUserIds.includes(who)) {
      return reply(t("bot.noRights"), true);
    }

    const r = msg.resource;

    const finish = async (tail: string) => {
      const base = cq.message?.text ? esc(cq.message.text) : t("bot.reminder");
      // Кнопки снимаем и дописываем итог: сообщение остаётся в истории чата и
      // должно честно показывать, чем закончилось.
      await editMessageText(token, msg.chatId, msg.messageId, `${base}\n\n${tail}`, [], proxy);
    };

    /**
     * Атомарный захват действия.
     *
     * Не «прочитать actedAction, потом записать»: между чтением и записью
     * помещается ретрай Telegram (он переотправляет апдейт, не дождавшись
     * ответа) и двойной тап. Оба прошли бы проверку и записали оплату дважды.
     * updateMany с условием actedAction:"" переводит гонку в БД, где она
     * разрешается одним UPDATE.
     */
    const claim = async (act: string): Promise<boolean> => {
      const res = await prisma.notifyMessage.updateMany({
        where: { id: msg.id, actedAction: "" },
        data: { actedAction: act, actedAt: new Date(), actedBy: who },
      });
      return res.count === 1;
    };

    const alreadyText: Record<string, string> = {
      paid: t("bot.already.paid"),
      cancelled: t("bot.already.cancelled"),
      deleted: t("bot.already.deleted"),
    };
    const already = () => reply(alreadyText[msg.actedAction] || t("bot.already.other"), true);

    if (msg.actedAction) return already();

    if (action === "cancel") {
      if (!(await claim("cancelled"))) return already();
      await finish(t("bot.cancelled.text"));
      return reply(t("bot.cancelled.toast"));
    }

    if (action === "paid") {
      if (!r) return reply(t("bot.resourceGone"), true);
      // Захват ПЕРЕД действием: если упадём после записи платежа, но до
      // пометки, ретрай Telegram записал бы платёж второй раз.
      if (!(await claim("paid"))) return already();

      // Сдвигаем от даты, о которой напоминали, а не от текущей: пока
      // сообщение висело, дату могли поменять в панели.
      const from = msg.dueDate ?? r.nextPaymentAt;
      const next = addPeriod(from, r.periodValue, r.periodUnit);
      await prisma.$transaction([
        prisma.resourcePayment.create({
          data: {
            resourceId: r.id,
            amount: r.amount,
            currency: r.currency,
            paidAt: from,
            note: t("bot.paid.note"),
          },
        }),
        prisma.resource.update({ where: { id: r.id }, data: { nextPaymentAt: next } }),
      ]);
      await finish(t("bot.paid.text", { date: next.toISOString().slice(0, 10) }));
      return reply(t("bot.paid.toast"));
    }

    if (action === "del") {
      if (!r) return reply(t("bot.resourceGone"), true);
      // Удаление необратимо, поэтому в два шага: первое нажатие ничего не
      // трогает, только перерисовывает клавиатуру подтверждением.
      await editMessageText(
        token,
        msg.chatId,
        msg.messageId,
        `${cq.message?.text ? esc(cq.message.text) : t("bot.reminder")}\n\n` +
          t("bot.confirmDelete", { name: esc(r.name) }),
        [
          [
            { text: t("bot.btn.deleteYes"), callback_data: `delyes:${key}` },
            { text: t("bot.btn.deleteNo"), callback_data: `delno:${key}` },
          ],
        ],
        proxy
      );
      return reply(t("bot.confirmDeleteToast"));
    }

    if (action === "delno") {
      await editMessageText(
        token,
        msg.chatId,
        msg.messageId,
        cq.message?.text ? esc(cq.message.text.split("\n\n⚠️")[0]) : t("bot.reminder"),
        // Та же клавиатура, что и под исходным напоминанием, собранная тем же
        // кодом: два независимых списка кнопок разъехались бы при первой правке.
        reminderButtons(key, t),
        proxy
      );
      return reply(t("bot.deleteCancelled"));
    }

    if (action === "delyes") {
      if (!r) return reply(t("bot.resourceGone"), true);
      if (!(await claim("deleted"))) return already();
      const name = r.name;
      // Ресурса может уже не быть — удалили из панели, пока висело сообщение.
      await prisma.resource.delete({ where: { id: r.id } }).catch(() => {});
      await finish(t("bot.deleted.text", { name: esc(name) }));
      return reply(t("bot.deleted.toast"));
    }

    return reply(t("bot.unknownButton"));
  } catch (e) {
    // 200, а не 500: на пятисотку Telegram зацикливает ретраи одного апдейта.
    console.error("[notify/webhook]", e);
    return ok();
  }
}
