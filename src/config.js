"use strict";

/**
 * Central configuration for Abliteration Bulk Creator.
 *
 * Everything is overridable through environment variables so the tool can be
 * embedded in cron jobs or a plain shell without editing code. Defaults are
 * chosen to be safe and observable.
 */

function bool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  // ---- Batch -----------------------------------------------------------------
  count: int(process.env.ABC_COUNT, 1),
  concurrency: int(process.env.ABC_CONCURRENCY, 2),
  minDelayMs: int(process.env.ABC_MIN_DELAY_MS, 5000),
  maxDelayMs: int(process.env.ABC_MAX_DELAY_MS, 14000),
  maxRetries: int(process.env.ABC_MAX_RETRIES, 3),
  dryRun: bool(process.env.ABC_DRY_RUN, false),

  // ---- Targets ---------------------------------------------------------------
  origin: process.env.ABC_ORIGIN || "https://abliteration.ai",
  signupPath: "/sign-up",
  apiKeysPath: "/console/api-keys",
  sessionPath: "/api/console/v1/session",

  // emailnator inbox provider
  emailnatorBase: process.env.ABC_EMAILNATOR_URL || "https://www.emailnator.com",

  // emailmux inbox provider (real @gmail.com)
  emailmuxBase: process.env.ABC_EMAILMUX_URL || "https://emailmux.com",
  // Optional Bearer API key; when set the account API is used.
  emailmuxApiKey: process.env.ABC_EMAILMUX_API_KEY || "",
  // Address suffixes to request from emailmux ("gmail" => name@gmail.com).
  emailmuxDomains: list(process.env.ABC_EMAILMUX_DOMAINS, ["gmail"]),

  // ---- Browser ---------------------------------------------------------------
  headless: bool(process.env.ABC_HEADLESS, true),
  browserChannel: process.env.ABC_BROWSER_CHANNEL || "", // "", "chrome", "msedge"
  userAgent:
    process.env.ABC_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  navigationTimeoutMs: int(process.env.ABC_NAV_TIMEOUT_MS, 60000),
  actionTimeoutMs: int(process.env.ABC_ACTION_TIMEOUT_MS, 30000),
  turnstileTimeoutMs: int(process.env.ABC_TURNSTILE_TIMEOUT_MS, 75000),
  humanTyping: bool(process.env.ABC_HUMAN_TYPING, true),

  // ---- Proxy (rotating) ------------------------------------------------------
  // A list of proxy URLs. Each new account picks the next proxy (round-robin),
  // which is what "rotating proxy" means at the account level. See proxy.js.
  proxyList: list(process.env.ABC_PROXIES, []),
  // A proxy list file, one entry per line. Accepts many common formats:
  //   host:port
  //   host:port:user:pass
  //   user:pass@host:port
  //   scheme://user:pass@host:port   (http, https, socks4, socks5)
  // Defaults to `proxy.txt` in the working directory when it exists.
  proxyFile: process.env.ABC_PROXY_FILE || "proxy.txt",
  // Default scheme applied to bare `host:port` entries (http, socks5, ...).
  proxyScheme: process.env.ABC_PROXY_SCHEME || "http",
  // Template with {session} and/or {index} placeholders expanded per account,
  // e.g. "http://user:pass@gate.example.com:8000" or a rotating gateway URL.
  proxyTemplate: process.env.ABC_PROXY_TEMPLATE || "",
  // When true, every account uses a fresh sticky session id in the template.
  proxyRotatePerAccount: bool(process.env.ABC_PROXY_ROTATE, true),
  // Optional: force a fresh proxy when an account fails (retry on new IP).
  proxyRotateOnFailure: bool(process.env.ABC_PROXY_ROTATE_ON_FAILURE, true),
  proxyCountry: process.env.ABC_PROXY_COUNTRY || "",

  // ---- Output ----------------------------------------------------------------
  outputDir: process.env.ABC_OUTPUT_DIR || "accounts",

  // ---- Verification ----------------------------------------------------------
  // How long to poll the inbox for a verification code, per step.
  codeTimeoutMs: int(process.env.ABC_CODE_TIMEOUT_MS, 180000),
  codePollMs: int(process.env.ABC_CODE_POLL_MS, 5000),
  // Which inbox to use: "emailmux" (default, real @gmail.com), "emailnator"
  // (also real @gmail.com) or "mailtm" (non-Gmail fallback).
  inboxProvider: process.env.ABC_INBOX_PROVIDER || "emailmux",
  inboxFallback: bool(process.env.ABC_INBOX_FALLBACK, true),
};

module.exports = config;
