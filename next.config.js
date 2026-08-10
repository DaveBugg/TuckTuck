/** @type {import('next').NextConfig} */
const nextConfig = {
  // Тонкий рантайм в докере: .next/standalone + .next/static (см. Dockerfile).
  output: "standalone",
  // Нативный движок Prisma не попадает в standalone автоматически —
  // без этого приложение в контейнере падает на первом запросе к БД.
  outputFileTracingIncludes: {
    "*": ["./node_modules/.prisma/client/**"],
  },
  // ssh2 подтягивает свои части через require по вычисляемым путям (нативный
  // ускоритель, если собрался). Бандлер такого не видит и молча выкидывает —
  // а падает это уже в рантайме, на первой установке агента.
  serverExternalPackages: ["ssh2"],
  images: {
    // Оптимизатор Next тянет sharp и кеш на диск; логотипы и так мелкие.
    unoptimized: true,
  },
};

module.exports = nextConfig;
