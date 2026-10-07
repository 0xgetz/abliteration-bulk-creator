"use strict";

/**
 * emailmux.com inbox provider.
 *
 * emailmux issues real `@gmail.com` (and outlook/hotmail/googlemail) addresses
 * on demand. It exposes two surfaces:
 *
 *   A. Public (unauthenticated) endpoints, used by the website itself:
 *        POST /generate-email   { domains: ["gmail"] }   -> { email, status }
 *        GET  /use-email?email=...                        -> activate the box
 *        GET  /emails?email=...                           -> { emails:[...] }
 *      These are heavily rate-limited per IP (a handful of requests/day), so
 *      they are best used together with a rotating proxy from `proxy.txt`.
 *
 *   B. Account (Bearer) API, for users with an emailmux API key:
 *        POST /api/auth    { username, password }         -> { Authorization }
 *        POST /api/random  { domian: ["gmail"] }          -> { address }
 *        POST /api/emails  { address }                    -> { email: { ... } }
 *      Requests carry `Authorization: Bearer <API_KEY>`.
 *
 * The client below speaks both. When `apiKey` is set it uses the Bearer API;
 * otherwise it falls back to the public endpoints. The website's address
 * suffixes are `gmail`, `gmail_plus`, `googlemail`, `outlook`, `hotmail`,
 * `iCloud`, `tampmail` — we only accept a real `@gmail.com` by default.
 */

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Origin: "https://emailmux.com",
  Referer: "https://emailmux.com/",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull a 6-digit numeric code out of a subject/body string. */
function extractCode(text) {
  if (!text) return null;
  const m = String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

/** Crude HTML-to-text so a code inside markup can be matched. */
function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

class EmailMux {
  /**
   * @param {object} opts
   * @param {string} [opts.base]      Base URL, e.g. https://emailmux.com
   * @param {string} [opts.apiKey]    Optional Bearer API key (account API)
   * @param {string} [opts.domains]   Address suffixes to request (default ["gmail"])
   * @param {Function} [opts.fetch]   Custom fetch implementation (proxy support)
   * @param {object} [opts.logger]
   */
  constructor({ base, apiKey = "", domains = ["gmail"], fetch: fetchImpl, logger = console } = {}) {
    this.base = (base || "https://emailmux.com").replace(/\/$/, "");
    this.apiKey = apiKey || "";
    this.domains = domains;
    this.logger = logger;
    this._fetch = fetchImpl || globalThis.fetch;
    this._authHeader = this.apiKey ? `Bearer ${this.apiKey}` : "";
  }

  get mode() {
    return this.apiKey ? "api" : "public";
  }

  _headers(extra = {}) {
    const h = { ...DEFAULT_HEADERS, ...extra };
    if (this._authHeader) h.Authorization = this._authHeader;
    return h;
  }

  async _request(path, { method = "GET", body, retries = 3 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this._fetch(`${this.base}${path}`, {
          method,
          headers: this._headers(),
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (!res.ok) {
          // 429 / 503 are "slow down or quota exhausted" — back off and retry.
          if ((res.status === 429 || res.status === 503) && attempt < retries) {
            await sleep(2500 * (attempt + 1));
            lastErr = Object.assign(new Error(`emailmux ${path} -> ${res.status}`), {
              status: res.status,
              data,
            });
            continue;
          }
          throw Object.assign(new Error(`emailmux ${path} -> ${res.status}`), {
            status: res.status,
            data,
          });
        }
        // Soft errors come back 200 with {status:"error"}.
        if (data && data.status === "error" && attempt < retries) {
          await sleep(2500 * (attempt + 1));
          lastErr = Object.assign(new Error(`emailmux: ${data.msg || "error"}`), { data });
          continue;
        }
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastErr || new Error(`emailmux ${path} failed`);
  }

  /** Generate a fresh real @gmail.com address and activate its mailbox. */
  async generateAddress() {
    let email;
    if (this.mode === "api") {
      const data = await this._request("/api/random", {
        method: "POST",
        body: { domian: this.domains },
      });
      email = data.address || data.email || data.data?.address;
    } else {
      // The public endpoint expects `domains`; "gmail" yields name@gmail.com.
      const data = await this._request("/generate-email", {
        method: "POST",
        body: { domains: this.domains },
      });
      email = data.email || data.address || data.data?.email;
    }
    if (!email) {
      throw new Error(`emailmux: no address in response`);
    }
    if (this.domains.includes("gmail") && !/@gmail\.com$/i.test(email)) {
      throw new Error(`emailmux: expected @gmail.com, got ${email}`);
    }
    return { email };
  }

  /** Fetch the current message list for an address. */
  async listMessages(email) {
    if (this.mode === "api") {
      // The account API returns one message per call; use it as the newest.
      const data = await this._request("/api/emails", {
        method: "POST",
        body: { address: email },
      });
      const msg = data.email || data.message || data.data;
      return msg && typeof msg === "object" ? [msg] : [];
    }
    const data = await this._request(`/emails?email=${encodeURIComponent(email)}`);
    return data.emails || data.messages || data.data || [];
  }

  /** Poll until a verification code arrives, then return it. */
  async waitForCode(email, { timeoutMs = 180000, pollMs = 5000, logger = console } = {}) {
    const started = Date.now();
    let lastCount = 0;
    while (Date.now() - started < timeoutMs) {
      let messages = [];
      try {
        messages = await this.listMessages(email);
      } catch (err) {
        logger.warn?.(`  emailmux poll failed: ${err.message}`);
      }
      // Account API returns a single object; the public API an array.
      const list = Array.isArray(messages) ? messages : messages ? [messages] : [];
      lastCount = Math.max(lastCount, list.length);
      for (const m of list) {
        const subject = m.subject || m.from || m.sender || "";
        const body = m.body || m.html || m.text || m.message || m.content || "";
        const code = extractCode(subject) || extractCode(stripHtml(body));
        if (code) return { code, message: m };
      }
      await sleep(pollMs);
    }
    throw new Error("Timed out waiting for the verification code (emailmux)");
  }
}

module.exports = { EmailMux, extractCode, stripHtml, DEFAULT_HEADERS };
