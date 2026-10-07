<div align="center">

<img src="../assets/logo.svg" alt="Abliteration Bulk Creator logo" width="150" />

# Abliteration Bulk Creator

**Erstelle verifizierte abliteration.ai-Konten im Bulk — jedes mit einem eigenen, zufällig benannten API-Schlüssel — mit einem einzigen Befehl.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-3DA639?style=flat-square)](../LICENSE)
[![Plattform](https://img.shields.io/badge/Plattform-abliteration.ai-FF5A3C?style=flat-square)](https://abliteration.ai/)
[![Inbox](https://img.shields.io/badge/Inbox-emailmux-F59E0B?style=flat-square)](https://emailmux.com/)
[![Fallback](https://img.shields.io/badge/Fallback-emailnator-8B5CF6?style=flat-square)](https://www.emailnator.com/)
[![Proxy](https://img.shields.io/badge/Proxy-Rotierend-06B6D4?style=flat-square)](../README.md#-rotating-proxies)
[![Stealth](https://img.shields.io/badge/Stealth-Chromium-7C5CFF?style=flat-square)](../README.md#how-it-works)
[![Gemacht mit](https://img.shields.io/badge/Gemacht%20mit-%E2%9D%A4%EF%B8%8F-EF4444?style=flat-square)]()
[![PRs](https://img.shields.io/badge/PRs-willkommen-brightgreen?style=flat-square)]()

[English](../README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

---

## Überblick

**Abliteration Bulk Creator** automatisiert den gesamten Onboarding-Ablauf bei
abliteration.ai. Für jedes Konto:

1. wird der nächste **rotierende Proxy** zugewiesen (optional, aber dringend
   empfohlen);
2. ein frisches, echtes `@gmail.com`-Postfach bei **emailmux** erstellt
   (mit **emailnator**- und optionalem **mail.tm**-Fallback);
3. die Registrierung auf `abliteration.ai` über ein **stealth-gepatchtes
   Headless-Chromium** durchgeführt (damit die Cloudflare-Turnstile-Prüfung so
   durchläuft wie bei einem Menschen);
4. der 6-stellige Bestätigungscode direkt aus dem Postfach gelesen und
   verifiziert;
5. die Konsolen-Sitzung gelesen, um die aktive Projekt-ID zu ermitteln;
6. ein **zufällig benannter API-Schlüssel** erzeugt und sein einmaliger
   `secret_key` erfasst.

Jedes Konto wird auf die Festplatte geschrieben. Keine Datenbank, kein
Dashboard, kein Cloud-Konto — nur ein Befehl.

> **Verwende Residential- oder Mobile-Proxys.** abliteration.ai schützt die
> Registrierung mit Cloudflare Turnstile und serverseitigem Anti-Abuse. Von
> einer Datacenter-IP (oder einer bereits markierten IP) antwortet der
> Endpunkt mit **HTTP 403** und blockiert die Automatisierung; von einer
> sauberen Residential-IP läuft es unsichtbar durch.

<div align="center">
<img src="../assets/architecture.svg" alt="3D-Architekturdiagramm" width="880" />
</div>

## Funktionen

- Ein Befehl erstellt beliebig viele Konten.
- Echte `@gmail.com`-Postfächer über **emailmux** (emailnator-Fallback) — ohne Konfiguration.
- Automatische E-Mail-Verifizierung (liest den 6-stelligen Code).
- Zufällige, lesbare API-Schlüsselnamen (`key-cobalt-falcon-4f2a`).
- Starke Passwörter, mit einem CSPRNG erzeugt.
- Direkte API-Aufrufe zum Erstellen des Schlüssels (mit `Idempotency-Key`).
- Unterstützung für **rotierende Proxys**: statische Liste oder Gateway-Template.
- Nebenläufigkeit, Wiederholungen und Pausen zwischen den Konten.
- Ausgaben als JSON, CSV und `email:apiKey`-Text.
- `--dry-run`-Modus zum Planen ohne Netzwerkaufrufe.

## Schnellstart

```bash
git clone https://github.com/0xgetz/abliteration-bulk-creator.git
cd abliteration-bulk-creator
npm install

# 5 verifizierte Konten, jedes mit eigenem API-Schlüssel
node src/index.js --count 5
```

Ergebnisse landen in `accounts/`:

```
accounts/
├── accounts.json
├── accounts.csv
├── keys.txt
└── summary.json
```

## Voraussetzungen

| Voraussetzung | Hinweise |
| --- | --- |
| **Node.js 18+** | Enthält `fetch` und `crypto.randomUUID`. |
| **Playwright Chromium** | Wird durch `npm install` installiert. Unter Linux einmalig `npx playwright install-deps chromium` ausführen. |
| **Ein Proxy** | *Dringend empfohlen.* Siehe [Rotierende Proxys](../README.md#rotating-proxies). |

## Verwendung

```bash
node src/index.js -n 10 -c 3

node src/index.js -n 20 --dry-run

ABC_PROXY_TEMPLATE='http://user:pass@gw.provider.com:8000?session={session}' \
  node src/index.js -n 20

ABC_PROXIES='http://a:p@1.2.3.4:8000,http://b:q@5.6.7.8:8000' \
  node src/index.js -n 6

node src/index.js -n 1 --headful
```

Die vollständige Tabelle der Optionen und Umgebungsvariablen findest du im
[englischen README](../README.md#usage). Alle Variablen nutzen das Präfix
`ABC_`.

## Wie es funktioniert

Die Registrierung bettet ein **Turnstile-Token** ein, das in der Seite erzeugt
wird. Ein reiner HTTP-Client kann daher keine Konten anlegen: Token und
Sitzungs-Cookie müssen aus einem echten Browser stammen. Deshalb steuert das
Tool einen.

```
POST /auth/password/sign-up   { email, password, signalsId, turnstileToken }
POST /auth/password/verify    { code }
GET  /api/console/v1/session  -> active_project.id
POST /api/console/v1/projects/:id/api-keys   (Idempotency-Key) -> secret_key: ak_…
```

## Postfach-Anbieter

- **emailmux** (Standard) — echtes `@gmail.com`. Ohne Schlüssel, aber pro IP limitiert; mit `proxy.txt` kombinieren.
- **emailnator** — Fallback, ebenfalls echtes `@gmail.com`.
- **mail.tm** — kein Gmail; nur mit `ABC_INBOX_FALLBACK=true` aktivieren.

`ABC_INBOX_PROVIDER=emailmux|emailnator|mailtm` · `ABC_EMAILMUX_API_KEY` (optional).

## Rotierende Proxys

- **Datei `proxy.txt`** — am einfachsten. Lege eine `proxy.txt` neben das
  Projekt; sie wird automatisch geladen (oder nutze `--proxy-file` /
  `ABC_PROXY_FILE`). Ein Proxy pro Zeile; Leerzeilen und `#`-Kommentare werden
  ignoriert. Formate: `host:port`, `host:port:user:pass`,
  `user:pass@host:port`, `http://user:pass@host:port`,
  `socks5://user:pass@host:port`.
- **Statische Liste** — `ABC_PROXIES` (Round-Robin, kombiniert mit `proxy.txt`).
- **Rotierendes Gateway** — `ABC_PROXY_TEMPLATE` mit `{session}` (neue
  Sticky-IP pro Konto) und optional `{country}`.

```bash
node src/index.js -n 25                      # nutzt proxy.txt automatisch
node src/index.js -n 25 --proxy-file ./p.txt

ABC_PROXY_TEMPLATE='http://user:pass@gw.example.com:8000?session={session}&country={country}' \
ABC_PROXY_COUNTRY=us \
node src/index.js -n 25
```

Prüfe deine Proxys vor einem großen Batch: `node tests/check-proxies.js`.

## Projektstruktur

```
src/index.js         CLI: Worker-Pool, Wiederholungen, Ausgabe
src/config.js        Konfiguration ABC_*
src/abliteration.js  Automatisierung mit Playwright
src/emailmux.js      echte @gmail.com-Postfächer
src/mailtm.js        optionaler Fallback
src/proxy.js         Pool rotierender Proxys
src/output.js        JSON/CSV/txt-Exporteure
src/util.js          CSPRNG-Namen und -Passwörter
```

## Fehlerbehebung

| Symptom | Ursache & Lösung |
| --- | --- |
| `signup blocked (HTTP 403 …)` | Deine IP ist markiert. Nutze einen sauberen Residential-Proxy. |
| `Timed out waiting for the verification code` | emailnator ist langsam oder limitiert. `ABC_CODE_TIMEOUT_MS` erhöhen. |
| Turnstile bleibt interaktiv | Datacenter-IP. Wechsle auf Residential-/Mobile-Proxy. |
| `session lookup failed (HTTP 401)` | Die Verifizierung wurde nicht abgeschlossen. Mit `--headful` ausführen. |

## Haftungsausschluss

Dieses Projekt dient **Bildungs- und Forschungszwecken**. Du bist allein dafür
verantwortlich, die Nutzungsbedingungen von abliteration.ai und geltendes Recht
einzuhalten.

## Lizenz

Veröffentlicht unter der [MIT-Lizenz](../LICENSE).
