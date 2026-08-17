#!/bin/sh
# TuckTuck — установка одной командой.
#
#   curl -fsSL https://raw.githubusercontent.com/DaveBugg/TuckTuck/main/setup.sh \
#     | TUCKTUCK_DOMAIN=panel.example.com sh
#
# Обновление уже поставленной панели — та же команда без переменных:
#   curl -fsSL https://raw.githubusercontent.com/DaveBugg/TuckTuck/main/setup.sh | sh
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
#   TUCKTUCK_TLS          auto (по умолчанию) — Let's Encrypt сам;
#                         internal — самоподписанный, для Cloudflare в режиме Full;
#                         путь к cert.pem и key.pem через запятую — свой сертификат
#   TUCKTUCK_SKIP_DOCKER  1 — не ставить Docker самому
#   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY   капча на входе
#   TELEGRAM_PROXY_URL    прокси до Telegram, если он с сервера недоступен
#   SEED_ADMIN_EMAIL      почта первого админа, по умолчанию admin@tucktuck.local
#   TUCKTUCK_TAG          тег образов, по умолчанию latest
#
# POSIX sh: на голом сервере bash есть не всегда, а зависеть от него ради
# массивов не хочется.
#
# ВАЖНО про stdin. Скрипт запускают как `curl ... | sh`, то есть он сам приходит
# по стандартному вводу. Команда внутри, читающая stdin, съедает остаток скрипта,
# и шелл упирается в конец файла посреди конструкции — «Syntax error: end of file
# unexpected». Поэтому каждой команде docker закрыт stdin через </dev/null, а у
# `compose run` дополнительно стоит -T: без него compose выделяет терминал.

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

# Домен можно не передавать, если панель здесь уже стоит: берём его из её же
# .env. Тогда эта же команда без единой переменной работает как ОБНОВЛЕНИЕ —
# подтянуть свежие compose-файлы, накатить миграции и перезапустить стек.
UPDATE=0
if [ -z "$DOMAIN" ] && [ -r "$DIR/.env" ]; then
  # Читаем одну строку, а не подключаем файл: там секреты, и выполнять его
  # содержимое как код незачем.
  DOMAIN="$(sed -n 's/^TUCKTUCK_DOMAIN=//p' "$DIR/.env" | head -1 | tr -d '"')"
  if [ -n "$DOMAIN" ]; then
    UPDATE=1
  fi
fi

[ -n "$DOMAIN" ] || die "не задан TUCKTUCK_DOMAIN.
  Установка: curl -fsSL ${RAW}/setup.sh | TUCKTUCK_DOMAIN=panel.example.com sh
  Обновление уже поставленной панели переменных не требует вовсе."

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

if [ "$UPDATE" = "1" ]; then
  say "Обновляю установку в $DIR (домен $DOMAIN взят из .env)"
fi

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
# deploy.sh кладём в корень установки, но НЕ поверх клона репозитория: там он
# уже есть в scripts/, и вторая копия рядом — лишний повод гадать, какая свежее.
if [ -f "$DIR/scripts/deploy.sh" ]; then
  ok "docker-compose.yml, caddy/Caddyfile (deploy.sh уже есть в scripts/)"
else
  fetch "${RAW}/scripts/deploy.sh" "$DIR/deploy.sh"
  chmod +x "$DIR/deploy.sh"
  ok "docker-compose.yml, caddy/Caddyfile, deploy.sh"
fi

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

# Ставить ли свой прокси. Решение запоминается в .env: без этого следующее
# обновление без переменных снова полезло бы занимать 80-й порт на машине, где
# его держит чужой веб-сервер.
SKIP_PROXY="${TUCKTUCK_SKIP_PROXY:-$(prev TUCKTUCK_SKIP_PROXY)}"
[ -n "$SKIP_PROXY" ] || SKIP_PROXY=0

# Способ получения сертификата переводим из понятного в директиву Caddy.
#
# Три случая, и все три встречаются: обычный DNS (Let's Encrypt сам), домен за
# Cloudflare в режиме Full (наружу светит сертификат Cloudflare, до сервера
# достаточно самоподписанного) и свой сертификат — их же Origin Certificate или
# купленный.
#
# Переменную не задали — берём то, что уже записано: иначе повторный запуск
# молча возвращал бы Let's Encrypt тому, кто выбрал самоподписанный, и панель
# за Cloudflare переставала бы отвечать.
TLS_DIRECTIVE=""
case "${TUCKTUCK_TLS:-}" in
  "") TLS_DIRECTIVE="$(prev TUCKTUCK_TLS_DIRECTIVE)" ;;
  auto) TLS_DIRECTIVE="" ;;
  internal) TLS_DIRECTIVE="tls internal" ;;
  *,*)
    cert="${TUCKTUCK_TLS%%,*}"
    key="${TUCKTUCK_TLS#*,}"
    [ -f "$cert" ] || die "не найден файл сертификата: $cert"
    [ -f "$key" ] || die "не найден файл ключа: $key"
    mkdir -p "$DIR/caddy/certs"
    cp "$cert" "$DIR/caddy/certs/cert.pem"
    cp "$key" "$DIR/caddy/certs/key.pem"
    chmod 600 "$DIR/caddy/certs/key.pem"
    TLS_DIRECTIVE="tls /certs/cert.pem /certs/key.pem"
    ;;
  *) die "TUCKTUCK_TLS: ожидается auto, internal или «путь-к-cert.pem,путь-к-key.pem»" ;;
esac
mkdir -p "$DIR/caddy/certs"

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

# Директива TLS для Caddy. Пусто — Let's Encrypt сам.
TUCKTUCK_TLS_DIRECTIVE="${TLS_DIRECTIVE}"
# 1 — свой прокси уже есть, Caddy не поднимаем.
TUCKTUCK_SKIP_PROXY="${SKIP_PROXY}"
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
docker compose pull -q tucktuck tucktuck-pg tucktuck-redis tucktuck-proxy 2>/dev/null </dev/null \
  || docker compose pull tucktuck tucktuck-pg tucktuck-redis tucktuck-proxy </dev/null
# Мигратор в профиле tools: без --profile compose его не видит.
docker compose --profile tools pull -q tucktuck-migrate 2>/dev/null </dev/null \
  || docker compose --profile tools pull tucktuck-migrate </dev/null

say "Поднимаю базу и кеш"
docker compose up -d tucktuck-pg tucktuck-redis >/dev/null </dev/null
ok "postgres и redis"

say "Применяю миграции"
docker compose --profile tools run --rm -T tucktuck-migrate >/dev/null </dev/null \
  || die "миграции не прошли. Логи: cd $DIR && docker compose logs tucktuck-pg"
ok "схема актуальна"

# Занят ли порт. Не смогли проверить — не мешаем: лучше пропустить проверку,
# чем остановить установку из-за отсутствия ss и netstat.
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -qE "[:.]$1[[:space:]]"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | grep -qE "[:.]$1[[:space:]]"
  else
    return 1
  fi
}

# Порты проверяем заранее и только когда собираемся их занять. Иначе docker
# падает уже на подъёме контейнера с «address already in use», и человеку надо
# догадаться, что делать дальше. Свой же работающий прокси не в счёт: при
# обновлении он держит порт совершенно законно.
if [ "$SKIP_PROXY" != "1" ]; then
  # Именно if, а не «условие && присваивание»: при set -e несовпавший grep в
  # конце такой цепочки завершает весь скрипт.
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${TUCKTUCK_PREFIX:-tucktuck}-proxy"; then
    ours=1
  else
    ours=0
  fi
  if [ "$ours" = "0" ]; then
    for prt in 80 443; do
      if port_busy "$prt"; then
        die "порт $prt уже занят другой программой (веб-сервер, панель, туннель).
  Поднимите TuckTuck без своего прокси и проксируйте на него сами:

    curl -fsSL ${RAW}/setup.sh | TUCKTUCK_SKIP_PROXY=1 sh

  Приложение останется на 127.0.0.1:${TUCKTUCK_PORT:-3000} — направьте туда свой
  веб-сервер. Пример конфига nginx есть в README, раздел про HTTPS."
      fi
    done
  fi
fi

say "Поднимаю панель"
if [ "$SKIP_PROXY" = "1" ]; then
  # Прежний контейнер прокси мог остаться от установки, где его поднимали:
  # оставить его — значит и дальше держать порт, ради которого всё затевалось.
  docker compose rm -sf tucktuck-proxy >/dev/null 2>&1 </dev/null || true
  # Свой прокси уже есть: не отбираем у него 80 и 443. Приложение остаётся на
  # loopback, проксировать на него — забота того, кто это выбрал.
  docker compose up -d tucktuck >/dev/null </dev/null
  ok "приложение на 127.0.0.1:${TUCKTUCK_PORT:-3000} (прокси пропущен)"
else
  docker compose up -d tucktuck tucktuck-proxy >/dev/null </dev/null
  ok "приложение и прокси с автоматическим HTTPS"
fi
docker compose --profile workers up -d tucktuck-notify >/dev/null </dev/null
ok "воркер напоминаний"

say "Жду готовности"
i=0
until [ "$i" -ge 60 ]; do
  if docker compose exec -T tucktuck node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null </dev/null; then
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
  docker compose exec -T tucktuck node prisma/seed.mjs </dev/null || warn "создать администратора не удалось — запустите вручную"
fi

printf '\n%sГотово.%s Панель: %shttps://%s%s\n' "$G" "$N" "$B" "$DOMAIN" "$N"
if [ "$SKIP_PROXY" = "1" ]; then
  printf '  Проксируйте свой веб-сервер на 127.0.0.1:%s — HTTPS на вашей стороне.\n' "${TUCKTUCK_PORT:-3000}"
else
  printf '  Сертификат Caddy выпустит сам, если A-запись %s уже смотрит на этот сервер.\n' "$DOMAIN"
fi
printf '  Обновление: cd %s && ./deploy.sh\n' "$DIR"
printf '  Настройки:  %s/.env\n\n' "$DIR"
