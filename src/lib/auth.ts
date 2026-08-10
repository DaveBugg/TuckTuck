// Server-side auth core: jose JWT in an HttpOnly cookie + DB revalidation on
// every read (a valid token alone is not trusted — deactivated users drop out
// immediately). Mirrors the handoff-lab admin pattern.
// Middleware does its own edge-safe jwtVerify (no prisma there) — see middleware.ts.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPermission, type Permission } from "./permissions";

export const AUTH_COOKIE = "tt_token";
export const USER_COOKIE = "tt_user"; // readable by client JS — display info only, never trusted
export const TOKEN_TTL_SEC = 7 * 24 * 60 * 60;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Язык интерфейса — клиент по нему сверяет куку и чинит расхождение. */
  locale: string;
};

export type TokenPayload = {
  sub: string;
  jti: string; // id сессии (Session.jti) — мультисессии/ревокация
  role: UserRole;
  email: string;
  name: string;
};

export function jwtSecret(): Uint8Array {
  const s = process.env.TUCKTUCK_JWT_SECRET;
  if (!s) throw new Error("TUCKTUCK_JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export function publicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale };
}

export async function signAuthToken(u: User, jti: string): Promise<string> {
  return new SignJWT({ role: u.role, email: u.email, name: u.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC)
    .sign(jwtSecret());
}

export async function verifyAuthToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/** Payload текущего токена из cookie (без обращения к БД). */
export async function getCurrentTokenPayload(): Promise<TokenPayload | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

/**
 * Token from cookie → verify → session by jti must exist and be non-revoked →
 * reload user from DB → must be active. lastSeenAt обновляется не чаще раза в
 * минуту (fire-and-forget).
 */
export async function getAuthUser(): Promise<User | null> {
  const payload = await getCurrentTokenPayload();
  if (!payload?.sub || !payload.jti) return null;
  const session = await prisma.session.findUnique({
    where: { jti: payload.jti },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.userId !== payload.sub) return null;
  const user = session.user;
  if (!user || !user.isActive) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  return user;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
  }
}

/** For API routes / server components: throws AuthError(401/403). */
export async function requireUser(roles?: UserRole[]): Promise<User> {
  const user = await getAuthUser();
  if (!user) throw new AuthError(401);
  if (roles && roles.length > 0 && !roles.includes(user.role)) throw new AuthError(403);
  return user;
}

/** Предпочтительный гейт: код запрашивает ПРАВО, а не роль (см. lib/permissions). */
export async function requirePermission(perm: Permission): Promise<User> {
  const user = await getAuthUser();
  if (!user) throw new AuthError(401);
  if (!hasPermission(user.role, perm)) throw new AuthError(403);
  return user;
}
