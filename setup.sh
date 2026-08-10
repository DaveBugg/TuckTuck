#!/bin/sh
# TuckTuck — установка одной командой.
#
#   curl -fsSL https://raw.githubusercontent.com/DaveBugg/TuckTuck/main/setup.sh \
#     | TUCKTUCK_DOMAIN=panel.example.com sh
#
# Минимум — только домен. Всё остальное (пароль базы, три секрета, токен
# воркера) генерируется здесь же и кладётся в .env. Задавать их руками имеет
# смысл только при переезде на другую машину с той же базой.
#
# Скрипт ИДЕМПОТЕНТЕН: повторный запуск обновляет compose-файлы и перезапускает
# стек, но НЕ трогает уже записанные секреты. Это не аккуратность ради
# аккуратности: перевыпуск TUCKTUCK_ENCRYPTION_KEY сделал бы нечитаемыми все
# сохранённые токены ботов и креды ресурсов.
#
# Переменные (все необязательные, кроме домена):
#   TUCKTUCK_DOMAIN       домен панели — единственное обязательное
#   TUCKTUCK_DIR          куда ставить, по умолчанию /opt/tucktuck
#   TUCKTUCK_PORT         порт приложения на loopback, по умолчанию 3000
#   TUCKTUCK_PREFIX       префикс имён контейнеров, по умолчанию tucktuck
#   TUCKTUCK_SKIP_PROXY   1 — не поднимать Caddy: свой прокси уже есть
#   TUCKTUCK_SKIP_DOCKER  1 — не ставить Docker самому
#   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY   капча на входе
#   TELEGRAM_PROXY_URL    прокси до Telegram, если он с сервера недоступен
#   SEED_ADMIN_EMAIL      почта первого админа, по умолчанию admin@tucktuck.local
#   TUCKTUCK_TAG          тег образов, по умолчанию latest
#
# POSIX sh: на голом сервере bash есть не всегда, а зависеть от него ради
# массивов не хочется.

set -eu

REPO="${TUCKTUCK_REPO:-DaveBugg/TuckTuck}"
REF="${TUCKTUCK_REF:-main}"
DIR="${TUCKTUCK_DIR:-/opt/tucktuck}"
RAW="https://raw.githubusercontent.com/${REPO}/${REF}"

B="$(printf '\033[1;34m')"; G="$(printf '\033[1;32m')"; Y="$(printf '\033[1;33m')"
R="$(printf '\033[1;31m')"; N="$(printf '\033[0m')"
say()  { printf '%s==>%s %s\n' "$B" "$N" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%sОШИБКА:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# ─────────────────────────── Проверки ───────────────────────────

[ "$(id -u)" = "0" ] || die "нужен root: запустите под sudo"

DOMAIN="${TUCKTUCK_DOMAIN:-}"
[ -n "$DOMAIN" ] || die "не задан TUCKTUCK_DOMAIN.
  Пример: curl -fsSL ${RAW}/setup.sh | TUCKTUCK_DOMAIN=panel.example.com sh"

# Домен, а не URL и не адрес с портом: его подставят в конфиг Caddy, и мусор
# там обернётся неудачным выпуском сертификата с невнятной ошибкой.
case "$DOMAIN" in
  *://*|*/*|*:*) die "TUCKTUCK_DOMAIN — только имя хоста, без схемы и пути: panel.example.com" ;;
  *.*) : ;;
  *) die "TUCKTUCK_DOMAIN не похож на домен: $DOMAIN" ;;
esac

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"
  else die "нет ни curl, ни wget"
  fi
}

say "Проверяю систему"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  ok "$(uname -sr), ${PRETTY_NAME:-неизвестный дистрибутив}"
else
  ok "$(uname -sr)"
fi

# ─────────────────────────── Docker ───────────────────────────

if ! command -v docker >/dev/null 2>&1; then
  if [ "${TUCKTUCK_SKIP_DOCKER:-0}" = "1" ]; then
    die "docker не установлен, а установка отключена TUCKTUCK_SKIP_DOCKER=1"
  fi
  say "Ставлю Docker с get.docker.com (официальный скрипт Docker)"
  warn "чтобы поставить самому — прервите и запустите заново с TUCKTUCK_SKIP_DOCKER=1"
  fetch https://get.docker.com /tmp/get-docker.sh
  sh /tmp/get-docker.sh >/dev/null 2>&1 || die "не удалось установить Docker"
  rm -f /tmp/get-docker.sh
  ok "docker установлен"
else
  ok "docker уже есть"
fi

docker compose version >/dev/null 2>&1 || die "нужен плагин docker compose (v2)"
systemctl enable --now docker >/dev/null 2>&1 || true

# ─────────────────────── Файлы стека ───────────────────────

say "Кладу файлы в $DIR"
mkdir -p "$DIR/caddy"
# Compose-файл и конфиг прокси перезаписываем всегда: это часть поставки, и
# именно их обновление приносит новые сервисы и настройки.
fetch "${RAW}/docker-compose.yml" "$DIR/docker-compose.yml"
fetch "${RAW}/caddy/Caddyfile" "$DIR/caddy/Caddyfile"
fetch "${RAW}/scripts/deploy.sh" "$DIR/deploy.sh" && chmod +x "$DIR/deploy.sh"
ok "docker-compose.yml, caddy/Caddyfile, deploy.sh"

cd "$DIR"

# ─────────────────────────── .env ───────────────────────────

gen() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Значение из уже существующего .env. Пустая строка, если файла или ключа нет.
prev() {
  [ -f .env ] || return 0
  sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" .env | head -1
}

# Приоритет: переменная окружения → то, что уже лежит в .env → генерация.
pick() {
  eval "v=\${$1:-}"
  [ -n "${v:-}" ] && { printf '%s' "$v"; return; }
  v="$(prev "$1")"
  [ -n "$v" ] && { printf '%s' "$v"; return; }
  printf '%s' "$2"
}

FIRST_RUN=0
[ -f .env ] || FIRST_RUN=1

PG_PASS="$(pick POSTGRES_PASSWORD "$(gen 24)")"
JWT="$(pick TUCKTUCK_JWT_SECRET "$(gen 32)")"
ENC="$(pick TUCKTUCK_ENCRYPTION_KEY "$(gen 32)")"
WORKER="$(pick TUCKTUCK_WORKER_TOKEN "$(gen 32)")"

say "Пишу .env"
umask 077
cat > .env <<EOF
# Создан setup.sh $(date -u +%Y-%m-%dT%H:%M:%SZ). Секреты сгенерированы здесь и
# больше нигде не хранятся — сделайте копию файла, если машина одноразовая.

TUCKTUCK_DOMAIN="${DOMAIN}"
TUCKTUCK_PORT="${TUCKTUCK_PORT:-3000}"
# Префикс имён контейнеров. Менять нужно, только если на этой машине уже стоит
# другая установка TuckTuck — иначе имена столкнутся.
TUCKTUCK_PREFIX="$(pick TUCKTUCK_PREFIX "tucktuck")"
TUCKTUCK_TAG="${TUCKTUCK_TAG:-latest}"

POSTGRES_USER="tucktuck"
POSTGRES_PASSWORD="${PG_PASS}"
POSTGRES_DB="tucktuck"
DATABASE_URL="postgresql://tucktuck:${PG_PASS}@tucktuck-pg:5432/tucktuck?schema=public"

TUCKTUCK_JWT_SECRET="${JWT}"
TUCKTUCK_ENCRYPTION_KEY="${ENC}"
TUCKTUCK_WORKER_TOKEN="${WORKER}"

REDIS_URL="redis://tucktuck-redis:6379"
NOTIFY_INTERVAL_SEC="${NOTIFY_INTERVAL_SEC:-300}"

# Капча на входе. Пусто — выключена. Ключи берутся в панели Cloudflare Turnstile.
TURNSTILE_SITE_KEY="$(pick TURNSTILE_SITE_KEY "")"
TURNSTILE_SECRET_KEY="$(pick TURNSTILE_SECRET_KEY "")"

# Прокси до api.telegram.org, если он с этого сервера недоступен.
# Формат: socks5://user:pass@host:port или http://user:pass@host:port
TELEGRAM_PROXY_URL="$(pick TELEGRAM_PROXY_URL "")"

SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@tucktuck.local}"
EOF
chmod 600 .env
ok "$DIR/.env (права 600)"
[ "$FIRST_RUN" = "1" ] || ok "прежние секреты сохранены — база и сохранённые креды остались читаемыми"

# ─────────────────────── Запуск ───────────────────────

say "Тяну образы"
docker compose pull -q tucktuck tucktuck-pg tucktuck-redis tucktuck-proxy 2>/dev/null   || docker compose pull tucktuck tucktuck-pg tucktuck-redis tucktuck-proxy
# Мигратор в профиле tools: без --profile compose его не видит.
docker compose --profile tools pull -q tucktuck-migrate 2>/dev/null   || docker compose --profile tools pull tucktuck-migrate

say "Поднимаю базу и кеш"
docker compose up -d tucktuck-pg tucktuck-redis >/dev/null
ok "postgres и redis"

say "Применяю миграции"
docker compose --profile tools run --rm tucktuck-migrate >/dev/null   || die "миграции не прошли. Логи: cd $DIR && docker compose logs tucktuck-pg"
ok "схема актуальна"

say "Поднимаю панель"
if [ "${TUCKTUCK_SKIP_PROXY:-0}" = "1" ]; then
  # Свой прокси уже есть: не отбираем у него 80 и 443. Приложение остаётся на
  # loopback, проксировать на него — забота того, кто это выбрал.
  docker compose up -d tucktuck >/dev/null
  ok "приложение на 127.0.0.1:${TUCKTUCK_PORT:-3000} (прокси пропущен)"
else
  docker compose up -d tucktuck tucktuck-proxy >/dev/null
  ok "приложение и прокси с автоматическим HTTPS"
fi
docker compose --profile workers up -d tucktuck-notify >/dev/null
ok "воркер напоминаний"

say "Жду готовности"
i=0
until [ "$i" -ge 60 ]; do
  if docker compose exec -T tucktuck node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  i=$((i + 1)); sleep 2
done
[ "$i" -lt 60 ] || die "панель не поднялась. Логи: cd $DIR && docker compose logs tucktuck"
ok "панель отвечает"

# ─────────────────── Первый администратор ───────────────────

if [ "$FIRST_RUN" = "1" ]; then
  say "Завожу администратора"
  # Пароль печатается ОДИН раз и нигде не сохраняется.
  docker compose exec -T tucktuck node prisma/seed.mjs || warn "создать администратора не удалось — запустите вручную"
fi

printf '\n%sГотово.%s Панель: %shttps://%s%s\n' "$G" "$N" "$B" "$DOMAIN" "$N"
if [ "${TUCKTUCK_SKIP_PROXY:-0}" = "1" ]; then
  printf '  Проксируйте свой веб-сервер на 127.0.0.1:%s — HTTPS на вашей стороне.\n' "${TUCKTUCK_PORT:-3000}"
else
  printf '  Сертификат Caddy выпустит сам, если A-запись %s уже смотрит на этот сервер.\n' "$DOMAIN"
fi
printf '  Обновление: cd %s && ./deploy.sh\n' "$DIR"
printf '  Настройки:  %s/.env\n\n' "$DIR"
