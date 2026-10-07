#!/usr/bin/env node
"use strict";

/**
 * Zero-dependency self-test. Run with:
 *
 *   node tests/selftest.js
 *
 * It exercises the pure logic (proxy parsing, code extraction, generators,
 * output writers) without needing Playwright or the network. Exits non-zero
 * on the first failure.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseProxyLine, loadProxyFile, resolveProxyList, ProxyPool, redact, toPlaywrightProxy } =
  require("../src/proxy");
const { extractCode, stripHtml } = require("../src/emailnator");
const { EmailMux } = require("../src/emailmux");
const { randomKeyName, randomPassword, randomEmailLocal, randomName } = require("../src/util");
const { writeAccounts, writeSummary } = require("../src/output");

let passed = 0;
const pending = [];
function ok(name, fn) {
  const out = fn();
  if (out && typeof out.then === "function") {
    pending.push(
      out.then(() => {
        passed += 1;
        console.log(`  ok  ${name}`);
      }),
    );
    return;
  }
  passed += 1;
  console.log(`  ok  ${name}`);
}
async function flush() {
  await Promise.all(pending);
  passed = passed; // all resolved
}

console.log("proxy parsing");
ok("host:port", () => assert.strictEqual(parseProxyLine("1.2.3.4:8080"), "http://1.2.3.4:8080"));
ok("host:port:user:pass", () =>
  assert.strictEqual(parseProxyLine("1.2.3.4:8080:u:p"), "http://u:p@1.2.3.4:8080"));
ok("user:pass@host:port", () =>
  assert.strictEqual(parseProxyLine("u:p@1.2.3.4:8080"), "http://u:p@1.2.3.4:8080"));
ok("socks5 scheme", () =>
  assert.strictEqual(parseProxyLine("socks5://u:p@1.2.3.4:1080"), "socks5://u:p@1.2.3.4:1080"));
ok("password with colon", () =>
  assert.strictEqual(parseProxyLine("1.2.3.4:8080:u:pa:ss"), "http://u:pa%3Ass@1.2.3.4:8080"));
ok("comment ignored", () => assert.strictEqual(parseProxyLine("# nope"), null));
ok("blank ignored", () => assert.strictEqual(parseProxyLine("   "), null));
ok("default scheme override", () =>
  assert.strictEqual(parseProxyLine("1.2.3.4:1080", "socks5"), "socks5://1.2.3.4:1080"));

console.log("proxy file + pool");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "abc-test-"));
const pf = path.join(tmpDir, "proxy.txt");
fs.writeFileSync(pf, "# c\n1.2.3.4:8000:u:p\n5.6.7.8:9000\n\n");
ok("loadProxyFile", () => {
  const list = loadProxyFile(pf);
  assert.deepStrictEqual(list, ["http://u:p@1.2.3.4:8000", "http://5.6.7.8:9000"]);
});
ok("resolveProxyList merges list + file", () => {
  const list = resolveProxyList({ proxyList: ["9.9.9.9:1"], proxyFile: pf });
  assert.strictEqual(list.length, 3);
});
ok("ProxyPool round-robin", () => {
  const pool = new ProxyPool({
    proxyList: ["http://a:p@1.1.1.1:1", "http://b:q@2.2.2.2:2"],
    proxyFile: "",
  });
  assert.strictEqual(pool.assign(0), "http://a:p@1.1.1.1:1");
  assert.strictEqual(pool.assign(1), "http://b:q@2.2.2.2:2");
  assert.strictEqual(pool.assign(2), "http://a:p@1.1.1.1:1");
});
ok("redact hides credentials", () => {
  assert.strictEqual(redact("http://user:secret@1.1.1.1:1"), "http://***:***@1.1.1.1:1/");
});
ok("toPlaywrightProxy shape", () => {
  assert.deepStrictEqual(toPlaywrightProxy("http://a:b@1.1.1.1:1"), {
    server: "http://1.1.1.1:1",
    username: "a",
    password: "b",
  });
});

console.log("emailnator helpers");
ok("extractCode from sentence", () =>
  assert.strictEqual(extractCode("Your verification code is 546595"), "546595"));
ok("extractCode from html body", () =>
  assert.strictEqual(extractCode(stripHtml("<b>code</b> <i>142062</i> expires")), "142062"));
ok("extractCode none", () => assert.strictEqual(extractCode("no digits here"), null));

console.log("emailmux provider");
ok("public mode by default", () => {
  const em = new EmailMux({});
  assert.strictEqual(em.mode, "public");
});
ok("api mode with key", () => {
  const em = new EmailMux({ apiKey: "abc" });
  assert.strictEqual(em.mode, "api");
  assert.strictEqual(em._headers().Authorization, "Bearer abc");
});
ok("generateAddress uses /generate-email in public mode", () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ email: "x@gmail.com", status: "success" }) };
  };
  const em = new EmailMux({ fetch: fakeFetch, logger: { warn() {} } });
  return em.generateAddress().then((r) => {
    assert.strictEqual(r.email, "x@gmail.com");
    assert.ok(calls[0].endsWith("/generate-email"));
  });
});
ok("generateAddress rejects non-gmail when gmail requested", () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ email: "x@outlook.com", status: "success" }),
  });
  const em = new EmailMux({ fetch: fakeFetch, logger: { warn() {} } });
  return em.generateAddress().then(
    () => assert.fail("should have thrown"),
    (e) => assert.match(e.message, /expected @gmail\.com/),
  );
});
ok("waitForCode reads code from emailmux message", () => {
  const em = new EmailMux({ logger: { warn() {} } });
  em.listMessages = async () => [{ subject: "", body: "Your verification code is 998877" }];
  return em.waitForCode("x@gmail.com", { timeoutMs: 2000, pollMs: 50, logger: { warn() {} } }).then((r) => {
    assert.strictEqual(r.code, "998877");
  });
});

console.log("generators");
ok("randomKeyName format", () => assert.match(randomKeyName(), /^key-[a-z]+-[a-z]+-[0-9a-f]{4}$/));
ok("randomPassword policy", () => {
  const pw = randomPassword();
  assert.ok(pw.length >= 18);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /[0-9]/);
  assert.match(pw, /[^A-Za-z0-9]/);
});
ok("randomEmailLocal looks like email", () =>
  assert.match(randomEmailLocal() + "@gmail.com", /^[a-z]+\.[0-9a-f]+@gmail\.com$/));
ok("randomName format", () => assert.match(randomName(), /^[a-z]+-[a-z]+-[0-9a-f]{4}$/));

console.log("output writers");
ok("writeAccounts + writeSummary", () => {
  const out = path.join(tmpDir, "accounts");
  const records = [
    { index: 0, status: "ok", email: "a@gmail.com", apiKey: "ak_1", password: "p", keyName: "k" },
    { index: 1, status: "failed", error: "boom" },
  ];
  const stats = writeAccounts(records, out);
  assert.deepStrictEqual(stats, { ok: 1, failed: 1 });
  assert.ok(fs.existsSync(path.join(out, "accounts.json")));
  assert.ok(fs.existsSync(path.join(out, "accounts.csv")));
  assert.strictEqual(fs.readFileSync(path.join(out, "keys.txt"), "utf8").trim(), "a@gmail.com:ak_1");
  writeSummary({ requested: 2 }, out);
  assert.ok(fs.existsSync(path.join(out, "summary.json")));
});

fs.rmSync(tmpDir, { recursive: true, force: true });
flush().then(() => {
  console.log(`\nall ${passed} checks passed`);
});
