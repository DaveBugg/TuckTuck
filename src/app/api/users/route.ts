import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseListParams, toApiError } from "@/lib/list-query";
import { tForRequest } from "@/lib/i18n/server";

const ROLES = ["ADMIN", "USER"] as const;

export async function GET(req: Request) {
  try {
    await requirePermission("users.view");
    const p = parseListParams(req.url, {
      sortable: ["email", "name", "role", "createdAt", "isActive"],
      defaultSort: "createdAt",
    });
    const role = p.get("role");
    const where = {
      ...(ROLES.includes(role as any) ? { role: role as (typeof ROLES)[number] } : {}),
      ...(p.search
        ? {
            OR: [
              { email: { contains: p.search, mode: "insensitive" as const } },
              { name: { contains: p.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { [p.sort]: p.order },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          totpEnabled: true,
          createdAt: true,
          _count: { select: { sessions: { where: { revokedAt: null } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return NextResponse.json({ rows, total });
  } catch (e) {
    return toApiError(e);
  }
}

export async function POST(req: Request) {
  const t = tForRequest(req);
  try {
    await requirePermission("users.manage");
    const b = await req.json().catch(() => ({}));
    const email = typeof b.email === "string" ? b.email.toLowerCase().trim() : "";
    const password = typeof b.password === "string" ? b.password : "";
    const role = ROLES.includes(b.role) ? b.role : "USER";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: t("users.err.email") }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: t("users.err.password") }, { status: 400 });
    }
    const row = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: typeof b.name === "string" ? b.name : "",
        role,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return toApiError(e, t);
  }
}
