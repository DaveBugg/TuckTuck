#!/usr/bin/env bash
# Раскатка и обновление TuckTuck на сервере.
#
#   ./scripts/deploy.sh              — обновиться до latest
#   ./scripts/deploy.sh sha-a1b2c3d  — раскатать конкретную сборку (или откатиться)
#   ./scripts/deploy.sh v0.1.0       — раскатать тег релиза
#
# Сборка живёт в CI: сюда приезжают ГОТОВЫЕ образы из GHCR. На сервере не нужны
# ни исходники, ни node, ни npm — только docker, этот скрипт, docker-compose.yml
# и .env.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

TAG="${1:-latest}"
COMPOSE="docker compose"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mОШИБКА:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f .env ] || die ".env не найден. Скопируйте .env.example и заполните."
[ -f docker-compose.yml ] || die "docker-compose.yml не найден."

# Порт нужен для health-проверки ещё до того, как compose прочитает .env сам.
set -a; . ./.env; set +a
APP_URL="http://127.0.0.1:${TUCKTUCK_PORT:-3000}/api/health"

export TUCKTUCK_TAG="$TAG"

# Версия, работающая сейчас: понадобится для отката, если новая не поднимется.
PREV_IMAGE="$(docker inspect --format '{{.Config.Image}}' tucktuck 2>/dev/null || true)"
PREV_TAG="${PREV_IMAGE##*:}"
[ -n "$PREV_IMAGE" ] && log "Сейчас работает: $PREV_IMAGE" || log "Первый запуск (работающего контейнера нет)"

log "Тяну образы (tag: $TAG)"
$COMPOSE pull tucktuck tucktuck-pg tucktuck-redis tucktuck-proxy
$COMPOSE --profile tools pull tucktuck-migrate

# База поднимается ДО миграций и остаётся поднятой: мигратор ждёт её healthcheck.
log "Поднимаю Postgres и Redis"
$COMPOSE up -d tucktuck-pg tucktuck-redis

log "Применяю миграции"
# Мигратор — отдельный контейнер, запускается разово и удаляется. Если миграция
# падает, дальше не идём: поднять новый код на старой схеме хуже, чем не
# обновиться вовсе.
$COMPOSE --profile tools run --rm tucktuck-migrate \
  || die "Миграции не применились. Приложение НЕ обновлено, работает прежняя версия."

log "Обновляю приложение"
$COMPOSE up -d tucktuck

# Прокси поднимается ПОСЛЕ приложения и не перезапускается, если уже работает:
# рвать TLS-соединения на каждый деплой незачем.
log "Проверяю прокси"
$COMPOSE up -d tucktuck-proxy

# Воркер обновляем ТОЛЬКО если он уже запущен на этой машине. Профиль workers
# включают не везде, и поднимать его самим на машине, где его сознательно нет,
# скрипт деплоя не должен. Без этой ветки воркер молча оставался на старом
# образе: профильные сервисы `up -d <имя>` не трогает.
if $COMPOSE --profile workers ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^tucktuck-notify$'; then
  log "Обновляю воркер напоминаний"
  $COMPOSE --profile workers up -d tucktuck-notify
fi

# Ждём, пока новый контейнер отзовётся. Проверяем не только код 200, но и что
# в ответе именно новая версия: без этого «успешный» деплой неотличим от
# рестарта старого контейнера, когда pull молча взял образ из кеша.
log "Жду готовности ($APP_URL)"
DEPLOYED=""
for i in $(seq 1 30); do
  if BODY="$(curl -fsS --max-time 3 "$APP_URL" 2>/dev/null)"; then
    DEPLOYED="$BODY"
    break
  fi
  sleep 2
done

if [ -z "$DEPLOYED" ]; then
  warn "Приложение не отвечает на health-проверку."
  docker logs --tail 50 tucktuck 2>&1 | sed 's/^/    /' >&2 || true
  if [ -n "$PREV_IMAGE" ] && [ "$PREV_TAG" != "$TAG" ]; then
    warn "Откатываюсь на $PREV_TAG"
    TUCKTUCK_TAG="$PREV_TAG" $COMPOSE up -d tucktuck
    die "Деплой откачен на предыдущую версию. Схема БД уже мигрирована — если новая миграция несовместима со старым кодом, откат нужно делать вручную."
  fi
  die "Деплой не удался."
fi

log "Готово. Health: $DEPLOYED"
$COMPOSE ps
