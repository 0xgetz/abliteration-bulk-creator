"use strict";

/**
 * Rotating-proxy support.
 *
 * Abliteration.ai protects signup with Cloudflare Turnstile and server-side
 * anti-abuse. A single IP address creating many accounts will get challenged
 * hard and eventually receives HTTP 403 from `/auth/password/sign-up`. The
 * account creator therefore supports rotating egress:
 *
 *   1. `ABC_PROXIES`          — a comma/newline separated list of full proxy URLs.
 *                               Accounts are assigned round-robin.
 *   2. `ABC_PROXY_TEMPLATE`   — one URL with `{session}` / `{index}` placeholders,
 *                               expanded per account. Ideal for "sticky session"
 *                               rotating gateways (Bright Data, Oxylabs, ProxyRise,
 *                               Smartproxy, IPRoyal, ...). Each account gets a new
 *                               `{session}` value, i.e. a new exit IP.
 *   3. No configuration       — the browser connects directly.
 *
 * A `ProxyPool` hands out proxies and tracks how many accounts/attempts each IP
 * has served so the run can spread load and rotate away from burnt addresses.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function randomToken(len = 8) {
  return crypto.randomBytes(len).toString("hex");
}

/**
 * Normalise a single proxy line into a full proxy URL.
 *
 * Accepts the common formats found in the wild and in `proxy.txt`:
 *   host:port
 *   host:port:user:pass
 *   user:pass@host:port
 *   scheme://user:pass@host:port        (http, https, socks4, socks5)
 *   scheme://host:port:user:pass
 *
 * @param {string} line
 * @param {string} [defaultScheme]   "http" | "socks5" | ... (default: http)
 * @returns {string|null} a normalised proxy URL, or null if the line is not a proxy
 */
function parseProxyLine(line, defaultScheme = "http") {
  if (!line) return null;
  let s = String(line).trim();
  if (!s || s.startsWith("#") || s.startsWith("//")) return null;
  // Strip a trailing inline comment (` # ...`) only when clearly separated.
  s = s.replace(/\s+#.*$/, "").trim();
  if (!s) return null;

  // Already a URL with a scheme.
  let scheme = defaultScheme.replace(/:\/\/$/, "");
  const schemeMatch = s.match(/^(https?|socks4|socks5):\/\/(.*)$/i);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    s = schemeMatch[2];
  }

  // user:pass@host:port
  if (s.includes("@")) {
    const at = s.lastIndexOf("@");
    const creds = s.slice(0, at);
    const hostPort = s.slice(at + 1);
    const [user, ...passParts] = creds.split(":");
    const pass = passParts.join(":");
    if (!hostPort) return null;
    const authPart = creds ? `${uriEnc(user)}:${uriEnc(pass)}@` : "";
    return `${scheme}://${authPart}${hostPort}`;
  }

  const parts = s.split(":");
  // host:port
  if (parts.length === 2) {
    return `${scheme}://${parts[0]}:${parts[1]}`;
  }
  // host:port:user:pass  (password may itself contain ':')
  if (parts.length >= 3) {
    const host = parts[0];
    const port = parts[1];
    const user = parts[2];
    const pass = parts.slice(3).join(":");
    if (!port || !/^\d+$/.test(port)) return null;
    if (user === undefined || user === "") return `${scheme}://${host}:${port}`;
    return `${scheme}://${uriEnc(user)}:${uriEnc(pass)}@${host}:${port}`;
  }
  return null;
}

function uriEnc(v) {
  return encodeURIComponent(v === undefined || v === null ? "" : String(v));
}

/**
 * Read + parse a proxy file (one entry per line). Blank lines and `#` comments
 * are ignored; each remaining line goes through `parseProxyLine`.
 *
 * @param {string} filePath
 * @param {string} [defaultScheme]
 * @returns {string[]} normalised proxy URLs
 */
function loadProxyFile(filePath, defaultScheme = "http") {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => parseProxyLine(l, defaultScheme))
    .filter(Boolean);
}

/**
 * Resolve the effective proxy list from config, merging (in priority order):
 *   1. the `ABC_PROXIES` env / explicit list,
 *   2. a `proxy.txt` file next to the project (or `ABC_PROXY_FILE`).
 * @param {object} cfg
 * @returns {string[]}
 */
function resolveProxyList(cfg = {}) {
  const out = [];
  for (const p of cfg.proxyList || []) {
    const norm = parseProxyLine(p, cfg.proxyScheme || "http") || p;
    if (norm) out.push(norm);
  }
  const file = cfg.proxyFile !== undefined ? cfg.proxyFile : "proxy.txt";
  if (file) {
    const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    if (fs.existsSync(abs)) {
      try {
        const fromFile = loadProxyFile(abs, cfg.proxyScheme || "http");
        out.push(...fromFile);
      } catch (err) {
        // Non-fatal: an unreadable proxy.txt should not kill a run.
        if (cfg.logger && cfg.logger.warn) cfg.logger.warn(`  could not read ${abs}: ${err.message}`);
      }
    }
  }
  // De-duplicate while preserving order.
  return [...new Set(out)];
}

function expandTemplate(template, index) {
  if (!template) return "";
  return template
    .replace(/\{session\}/gi, `abc${randomToken(4)}`)
    .replace(/\{index\}/g, String(index));
}

class ProxyPool {
  /**
   * @param {object} cfg
   * @param {string[]} [cfg.proxyList]
   * @param {string} [cfg.proxyTemplate]
   * @param {boolean} [cfg.rotatePerAccount]
   * @param {string} [cfg.country]
   */
  constructor(cfg) {
    this.static = cfg.proxyFile !== undefined || cfg.proxyList
      ? resolveProxyList(cfg)
      : (cfg.proxyList || []).slice();
    this.template = cfg.proxyTemplate || "";
    this.rotatePerAccount = cfg.rotatePerAccount !== false;
    this.country = cfg.country || "";
    this.usage = new Map(); // proxy URL -> number of assignments
    this.cursor = 0;
  }

  get enabled() {
    return this.static.length > 0 || Boolean(this.template);
  }

  /** Return the proxy URL to use for a given account index, or "" for direct. */
  assign(index) {
    if (this.template) {
      // Template mode: a fresh session per account (when rotating) or a fixed one.
      const expanded = expandTemplate(this.template, this.rotatePerAccount ? index : 0);
      const withCountry = this.country
        ? expanded.replace(/\{country\}/gi, this.country)
        : expanded;
      this.bump(withCountry);
      return withCountry;
    }
    if (this.static.length > 0) {
      const proxy = this.static[this.cursor % this.static.length];
      this.cursor += 1;
      this.bump(proxy);
      return proxy;
    }
    return "";
  }

  /** Pick a different proxy than `current` (used on retry after a failure). */
  rotate(current) {
    if (this.template) return this.assign(this.cursor++);
    if (this.static.length === 0) return "";
    if (this.static.length === 1) return this.static[0];
    let next = this.static[this.cursor % this.static.length];
    this.cursor += 1;
    if (next === current) {
      next = this.static[this.cursor % this.static.length];
      this.cursor += 1;
    }
    this.bump(next);
    return next;
  }

  bump(proxy) {
    if (!proxy) return;
    const key = redact(proxy);
    this.usage.set(key, (this.usage.get(key) || 0) + 1);
  }

  report() {
    return [...this.usage.entries()].map(([proxy, n]) => ({ proxy, accounts: n }));
  }
}

/** Hide credentials when a proxy URL is printed to logs or reports. */
function redact(url) {
  try {
    const u = new URL(url);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/\/\/[^@/]+@/, "//***@");
  }
}

/** Convert a proxy URL into the shape Playwright expects. */
function toPlaywrightProxy(proxyUrl) {
  if (!proxyUrl) return undefined;
  const u = new URL(proxyUrl);
  return {
    server: `${u.protocol}//${u.host}`,
    username: decodeURIComponent(u.username || "") || undefined,
    password: decodeURIComponent(u.password || "") || undefined,
  };
}

module.exports = {
  ProxyPool,
  redact,
  toPlaywrightProxy,
  expandTemplate,
  parseProxyLine,
  loadProxyFile,
  resolveProxyList,
};
