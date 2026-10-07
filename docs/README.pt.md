<div align="center">

<img src="../assets/logo.svg" alt="Abliteration Bulk Creator logo" width="150" />

# Abliteration Bulk Creator

**Crie contas verificadas na abliteration.ai em massa — cada uma com sua própria chave de API de nome aleatório — com um único comando.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-3DA639?style=flat-square)](../LICENSE)
[![Plataforma](https://img.shields.io/badge/Plataforma-abliteration.ai-FF5A3C?style=flat-square)](https://abliteration.ai/)
[![Inbox](https://img.shields.io/badge/Inbox-emailmux-F59E0B?style=flat-square)](https://emailmux.com/)
[![Fallback](https://img.shields.io/badge/Fallback-emailnator-8B5CF6?style=flat-square)](https://www.emailnator.com/)
[![Proxy](https://img.shields.io/badge/Proxy-Rotativo-06B6D4?style=flat-square)](../README.md#-rotating-proxies)
[![Stealth](https://img.shields.io/badge/Stealth-Chromium-7C5CFF?style=flat-square)](../README.md#how-it-works)
[![Feito com](https://img.shields.io/badge/Feito%20com-%E2%9D%A4%EF%B8%8F-EF4444?style=flat-square)]()
[![PRs](https://img.shields.io/badge/PRs-bem--vindos-brightgreen?style=flat-square)]()

[English](../README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

---

## Visão geral

**Abliteration Bulk Creator** automatiza todo o fluxo de cadastro na
abliteration.ai. Para cada conta:

1. atribui o próximo **proxy rotativo** (opcional, mas muito recomendado);
2. provisiona uma caixa real de `@gmail.com` no **emailmux**
   (com fallback do **emailnator** e, opcionalmente, **mail.tm**);
3. cadastra em `abliteration.ai` através de um **Chromium headless com patch
   stealth** (para que o desafio Cloudflare Turnstile passe como passaria para
   um humano);
4. lê o código de verificação de 6 dígitos da caixa de entrada e verifica;
5. lê a sessão do console para descobrir o id do projeto ativo;
6. gera uma **chave de API de nome aleatório** e captura seu `secret_key`.

Cada conta é gravada em disco. Sem banco de dados, sem painel, sem conta na
nuvem — apenas um comando.

> **Use proxies residenciais ou móveis.** A abliteration.ai protege o cadastro
> com Cloudflare Turnstile e antiabuso no servidor. De um IP de datacenter (ou
> já sinalizado) o endpoint responde **HTTP 403** e bloqueia a automação; de um
> IP residencial limpo ele passa invisível.

<div align="center">
<img src="../assets/architecture.svg" alt="Diagrama de arquitetura 3D" width="880" />
</div>

## Recursos

- Um comando para criar qualquer quantidade de contas.
- Caixas reais de `@gmail.com` via **emailmux** (fallback emailnator) — sem configuração.
- Verificação automática do e-mail (lê o código de 6 dígitos).
- Nomes de chave de API aleatórios e legíveis (`key-cobalt-falcon-4f2a`).
- Senhas fortes geradas com CSPRNG.
- Chamadas diretas à API para criar a chave (com o `Idempotency-Key`).
- Suporte a **proxy rotativo**: lista estática ou template de gateway.
- Concorrência, retentativas e pausas entre contas.
- Saídas JSON, CSV e texto `email:apiKey`.
- Modo `--dry-run` para planejar sem chamadas de rede.

## Início rápido

```bash
git clone https://github.com/0xgetz/abliteration-bulk-creator.git
cd abliteration-bulk-creator
npm install

# Cria 5 contas verificadas, cada uma com sua chave de API
node src/index.js --count 5
```

Os resultados são gravados em `accounts/`:

```
accounts/
├── accounts.json
├── accounts.csv
├── keys.txt
└── summary.json
```

## Requisitos

| Requisito | Observações |
| --- | --- |
| **Node.js 18+** | Inclui `fetch` e `crypto.randomUUID`. |
| **Playwright Chromium** | Instalado por `npm install`. No Linux rode uma vez `npx playwright install-deps chromium`. |
| **Um proxy** | *Muito recomendado.* Veja [Proxies rotativos](../README.md#rotating-proxies). |

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

A tabela completa de opções e variáveis de ambiente está no
[README em inglês](../README.md#usage). Todas as variáveis usam o prefixo
`ABC_`.

## Como funciona

O cadastro embute um **token Turnstile** gerado dentro da página, então um
cliente HTTP puro não consegue registrar contas: o token e o cookie de sessão
precisam vir de um navegador real. Por isso a ferramenta controla um.

```
POST /auth/password/sign-up   { email, password, signalsId, turnstileToken }
POST /auth/password/verify    { code }
GET  /api/console/v1/session  -> active_project.id
POST /api/console/v1/projects/:id/api-keys   (Idempotency-Key) -> secret_key: ak_…
```

## Provedores de caixa de entrada

- **emailmux** (padrão) — `@gmail.com` real. Sem chave, mas com limite por IP; combine com `proxy.txt`.
- **emailnator** — fallback, também `@gmail.com` real.
- **mail.tm** — não é Gmail; ative com `ABC_INBOX_FALLBACK=true` se precisar.

`ABC_INBOX_PROVIDER=emailmux|emailnator|mailtm` · `ABC_EMAILMUX_API_KEY` (opcional).

## Proxies rotativos

- **Arquivo `proxy.txt`** — o mais fácil. Coloque um `proxy.txt` junto ao projeto
  e ele é carregado automaticamente (ou use `--proxy-file` / `ABC_PROXY_FILE`).
  Um proxy por linha; linhas vazias e comentários `#` são ignorados. Formatos:
  `host:port`, `host:port:user:pass`, `user:pass@host:port`,
  `http://user:pass@host:port`, `socks5://user:pass@host:port`.
- **Lista estática** — `ABC_PROXIES` (round-robin, combinado com `proxy.txt`).
- **Gateway rotativo** — `ABC_PROXY_TEMPLATE` com `{session}` (novo IP fixo por
  conta) e `{country}` opcional.

```bash
node src/index.js -n 25                      # usa proxy.txt automaticamente
node src/index.js -n 25 --proxy-file ./p.txt

ABC_PROXY_TEMPLATE='http://user:pass@gw.example.com:8000?session={session}&country={country}' \
ABC_PROXY_COUNTRY=us \
node src/index.js -n 25
```

Verifique seus proxies antes de um lote grande: `node tests/check-proxies.js`.

## Estrutura do projeto

```
src/index.js         CLI: pool de workers, retentativas, saída
src/config.js        configuração ABC_*
src/abliteration.js  automação com Playwright
src/emailmux.js      caixas reais @gmail.com
src/mailtm.js        fallback opcional
src/proxy.js         pool de proxies rotativos
src/output.js        exportadores JSON/CSV/txt
src/util.js          nomes e senhas CSPRNG
```

## Solução de problemas

| Sintoma | Causa e solução |
| --- | --- |
| `signup blocked (HTTP 403 …)` | Seu IP está marcado. Use um proxy residencial limpo. |
| `Timed out waiting for the verification code` | emailnator lento ou limitado. Aumente `ABC_CODE_TIMEOUT_MS`. |
| Turnstile continua interativo | IP de datacenter. Troque para proxy residencial/móvel. |
| `session lookup failed (HTTP 401)` | A verificação não terminou. Use `--headful`. |

## Aviso legal

Projeto com fins **educacionais e de pesquisa**. Você é o único responsável por
cumprir os Termos de Serviço da abliteration.ai e a legislação aplicável.

## Licença

Distribuído sob a [Licença MIT](../LICENSE).
