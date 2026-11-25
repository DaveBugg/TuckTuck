import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma 7 требует настройку соединения в конфиге, а не в схеме.
    // process.env позволяет запускать `prisma generate` без DATABASE_URL
    // (generate использует только схему); миграции/seed получают реальный URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
