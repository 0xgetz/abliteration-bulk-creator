"use strict";

/**
 * emailnator.com inbox provider.
 *
 * emailnator issues *real* @gmail.com addresses on demand, which sidesteps the
 * disposable-domain filters that many signup forms apply. The public site is
 * backed by a small JSON API:
 *
 *   POST /api/generate-email      { ids: ["domain","plusGmail"] }  -> { email }
 *   POST /api/generate-bulk-email { ids:[...], count:N }          -> { email: [...] }
 *   POST /api/message-list        { email }                        -> { messages:[...] }
 *   POST /api/message/:id                                          -> { message }
 *
 * The API is occasionally rate-limited (HTTP 503); the client waits and retries.
 */

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Origin: "https://www.emailnator.com",
  Referer: "https://www.emailnator.com/",
};

// emailnator EMAIL_TYPES. `domain` + `plusGmail` yields name+tag@gmail.com.
const EMAIL_TYPES = {
  domain: "domain",
  plusGmail: "plusGmail",
  dotGmail: "dotGmail",
  googleMail: "googleMail",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull a 6-digit numeric code out of `Your verification code is 123456`. */
function extractCode(text) {
  if (!text) return null;
  const m = String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

class Emailnator {
  /**
   * @param {object} opts
   * @param {string} opts.base      Base URL, e.g. https://www.emailnator.com
   * @param {string} [opts.proxy]   Proxy URL (http://user:pass@host:port)
   * @param {Function} [opts.fetch] Custom fetch implementation (for proxy support)
   * @param {object} [opts.logger]
   */
  constructor({ base, proxy = "", fetch: fetchImpl, logger = console } = {}) {
    this.base = (base || "https://www.emailnator.com").replace(/\/$/, "");
    this.proxy = proxy;
    this.logger = logger;
    this._fetch = fetchImpl || globalThis.fetch;
  }

  async _post(path, body, { retries = 4 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this._fetch(`${this.base}${path}`, {
          method: "POST",
          headers: DEFAULT_HEADERS,
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (!res.ok) {
          // 503/429 mean "slow down"; back off and retry.
          if ((res.status === 503 || res.status === 429) && attempt < retries) {
            await sleep(3000 * (attempt + 1));
            continue;
          }
          throw Object.assign(new Error(`emailnator ${path} -> ${res.status}`), {
            status: res.status,
            data,
          });
        }
        // Some failures come back 200 with a soft error envelope.
        if (data && data.status === "error" && attempt < retries) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await sleep(2500 * (attempt + 1));
          continue;
        }
      }
    }
    throw lastErr || new Error(`emailnator ${path} failed`);
  }

  /** Generate a fresh real Gmail address (name+tag@gmail.com). */
  async generateAddress({ ids = [EMAIL_TYPES.domain, EMAIL_TYPES.plusGmail] } = {}) {
    const data = await this._post("/api/generate-email", { ids });
    const email =
      data.email ||
      data.address ||
      (Array.isArray(data) ? data[0] : null) ||
      data?.data?.email;
    if (!email || !/@gmail\.com$/i.test(email)) {
      throw new Error(
        `emailnator: no @gmail.com address in response ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return { email, raw: data };
  }

  /** Fetch the newest messages for an address. */
  async listMessages(email, { limit = 20 } = {}) {
    const data = await this._post("/api/message-list", { email, limit });
    return data.messages || data.data || [];
  }

  /**
   * Poll until a verification message arrives, then return the extracted code.
   * @returns {Promise<{code:string, message:object}>}
   */
  async waitForCode(email, { timeoutMs = 180000, pollMs = 5000, logger = console } = {}) {
    const started = Date.now();
    let seen = new Set();
    while (Date.now() - started < timeoutMs) {
      let messages = [];
      try {
        messages = await this.listMessages(email, { limit: 20 });
      } catch (err) {
        logger.warn?.(`  inbox poll failed: ${err.message}`);
      }
      for (const m of messages) {
        const id = m.messageID || m.id || m._id || JSON.stringify(m).slice(0, 60);
        seen.add(id);
        const subject = m.subject || m.from || "";
        // Codes can live in the subject or (more often) the HTML body.
        const code = extractCode(subject) || extractCode(stripHtml(m.body || m.html || m.message));
        if (code) return { code, message: m };
      }
      await sleep(pollMs);
    }
    throw new Error("Timed out waiting for the verification code in the inbox");
  }
}

/** Crude HTML-to-text so a 6-digit code inside markup can be matched. */
function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

module.exports = { Emailnator, extractCode, stripHtml, EMAIL_TYPES, DEFAULT_HEADERS };
