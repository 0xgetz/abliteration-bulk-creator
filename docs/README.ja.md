<div align="center">

<img src="../assets/logo.svg" alt="Abliteration Bulk Creator logo" width="150" />

# Abliteration Bulk Creator

**1つのコマンドで、検証済みの abliteration.ai アカウントを一括作成 — それぞれにランダム名の API キーを付与。**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![ライセンス: MIT](https://img.shields.io/badge/%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9-MIT-3DA639?style=flat-square)](../LICENSE)
[![プラットフォーム](https://img.shields.io/badge/%E3%83%97%E3%83%A9%E3%83%83%E3%83%88%E3%83%95%E3%82%A9%E3%83%BC%E3%83%A0-abliteration.ai-FF5A3C?style=flat-square)](https://abliteration.ai/)
[![受信箱](https://img.shields.io/badge/%E5%8F%97%E4%BF%A1%E7%AE%B1-emailnator-F59E0B?style=flat-square)](https://www.emailnator.com/)
[![プロキシ](https://img.shields.io/badge/%E3%83%97%E3%83%AD%E3%82%AD%E3%82%B7-%E3%83%AD%E3%83%BC%E3%83%86%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3-06B6D4?style=flat-square)](../README.md#-rotating-proxies)
[![Stealth](https://img.shields.io/badge/Stealth-Chromium-7C5CFF?style=flat-square)](../README.md#how-it-works)
[![Made with](https://img.shields.io/badge/Made%20with-%E2%9D%A4%EF%B8%8F-EF4444?style=flat-square)]()
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)]()

[English](../README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

---

## 概要

**Abliteration Bulk Creator** は abliteration.ai のオンボーディング全体を自動化
します。各アカウントについて:

1. 次の**ローテーションプロキシ**を割り当てます（任意、ただし強く推奨）;
2. **emailnator** で本物の `@gmail.com` 受信箱を新規作成します
   （**mail.tm** への任意フォールバック付き）;
3. **stealth 適用のヘッドレス Chromium** で `abliteration.ai` に登録します
   （Cloudflare Turnstile が人間と同じように通過するため）;
4. 受信箱から 6 桁の確認コードを読み取り、検証します;
5. コンソールセッションを読み取り、アクティブなプロジェクト ID を取得します;
6. **ランダム名の API キー**を作成し、一度きりの `secret_key` を取得します。

すべてのアカウントはディスクに保存されます。データベースもダッシュボードも
クラウドアカウントも不要 — コマンド 1 つだけです。

> **レジデンシャルまたはモバイルプロキシを使用してください。** abliteration.ai
> は Cloudflare Turnstile とサーバー側の不正対策で登録を保護しています。データ
> センター IP（または既にフラグが立った IP）からは **HTTP 403** が返り自動化が
> ブロックされます。クリーンなレジデンシャル IP なら不可視で通過します。

<div align="center">
<img src="../assets/architecture.svg" alt="3D アーキテクチャ図" width="880" />
</div>

## 特徴

- 1 つのコマンドで任意数のアカウントを作成。
- **emailnator** による本物の `@gmail.com` 受信箱 — 設定不要。
- メールの自動検証（6 桁コードを読み取り）。
- ランダムで読みやすい API キー名（`key-cobalt-falcon-4f2a`）。
- CSPRNG による強力なランダムパスワード。
- キー作成は直接 API 呼び出し（`Idempotency-Key` 付き）。
- **ローテーションプロキシ**対応: 静的リストまたはゲートウェイテンプレート。
- 並行実行、リトライ、アカウント間の待機。
- JSON・CSV・`email:apiKey` テキストを出力。
- ネットワークを使わず計画できる `--dry-run` モード。

## クイックスタート

```bash
git clone https://github.com/octra42/abliteration-bulk-creator.git
cd abliteration-bulk-creator
npm install

# 検証済みアカウントを 5 件、それぞれ API キー付きで作成
node src/index.js --count 5
```

結果は `accounts/` に出力されます:

```
accounts/
├── accounts.json
├── accounts.csv
├── keys.txt
└── summary.json
```

## 必要要件

| 要件 | 備考 |
| --- | --- |
| **Node.js 18+** | `fetch` と `crypto.randomUUID` を含みます。 |
| **Playwright Chromium** | `npm install` で導入。Linux では `npx playwright install-deps chromium` を一度実行。 |
| **プロキシ** | *強く推奨。* [ローテーションプロキシ](../README.md#rotating-proxies) を参照。 |

## 使い方

```bash
node src/index.js -n 10 -c 3

node src/index.js -n 20 --dry-run

ABC_PROXY_TEMPLATE='http://user:pass@gw.provider.com:8000?session={session}' \
  node src/index.js -n 20

ABC_PROXIES='http://a:p@1.2.3.4:8000,http://b:q@5.6.7.8:8000' \
  node src/index.js -n 6

node src/index.js -n 1 --headful
```

オプションと環境変数の完全な一覧は[英語 README](../README.md#usage) を参照。
変数はすべて `ABC_` 接頭辞を使用します。

## 仕組み

登録リクエストにはページ内で生成された **Turnstile トークン**が埋め込まれる
ため、純粋な HTTP クライアントではアカウント登録ができません。トークンと
セッション Cookie は本物のブラウザから取得する必要があります。そのため本ツール
はブラウザを操作します。

```
POST /auth/password/sign-up   { email, password, signalsId, turnstileToken }
POST /auth/password/verify    { code }
GET  /api/console/v1/session  -> active_project.id
POST /api/console/v1/projects/:id/api-keys   (Idempotency-Key) -> secret_key: ak_…
```

## ローテーションプロキシ

- **`proxy.txt` ファイル** — 最も簡単。プロジェクト直下に `proxy.txt` を置く
  と自動的に読み込まれます（`--proxy-file` / `ABC_PROXY_FILE` でも指定可）。
  1 行に 1 件、空行と `#` コメントは無視。対応形式:
  `host:port`、`host:port:user:pass`、`user:pass@host:port`、
  `http://user:pass@host:port`、`socks5://user:pass@host:port`。
- **静的リスト** — `ABC_PROXIES`（ラウンドロビン、`proxy.txt` と統合）。
- **ローテーションゲートウェイ** — `ABC_PROXY_TEMPLATE`（`{session}` で
  アカウントごとに新しい固定 IP、`{country}` は任意）。

```bash
node src/index.js -n 25                      # proxy.txt を自動使用
node src/index.js -n 25 --proxy-file ./p.txt

ABC_PROXY_TEMPLATE='http://user:pass@gw.example.com:8000?session={session}&country={country}' \
ABC_PROXY_COUNTRY=us \
node src/index.js -n 25
```

## プロジェクト構成

```
src/index.js         CLI: ワーカープール、リトライ、出力
src/config.js        ABC_* 設定
src/abliteration.js  Playwright による自動化
src/emailnator.js    本物の @gmail.com 受信箱
src/mailtm.js        任意のフォールバック
src/proxy.js         ローテーションプロキシプール
src/output.js        JSON/CSV/txt エクスポータ
src/util.js          CSPRNG の名前とパスワード
```

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `signup blocked (HTTP 403 …)` | IP にフラグ。クリーンなレジデンシャルプロキシを使用。 |
| `Timed out waiting for the verification code` | emailnator が遅い/制限。`ABC_CODE_TIMEOUT_MS` を増やす。 |
| Turnstile が対話型のまま | データセンター IP。レジデンシャル/モバイルに変更。 |
| `session lookup failed (HTTP 401)` | 検証が完了していない。`--headful` で実行。 |

## 免責事項

本プロジェクトは**教育および研究目的**で提供されます。abliteration.ai の利用
規約および適用法を遵守する責任は利用者にあります。

## ライセンス

[MIT ライセンス](../LICENSE) の下で公開されています。
