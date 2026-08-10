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

  // Запрет индексации заголовком — из самого приложения, а не только из Caddy.
  //
  // Заголовок в конфиге прокси работает, лишь пока прокси наш. Панель можно
  // поставить с TUCKTUCK_SKIP_PROXY=1 за свой nginx, и тогда единственной
  // защитой остались бы robots.txt и мета-тег — а мета-тега нет ни у API, ни у
  // картинок, ни у ответов на HEAD.
  //
  // Это третий слой поверх robots.txt (src/app/robots.ts) и мета-тега
  // (src/app/layout.tsx). Дублирование намеренное: панель светит наружу
  // домен с оплатами и адресами серверов, и попасть в поиск ей нельзя.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" }],
      },
    ];
  },
};

module.exports = nextConfig;
