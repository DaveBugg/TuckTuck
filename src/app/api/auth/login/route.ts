import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, USER_COOKIE, TOKEN_TTL_SEC, publicUser, signAuthToken } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, resolveLocale } from "@/lib/i18n/config";
import { tForRequest } from "@/lib/i18n/server";
import { rateLimit, rateLimitReset, ipKey, idKey } from "@/lib/rate-limit";

// Пароль длиннее этого не бывает у людей, а bcrypt считает хеш тем дольше, чем
// длиннее вход: без ограничения мегабайтная строка занимала бы процесс.
const MAX_PASSWORD_LEN = 200;

// Два разных лимита, и они защищают от разного.
//
// По логину — узкий: восемь попыток за четверть часа. Долбёжка в одну учётку
// почти всегда перебор, а человек, промахнувшийся паролем восемь раз подряд,
// скорее пойдёт за сбросом, чем за девятой попыткой.
//
// По адресу — широкий: он ловит перебор ПО РАЗНЫМ логинам с одной машины. Узкий
// здесь вреден: за общим NAT сидит вся команда, и пятью промахами одного
// человека запирался бы вход для остальных.
const IP_LIMIT = 20;
const IP_WINDOW_SEC = 300;
const ID_LIMIT = 8;
const ID_WINDOW_SEC = 900;

// Хеш-пустышка, чтобы сравнение шло и для несуществующего пользователя.
// Иначе ответ на незнакомую почту возвращается заметно быстрее, и по времени
// ответа перебирается список существующих адресов.
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function POST(req: Request) {
  const t = tForRequest(req);
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const totp = typeof body.totp === "string" ? body.totp.trim() : "";
  if (!email || !password || password.length > MAX_PASSWORD_LEN) {
    return NextResponse.json({ error: t("auth.err.credentialsRequired") }, { status: 400 });
  }

  const clientIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  // Считаем ДО проверки пароля: смысл лимита в том, чтобы дорогая проверка не
  // выполнялась на каждую попытку перебора.
  const byIp = await rateLimit(ipKey("login", clientIp), IP_LIMIT, IP_WINDOW_SEC);
  const byId = await rateLimit(idKey("login", email), ID_LIMIT, ID_WINDOW_SEC);
  const limited = !byIp.ok ? byIp : !byId.ok ? byId : null;
  if (limited) {
    return NextResponse.json(
      { error: t("auth.err.tooMany", { sec: limited.retryAfterSec }) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  // Turnstile (пропускает, если секрет не задан). Токен в X-Turnstile-Token.
  const tsToken = req.headers.get("x-turnstile-token") || "";
  if (!(await verifyTurnstile(tsToken, clientIp))) {
    return NextResponse.json({ error: t("auth.err.captcha") }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Сравнение выполняется всегда, даже когда пользователя нет: одинаковое время
  // ответа не даёт отличить «нет такой почты» от «неверный пароль».
  const passwordOk = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.isActive || !passwordOk) {
    return NextResponse.json({ error: t("auth.err.badCredentials") }, { status: 401 });
  }

  // Второй шаг при включённом 2FA: пароль верен → просим/проверяем код.
  if (user.totpEnabled) {
    // Флаг стоит, а секрета нет — это испорченная строка, и трактовать её как
    // «двухфакторки нет» значит тихо пустить туда, где её включали намеренно.
    if (!user.totpSecret) {
      return NextResponse.json({ error: t("auth.err.badCredentials") }, { status: 401 });
    }
    if (!totp) {
      return NextResponse.json({ needTotp: true });
    }
    if (!authenticator.check(totp, user.totpSecret)) {
      return NextResponse.json({ error: t("auth.err.badTotp") }, { status: 401 });
    }
  }

  // Вошли — счётчики обнуляем: иначе человек, промахнувшийся паролем пару раз,
  // остаётся с почти исчерпанным лимитом на четверть часа.
  await rateLimitReset(ipKey("login", clientIp));
  await rateLimitReset(idKey("login", email));

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
