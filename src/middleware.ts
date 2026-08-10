// Edge auth guard: verifies the tt_token JWT signature/expiry and gates /demo
// to ADMIN. DB revalidation (isActive) happens server-side in lib/auth
// getAuthUser() — middleware can't reach prisma on the edge runtime.
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { hasPermission, routePermission } from "@/lib/permissions";

const AUTH_COOKIE = "tt_token";

type TokenPayload = { sub?: string; jti?: string; role?: string };

async function readToken(req: NextRequest): Promise<TokenPayload | null> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const secret = process.env.TUCKTUCK_JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

// ЕДИНСТВЕННЫЕ публичные страницы (без логина). Всё остальное — под авторизацией.
// Регистрации нет; forgot-password нет (сброс делает админ). Логаут доступен.
const PUBLIC_PATHS = new Set(["/", "/auth/login", "/auth/logout"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const payload = await readToken(req);

  if (PUBLIC_PATHS.has(pathname)) {
    // Уже залогинен → не показываем логин снова (логаут остаётся доступен).
    if (payload && pathname === "/auth/login") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // jti обязателен: легаси-токены без сессии не пускаем даже на страницы
  // (ревокацию по БД проверяет серверный слой — getAuthUser).
  if (!payload?.sub || !payload.jti) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // Permission-gated sections (see ROUTE_PERMISSIONS in lib/permissions).
  const needed = routePermission(pathname);
  if (needed && !hasPermission(payload.role, needed)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // All pages except static assets and API routes (APIs guard themselves via requireUser).
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
