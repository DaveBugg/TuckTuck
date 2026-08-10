import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { checkReachable } from "@/lib/telegram";
import { globalProxyUrl, validateProxyUrl } from "@/lib/notify-proxy";
import { tForRequest } from "@/lib/i18n/server";

/**
 * Доступен ли Telegram — сейчас и с указанными настройками.
 *
 * Позволяет проверить прокси ДО сохранения: иначе единственным способом
 * узнать, рабочий ли он, было бы завести бота и посмотреть, придёт ли
 * сообщение.
 *
 * Проверяем оба пути сразу — напрямую и через прокси. Так сразу видно, нужен
 * ли прокси вообще: если прямой путь открыт, навязывать его незачем.
 */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("notify.manage");
    const b = await req.json().catch(() => ({}));

    // Прокси из тела (проверка перед сохранением) либо уже сохранённый.
    let proxy: string;
    if (typeof b.proxyUrl === "string") {
      proxy = b.proxyUrl.trim();
      const err = validateProxyUrl(proxy, t);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    } else {
      proxy = await globalProxyUrl();
    }
    if (!proxy) proxy = (process.env.TELEGRAM_PROXY_URL || "").trim();

    const direct = await checkReachable("");
    const viaProxy = proxy ? await checkReachable(proxy) : null;

    return NextResponse.json({
      direct: { ok: direct.ok, error: direct.error },
      proxy: proxy ? { ok: viaProxy!.ok, error: viaProxy!.error } : null,
      // Итог для интерфейса: хоть один путь рабочий — оповещения поедут.
      usable: direct.ok || !!viaProxy?.ok,
      proxyNeeded: !direct.ok,
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
