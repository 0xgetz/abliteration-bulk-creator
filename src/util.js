"use strict";

/**
 * Small shared helpers: random credentials, human-like names and timing.
 */

const crypto = require("crypto");

const ADJECTIVES = [
  "swift", "brave", "calm", "clever", "cobalt", "crimson", "amber", "lucid",
  "noble", "quiet", "rapid", "silent", "solar", "vivid", "wired", "zen",
  "arctic", "bold", "cosmic", "daring", "electric", "frozen", "golden",
  "hidden", "iron", "jade", "lunar", "mellow", "neon", "onyx", "primal",
];

const NOUNS = [
  "falcon", "otter", "cedar", "comet", "harbor", "lumen", "nimbus", "orbit",
  "pixel", "quartz", "river", "sable", "tiger", "vertex", "willow", "zephyr",
  "atlas", "beacon", "cipher", "delta", "ember", "forge", "glacier", "helix",
  "ion", "keystone", "matrix", "nebula", "obsidian", "prism", "rune", "specter",
];

const pick = (arr) => arr[crypto.randomInt(arr.length)];

/** Human-readable random name, e.g. `cobalt-falcon-4f2a`. */
function randomName() {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${crypto.randomBytes(2).toString("hex")}`;
}

/** Random, human-readable API-key name, e.g. `key-cobalt-falcon-4f2a`. */
function randomKeyName() {
  return `key-${randomName()}`;
}

/** Random display name for the account, e.g. `Nova B.`. */
function randomDisplayName() {
  const first = ["Nova", "Orion", "Lyra", "Atlas", "Iris", "Kai", "Vega", "Rhea",
    "Juno", "Cyra", "Onyx", "Zane", "Mira", "Echo", "Lex", "Noor"][crypto.randomInt(16)];
  const last = "ABCDEFGHJKLMNPQRSTUVWXYZ"[crypto.randomInt(24)];
  return `${first} ${last}.`;
}

/** Generate an email local-part that reads naturally but stays unique. */
function randomEmailLocal() {
  const bases = ["agent", "pilot", "tester", "runner", "builder", "scout",
    "cipher", "probe", "vector", "signal", "nomad", "pixel"];
  const base = bases[crypto.randomInt(bases.length)];
  const token = crypto.randomBytes(3).toString("hex");
  return `${base}.${token}`;
}

/** Strong random password that satisfies the usual policy. */
function randomPassword(len = 18) {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = lower + upper + digits + symbols;
  const chars = [
    lower[crypto.randomInt(lower.length)],
    upper[crypto.randomInt(upper.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  while (chars.length < len) chars.push(all[crypto.randomInt(all.length)]);
  // Fisher-Yates shuffle with a CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jitter(min, max) {
  return crypto.randomInt(min, max + 1);
}

/** Random pause between `min` and `max` ms. */
const randomDelay = (min, max) => sleep(jitter(min, max));

module.exports = {
  randomName,
  randomKeyName,
  randomDisplayName,
  randomEmailLocal,
  randomPassword,
  sleep,
  jitter,
  randomDelay,
};
