#!/bin/sh
# Установка агента мониторинга TuckTuck.
#
#   curl -fsSL https://ПАНЕЛЬ/install.sh | TUCKTUCK_URL=... TUCKTUCK_TOKEN=... sh
#
# ИДЕМПОТЕНТЕН: запускайте сколько угодно раз. Повторный запуск обновляет агент
# и настройки, но не плодит вторые копии таймера и записи в cron. Это не
# теория — первая версия команды состояла из пяти строк, её выполнили дважды,
# и в crontab оказалось две записи: метрики стали приходить парами.
#
# Работает на любом Linux с /bin/sh: расписание ставится через systemd, а где
# его нет (старые дистрибутивы, контейнеры, Alpine) — через cron. Качать умеет
# и curl, и wget — в минимальном Debian нет первого, в Alpine по умолчанию есть
# только второй, из busybox.
#
# Панель ставит агент этим же скриптом по SSH, передавая его содержимое в
# TUCKTUCK_AGENT_SRC, — тогда HTTP-скачивание не нужно вовсе.

set -eu

AGENT=/usr/local/bin/tucktuck-agent
ENVF=/etc/tucktuck-agent.env
UNIT=/etc/systemd/system/tucktuck-agent
CRON_MARK='tucktuck-agent'

say()  { printf '%s\n' "$*"; }
step() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mОШИБКА:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "нужны права root (запустите под sudo)"
[ -n "${TUCKTUCK_URL:-}" ]   || die "не задан TUCKTUCK_URL"
[ -n "${TUCKTUCK_TOKEN:-}" ] || die "не задан TUCKTUCK_TOKEN"

have() { command -v "$1" >/dev/null 2>&1; }

step "Проверяю систему"
say  "  $(uname -s) $(uname -r), $( . /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-неизвестный дистрибутив}" || echo "неизвестный дистрибутив")"
[ -r /proc/stat ] || die "нет /proc/stat — это не Linux, агент работать не сможет"

# Во временный файл и только потом на место: оборванная закачка не оставит
# полускачанный агент, который будет молча падать каждую минуту.
TMP="$(mktemp)"

if [ -n "${TUCKTUCK_AGENT_SRC:-}" ] && [ -r "${TUCKTUCK_AGENT_SRC}" ]; then
  # Установка по SSH из панели: агент уже передан по тому же соединению, и
  # качать его по HTTP незачем. Побочно это снимает требование curl/wget на
  # время установки — они нужны только самому агенту при отправке метрик.
  step "Беру агент из переданного файла"
  cat "$TUCKTUCK_AGENT_SRC" > "$TMP"
else
  step "Скачиваю агент"
  if have curl; then
    curl -fsSL --max-time 30 "$TUCKTUCK_URL/agent.sh" -o "$TMP" \
      || die "не удалось скачать $TUCKTUCK_URL/agent.sh"
  elif have wget; then
    wget -q -O "$TMP" --timeout=30 "$TUCKTUCK_URL/agent.sh" \
      || die "не удалось скачать $TUCKTUCK_URL/agent.sh"
  else
    die "нужен curl или wget (apt install curl / apk add curl / yum install curl)"
  fi
fi

[ -s "$TMP" ] || die "агент оказался пустым"
head -1 "$TMP" | grep -q '^#!/bin/sh' || die "получен не агент — проверьте адрес панели"
mv -f "$TMP" "$AGENT"
chmod 755 "$AGENT"
say "  $AGENT"

# Отправлять метрики агенту всё-таки нечем, если нет ни того ни другого.
have curl || have wget || die "нужен curl или wget — агенту нечем отправлять метрики"

step "Записываю настройки"
# Перезаписываем целиком: повторный запуск с новым токеном должен заменить
# старый, а не дописать вторую строку, которая молча победит при `.` env.
umask 077
printf 'TUCKTUCK_URL=%s\nTUCKTUCK_TOKEN=%s\n' "$TUCKTUCK_URL" "$TUCKTUCK_TOKEN" > "$ENVF"
chmod 600 "$ENVF"
say "  $ENVF (права 600)"

# ── Расписание ──────────────────────────────────────────────────────────────
# Сначала СНИМАЕМ всё, что могли поставить прошлые запуски, и только потом
# ставим заново. Иначе переход с cron на systemd оставил бы обе схемы, и
# метрики шли бы дважды в минуту.

step "Убираю прежнее расписание, если было"
if have crontab; then
  OLD="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$OLD" | grep -q "$CRON_MARK"; then
    N=$(printf '%s\n' "$OLD" | grep -c "$CRON_MARK")
    printf '%s\n' "$OLD" | grep -v "$CRON_MARK" | crontab - 2>/dev/null || true
    say "  из cron убрано записей: $N"
  fi
fi
if [ -d /etc/systemd/system ] && [ -f "$UNIT.timer" ]; then
  systemctl disable --now tucktuck-agent.timer >/dev/null 2>&1 || true
  say "  прежний systemd-таймер остановлен"
fi

if have systemctl && [ -d /run/systemd/system ]; then
  step "Ставлю systemd-таймер (раз в минуту)"
  cat > "$UNIT.service" <<EOF
[Unit]
Description=TuckTuck monitoring agent
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=$ENVF
ExecStart=$AGENT
EOF
  cat > "$UNIT.timer" <<EOF
[Unit]
Description=TuckTuck monitoring agent every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
# Разброс, чтобы десяток серверов не бил в панель одновременно каждую минуту.
RandomizedDelaySec=10s
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now tucktuck-agent.timer >/dev/null 2>&1 \
    || die "не удалось включить таймер (systemctl status tucktuck-agent.timer)"
  say "  таймер tucktuck-agent.timer включён"
else
  have crontab || die "нет ни systemd, ни cron — расписание поставить нечем"
  step "Ставлю запись в cron (раз в минуту)"
  ( crontab -l 2>/dev/null || true; echo "* * * * * $AGENT >/dev/null 2>&1" ) | crontab -
  say "  запись добавлена"
fi

step "Пробный запуск"
# Первый запуск всегда без CPU: считать его не с чем, состояние только что
# создано. Это не ошибка, и пугать этим не нужно.
if "$AGENT"; then
  say "  метрика отправлена (CPU появится со второго запуска, через минуту)"
else
  die "агент запустился, но отправить метрику не смог — проверьте, что с сервера открыт доступ к $TUCKTUCK_URL"
fi

printf '\033[1;32mГотово.\033[0m Метрики появятся в панели в течение минуты.\n'
