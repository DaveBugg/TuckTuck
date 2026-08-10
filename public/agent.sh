#!/bin/sh
# Агент мониторинга TuckTuck.
#
# Снимает CPU, память, диск, load average и аптайм и отправляет в панель.
# Запускается по таймеру (systemd или cron) — своего демона не держит.
#
# На /bin/sh и coreutils намеренно: агент ставится на чужие серверы, и требовать
# там Node, Python или Docker — значит не поставить его на половину машин.
# Всё читается из /proc и df, которые есть везде, где есть Linux.
#
# Ставится через install.sh, вручную запускать не нужно.

set -eu

[ -f /etc/tucktuck-agent.env ] && . /etc/tucktuck-agent.env

URL="${TUCKTUCK_URL:-}"
TOKEN="${TUCKTUCK_TOKEN:-}"
DISK_PATH="${TUCKTUCK_DISK:-/}"
STATE_DIR="${TUCKTUCK_STATE_DIR:-/var/lib/tucktuck-agent}"
STATE="$STATE_DIR/cpu.state"

if [ -z "$URL" ] || [ -z "$TOKEN" ]; then
  echo "tucktuck-agent: не заданы TUCKTUCK_URL и TUCKTUCK_TOKEN" >&2
  exit 1
fi

# ── CPU ─────────────────────────────────────────────────────────────────────
# Считаем разницу с ПРОШЛЫМ запуском, а не два замера с паузой в секунду.
#
# Пауза казалась проще, но давала неверные числа: на одноядерной машине в это
# секундное окно попадает сам агент вместе с awk и curl, то есть он мерил
# собственную работу и стабильно показывал 100%. Окно между запусками (обычно
# минута) на два порядка больше времени работы агента, и его вклад тонет.
#
# Побочно: агент больше не спит секунду и завершается сразу.
read_cpu() {
  # printf, а не print: у total бывает девять значащих цифр, и вывод по
  # умолчанию (OFMT=%.6g) превратил бы их в 1.21906e+08.
  awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; printf "%.0f %.0f\n", total, idle}' /proc/stat
}

CUR="$(read_cpu)"
CPU=""

mkdir -p "$STATE_DIR" 2>/dev/null || true
if [ -r "$STATE" ]; then
  PREV="$(cat "$STATE" 2>/dev/null || echo '')"
  if [ -n "$PREV" ]; then
    CPU=$(awk -v p="$PREV" -v c="$CUR" 'BEGIN{
      split(p, a, " "); split(c, b, " ");
      dt = b[1] - a[1]; di = b[2] - a[2];
      # dt<=0 — счётчики сбросились (перезагрузка) или состояние из будущего.
      # Тогда честнее не показать ничего, чем показать выдумку.
      if (dt <= 0) exit;
      v = (dt - di) * 100 / dt;
      if (v < 0) v = 0;
      if (v > 100) v = 100;
      printf "%.1f", v;
    }')
  fi
fi
# Через временный файл: два одновременных запуска не оставят половину строки,
# а читатель никогда не увидит недописанное состояние.
printf '%s' "$CUR" > "$STATE.tmp" 2>/dev/null && mv -f "$STATE.tmp" "$STATE" 2>/dev/null || true

# ── Память ──────────────────────────────────────────────────────────────────
# MemAvailable, а не MemFree: free не учитывает кеш, который ядро отдаст по
# первому требованию, и на нормальной машине показывал бы «памяти нет».
MEM=$(awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{
  if (t > 0 && a != "") printf "%.1f", (t - a) * 100 / t;
}' /proc/meminfo)

# ── Диск ────────────────────────────────────────────────────────────────────
# -P — POSIX-формат: без него длинные имена устройств переносятся на вторую
# строку, и колонки разъезжаются.
DISK=$(df -P "$DISK_PATH" 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')

# ── Load average, аптайм, ядра ──────────────────────────────────────────────
LOAD1=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "")
UPTIME=$(awk '{printf "%d", $1}' /proc/uptime 2>/dev/null || echo "")
HOSTNAME_V=$(hostname 2>/dev/null || echo "")
CORES=$(nproc 2>/dev/null || echo "")

# ── Отправка ────────────────────────────────────────────────────────────────
# Пустые значения уходят как null: панель покажет прочерк вместо нуля. Ноль
# означал бы «простаивает», а это неправда — метрику просто не удалось снять.
# CPU пуст на ПЕРВОМ запуске: сравнивать ещё не с чем.
json_num() { [ -n "$1" ] && printf '%s' "$1" || printf 'null'; }

BODY=$(printf '{"cpu":%s,"memory":%s,"disk":%s,"load1":%s,"uptime":%s,"cores":%s,"host":"%s","agent":"sh-2"}' \
  "$(json_num "$CPU")" \
  "$(json_num "$MEM")" \
  "$(json_num "$DISK")" \
  "$(json_num "$LOAD1")" \
  "$(json_num "$UPTIME")" \
  "$(json_num "$CORES")" \
  "$HOSTNAME_V")

# curl есть не везде: минимальный Debian ставится без него, в Alpine и на
# роутерах вместо него busybox wget. Требовать curl значило бы не поставить
# агент на часть машин из-за инструмента, а не из-за возможностей системы.
#
# Таймаут обязателен в обоих вариантах: зависшая сеть без него оставит процесс
# висеть до следующего тика, и за час их накопятся десятки.
if command -v curl >/dev/null 2>&1; then
  curl -fsS --max-time 20 \
    -X POST "$URL/api/ingest/metrics" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Token: $TOKEN" \
    -d "$BODY" >/dev/null
elif command -v wget >/dev/null 2>&1; then
  # busybox wget не знает --method/--body-data, GNU wget не знает --post-data
  # вместе с --header в старых версиях. Пробуем оба, тихо.
  wget -q -O /dev/null --timeout=20 \
    --header="Content-Type: application/json" \
    --header="X-Agent-Token: $TOKEN" \
    --post-data="$BODY" "$URL/api/ingest/metrics" 2>/dev/null \
  || wget -q -O /dev/null --timeout=20 \
    --header="Content-Type: application/json" \
    --header="X-Agent-Token: $TOKEN" \
    --method=POST --body-data="$BODY" "$URL/api/ingest/metrics"
else
  echo "tucktuck-agent: нужен curl или wget" >&2
  exit 1
fi
