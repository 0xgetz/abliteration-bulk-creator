"use strict";

/**
 * Result exporters. Every run writes:
 *   accounts/accounts.json   full records (JSON array)
 *   accounts/accounts.csv    spreadsheet-friendly
 *   accounts/keys.txt        email:apiKey lines for easy piping
 *   accounts/summary.json    run metadata + proxy usage
 */

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function csvEscape(value) {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeAccounts(records, outputDir) {
  ensureDir(outputDir);
  const ok = records.filter((r) => r.status === "ok");

  fs.writeFileSync(
    path.join(outputDir, "accounts.json"),
    JSON.stringify(records, null, 2),
  );

  const cols = [
    "index", "status", "email", "password", "keyName", "apiKey",
    "projectId", "proxy", "createdAt", "durationMs", "error",
  ];
  const csv = [
    cols.join(","),
    ...records.map((r) => cols.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "accounts.csv"), csv + "\n");

  fs.writeFileSync(
    path.join(outputDir, "keys.txt"),
    ok.map((r) => `${r.email}:${r.apiKey}`).join("\n") + (ok.length ? "\n" : ""),
  );

  return { ok: ok.length, failed: records.length - ok.length };
}

function writeSummary(summary, outputDir) {
  ensureDir(outputDir);
  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
}

module.exports = { writeAccounts, writeSummary, ensureDir };
