import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

/** Админ сбрасывает пароль юзеру: временный пароль возвращается ОДИН раз, все сессии юзера ревокаются. */
export async function POST(req: Request, ctx: Ctx) {
  const t = tForRequest(req);
  try {
    await requirePermission("users.manage");
    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: t("err.notFound") }, { status: 404 });
    const tempPassword = crypto.randomBytes(9).toString("base64url");
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(tempPassword, 10) },
      }),
      prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true, tempPassword });
  } catch (e) {
    return toApiError(e, t);
  }
}
