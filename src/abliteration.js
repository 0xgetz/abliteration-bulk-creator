"use strict";

/**
 * Abliteration.ai account automation.
 *
 * Abliteration.ai is a Next.js console protected by Cloudflare Turnstile, with
 * a small first-party JSON API behind `/auth/*` and `/api/console/v1/*`:
 *
 *   POST /auth/password/sign-up  { email, password, signalsId, turnstileToken }
 *   POST /auth/password/sign-in  { email, password, signalsId }
 *   POST /auth/password/verify   { code }
 *   GET  /api/console/v1/session                      -> account + active_project
 *   POST /api/console/v1/projects/:id/api-keys        { name }  (+ Idempotency-Key header)
 *          -> { api_key: {...}, secret_key: "ak_..." }
 *
 * Because sign-up embeds a Turnstile token minted in the page, a pure HTTP
 * client cannot register accounts: the token and the session cookie must come
 * from a real browser. This module therefore drives a real headless Chromium
 * with Playwright. Once the account is verified, the API-key mint is a plain
 * authenticated fetch from inside the page (with the required idempotency
 * header), which is more robust than clicking through the UI.
 *
 * Flow per account:
 *   1. open /sign-up
 *   2. fill email + password, submit
 *   3. read the 6-digit code from the inbox, enter it, verify
 *   4. read the console session to discover the active project id
 *   5. POST to create a randomly-named API key and capture the one-time value
 */

const { Emailnator } = require("./emailnator");
const { MailTm } = require("./mailtm");
const { toPlaywrightProxy, redact } = require("./proxy");
const {
  randomKeyName,
  randomPassword,
  randomEmailLocal,
  jitter,
} = require("./util");

/** Selectors are collected here so they are easy to update if the UI changes. */
const SEL = {
  email: 'input[type="email"][name="email"], input[name="email"]',
  password: 'input[type="password"][name="password"], input[name="password"]',
  code: 'input[name="code"], input[inputmode="numeric"], input[autocomplete="one-time-code"]',
};

class AbliterationAccountCreator {
  /**
   * @param {object} opts
   * @param {import('playwright').Browser} opts.browser
   * @param {object} opts.config
   * @param {object} [opts.logger]
   */
  constructor({ browser, config, logger = console }) {
    this.browser = browser;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create one fully verified account and mint an API key for it.
   * @param {number} index  0-based account index (used for proxy + naming)
   * @param {string} proxyUrl
   * @returns {Promise<object>} account record
   */
  async createAccount(index, proxyUrl = "") {
    const cfg = this.config;
    const password = randomPassword();
    const keyName = randomKeyName();
    const startedAt = Date.now();

    this.logger.info?.(`  proxy: ${proxyUrl ? redact(proxyUrl) : "direct"}`);

    const context = await this.browser.newContext({
      proxy: toPlaywrightProxy(proxyUrl),
      userAgent: cfg.userAgent,
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });
    context.setDefaultTimeout(cfg.actionTimeoutMs);
    context.setDefaultNavigationTimeout(cfg.navigationTimeoutMs);

    const page = await context.newPage();
    const emailnator = new Emailnator({
      base: cfg.emailnatorBase,
      logger: this.logger,
    });

    let record;
    try {
      // 1. Provision an inbox. Prefer emailnator (real @gmail.com); fall back
      //    to mail.tm when configured.
      const { email, inbox } = await this._provisionInbox(emailnator);
      this.logger.info?.(`  inbox: ${email} (${inbox.name})`);

      // 2. Sign up.
      await this._signup(page, email, password);

      // 3. Read the verification code and finish signup.
      const { code } = await inbox.waitForCode(email, {
        timeoutMs: cfg.codeTimeoutMs,
        pollMs: cfg.codePollMs,
        logger: this.logger,
      });
      this.logger.info?.(`  code:  ${code}`);
      await this._submitCode(page, code);
      await this._waitForConsole(page);

      // 4. Discover the active project id from the console session.
      const projectId = await this._getProjectId(page);

      // 5. Mint an API key with the one-time secret value.
      const apiKey = await this._createApiKey(page, projectId, keyName);

      record = {
        index,
        email,
        password,
        apiKey,
        keyName,
        projectId,
        displayName: null,
        proxy: proxyUrl ? redact(proxyUrl) : "direct",
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: "ok",
      };
      this.logger.info?.(`  key:   ${apiKey}`);
    } catch (err) {
      record = {
        index,
        email: undefined,
        password,
        keyName,
        projectId: undefined,
        proxy: proxyUrl ? redact(proxyUrl) : "direct",
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: "failed",
        error: err && err.message ? err.message : String(err),
      };
      this.logger.error?.(`  failed: ${record.error}`);
      await this._dumpOnFailure(page, index);
    } finally {
      await context.close().catch(() => {});
    }
    return record;
  }

  // ---- steps ---------------------------------------------------------------

  /**
   * Provision an inbox, preferring emailnator (real @gmail.com) and optionally
   * falling back to mail.tm.
   * @returns {Promise<{email:string, inbox:{name:string, waitForCode:Function}}>}
   */
  async _provisionInbox(emailnator) {
    const cfg = this.config;
    const providers = [];

    if (cfg.inboxProvider !== "mailtm") {
      providers.push({
        name: "emailnator",
        gen: async () => {
          const { email } = await emailnator.generateAddress();
          return {
            email,
            inbox: {
              name: "emailnator",
              waitForCode: (addr, opts) => emailnator.waitForCode(addr, opts),
            },
          };
        },
      });
    }

    if (cfg.inboxFallback) {
      providers.push({
        name: "mail.tm",
        gen: async () => {
          const mt = new MailTm({ logger: this.logger });
          const { email } = await mt.generateAddress();
          return {
            email,
            inbox: {
              name: "mail.tm",
              waitForCode: (_addr, opts) => mt.waitForCode(opts),
            },
          };
        },
      });
    }

    let lastErr;
    for (const p of providers) {
      try {
        return await p.gen();
      } catch (err) {
        lastErr = err;
        this.logger.warn?.(`  inbox provider ${p.name} failed: ${err.message}`);
      }
    }
    throw lastErr || new Error("no inbox provider available");
  }

  async _signup(page, email, password) {
    const cfg = this.config;
    await page.goto(`${cfg.origin}${cfg.signupPath}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(SEL.email, { state: "visible" });

    await this._type(page, SEL.email, email);
    await this._type(page, SEL.password, password);

    await page.getByRole("button", { name: /^create account$/i }).first().click();

    // Turnstile may briefly show an interactive checkbox on a "dirty" IP; wait
    // for it to clear. A clean residential proxy makes it invisible.
    await this._solveTurnstile(page, /verify|check your inbox|verification/i);

    // Either we advance to the code step, or the server blocks the attempt.
    await page.waitForTimeout(2500);
    const body = await page.textContent("body").catch(() => "");
    if (/sign-in attempt was blocked|was blocked\. try another/i.test(body)) {
      throw new Error(
        "signup blocked (HTTP 403 from /auth/password/sign-up) — use a clean residential proxy",
      );
    }
  }

  /** Wait for / click the Cloudflare Turnstile widget when it is interactive. */
  async _solveTurnstile(page, advancePattern) {
    const deadline = Date.now() + (this.config.turnstileTimeoutMs || 75000);
    let clicked = false;
    while (Date.now() < deadline) {
      const body = await page.textContent("body").catch(() => "");
      if (advancePattern && advancePattern.test(body)) return;
      // A successful signup navigates to the verify view.
      if (/verification code/i.test(body)) return;

      if (!clicked) {
        const label = page.getByText(/verify you are human/i).first();
        if (await label.count().catch(() => 0)) {
          const bb = await label.boundingBox().catch(() => null);
          if (bb) {
            const x = bb.x + 22;
            const y = bb.y + bb.height / 2;
            try {
              await page.mouse.move(x - 60, y - 30, { steps: 10 });
              await page.mouse.move(x, y, { steps: 10 });
              await page.mouse.down();
              await page.waitForTimeout(90);
              await page.mouse.up();
              clicked = true;
            } catch {
              /* retry next loop */
            }
          }
        }
      }

      for (const frame of page.frames()) {
        if (!/challenges\.cloudflare\.com/.test(frame.url())) continue;
        await frame
          .locator('input[type="checkbox"], .ctp-checkbox-label, #challenge-stage')
          .first()
          .click({ timeout: 1500 })
          .catch(() => {});
      }
      await page.waitForTimeout(1500);
    }
  }

  async _submitCode(page, code) {
    const input = page.locator(SEL.code).first();
    await input.waitFor({ state: "visible" });
    await input.click();
    await page.keyboard.type(String(code), { delay: 90 });

    // Some views auto-advance; others need an explicit button.
    await page.waitForTimeout(1000);
    const btn = page.getByRole("button", { name: /verify and continue|verify|continue/i }).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click().catch(() => {});
    }
  }

  async _waitForConsole(page) {
    await page.waitForURL(/\/console/, { timeout: this.config.navigationTimeoutMs });
    // "Getting your workspace ready" intermediate screen.
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => !/getting your workspace ready/i.test(document.body.innerText),
      { timeout: this.config.navigationTimeoutMs },
    ).catch(() => {});
    await page.waitForTimeout(2500);
  }

  /** Read the authenticated console session and return the active project id. */
  async _getProjectId(page) {
    const res = await page.evaluate(async (path) => {
      const r = await fetch(path, { credentials: "include" });
      const text = await r.text();
      return { status: r.status, text };
    }, this.config.sessionPath);
    if (res.status !== 200) {
      throw new Error(`session lookup failed (HTTP ${res.status})`);
    }
    let data;
    try {
      data = JSON.parse(res.text);
    } catch {
      throw new Error("session lookup returned non-JSON");
    }
    const id =
      data?.active_project?.id ||
      data?.project?.id ||
      data?.data?.active_project?.id;
    if (!id) throw new Error("active project id not found in session");
    return id;
  }

  /** Create an API key from inside the authenticated page and return the secret. */
  async _createApiKey(page, projectId, keyName) {
    const res = await page.evaluate(
      async ({ projectId: pid, name }) => {
        const r = await fetch(`/api/console/v1/projects/${pid}/api-keys`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            // Required by the endpoint; a fresh UUID per request.
            "Idempotency-Key": (crypto.randomUUID && crypto.randomUUID()) ||
              `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          },
          body: JSON.stringify({ name }),
        });
        const text = await r.text();
        return { status: r.status, text };
      },
      { projectId, name: keyName },
    );
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`api-key create failed (HTTP ${res.status}): ${res.text.slice(0, 200)}`);
    }
    let data;
    try {
      data = JSON.parse(res.text);
    } catch {
      throw new Error("api-key create returned non-JSON");
    }
    const secret = data.secret_key || data.api_key?.key || data.key;
    if (!secret) throw new Error("api-key secret not found in response");
    return secret;
  }

  // ---- helpers -------------------------------------------------------------

  /** Type text like a human (optional) so Turnstile's analysis stays satisfied. */
  async _type(page, selector, value) {
    const el = page.locator(selector).first();
    await el.click();
    if (this.config.humanTyping) {
      await el.pressSequentially(value, { delay: jitter(40, 120) });
    } else {
      await el.fill(value);
    }
  }

  async _dumpOnFailure(page, index) {
    try {
      const dir = this.config.outputDir;
      const fs = require("fs");
      const path = require("path");
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: path.join(dir, `failure-${index}-${Date.now()}.png`),
        fullPage: true,
      });
    } catch {
      /* best effort */
    }
  }
}

module.exports = { AbliterationAccountCreator, SEL, randomEmailLocal };
