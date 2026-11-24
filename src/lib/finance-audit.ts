// Тонкая обёртка над FinanceAuditLog. Роуты сами подготавливают plain-снимки,
// здесь только запись и вспомогательная сериализация Decimal → строка.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditEntity =
  "expense" | "income" | "distribution" | "project" | "member" | "recurring";

/**
 * Decimal из Prisma не сериализуется в JSON, поэтому перед записью в Json-поле
 * превращаем объекты в plain-структуры: Decimal → строка, Date → ISO.
 */
export function serializeSnapshot<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(serializeSnapshot);

  // Decimal — у @prisma/client/runtime есть метод toString()
  const anyV = value as any;
  if (
    typeof anyV.toString === "function" &&
    anyV.constructor?.name === "Decimal"
  ) {
    return anyV.toString();
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as object)) {
    out[k] = serializeSnapshot(v);
  }
  return out;
}

/** Записать событие аудита. before/after — plain-объекты или null. */
export async function writeAudit(
  actorId: string | null,
  action: string,
  entity: AuditEntity,
  entityId: string,
  before: unknown,
  after: unknown
): Promise<Prisma.FinanceAuditLogGetPayload<{}>> {
  return prisma.financeAuditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      before: serializeSnapshot(before) as Prisma.InputJsonValue,
      after: serializeSnapshot(after) as Prisma.InputJsonValue,
    },
  });
}
