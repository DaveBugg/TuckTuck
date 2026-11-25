import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secret-crypto";
import {
  AUTH_COOKIE,
  USER_COOKIE,
  TOKEN_TTL_SEC,
  publicUser,
  signAuthToken,
} from "@/lib/auth";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  resolveLocale,
} from "@/lib/i18n/config";
import { tForRequest } from "@/lib/i18n/server";
import { validateInitData } from "@/lib/tg-auth";
import { rateLimit, ipKey } from "@/lib/rate-limit";

// Один IP может перебирать подписи WebApp по разным ботам.
const IP_LIMIT = 20;
const IP_WINDOW_SEC = 300;

/**
 * Вход по Telegram WebApp initData.
 *
 * Публичный эндпоинт: WebApp шлёт подписанные Telegram-ом данные, мы
 * проверяем подпись по ВСЕМ активным ботам (пользователь мог открыть панель
 * через любого из них), находим активного User по telegramUserId и создаём
 * обычную сессию.
 */
export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    const clientIp = (req.headers.get("x-forwarded-for") || "")
      .split(",")[0]
      .trim();
    const limited = await rateLimit(
      ipKey("tg-auth", clientIp),
      IP_LIMIT,
      IP_WINDOW_SEC
    );
    if (!limited.ok) {
      return NextResponse.json(
        { error: t("auth.err.tooMany", { sec: limited.retryAfterSec }) },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const initData = typeof body.initData === "string" ? body.initData : "";
    if (!initData) {
      return NextResponse.json(
        { error: t("err.unauthorized") },
        { status: 401 }
      );
    }

    const bots = await prisma.notifyBot.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!bots.length) {
      return NextResponse.json(
        { error: t("err.unauthorized") },
        { status: 401 }
      );
    }

    let validatedUser: { id: number } | null = null;
    for (const bot of bots) {
      let token: string;
      try {
        token = decryptSecret(bot.tokenEnc);
      } catch {
        continue;
      }
      const validated = validateInitData(initData, token);
      if (validated.ok) {
        validatedUser = validated.user;
        break;
      }
    }

    if (!validatedUser) {
      return NextResponse.json(
        { error: t("err.unauthorized") },
        { status: 401 }
      );
    }

    const tgUserId = BigInt(String(validatedUser.id));
    const user = await prisma.user.findUnique({
      where: { telegramUserId: tgUserId },
    });
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: t("err.unauthorized") },
        { status: 401 }
      );
    }

    const jti = crypto.randomUUID();
    const fwd = req.headers.get("x-forwarded-for") || "";
    await prisma.session.create({
      data: {
        userId: user.id,
        jti,
        userAgent: (req.headers.get("user-agent") || "").slice(0, 255),
        ip: (fwd.split(",")[0] || req.headers.get("x-real-ip") || "")
          .trim()
          .slice(0, 64),
      },
    });

    const authToken = await signAuthToken(user, jti);
    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(AUTH_COOKIE, authToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: TOKEN_TTL_SEC,
    });
    res.cookies.set(USER_COOKIE, JSON.stringify(publicUser(user)), {
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: TOKEN_TTL_SEC,
    });
    res.cookies.set(LOCALE_COOKIE, resolveLocale(user.locale), {
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
    return res;
  } catch (e) {
    console.error("[auth/telegram]", e);
    return NextResponse.json({ error: t("err.internal") }, { status: 500 });
  }
}
