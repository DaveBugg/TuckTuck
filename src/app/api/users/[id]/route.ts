import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };
const ROLES = ["ADMIN", "USER"] as const;

/** Нельзя оставить систему без активного админа. */
async function wouldRemoveLastAdmin(targetId: string, next: { role?: string; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return false;
  const stillAdmin = (next.role ?? target.role) === "ADMIN" && (next.isActive ?? target.isActive);
  if (target.role === "ADMIN" && target.isActive && !stillAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, NOT: { id: targetId } },
    });
    return otherAdmins === 0;
  }
  return false;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("users.manage");
    const { id } = await ctx.params;
    const b = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof b.name === "string") data.name = b.name;
    if (ROLES.includes(b.role)) data.role = b.role;
    if (typeof b.isActive === "boolean") data.isActive = b.isActive;

    // сам себя: нельзя деактивировать или снять с себя админку
    if (id === me.id && (data.isActive === false || (data.role && data.role !== me.role))) {
      return NextResponse.json({ error: t("users.err.selfRole") }, { status: 400 });
    }
    if (await wouldRemoveLastAdmin(id, data as any)) {
      return NextResponse.json({ error: t("users.err.lastAdmin") }, { status: 400 });
    }

    const row = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    // деактивация → выбиваем все сессии
    if (data.isActive === false) {
      await prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return NextResponse.json({ row });
  } catch (e) {
    return toApiError(e, t);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    const me = await requirePermission("users.manage");
    const { id } = await ctx.params;
    if (id === me.id) {
      return NextResponse.json({ error: t("users.err.selfDelete") }, { status: 400 });
    }
    if (await wouldRemoveLastAdmin(id, { isActive: false })) {
      return NextResponse.json({ error: t("users.err.lastAdmin") }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toApiError(e, t);
  }
}
