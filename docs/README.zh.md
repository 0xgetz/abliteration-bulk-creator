<div align="center">

<img src="../assets/logo.svg" alt="Abliteration Bulk Creator logo" width="150" />

# Abliteration Bulk Creator

**一条命令批量创建已验证的 abliteration.ai 账号 — 每个账号都带有自己随机命名的 API 密钥。**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![许可证: MIT](https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-3DA639?style=flat-square)](../LICENSE)
[![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-abliteration.ai-FF5A3C?style=flat-square)](https://abliteration.ai/)
[![Inbox](https://img.shields.io/badge/Inbox-emailmux-F59E0B?style=flat-square)](https://emailmux.com/)
[![Fallback](https://img.shields.io/badge/Fallback-emailnator-8B5CF6?style=flat-square)](https://www.emailnator.com/)
[![代理](https://img.shields.io/badge/%E4%BB%A3%E7%90%86-%E8%BD%AE%E6%8D%A2-06B6D4?style=flat-square)](../README.md#rotating-proxies)
[![Stealth](https://img.shields.io/badge/Stealth-Chromium-7C5CFF?style=flat-square)](../README.md#how-it-works)
[![Made with](https://img.shields.io/badge/Made%20with-%E2%9D%A4%EF%B8%8F-EF4444?style=flat-square)]()
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)]()

[English](../README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

---

## 概述

**Abliteration Bulk Creator** 自动化了 abliteration.ai 的整个注册流程。对每个账号：

1. 分配下一个**轮换代理**（可选，但强烈推荐）；
2. 通过 **emailmux** 创建一个全新的真实 `@gmail.com` 收件箱
   （并回退到 **emailnator** 及可选的 **mail.tm**）；
3. 通过**带 stealth 补丁的无头 Chromium** 在 `abliteration.ai` 注册
   （使 Cloudflare Turnstile 像人类一样通过）；
4. 从收件箱中读取 6 位验证码并完成验证；
5. 读取控制台会话以发现活动项目 ID；
6. 创建**随机命名的 API 密钥**并捕获其一次性的 `secret_key`。

每个账号都会写入磁盘。无需数据库、无需面板、无需云账号 — 只需一条命令。

> **请使用住宅或移动代理。** abliteration.ai 使用 Cloudflare Turnstile 和
> 服务端反滥用保护注册。来自数据中心 IP（或已被标记的 IP）时，端点返回
> **HTTP 403** 并阻止自动化；来自干净的住宅 IP 时则会隐式通过。

<div align="center">
<img src="../assets/architecture.svg" alt="3D 架构图" width="880" />
</div>

## 特性

- 一条命令即可创建任意数量的账号。
- 通过 **emailmux** 获取真实 `@gmail.com` 收件箱（回退 emailnator）— 无需配置。
- 自动邮件验证（读取 6 位验证码）。
- 随机且易读的 API 密钥名（`key-cobalt-falcon-4f2a`）。
- 使用 CSPRNG 生成强随机密码。
- 直接调用第一方 API 创建密钥（带 `Idempotency-Key`）。
- 支持**轮换代理**：`proxy.txt` 文件、静态列表或网关模板。
- 并发、重试和账号间延迟。
- 输出 JSON、CSV 和 `email:apiKey` 文本。
- `--dry-run` 模式可离线规划批次。

## 快速开始

```bash
git clone https://github.com/0xgetz/abliteration-bulk-creator.git
cd abliteration-bulk-creator
npm install

# 创建 5 个已验证账号，每个都有自己的 API 密钥
node src/index.js --count 5
```

结果写入 `accounts/`：

```
accounts/
├── accounts.json
├── accounts.csv
├── keys.txt
└── summary.json
```

## 环境要求

| 要求 | 说明 |
| --- | --- |
| **Node.js 18+** | 内置 `fetch` 与 `crypto.randomUUID`。 |
| **Playwright Chromium** | 由 `npm install` 安装。在 Linux 上另需运行一次 `npx playwright install-deps chromium`。 |
| **代理** | *强烈推荐。* 见[轮换代理](../README.md#rotating-proxies)。 |

## 使用方法

```bash
node src/index.js -n 10 -c 3

node src/index.js -n 20 --dry-run

# 最简单：把代理放进 proxy.txt，然后直接运行
node src/index.js -n 25

ABC_PROXY_TEMPLATE='http://user:pass@gw.provider.com:8000?session={session}' \
  node src/index.js -n 20

ABC_PROXIES='http://a:p@1.2.3.4:8000,http://b:q@5.6.7.8:8000' \
  node src/index.js -n 6

node src/index.js -n 1 --headful
```

完整的选项和环境变量表见[英文 README](../README.md#usage)。所有变量均以
`ABC_` 为前缀。

## 工作原理

注册请求嵌入了在页面内生成的 **Turnstile 令牌**，因此纯 HTTP 客户端无法注册
账号：令牌和会话 Cookie 必须来自真实浏览器。这就是本工具驱动浏览器的原因。

```
POST /auth/password/sign-up   { email, password, signalsId, turnstileToken }
POST /auth/password/verify    { code }
GET  /api/console/v1/session  -> active_project.id
POST /api/console/v1/projects/:id/api-keys   (Idempotency-Key) -> secret_key: ak_…
```

## 收件箱服务商

- **emailmux**（默认）— 真实 `@gmail.com`。无需密钥，但按 IP 限流，建议搭配 `proxy.txt`。
- **emailnator** — 回退项，同样是真实 `@gmail.com`。
- **mail.tm** — 非 Gmail；如需启用请设 `ABC_INBOX_FALLBACK=true`。

`ABC_INBOX_PROVIDER=emailmux|emailnator|mailtm` · `ABC_EMAILMUX_API_KEY`（可选）。

## 轮换代理

- **`proxy.txt` 文件** — 最简单。在项目旁放置 `proxy.txt` 即可自动加载
  （或用 `--proxy-file` / `ABC_PROXY_FILE` 指定）。每行一个，空行和 `#`
  注释会被忽略。支持格式：`host:port`、`host:port:user:pass`、
  `user:pass@host:port`、`http://user:pass@host:port`、
  `socks5://user:pass@host:port`。
- **静态列表** — `ABC_PROXIES`（轮询分配，与 `proxy.txt` 合并）。
- **轮换网关** — `ABC_PROXY_TEMPLATE`，用 `{session}` 为每个账号分配新的固定
  IP，`{country}` 可选。

```bash
node src/index.js -n 25                      # 自动使用 proxy.txt
node src/index.js -n 25 --proxy-file ./p.txt

ABC_PROXY_TEMPLATE='http://user:pass@gw.example.com:8000?session={session}&country={country}' \
ABC_PROXY_COUNTRY=us \
node src/index.js -n 25
```

## 项目结构

```
src/index.js         CLI：工作池、重试、输出
src/config.js        ABC_* 配置
src/abliteration.js  Playwright 自动化
src/emailmux.js      真实 @gmail.com 收件箱
src/mailtm.js        可选回退
src/proxy.js         轮换代理池 + proxy.txt 解析
src/output.js        JSON/CSV/txt 导出
src/util.js          CSPRNG 名称与密码
```

## 故障排查

| 症状 | 原因与解决 |
| --- | --- |
| `signup blocked (HTTP 403 …)` | IP 被标记。请使用干净的住宅代理。 |
| `Timed out waiting for the verification code` | emailnator 较慢或被限流。增大 `ABC_CODE_TIMEOUT_MS`。 |
| Turnstile 一直需要交互 | 数据中心 IP。请改用住宅/移动代理。 |
| `session lookup failed (HTTP 401)` | 验证未完成。用 `--headful` 运行观察。 |

## 免责声明

本项目仅供**教育和研究用途**。您需自行负责遵守 abliteration.ai 的服务条款及
适用法律。

## 许可证

基于 [MIT 许可证](../LICENSE) 发布。
