import { PrismaClient } from "@prisma/client";

// Singleton — переживает hot-reload дев-сервера Next. Без этого каждый релоад
// поднимал бы новый пул соединений, и Postgres упирался бы в max_connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
