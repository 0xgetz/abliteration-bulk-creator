"use strict";

/**
 * Fallback inbox provider (mail.tm).
 *
 * emailnator issues real @gmail.com addresses, which is what abliteration.ai
 * prefers, but its generation endpoint is occasionally rate-limited or
 * temporarily unavailable. When that happens the creator can transparently fall
 * back to mail.tm so a run does not die on one provider.
 *
 * Note: mail.tm addresses are NOT @gmail.com, so only enable this fallback if
 * the target accepts non-Gmail addresses. It is OFF by default.
 *
 * mail.tm API:
 *   GET  /domains                       -> pick a domain
 *   POST /accounts   {address,password} -> create an inbox
 *   POST /token      {address,password} -> bearer token
 *   GET  /messages                      -> message list
 *   GET  /messages/:id                  -> full message
 */

const DEFAULT_BASE = "https://api.mail.tm";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class MailTm {
  constructor({ base = DEFAULT_BASE, logger = console } = {}) {
    this.base = base.replace(/\/$/, "");
    this.logger = logger;
    this.token = null;
    this.address = null;
    this.password = null;
  }

  async _req(path, { method = "GET", body, auth = false, retries = 2 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const headers = { Accept: "application/json" };
      if (body) headers["Content-Type"] = "application/json";
      if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      if (res.ok) return data;
      if (res.status === 429 && attempt < retries) {
        await sleep(3000 * (attempt + 1));
        lastErr = Object.assign(new Error(`mail.tm ${path} -> 429`), { status: 429, data });
        continue;
      }
      throw Object.assign(new Error(`mail.tm ${path} -> ${res.status}`), {
        status: res.status,
        data,
      });
    }
    throw lastErr || new Error(`mail.tm ${path} failed`);
  }

  /** Provision a new inbox and return its address. */
  async generateAddress() {
    const domains = await this._req("/domains");
    const list = Array.isArray(domains)
      ? domains
      : domains["hydra:member"] || domains["member"] || [];
    const domain =
      list.find((d) => d.isActive && !d.isPrivate)?.domain || list[0]?.domain;
    if (!domain) throw new Error("mail.tm: no active domain available");
    const local = `abc${Math.random().toString(36).slice(2, 10)}`;
    const address = `${local}@${domain}`;
    const password = Math.random().toString(36).slice(2, 14) + "Aa1!";

    await this._req("/accounts", { method: "POST", body: { address, password } });
    const tok = await this._req("/token", {
      method: "POST",
      body: { address, password },
    });
    this.token = tok.token;
    this.address = address;
    this.password = password;
    return { email: address };
  }

  async listMessages() {
    const data = await this._req("/messages", { auth: true });
    return Array.isArray(data) ? data : data["hydra:member"] || data["member"] || [];
  }

  async waitForCode({ timeoutMs = 180000, pollMs = 5000 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      let messages = [];
      try {
        messages = await this.listMessages();
      } catch (err) {
        this.logger.warn?.(`  mail.tm poll failed: ${err.message}`);
      }
      for (const m of messages) {
        const code = (String(m.subject || "").match(/\b(\d{6})\b/) || [])[1];
        if (code) return { code, message: m };
      }
      await sleep(pollMs);
    }
    throw new Error("Timed out waiting for the verification code (mail.tm)");
  }
}

module.exports = { MailTm };
