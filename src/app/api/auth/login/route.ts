import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, USER_COOKIE, TOKEN_TTL_SEC, publicUser, signAuthToken } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, resolveLocale } from "@/lib/i18n/config";
import { tForRequest } from "@/lib/i18n/server";

export async function POST(req: Request) {
  const t = tForRequest(req);
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const totp = typeof body.totp === "string" ? body.totp.trim() : "";
  if (!email || !password) {
    return NextResponse.json({ error: t("auth.err.credentialsRequired") }, { status: 400 });
  }

  // Turnstile (fail-open, если секрет не задан). Токен в X-Turnstile-Token.
  const tsToken = req.headers.get("x-turnstile-token") || "";
  const clientIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!(await verifyTurnstile(tsToken, clientIp))) {
    return NextResponse.json({ error: t("auth.err.captcha") }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    return NextResponse.json({ error: t("auth.err.badCredentials") }, { status: 401 });
  }

  // Второй шаг при включённом 2FA: пароль верен → просим/проверяем код.
  if (user.totpEnabled && user.totpSecret) {
    if (!totp) {
      return NextResponse.json({ needTotp: true });
    }
    if (!authenticator.check(totp, user.totpSecret)) {
      return NextResponse.json({ error: t("auth.err.badTotp") }, { status: 401 });
    }
  }

  // Мультисессии: своя строка на каждый логин, jti уходит в JWT.
  const jti = crypto.randomUUID();
  const fwd = req.headers.get("x-forwarded-for") || "";
  await prisma.session.create({
    data: {
      userId: user.id,
      jti,
      userAgent: (req.headers.get("user-agent") || "").slice(0, 255),
      ip: (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim().slice(0, 64),
    },
  });

  const token = await signAuthToken(user, jti);
  const res = NextResponse.json({ user: publicUser(user) });
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: TOKEN_TTL_SEC,
  });
  // Display-only copy for client UI (name/role in the header) — never trusted server-side.
  res.cookies.set(USER_COOKIE, JSON.stringify(publicUser(user)), {
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: TOKEN_TTL_SEC,
  });
  // Единственное место, где язык читается из базы. Дальше его берут из куки:
  // он нужен каждому экрану, и запрос за ним стал бы самым частым в системе.
  // Живёт год, а не сессию: язык — не часть входа и переживает разлогин.
  res.cookies.set(LOCALE_COOKIE, resolveLocale(user.locale), {
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
  return res;
}
