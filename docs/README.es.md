<div align="center">

<img src="../assets/logo.svg" alt="Abliteration Bulk Creator logo" width="150" />

# Abliteration Bulk Creator

**Crea cuentas verificadas de abliteration.ai en lote — cada una con su propia clave API de nombre aleatorio — con un solo comando.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-3DA639?style=flat-square)](../LICENSE)
[![Plataforma](https://img.shields.io/badge/Plataforma-abliteration.ai-FF5A3C?style=flat-square)](https://abliteration.ai/)
[![Inbox](https://img.shields.io/badge/Inbox-emailmux-F59E0B?style=flat-square)](https://emailmux.com/)
[![Fallback](https://img.shields.io/badge/Fallback-emailnator-8B5CF6?style=flat-square)](https://www.emailnator.com/)
[![Proxy](https://img.shields.io/badge/Proxy-Rotativo-06B6D4?style=flat-square)](../README.md#-rotating-proxies)
[![Stealth](https://img.shields.io/badge/Stealth-Chromium-7C5CFF?style=flat-square)](../README.md#how-it-works)
[![Hecho con](https://img.shields.io/badge/Hecho%20con-%E2%9D%A4%EF%B8%8F-EF4444?style=flat-square)]()
[![PRs](https://img.shields.io/badge/PRs-bienvenidos-brightgreen?style=flat-square)]()

[English](../README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

---

## Descripción general

**Abliteration Bulk Creator** automatiza todo el flujo de registro en
abliteration.ai. Para cada cuenta:

1. asigna el siguiente **proxy rotativo** (opcional pero muy recomendable);
2. crea una bandeja real de `@gmail.com` en **emailmux**
   (con respaldo de **emailnator** y, opcionalmente, **mail.tm**);
3. se registra en `abliteration.ai` mediante un **Chromium sin cabeza con
   parche stealth** (para que el desafío Cloudflare Turnstile pase como con
   un humano);
4. lee el código de verificación de 6 dígitos de la bandeja y verifica;
5. lee la sesión de la consola para descubrir el id del proyecto activo;
6. acuña una **clave API de nombre aleatorio** y captura su `secret_key`.

Cada cuenta se escribe en disco. Sin base de datos, sin panel, sin cuenta en la
nube — solo un comando.

> **Usa proxies residenciales o móviles.** abliteration.ai protege el registro
> con Cloudflare Turnstile y anti-abuso del lado del servidor. Desde una IP de
> centro de datos (o ya marcada) el endpoint responde **HTTP 403** y bloquea la
> automatización; desde una IP residencial limpia pasa de forma invisible.

<div align="center">
<img src="../assets/architecture.svg" alt="Diagrama de arquitectura 3D" width="880" />
</div>

## Características

- Un comando para crear cualquier número de cuentas.
- Bandejas reales de `@gmail.com` con **emailmux** (respaldo emailnator) — sin configuración.
- Verificación automática del correo (lee el código de 6 dígitos).
- Nombres de clave API aleatorios y legibles (`key-cobalt-falcon-4f2a`).
- Contraseñas fuertes generadas con un CSPRNG.
- Llamadas directas a la API para crear la clave (con el `Idempotency-Key`).
- Soporte de **proxy rotativo**: lista estática o plantilla de gateway.
- Concurrencia, reintentos y pausas entre cuentas.
- Salidas JSON, CSV y texto `email:apiKey`.
- Modo `--dry-run` para planificar sin llamadas de red.

## Inicio rápido

```bash
git clone https://github.com/0xgetz/abliteration-bulk-creator.git
cd abliteration-bulk-creator
npm install

# Crea 5 cuentas verificadas, cada una con su clave API
node src/index.js --count 5
```

Los resultados se escriben en `accounts/`:

```
accounts/
├── accounts.json
├── accounts.csv
├── keys.txt
└── summary.json
```

## Requisitos

| Requisito | Notas |
| --- | --- |
| **Node.js 18+** | Incluye `fetch` y `crypto.randomUUID`. |
| **Playwright Chromium** | Instalado por `npm install`. En Linux ejecuta una vez `npx playwright install-deps chromium`. |
| **Un proxy** | *Muy recomendable.* Consulta [Proxies rotativos](../README.md#rotating-proxies). |

## Uso

```bash
node src/index.js -n 10 -c 3

node src/index.js -n 20 --dry-run

ABC_PROXY_TEMPLATE='http://user:pass@gw.provider.com:8000?session={session}' \
  node src/index.js -n 20

ABC_PROXIES='http://a:p@1.2.3.4:8000,http://b:q@5.6.7.8:8000' \
  node src/index.js -n 6

node src/index.js -n 1 --headful
```

La tabla completa de opciones y variables de entorno está en el
[README en inglés](../README.md#usage). Todas las variables usan el prefijo
`ABC_`.

## Cómo funciona

El registro incrusta un **token de Turnstile** generado dentro de la página, por
lo que un cliente HTTP puro no puede registrar cuentas: el token y la cookie de
sesión deben venir de un navegador real. Por eso la herramienta maneja uno.

```
POST /auth/password/sign-up   { email, password, signalsId, turnstileToken }
POST /auth/password/verify    { code }
GET  /api/console/v1/session  -> active_project.id
POST /api/console/v1/projects/:id/api-keys   (Idempotency-Key) -> secret_key: ak_…
```

## Proveedores de bandeja

- **emailmux** (por defecto) — `@gmail.com` real. Sin clave, pero con límite por IP; combínalo con `proxy.txt`.
- **emailnator** — respaldo, también `@gmail.com` real.
- **mail.tm** — no es Gmail; actívalo con `ABC_INBOX_FALLBACK=true` si hace falta.

`ABC_INBOX_PROVIDER=emailmux|emailnator|mailtm` · `ABC_EMAILMUX_API_KEY` (opcional).

## Proxies rotativos

- **Archivo `proxy.txt`** — lo más fácil. Deja un `proxy.txt` junto al proyecto
  y se carga automáticamente (o usa `--proxy-file` / `ABC_PROXY_FILE`). Un
  proxy por línea; se ignoran líneas vacías y comentarios `#`. Formatos:
  `host:port`, `host:port:user:pass`, `user:pass@host:port`,
  `http://user:pass@host:port`, `socks5://user:pass@host:port`.
- **Lista estática** — `ABC_PROXIES` (asignación round-robin, se combina con `proxy.txt`).
- **Gateway rotativo** — `ABC_PROXY_TEMPLATE` con `{session}` (nueva IP fija por
  cuenta) y `{country}` opcional.

```bash
node src/index.js -n 25                      # usa proxy.txt automáticamente
node src/index.js -n 25 --proxy-file ./p.txt

ABC_PROXY_TEMPLATE='http://user:pass@gw.example.com:8000?session={session}&country={country}' \
ABC_PROXY_COUNTRY=us \
node src/index.js -n 25
```

Verifica tus proxies antes de un lote grande: `node tests/check-proxies.js`.

## Estructura del proyecto

```
src/index.js         CLI: pool de trabajadores, reintentos, salida
src/config.js        configuración ABC_*
src/abliteration.js  automatización con Playwright
src/emailmux.js      bandejas reales @gmail.com
src/mailtm.js        respaldo opcional
src/proxy.js         pool de proxies rotativos
src/output.js        exportadores JSON/CSV/txt
src/util.js          nombres y contraseñas CSPRNG
```

## Solución de problemas

| Síntoma | Causa y solución |
| --- | --- |
| `signup blocked (HTTP 403 …)` | Tu IP está marcada. Usa un proxy residencial limpio. |
| `Timed out waiting for the verification code` | emailnator lento o limitado. Sube `ABC_CODE_TIMEOUT_MS`. |
| Turnstile sigue interactivo | IP de centro de datos. Cambia a proxy residencial/móvil. |
| `session lookup failed (HTTP 401)` | La verificación no terminó. Usa `--headful`. |

## Aviso legal

Proyecto con fines **educativos y de investigación**. Eres el único responsable
de cumplir los Términos de Servicio de abliteration.ai y la legislación
aplicable.

## Licencia

Publicado bajo la [Licencia MIT](../LICENSE).
