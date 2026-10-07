#!/usr/bin/env node
"use strict";

/**
 * Abliteration Bulk Creator — CLI entry point.
 *
 * Examples:
 *   node src/index.js --count 5
 *   node src/index.js -n 10 --concurrency 3
 *   ABC_PROXY_TEMPLATE='http://user:pass@gw.proxy.com:8000?session={session}' node src/index.js -n 20
 *   ABC_PROXIES='http://a:p@1.2.3.4:8000,http://a:p@5.6.7.8:8000' node src/index.js -n 4
 *   node src/index.js -n 3 --dry-run
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { ProxyPool } = require("./proxy");
const { writeAccounts, writeSummary, ensureDir } = require("./output");
const { randomDelay, randomEmailLocal } = require("./util");

function parseArgs(argv) {
  const args = { ...config };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-n":
      case "--count":
        args.count = Number.parseInt(next(), 10);
        break;
      case "-c":
      case "--concurrency":
        args.concurrency = Number.parseInt(next(), 10);
        break;
      case "--headful":
        args.headless = false;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-o":
      case "--output":
        args.outputDir = next();
        break;
      case "--proxy":
        args.proxyList.push(next());
        break;
      case "--proxy-file":
        args.proxyFile = next();
        break;
      case "--proxy-scheme":
        args.proxyScheme = next();
        break;
      case "--proxy-template":
        args.proxyTemplate = next();
        break;
      case "--no-proxy-rotate":
        args.proxyRotateOnFailure = false;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a.startsWith("--count=")) args.count = Number.parseInt(a.split("=")[1], 10);
        else if (a.startsWith("--concurrency=")) args.concurrency = Number.parseInt(a.split("=")[1], 10);
        break;
    }
  }
  return args;
}

const HELP = `
Abliteration Bulk Creator — create verified abliteration.ai accounts with API keys.

Usage:
  node src/index.js [options]

Options:
  -n, --count <n>            Number of accounts to create        (default 1)
  -c, --concurrency <n>      Parallel accounts                   (default 2)
  -o, --output <dir>         Output directory                    (default accounts)
      --proxy <url>          Add a proxy (repeatable)
      --proxy-file <path>    Load proxies from a file              (default proxy.txt)
      --proxy-scheme <s>     Scheme for bare host:port entries      (default http)
      --proxy-template <t>   Proxy URL template with {session}/{index}
      --no-proxy-rotate      Do not switch proxy when retrying
      --dry-run              Plan the batch without touching the network
      --headful              Show the browser window
      --headless             Hide the browser window             (default)
  -h, --help                 Show this help

Environment:
  ABC_PROXIES                  Comma-separated proxy list
  ABC_PROXY_FILE               Proxy list file (default proxy.txt)
  ABC_PROXY_SCHEME             Scheme for bare host:port entries (default http)
  ABC_PROXY_TEMPLATE           Rotating-gateway URL template
  ABC_PROXY_ROTATE             true/false — new exit IP per account (default true)
  ABC_PROXY_ROTATE_ON_FAILURE  true/false — rotate on retry (default true)
  ABC_PROXY_COUNTRY            Optional country code for {country} in the template
  ABC_CONCURRENCY              Parallelism
  ABC_HEADLESS                 true/false
  ABC_CODE_TIMEOUT_MS          Wait for the email code (default 180000)
  ABC_OUTPUT_DIR               Output directory
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!Number.isFinite(args.count) || args.count < 1) {
    process.stderr.write("error: --count must be >= 1\n");
    process.exitCode = 2;
    return;
  }

  const log = {
    info: (m) => console.log(`[abc] ${m}`),
    warn: (m) => console.warn(`[abc] ${m}`),
    error: (m) => console.error(`[abc] ${m}`),
  };

  if (args.dryRun) return dryRun(args, log);

  // Lazy-require Playwright only for a real run so `--dry-run` works with no deps.
  let chromium;
  try {
    ({ chromium } = require("playwright-extra"));
    const stealth = require("puppeteer-extra-plugin-stealth")();
    chromium.use(stealth);
  } catch {
    ({ chromium } = require("playwright"));
  }
  const { AbliterationAccountCreator } = require("./abliteration");

  ensureDir(args.outputDir);
  const pool = new ProxyPool(args);
  const proxyFileUsed =
    args.proxyFile && fs.existsSync(path.resolve(process.cwd(), args.proxyFile))
      ? path.resolve(process.cwd(), args.proxyFile)
      : null;

  log.info(`Abliteration Bulk Creator — ${args.count} account(s), concurrency ${args.concurrency}`);
  log.info(`output dir: ${args.outputDir}`);
  if (pool.enabled) {
    log.info(
      `proxy: enabled (${pool.static.length || "template"} entr${(pool.static.length || 1) === 1 ? "y" : "ies"}, rotate=${args.proxyRotatePerAccount})`,
    );
    if (proxyFileUsed) log.info(`proxy file: ${proxyFileUsed}`);
  } else {
    log.warn("proxy: disabled (direct connection) — signup will likely be blocked; see README");
  }

  const browser = await chromium.launch({
    headless: args.headless,
    channel: args.browserChannel || undefined,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const creator = new AbliterationAccountCreator({ browser, config: args, logger: log });
  const results = [];

  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= args.count) return;
      log.info(`[${index + 1}/${args.count}] creating account...`);
      const record = await attemptWithRetries(creator, pool, index, args, log);
      results.push(record);
      if (index < args.count - 1) {
        await randomDelay(args.minDelayMs, args.maxDelayMs);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(args.concurrency, args.count) },
    () => worker(),
  );
  try {
    await Promise.all(workers);
  } finally {
    await browser.close().catch(() => {});
  }

  results.sort((a, b) => a.index - b.index);
  const stats = writeAccounts(results, args.outputDir);
  writeSummary(
    {
      startedAt: new Date().toISOString(),
      requested: args.count,
      created: stats.ok,
      failed: stats.failed,
      concurrency: args.concurrency,
      proxyUsage: pool.report(),
    },
    args.outputDir,
  );

  log.info(`done: ${stats.ok} created, ${stats.failed} failed`);
  log.info(`results: ${args.outputDir}/accounts.json, ${args.outputDir}/accounts.csv, ${args.outputDir}/keys.txt`);
  if (stats.failed && !stats.ok) process.exitCode = 1;
}

/** Print the batch plan without any network activity. */
function dryRun(args, log) {
  log.info(`DRY RUN — ${args.count} account(s), concurrency ${args.concurrency}`);
  log.info(`target: ${args.origin}${args.signupPath}`);
  for (let i = 0; i < args.count; i++) {
    const email = `${randomEmailLocal()}@gmail.com`;
    log.info(`  [${i + 1}/${args.count}] would create ${email}`);
  }
  log.info("no accounts were created");
}

async function attemptWithRetries(creator, pool, index, args, log) {
  let lastRecord;
  let usedProxy = "";
  for (let attempt = 0; attempt <= args.maxRetries; attempt++) {
    const proxyUrl =
      attempt === 0 || !args.proxyRotateOnFailure ? pool.assign(index) : pool.rotate(usedProxy);
    usedProxy = proxyUrl;
    if (attempt > 0) log.warn(`  retry ${attempt}/${args.maxRetries} for account ${index + 1}`);
    const record = await creator.createAccount(index, proxyUrl);
    if (record.status === "ok") return record;
    lastRecord = record;
  }
  return lastRecord;
}

main().catch((err) => {
  console.error(`[abc] fatal: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
