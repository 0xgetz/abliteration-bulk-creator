<div align="center">

<img src="assets/logo.svg" alt="Abliteration Bulk Creator logo" width="150" />

# Abliteration Bulk Creator

**Bulk-create verified abliteration.ai accounts — each with its own randomly-named API key — from a single command.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-abliteration.ai-FF5A3C?style=flat-square)](https://abliteration.ai/)
[![Inbox](https://img.shields.io/badge/Inbox-emailnator-F59E0B?style=flat-square)](https://www.emailnator.com/)
[![Proxy](https://img.shields.io/badge/Proxy-Rotating-06B6D4?style=flat-square)](#-rotating-proxies)
[![Stealth](https://img.shields.io/badge/Stealth-Chromium-7C5CFF?style=flat-square)](#-how-it-works)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#)
[![Made with](https://img.shields.io/badge/Made%20with-%E2%9D%A4%EF%B8%8F-EF4444?style=flat-square)]()

[English](README.md) · [Español](docs/README.es.md) · [Português](docs/README.pt.md) · [Deutsch](docs/README.de.md) · [日本語](docs/README.ja.md) · [中文](docs/README.zh.md)

</div>

---

## Overview

**Abliteration Bulk Creator** automates the entire abliteration.ai onboarding
pipeline. For every account it:

1. assigns the next **rotating proxy** (optional, but strongly recommended);
2. provisions a fresh, real `@gmail.com` inbox on **emailnator**
   (with an optional **mail.tm** fallback);
3. signs up on `abliteration.ai` through a **stealth-patched headless Chromium**
   (so the Cloudflare Turnstile challenge passes the way it does for a human);
4. reads the 6-digit verification code straight out of the inbox and verifies;
5. reads the console session to discover the active project id;
6. mints a **randomly-named API key** and captures its one-time `secret_key`.

Every account is written to disk. No database, no dashboard, no cloud account —
just a command.

> **Use residential or mobile proxies.** abliteration.ai protects signup with
> Cloudflare Turnstile and server-side anti-abuse. From a datacenter or already
> flagged IP the endpoint answers **HTTP 403** (`/auth/password/sign-up`) and
> blocks automation; from a clean residential IP it passes invisibly. See
> [Rotating proxies](#-rotating-proxies).

<div align="center">
<img src="assets/architecture.svg" alt="3D architecture diagram" width="880" />
</div>

## Features

- One command to create any number of accounts.
- Real `@gmail.com` inboxes via **emailnator** — nothing to configure.
- Automatic email verification (reads the 6-digit code from the inbox).
- Random, human-readable API-key names (`key-cobalt-falcon-4f2a`).
- Random strong passwords, generated with a CSPRNG.
- First-party API calls for the key mint (with the required `Idempotency-Key`).
- Rotating-proxy support: static list **or** sticky-session gateway template.
- Concurrency, retries and per-account delay, so a run is gentle and robust.
- Outputs JSON, CSV and `email:apiKey` text for easy piping.
- Dry-run mode to plan a batch with no network calls.

## Quick start

```bash
git clone https://github.com/0xgetz/abliteration-bulk-creator.git
cd abliteration-bulk-creator
npm install          # installs Playwright + stealth plugin (headless Chromium)

# Optional but recommended: add your proxies (see Rotating proxies)
cp proxy.txt.example proxy.txt && $EDITOR proxy.txt

# Create 5 verified accounts, each with its own API key
node src/index.js --count 5
```

Results are written to `accounts/`:

```
accounts/
├── accounts.json    # full structured records
├── accounts.csv     # spreadsheet-friendly
├── keys.txt         # email:apiKey, one per line
└── summary.json     # run metadata + proxy usage
```

## Requirements

| Requirement | Notes |
| --- | --- |
| **Node.js 18+** | Ships `fetch` and `crypto.randomUUID`; the tool targets the modern runtime. |
| **Playwright Chromium** | Installed by `npm install`. On Linux, also run `npx playwright install-deps chromium` once. |
| **A proxy** | *Strongly recommended.* See [Rotating proxies](#-rotating-proxies). |

Run the offline self-test at any time (no browser or network needed):

```bash
npm test
```

## Usage

```bash
# Create 10 accounts, 3 at a time
node src/index.js -n 10 -c 3

# Plan a batch of 20 with no network calls
node src/index.js -n 20 --dry-run

# Rotating gateway: a fresh sticky IP per account
ABC_PROXY_TEMPLATE='http://user:pass@gw.provider.com:8000?session={session}' \
  node src/index.js -n 20

# A static list of proxies, assigned round-robin
ABC_PROXIES='http://a:p@1.2.3.4:8000,http://b:q@5.6.7.8:8000' \
  node src/index.js -n 6

# Watch the browser for the first run (debugging)
node src/index.js -n 1 --headful
```

### CLI options

| Flag | Description | Default |
| --- | --- | --- |
| `-n`, `--count <n>` | Number of accounts to create | `1` |
| `-c`, `--concurrency <n>` | Parallel accounts | `2` |
| `-o`, `--output <dir>` | Output directory | `accounts` |
| `--proxy <url>` | Add a proxy (repeatable) | — |
| `--proxy-file <path>` | Load proxies from a file | `proxy.txt` |
| `--proxy-scheme <s>` | Scheme for bare `host:port` entries | `http` |
| `--proxy-template <t>` | Proxy URL template with `{session}` / `{index}` | — |
| `--no-proxy-rotate` | Do not switch proxy when retrying | — |
| `--dry-run` | Plan the batch without touching the network | off |
| `--headful` | Show the browser window | off |
| `--headless` | Hide the browser window | on |
| `-h`, `--help` | Show help | — |

### Environment variables

Every option can be set through the environment instead. Copy
[`.env.example`](.env.example) to get started.

| Variable | Purpose |
| --- | --- |
| `ABC_COUNT`, `ABC_CONCURRENCY` | Batch size and parallelism. |
| `ABC_MIN_DELAY_MS`, `ABC_MAX_DELAY_MS` | Random pause between accounts. |
| `ABC_MAX_RETRIES` | Retries per account. |
| `ABC_ORIGIN` | Target origin (default `https://abliteration.ai`). |
| `ABC_EMAILNATOR_URL` | emailnator base URL. |
| `ABC_INBOX_PROVIDER` | `emailnator` (default) or `mailtm`. |
| `ABC_INBOX_FALLBACK` | Enable the mail.tm fallback (default `false`). |
| `ABC_PROXIES` | Comma-separated proxy list. |
| `ABC_PROXY_FILE` | Proxy list file (default `proxy.txt`). |
| `ABC_PROXY_SCHEME` | Scheme for bare `host:port` entries (default `http`). |
| `ABC_PROXY_TEMPLATE` | Rotating gateway template with `{session}`/`{index}`. |
| `ABC_PROXY_ROTATE` | New exit IP per account (default `true`). |
| `ABC_PROXY_ROTATE_ON_FAILURE` | Rotate on retry (default `true`). |
| `ABC_PROXY_COUNTRY` | Country code substituted into `{country}`. |
| `ABC_HEADLESS` | `true`/`false`. |
| `ABC_CODE_TIMEOUT_MS` | How long to wait for an email code (default `180000`). |
| `ABC_OUTPUT_DIR` | Output directory. |

## How it works

Abliteration.ai is a Next.js console with a first-party JSON API. The full
account lifecycle is:

```
┌────────────┐   POST /auth/password/sign-up   ┌──────────────────┐
│  Chromium  │ ──────────────────────────────► │  abliteration.ai │
│ (stealth)  │   { email, password,            │                  │
│            │     signalsId, turnstileToken } │  Turnstile gate  │
│            │ ◄────────────────────────────── │  (403 if dirty)  │
│            │                                 │                  │
│            │   POST /auth/password/verify    │                  │
│            │ ──────────────────────────────► │  6-digit code    │
│            │   { code }                      │                  │
│            │                                 │                  │
│            │   GET  /api/console/v1/session  │                  │
│            │ ◄────────────────────────────── │  active_project  │
│            │                                 │                  │
│            │   POST .../projects/:id/api-keys│                  │
│            │ ──────────────────────────────► │  secret_key: ak_ │
└────────────┘                                 └──────────────────┘
       ▲                                                   │
       │  6-digit code                                     │
       │                                                   ▼
┌──────────────┐                                 ┌──────────────────┐
│  emailnator  │  real @gmail.com inbox          │  accounts/       │
│  inbox       │                                 │  json·csv·txt    │
└──────────────┘                                 └──────────────────┘
```

Because the sign-up request embeds a **Turnstile token** minted inside the
page, a pure HTTP client cannot register accounts — the token and the session
cookie must come from a real browser. That is why the tool drives one.

## Rotating proxies

A single IP creating several accounts will be challenged and then blocked with
**HTTP 403**. Rotate egress with one of:

- **`proxy.txt` file** — the easiest option. Drop a `proxy.txt` next to the
  project and it is picked up automatically (or point to one with
  `--proxy-file` / `ABC_PROXY_FILE`). One entry per line; blank lines and `#`
  comments are ignored. These formats are all understood:
  ```
  host:port
  host:port:user:pass
  user:pass@host:port
  http://user:pass@host:port
  socks5://user:pass@host:port
  ```
  Bare `host:port` entries take the scheme from `ABC_PROXY_SCHEME`
  (default `http`). Passwords containing `:` are supported.

- **Static list** — `ABC_PROXIES` (round-robin assignment, merged with `proxy.txt`).
- **Rotating gateway** — `ABC_PROXY_TEMPLATE` with `{session}` (a new sticky
  IP per account) and optional `{country}`. Works with Bright Data, Oxylabs,
  Smartproxy, IPRoyal, ProxyRise and similar.

```bash
# Simplest: put your proxies in proxy.txt, then just run
node src/index.js -n 25

# Explicit file
node src/index.js -n 25 --proxy-file ./my-proxies.txt

# Rotating gateway with a fresh sticky IP + country per account
ABC_PROXY_TEMPLATE='http://user:pass@gw.example.com:8000?session={session}&country={country}' \
ABC_PROXY_COUNTRY=us \
node src/index.js -n 25

# Inline list
ABC_PROXIES='http://a:p@1.2.3.4:8000,http://b:q@5.6.7.8:8000' \
node src/index.js -n 6
```

## Project structure

```
abliteration-bulk-creator/
├── src/
│   ├── index.js         # CLI entry point — worker pool, retries, output
│   ├── config.js        # all defaults, overridable via ABC_* env vars
│   ├── abliteration.js  # the account automation (Playwright flow)
│   ├── emailnator.js    # real @gmail.com inbox provider
│   ├── mailtm.js        # optional fallback inbox provider
│   ├── proxy.js         # rotating proxy pool + Playwright adapter
│   ├── output.js        # JSON / CSV / keys.txt exporters
│   └── util.js          # CSPRNG names, passwords, timing
├── assets/              # logo + 3D architecture diagram
├── docs/                # translated READMEs
├── examples/            # sample output
├── proxy.txt            # your proxy list (one per line, many formats)
├── .env.example
├── package.json
└── LICENSE
```

## Output format

`accounts.json` is an array of records:

```json
{
  "index": 0,
  "email": "agent.4f2a1b@gmail.com",
  "password": "…",
  "apiKey": "ak_…",
  "keyName": "key-cobalt-falcon-4f2a",
  "projectId": "proj_…",
  "proxy": "http://***:***@gw.example.com:8000/",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "durationMs": 42150,
  "status": "ok"
}
```

`keys.txt` is `email:apiKey` per line, ready to pipe:

```bash
cat accounts/keys.txt | while IFS=: read email key; do
  echo "$email -> $key"
done
```

## Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| `signup blocked (HTTP 403 …)` | Your IP is flagged. Use a clean residential proxy (`ABC_PROXY_TEMPLATE` / `ABC_PROXIES`). |
| `Timed out waiting for the verification code` | emailnator is slow or rate-limited. Raise `ABC_CODE_TIMEOUT_MS`, or enable the mail.tm fallback. |
| `emailnator: no @gmail.com address` | The generator returned a non-Gmail domain; the client retries automatically. Extreme rate-limits — slow down. |
| Turnstile stays interactive | Datacenter IP. Switch to a residential/mobile proxy; the checkbox clears itself on a clean IP. |
| `session lookup failed (HTTP 401)` | The verification did not complete. Run with `--headful` to watch the flow. |

## Disclaimer

This project is provided for **educational and research purposes**. You are
solely responsible for complying with abliteration.ai's Terms of Service and any
applicable laws. Automating account creation may violate a provider's terms;
use it only where you have permission. The authors accept no liability for
misuse.

## License

Released under the [MIT License](LICENSE).
