# TuckTuck

*[Русская версия](README.ru.md)*

Self-hosted panel for tracking what you pay for and when. Servers, VPNs,
proxies, domains and SaaS subscriptions in one list, sorted by the next payment
date, with Telegram reminders before the money is due.

Built for one person or a small team. No SaaS, no accounts anywhere else — one
`docker compose up` on your own machine.

---

## Why

Payments for infrastructure are easy to miss: a domain expires on a Tuesday, a
VPS gets suspended over a weekend, a subscription renews at a price you meant to
review. Each provider has its own panel and its own reminder email, and none of
them know about each other.

TuckTuck keeps all of it in one table: what is due, when, how much, and who the
provider is. Two days before and one day before payment a bot writes to your
Telegram. You mark it paid from the chat — the date rolls forward on its own.

## What it does

| | |
|---|---|
| **Resources** | Servers, VPNs, proxies, domains, SaaS — one list sorted by next payment |
| **Filters** | Due in 3 / 7 / 14 days, by type, provider or tag; search by name, IP, domain, URL |
| **Payments** | Mark paid — the payment goes to history, the date shifts by the billing period |
| **Reminders** | Per-resource, in days before payment; 2 and 1 by default |
| **Telegram** | Several bots, each with its own filter by type and tags; buttons under each message |
| **Monitoring** | Own agent — a POSIX shell script, no Node or Docker on the target. CPU, memory, disk, load, uptime; history for 1 / 7 / 14 / 30 days and load by hour of day |
| **Agent install** | From the panel over SSH with a live log, or one copy-paste command. The private key is never stored |
| **Money** | Fiat and crypto (coin + network), exact per-currency totals plus a converted grand total at live rates |
| **Auth** | JWT in an HttpOnly cookie, multi-session with revocation, TOTP two-factor, Cloudflare Turnstile |
| **Access** | Roles `ADMIN` and `USER`; groups decide who sees which resource |
| **Languages** | English and Russian, per user; the bot's language is set separately |

### Not built yet

Credential storage with a reveal log (schema and encryption are in place, the
screen is not), scheduled backup pulls.

## Screens

- `/dashboard` — what is due soon, monthly spend, server health
- `/resources` — the main table
- `/notifications` — Telegram bots and their filters
- `/settings` — proxy, time zone, metric retention, total currency, bot language
- `/users` — accounts, roles, password resets
- `/profile` — language, password, two-factor, active sessions

There is no sign-up: the administrator creates accounts.

## Monitoring

The agent is a POSIX shell script that reads `/proc` and `df` and posts a
snapshot once a minute. Requiring Node, Python or Docker on someone else's
server would mean not installing on half of them.

Two ways to install it:

- **Over SSH from the panel.** Paste the private key or upload the key file; the
  installation runs on the target and streams its log into the dialog. The key
  lives in memory for the duration and is never written anywhere — only host,
  port, user and the host key fingerprint are stored. The fingerprint is pinned
  on first connect and checked afterwards, the same way `ssh` does it.
- **One command**, copied from the same dialog and run as root. It is
  idempotent: re-running it updates the agent without duplicating the schedule.

The panel's own server needs neither: metrics are read from the host `/proc` and
`/` mounted read-only into the container.

Raw minute points are kept for a day, then rolled up into hourly averages, and
after a month into daily ones. A year of history for one machine is a couple of
thousand rows instead of half a million.

## Stack

Next.js 16 · TypeScript · Prisma · PostgreSQL 17 · Redis (rate cache) ·
Tailwind CSS v4 · shadcn/ui (Radix) · Caddy for automatic HTTPS.

## Running locally

```bash
cp .env.example .env          # set TUCKTUCK_JWT_SECRET at minimum
docker compose -f docker-compose.dev.yml up -d
npm install
npm run db:deploy
npm run db:seed               # prints the generated admin password once
npm run dev                   # http://localhost:3000
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build (`output: standalone`) |
| `npm test` | unit tests |
| `npm run type-check` | `tsc --noEmit` — expected to be clean |
| `npm run db:migrate` | create a migration from a changed schema |
| `npm run db:deploy` | apply migrations |
| `npm run db:seed` | create the first admin (idempotent) |

## Deploying

The server needs Docker, this repository and an `.env`. No Node, no build step —
images come prebuilt from GHCR.

```bash
git clone https://github.com/DaveBugg/TuckTuck.git && cd TuckTuck
cp .env.example .env && nano .env    # domain, DB password, secrets
./scripts/deploy.sh
docker compose exec tucktuck node prisma/seed.mjs   # first admin
```

Updating is `git pull && ./scripts/deploy.sh`. Rolling back to a specific build
is `./scripts/deploy.sh sha-a1b2c3d`.

`deploy.sh` pulls images, runs migrations in a separate container, updates the
app, then waits for `/api/health` and compares the reported build version. If
the new version does not come up it prints the logs and rolls back to the
previous tag.

> The rollback restores the image but **does not revert migrations**. Split
> breaking schema changes into compatible steps.

HTTPS is automatic: Caddy holds 80/443 and issues a Let's Encrypt certificate
for `TUCKTUCK_DOMAIN`. The domain's A record must already point at the server.

### Reminders

The worker is a separate container from the same image:

```bash
docker compose --profile workers up -d tucktuck-notify
```

It calls the app over the internal network every `NOTIFY_INTERVAL_SEC` seconds.
Waking it more often than daily is safe — repeat sends are blocked at the
database level.

For the buttons under Telegram messages to work, `TUCKTUCK_PUBLIC_URL` must be
set to an https address Telegram can reach. Without it reminders are still sent,
just without buttons; the panel says so.

## CI

`.github/workflows/ci.yml` runs unit tests on every push, and on `main` builds
and publishes two images to GHCR: the app and a migrator. Tags are `latest`,
`sha-<short>` and semver from git tags.

`NEXT_PUBLIC_*` values are baked in at build time, so they live in repository
variables rather than the server's `.env`.

## Notes on the code

| Path | What's there |
|---|---|
| `src/lib/permissions.ts` | the permission map. Isomorphic: edge middleware, API and UI share it |
| `src/lib/auth.ts` | JWT signing and verification, `requirePermission`, DB revalidation |
| `src/lib/resources.ts` | visibility rule, billing period arithmetic, due-date levels |
| `src/lib/notify.ts` | reminder selection, bot filters, message text |
| `src/lib/telegram.ts` | thin Bot API client |
| `src/lib/ssh-install.ts` | SSH transport for agent installation: TOFU fingerprint, script over stdin |
| `src/lib/monitoring.ts` | health from snapshot freshness, parsing of what the agent sent |
| `src/lib/i18n/` | dictionaries and the translation engine (Intl-based plurals) |
| `public/agent.sh` | the agent itself |
| `public/install.sh` | idempotent installer, systemd timer or cron |
| `src/components/data-table.tsx` | server-driven tables: search, sort, filters, row actions |
| `src/components/ui/` | shadcn components, owned by this repository |

Code checks a **permission**, never a role. Roles only hand out permission sets,
so adding one is a single line in `ROLE_PERMISSIONS`.

Anything paid for is one `Resource` row with a `kind`, not five separate models
— the main screen is a single list across all types, and five tables would mean
a five-way union plus five copies of payments, reminders, credentials and tags.

The interface language comes from a cookie first and only falls back to the
database. Language is needed by every screen; reading it from the database would
make it the most frequent query in the system. It is read from there once, at
sign-in, and written into the cookie.

## License

[MIT](LICENSE). The UI is built on shadcn/ui components (MIT) copied into this
repository, so there is no third-party theme licence to worry about.
