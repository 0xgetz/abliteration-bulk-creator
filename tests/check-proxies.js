#!/usr/bin/env node
"use strict";

/**
 * Check that the proxies in `proxy.txt` (or ABC_PROXIES) are reachable and
 * actually forward traffic. Run this from the machine that will run the
 * creator:
 *
 *   node tests/check-proxies.js
 *   node tests/check-proxies.js --file ./my-proxies.txt
 *
 * For each proxy it prints the exit IP or the failure reason. Requires Node 18+
 * (uses global fetch + a tiny HTTP CONNECT tunnel, no dependencies).
 */

const fs = require("fs");
const path = require("path");
const net = require("net");
const tls = require("tls");
const http = require("http");
const { parseProxyLine, loadProxyFile } = require("../src/proxy");

function parseArgs(argv) {
  const out = { file: "proxy.txt" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") out.file = argv[++i];
    else if (argv[i].startsWith("--file=")) out.file = argv[i].split("=")[1];
  }
  return out;
}

/** Open a CONNECT tunnel through `proxyUrl` to `targetHost:targetPort`. */
function connectThroughProxy(proxyUrl, targetHost, targetPort, timeoutMs = 12000) {
  const u = new URL(proxyUrl);
  const auth =
    u.username || u.password
      ? "Proxy-Authorization: Basic " +
        Buffer.from(
          `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`,
        ).toString("base64") +
        "\r\n"
      : "";
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(u.port) || (u.protocol === "https:" ? 443 : 80), u.hostname);
    socket.setTimeout(timeoutMs);
    const onErr = (e) => reject(new Error(`${e.code || e.message}`));
    socket.once("error", onErr);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("connect timeout"));
    });
    socket.once("connect", () => {
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}\r\n`,
      );
    });
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("latin1");
      if (buf.includes("\r\n\r\n")) {
        socket.removeListener("data", onData);
        const status = buf.split("\r\n")[0];
        const code = Number((status.match(/\s(\d{3})\s/) || [])[1]);
        if (code === 200) resolve(socket);
        else reject(new Error(status.trim()));
      }
    };
    socket.on("data", onData);
  });
}

/** Fetch https://api.ipify.org through a proxy and return the exit IP. */
async function exitIp(proxyUrl) {
  const sock = await connectThroughProxy(proxyUrl, "api.ipify.org", 443);
  return new Promise((resolve, reject) => {
    const tlsSock = tls.connect({ socket: sock, servername: "api.ipify.org" }, () => {
      tlsSock.write(
        "GET /?format=json HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n",
      );
    });
    let body = "";
    tlsSock.on("data", (d) => (body += d.toString()));
    tlsSock.on("end", () => {
      const m = body.match(/\{[\s\S]*\}/);
      try {
        resolve(JSON.parse(m ? m[0] : body).ip);
      } catch {
        reject(new Error("unparseable ipify response"));
      }
    });
    tlsSock.on("error", reject);
    tlsSock.setTimeout(20000, () => reject(new Error("tls timeout")));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), args.file);
  let list = [];
  if (fs.existsSync(filePath)) list = loadProxyFile(filePath);
  else if (process.env.ABC_PROXIES) {
    list = process.env.ABC_PROXIES.split(",").map((p) => parseProxyLine(p)).filter(Boolean);
  }
  if (!list.length) {
    console.error(`No proxies found. Add entries to ${filePath} or set ABC_PROXIES.`);
    process.exit(2);
  }
  console.log(`Checking ${list.length} prox${list.length === 1 ? "y" : "ies"} from ${filePath}\n`);
  let ok = 0;
  for (const px of list) {
    const shown = px.replace(/\/\/[^@/]+@/, "//***:***@");
    process.stdout.write(`  ${shown} ... `);
    try {
      const ip = await exitIp(px);
      console.log(`OK  exit=${ip}`);
      ok += 1;
    } catch (e) {
      console.log(`FAIL  ${e.message}`);
    }
  }
  console.log(`\n${ok}/${list.length} proxies working`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error("fatal:", e.message);
  process.exit(1);
});
