import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { getSettings, validateSettings, invalidateSettingsCache } from "@/lib/settings";
import { encryptSecret } from "@/lib/secret-crypto";
import { globalProxyUrl, maskProxyUrl, saveGlobalProxy, validateProxyUrl } from "@/lib/notify-proxy";
import { resetProxyCache } from "@/lib/proxy-dispatcher";
import { tForRequest } from "@/lib/i18n/server";

/** Настройки системы. Только админ: тут прокси с паролем и срок хранения данных. */
export async function GET() {
  try {
    await requirePermission("users.manage");
    const s = await getSettings();
    const proxy = await globalProxyUrl();
    const secretRow = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { turnstileSecretEnc: true },
    });
    return NextResponse.json({
      ...s,
      // Адрес наружу только замаскированным: в нём пароль.
      proxy: maskProxyUrl(proxy),
      proxySet: !!proxy,
      envProxySet: !!(process.env.TELEGRAM_PROXY_URL || "").trim(),
      // Сам секрет капчи не отдаём никогда — только факт, что он задан.
      turnstileSecretSet: !!secretRow?.turnstileSecretEnc,
      turnstileEnvSet: !!(process.env.TURNSTILE_SECRET_KEY || "").trim(),
    });
  } catch (e) {
    return toApiError(e);
  }
}

export async function PUT(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("users.manage");
    const b = await req.json().catch(() => ({}));

    const err = validateSettings(b, t);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (b.timezone !== undefined) data.timezone = String(b.timezone);
    if (b.metricsRetentionDays !== undefined) data.metricsRetentionDays = Number(b.metricsRetentionDays);
    if (b.displayCurrency !== undefined) data.displayCurrency = String(b.displayCurrency).toUpperCase();
    if (b.notifyLocale !== undefined) data.notifyLocale = String(b.notifyLocale);
    if (b.notifyFromHour !== undefined) data.notifyFromHour = Number(b.notifyFromHour);
    if (b.notifyToHour !== undefined) data.notifyToHour = Number(b.notifyToHour);
    if (b.turnstileSiteKey !== undefined) data.turnstileSiteKey = String(b.turnstileSiteKey).trim();
    // Пустая строка осмысленна — «выключить капчу», поэтому отличаем её от
    // «поле не прислали».
    if (typeof b.turnstileSecretKey === "string") {
      const raw = b.turnstileSecretKey.trim();
      data.turnstileSecretEnc = raw ? encryptSecret(raw) : "";
    }

    // Прокси лежит в той же строке, но приходит отдельным полем: пустая строка
    // здесь осмысленна («ходить напрямую»), поэтому отличаем её от «не прислали».
    if (typeof b.proxyUrl === "string") {
      const raw = b.proxyUrl.trim();
      const perr = validateProxyUrl(raw, t);
      if (perr) return NextResponse.json({ error: perr }, { status: 400 });
      await saveGlobalProxy(raw);
      // Диспатчеры кешируются по адресу — иначе смена не вступит в силу до
      // перезапуска приложения.
      resetProxyCache();
    }

    if (Object.keys(data).length) {
      await prisma.appSettings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", ...(data as any) },
        update: data as any,
      });
    }

    // Кеш сбрасываем до чтения: иначе ответ вернёт прежние значения, и в
    // интерфейсе правка выглядела бы не сохранившейся.
    await invalidateSettingsCache();
    const s = await getSettings();
    const proxy = await globalProxyUrl();
    const secretRow = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { turnstileSecretEnc: true },
    });
    return NextResponse.json({
      ...s,
      proxy: maskProxyUrl(proxy),
      proxySet: !!proxy,
      envProxySet: !!(process.env.TELEGRAM_PROXY_URL || "").trim(),
      turnstileSecretSet: !!secretRow?.turnstileSecretEnc,
      turnstileEnvSet: !!(process.env.TURNSTILE_SECRET_KEY || "").trim(),
    });
  } catch (e) {
    return toApiError(e, t);
  }
}
