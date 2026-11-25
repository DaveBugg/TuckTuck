# =============================================================================
# TuckTuck — селфхостед панель планирования оплат (Next 16 + TS + Postgres).
# Build context = корень репозитория.
#
# Образы (multi-stage):
#   runner   : node server.js        — приложение (Next standalone)
#   migrator : prisma migrate deploy — разовый прогон миграций перед `up`
#   test     : npm run test:unit     — падает, если юниты красные (для CI)
#
# Standalone runner: next.config.js задаёт `output: "standalone"`, поэтому в
# рантайм едет только .next/standalone (self-contained урезанный node_modules +
# server.js) + .next/static + public. images.unoptimized=true → sharp не нужен.
# =============================================================================

ARG NODE_VERSION=22-slim

# ---------- deps: полное дерево для сборки Next (слой кеша) ----------
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# npm install, а не ci: lockfile периодически расходится с package.json при
# ручных правках зависимостей, и ci на этом падает. legacy-peer-deps повторяет
# npmConfig из package.json (сам npm его оттуда не читает).
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --legacy-peer-deps --no-audit --no-fund

# ---------- builder: prisma generate + next build ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* впекаются в клиентский бандл на этапе СБОРКИ (.env в dockerignore).
# Каждый ARG обязан быть продублирован в ENV: сам по себе ARG виден только
# командам Dockerfile, а `next build` читает именно окружение процесса.
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
# Turnstile sitekey тоже build-time. Пусто → капча не рендерится.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# Prisma client должен существовать до сборки Next (его импортирует lib/prisma).
RUN npx prisma generate
RUN npm run build

# ---------- seed-tools: tsx для запуска prisma/seed.ts в slim-раннере ----------
FROM node:${NODE_VERSION} AS seed-tools
WORKDIR /seed-tools
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund tsx

# ---------- test: юнит-тесты в CI ----------
# Отдельной стадией, а не отдельной джобой с `npm install`: дерево зависимостей
# уже собрано выше, и переиспользование слоя экономит минуты на каждом пуше.
# Стадия ничего не отдаёт наружу: смысл в том, что `docker build --target test`
# падает, если тесты красные.
FROM builder AS test
RUN npm run test:unit

# ---------- migrator: prisma CLI + миграции (ОТДЕЛЬНЫЙ образ) ----------
# Намеренно отдельно от runner: CLI с движками весит ~150 МБ, и вешать их на
# образ, который обслуживает трафик, незачем — мигратор нужен разово, перед
# `up` в деплое. Собран из тех же исходников, поэтому набор миграций
# гарантированно соответствует коду (никакого version skew).
# Запуск: docker compose run --rm tucktuck-migrate  → prisma migrate deploy.
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
# CLI ставим ЧИСТО, а не копируем node_modules/prisma из dependencies: npm
# поднимает транзитивные зависимости в корень дерева, поэтому выборочное
# копирование ломается на первом же require.
# Версия берётся ИЗ package.json → не разъедется с приложением при апгрейде.
# package.json кладём ВНЕ /app: `npm install <pkg>` в каталоге с ним подтянул бы
# ещё и всё дерево зависимостей приложения. Здесь — пустой манифест и один пакет.
COPY package.json /tmp/pkg.json
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm init -y >/dev/null \
 && npm install --no-audit --no-fund --save-exact \
      "prisma@$(node -p "require('/tmp/pkg.json').devDependencies.prisma")" \
 && npm cache clean --force \
 && rm -f /tmp/pkg.json
COPY prisma.config.ts ./
COPY prisma ./prisma
ENTRYPOINT ["/usr/bin/tini","--","node","node_modules/prisma/build/index.js"]
CMD ["migrate","deploy"]

# ---------- runner (slim, standalone) ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Версия сборки отдаётся в /api/health. По ней деплой-скрипт убеждается, что
# поднялся ИМЕННО новый образ: без этого «успешный» деплой неотличим от
# рестарта старого контейнера, когда pull молча взял образ из кеша.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# Standalone output = server.js + минимальный node_modules; static/public в него
# не трассируются и копируются рядом.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static     ./.next/static
COPY --from=builder --chown=node:node /app/public           ./public

# Сид первого админа. Переведён на TypeScript; в раннере нет tsx, поэтому
# подкладываем tsx/esbuild и исходник seed.ts с tsconfig + сгенерированный клиент.
# Запуск на сервере:
#   docker compose exec tucktuck node node_modules/tsx/dist/cli.mjs prisma/seed.ts
COPY --from=builder --chown=node:node /app/prisma/seed.ts ./prisma/seed.ts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/src/generated/prisma ./src/generated/prisma

# bcryptjs — ОТДЕЛЬНО и намеренно. В standalone-выводе его нет: Next вшивает
# зависимости серверных роутов прямо в бандл, и как самостоятельный модуль
# bcryptjs не остаётся (ловили ERR_MODULE_NOT_FOUND при первом сиде на сервере).
# Приложению это не мешает — оно ходит в свой бандл, — но seed.ts запускается
# отдельным процессом и резолвит модуль обычным способом. Пакет чисто на JS,
# весит десятки килобайт.
COPY --from=builder --chown=node:node /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Prisma 7: для seed.ts нужен драйвер-адаптер и его транзитивные зависимости,
# которые Next не оставляет в standalone node_modules (они заbundлены в бандл).
# dotenv нужен для `import "dotenv/config"` в seed.ts.
COPY --from=builder --chown=node:node /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=node:node /app/node_modules/@prisma/adapter-pg ./node_modules/@prisma/adapter-pg
COPY --from=builder --chown=node:node /app/node_modules/@prisma/driver-adapter-utils ./node_modules/@prisma/driver-adapter-utils
COPY --from=builder --chown=node:node /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=builder --chown=node:node /app/node_modules/postgres-array ./node_modules/postgres-array

# tsx + esbuild для запуска seed.ts в раннере (Linux-специфичные бинарники
# ставятся отдельной стадией seed-tools).
COPY --from=seed-tools --chown=node:node /seed-tools/node_modules/tsx ./node_modules/tsx
COPY --from=seed-tools --chown=node:node /seed-tools/node_modules/esbuild ./node_modules/esbuild
COPY --from=seed-tools --chown=node:node /seed-tools/node_modules/@esbuild ./node_modules/@esbuild

# Воркер напоминаний. Тот же образ, другая команда (см. docker-compose.yml):
# отдельный образ ради одного .mjs без зависимостей был бы лишним.
COPY --from=builder --chown=node:node /app/notify-worker.mjs ./notify-worker.mjs

USER node
EXPOSE 3000

# Пробой по /api/health: он же дёргает БД, поэтому «контейнер жив, но база
# недоступна» не выглядит здоровым. start-period даёт время на холодный старт.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.js"]
