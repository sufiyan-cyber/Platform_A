#!/usr/bin/env node
/**
 * Clears demo state between a rehearsal and the real run.
 *
 * The default is deliberately narrow: it deletes the *conversations* and the
 * *handoff records*, and nothing else. Your pre-built agent, its XP, its
 * decisions and — critically — its share token and QR code all survive, because
 * those are the things you spent time setting up and printed onto a slide. A
 * reset that invalidated the link you already tested would be worse than no
 * reset at all.
 *
 * Pass --full when you want a campaign back at zero so you can build it live.
 *
 * Why `prisma db execute` rather than a Prisma client import
 * ---------------------------------------------------------
 * The Prisma 7 `prisma-client` generator emits TypeScript, which a plain node
 * script cannot import. Shelling out to the CLI reads the same datasource from
 * prisma.config.ts, so this keeps working when Phase 5 flips the provider to
 * postgresql — no second connection string to keep in sync.
 *
 * Usage
 * -----
 *   node scripts/reset-demo.mjs --email you@example.com
 *   node scripts/reset-demo.mjs --email you@example.com --campaign support-desk --full
 *   node scripts/reset-demo.mjs --email you@example.com --dry-run
 *
 * Flags
 *   --email <addr>     Required. Whose demo state to clear.
 *   --campaign <id>    Limit to one campaign. Default: all of them.
 *   --full             Also delete decisions and the build itself (back to zero).
 *   --dry-run          Print the SQL, run nothing.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

/* ── Args ──────────────────────────────────────────────────────────────────── */

const options = { email: null, campaign: null, full: false, dryRun: false };
const argv = process.argv.slice(2);

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  const next = () => {
    const value = argv[++i];
    if (value === undefined) fail(`${arg} needs a value.`);
    return value;
  };

  if (arg === "--email") options.email = next();
  else if (arg === "--campaign") options.campaign = next();
  else if (arg === "--full") options.full = true;
  else if (arg === "--dry-run") options.dryRun = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    process.exit(0);
  } else fail(`Unknown argument: ${arg}`);
}

if (!options.email) fail("--email is required. This script deletes data; it will not guess whose.");

// These values are interpolated into SQL, so they are whitelisted rather than
// escaped. Anything outside these shapes is rejected instead of quoted.
if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(options.email)) {
  fail(`"${options.email}" is not an email address.`);
}
if (options.campaign && !/^[a-z0-9-]{1,64}$/.test(options.campaign)) {
  fail(`"${options.campaign}" is not a valid campaign id.`);
}

/* ── SQL ───────────────────────────────────────────────────────────────────── */

// Double-quoted identifiers are the one quoting style both SQLite and Postgres
// accept, which is what lets this survive the Phase 5 provider switch.
const buildScope = [
  `SELECT b."id" FROM "Build" b`,
  `JOIN "User" u ON b."userId" = u."id"`,
  `WHERE u."email" = '${options.email}'`,
  options.campaign ? `AND b."campaignId" = '${options.campaign}'` : "",
]
  .filter(Boolean)
  .join(" ");

// Children first, explicitly. `db execute` does not guarantee that SQLite has
// foreign keys enforced for this connection, so relying on ON DELETE CASCADE
// here could leave orphaned rows behind rather than failing visibly.
const statements = [
  `DELETE FROM "ChatMessage" WHERE "buildId" IN (${buildScope});`,
  `DELETE FROM "Escalation" WHERE "buildId" IN (${buildScope});`,
];

if (options.full) {
  statements.push(
    `DELETE FROM "Decision" WHERE "buildId" IN (${buildScope});`,
    `DELETE FROM "Build" WHERE "id" IN (${buildScope});`,
  );
}

const sql = statements.join("\n");

/* ── Run ───────────────────────────────────────────────────────────────────── */

const scope = options.campaign ? `campaign "${options.campaign}"` : "all campaigns";
const depth = options.full
  ? "decisions, progress, agent link and share token"
  : "conversations and handoff records only (agent, XP and share link kept)";

console.log(`\n  Account:  ${options.email}`);
console.log(`  Scope:    ${scope}`);
console.log(`  Clearing: ${depth}`);

if (options.dryRun) {
  console.log(`\n  --dry-run, nothing executed:\n`);
  console.log(sql.split("\n").map((line) => `    ${line}`).join("\n"));
  console.log();
  process.exit(0);
}

// `shell: true` on Windows because Node 22 refuses to spawn a .cmd directly
// (the CVE-2024-27980 mitigation), and `npx` is `npx.cmd` there. No user input
// reaches argv — the SQL travels on stdin — so there is nothing here to inject
// into. The email and campaign id were whitelisted above regardless.
const result = spawnSync("npx", ["prisma", "db", "execute", "--stdin"], {
  input: sql,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`\n  ${result.error.message}`);
  fail("Could not run the Prisma CLI. Is it installed (npm install)?");
}

if (result.status !== 0) {
  if (result.stdout?.trim()) console.error(result.stdout);
  if (result.stderr?.trim()) console.error(result.stderr);
  fail("prisma db execute failed — nothing is guaranteed to have been cleared.");
}

console.log(`\n  Cleared.`);
if (!options.full) {
  console.log(`  Your pre-built agent and its share link are untouched — re-test the QR anyway.`);
} else {
  console.log(`  Those campaigns are back at zero and ready to build live.`);
}
console.log();
