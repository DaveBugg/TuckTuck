import { NextResponse } from "next/server";
import { AuthError, getCurrentTokenPayload, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tForRequest } from "@/lib/i18n/server";

function asApiError(e: unknown): NextResponse {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/** Активные сессии текущего юзера; текущая помечена isCurrent. */
export async function GET() {
  try {
    const user = await requireUser();
    const payload = await getCurrentTokenPayload();
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, jti: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
    });
    return NextResponse.json({
      sessions: sessions.map(s => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        isCurrent: s.jti === payload?.jti,
      })),
    });
  } catch (e) {
    return asApiError(e);
  }
}

/** Ревокация: body {sessionId} — одна СВОЯ сессия; body {others:true} — все кроме текущей. */
export async function DELETE(req: Request) {
  const t = tForRequest(req);
  try {
    const user = await requireUser();
    const payload = await getCurrentTokenPayload();
    const body = await req.json().catch(() => ({}));

    if (body.others === true) {
      const r = await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null, NOT: { jti: payload?.jti || "" } },
        data: { revokedAt: new Date() },
      });
      return NextResponse.json({ ok: true, revoked: r.count });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return NextResponse.json({ error: t("auth.err.sessionIdRequired") }, { status: 400 });
    }
    // userId в where — чужую сессию ревокнуть нельзя.
    const r = await prisma.session.updateMany({
      where: { id: sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (r.count === 0) {
      return NextResponse.json({ error: t("auth.err.sessionNotFound") }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return asApiError(e);
  }
}
