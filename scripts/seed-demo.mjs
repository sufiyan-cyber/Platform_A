#!/usr/bin/env node
/**
 * Seeds a demo account: signs in, answers every decision, banks the XP, and
 * optionally launches the agent and publishes its share link.
 *
 * Why it talks HTTP instead of the database
 * ----------------------------------------
 * Every write goes through the app's own routes, with the app's own session
 * cookie, so the seeded build is indistinguishable from one made by hand:
 * decisions are re-validated server-side, XP is awarded by the same endpoint the
 * UI calls, and the launch payload is assembled by the same code path. A seed
 * that wrote rows directly would drift from the product the moment either side
 * changed — and drift is exactly what you cannot afford to discover on stage.
 *
 * It also means this works unchanged against a deployed URL, which is what you
 * want the night before: seed production, not just localhost.
 *
 * XP is the part that bites
 * -------------------------
 * Answering every step does NOT award XP. `completedMissionIds` and `xp` are
 * only written by PATCH /progress with `completeMissionId`, and a build that
 * skips it renders as "Agent launched · 0 XP" on the campaigns page, which reads
 * as broken. This script calls it once per mission and prints what was awarded,
 * so a silent regression here is visible rather than something you notice from
 * the stage.
 *
 * Usage
 * -----
 *   node scripts/seed-demo.mjs --email you@example.com --launch --share
 *   node scripts/seed-demo.mjs --campaign support-desk --launch
 *   node scripts/seed-demo.mjs --base-url https://your-app.vercel.app --launch --share
 *
 * Flags
 *   --email <addr>      Demo account. Created on first use. Default: demo@agentforge.dev
 *   --campaign <id>     Repeatable. Default: research-analyst
 *   --base-url <url>    Default: http://localhost:3000
 *   --launch            Create the real agent (costs a Lyzr call, takes ~5-30s)
 *   --share             Create the public link and print the URL. Implies --launch
 *   --dry-run           Print what would happen, write nothing
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── Campaign presets ──────────────────────────────────────────────────────── */

// Mission ids are m1..m5 in both shipped campaigns. An id that doesn't exist is
// rejected by the progress route rather than silently skipped, so a campaign
// that grows a sixth mission fails loudly here instead of seeding 0 XP.
const MISSION_IDS = ["m1", "m2", "m3", "m4", "m5"];

/**
 * Values chosen to be *demo-legible*, not just valid: each one should be
 * readable aloud and obviously a decision somebody made. Select-input steps use
 * the exact option strings from the campaign, so the finished artifact matches
 * what clicking through the UI would produce.
 */
const PRESETS = {
  "research-analyst": {
    label: "Research Analyst",
    decisions: {
      name: "Market Signal",
      provider: "gpt-4o-mini",
      role: "A research analyst covering the AI infrastructure market for a small product team that has to make build-or-buy calls without a dedicated research function.",
      goal: "Turn a vague question into a short, decision-ready briefing that separates what is established from what is inferred, so the reader knows exactly how much weight the conclusion can carry.",
      evidence:
        "Treat supplied material as established. You may add well-known general context from your training, but mark it explicitly as background and note that it may be out of date.",
      depth:
        "Before answering, identify the two or three readings the material could support, then commit to the best-supported one and say briefly why the others lose.",
      budget: 250,
      structure:
        "Structure every reply as: **Bottom line** (one sentence), **Why** (the two or three strongest supporting points), **What would change my mind** (the specific evidence that would flip the conclusion).",
      uncertainty:
        "When you do not know something, say so in the first sentence rather than burying it. Never estimate a number, a date, or a company name you were not given. If the material is thin, say what specifically is missing and what you would need in order to answer properly. A short answer that names its gaps is always better than a complete-sounding one that hides them.",
      knowledge:
        "Our team builds developer tooling and is evaluating whether to build our own retrieval layer or buy one. We are a team of four engineers, our budget ceiling is roughly $2,000 a month, and we care more about answer traceability than about raw latency. We have already ruled out anything that cannot run in our own VPC.",
    },
  },

  "support-desk": {
    label: "Support Desk",
    decisions: {
      name: "Halyard Support",
      provider: "gpt-4o-mini",
      role: "A front-line support agent for Halyard, a payments product used by freelancers and small agencies to invoice clients and get paid.",
      goal: "Resolve a customer's billing or payout question in one reply where the handbook allows it, and route them accurately the moment it doesn't.",
      scope:
        "Answer questions about plans, subscription refunds, payout timing, and payment links. Do not discuss enterprise pricing, do not give tax advice, and do not speculate about why a specific bank held a transfer.",
      tone: "Warm and plain-spoken. Short sentences, no jargon, no corporate hedging. Acknowledge the frustration before solving the problem.",
      rules:
        "Never state a price, a fee, a percentage, or a timeframe that does not appear in your supplied material — if it isn't there, say you don't have it and name who does. Never promise a refund; state the policy and let it decide. Never guess why an individual payout was held. When a customer is angry, answer the question first and apologise second.",
      format:
        "Open with a one-sentence answer, then numbered steps if the fix requires more than one action. Keep the whole reply under 150 words.",
      opening:
        "Hi — I can help with billing, payouts, and payment links. What's happened?",
      // Read from the repo rather than duplicated: samples/README.md explains
      // where this handbook came from and what it's for.
      knowledge: () => readFileSync(join(ROOT, "samples/halyard-knowledge-block.txt"), "utf8").trim(),
    },
  },
};

/* ── Args ──────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const options = {
    email: "demo@agentforge.dev",
    baseUrl: "http://localhost:3000",
    campaigns: [],
    launch: false,
    share: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value.`);
      return value;
    };

    if (arg === "--email") options.email = next();
    else if (arg === "--base-url") options.baseUrl = next().replace(/\/+$/, "");
    else if (arg === "--campaign") options.campaigns.push(next());
    else if (arg === "--launch") options.launch = true;
    else if (arg === "--share") options.share = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }

  if (options.campaigns.length === 0) options.campaigns = ["research-analyst"];
  // Sharing a build that was never launched is a 409 from the API; treating
  // --share as implying --launch is friendlier than failing halfway through.
  if (options.share) options.launch = true;

  for (const id of options.campaigns) {
    if (!PRESETS[id]) fail(`No preset for campaign "${id}". Known: ${Object.keys(PRESETS).join(", ")}`);
  }

  return options;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

/* ── HTTP ──────────────────────────────────────────────────────────────────── */

/**
 * A tiny session-carrying client.
 *
 * The cookie comes from the app's real sign-in route, so this script holds no
 * copy of the signing secret and cannot drift from how sessions actually work.
 */
function createClient(baseUrl) {
  let cookie = null;

  return async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];

    const text = await response.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Next serves an HTML 404 page for a route it can't match. The usual cause
      // is a stale .next cache after running `next build` and then `next dev` —
      // delete .next and restart before assuming the server is broken.
      throw new Error(
        `${method} ${path} returned ${response.status} with a non-JSON body. ` +
          `If this is a 404 on a nested route, delete .next and restart the dev server.`,
      );
    }

    if (!parsed.ok) {
      const detail = parsed.error?.fields
        ? ` (${Object.entries(parsed.error.fields).map(([k, v]) => `${k}: ${v}`).join("; ")})`
        : "";
      throw new Error(`${method} ${path} → ${parsed.error?.code}: ${parsed.error?.message}${detail}`);
    }

    return parsed.data;
  };
}

/* ── Seeding ───────────────────────────────────────────────────────────────── */

async function seedCampaign(request, campaignId, options) {
  const preset = PRESETS[campaignId];
  console.log(`\n  ${preset.label}`);

  const { build } = await request("POST", "/api/builds", { campaignId });
  console.log(`    build          ${build.id}${build.status === "launched" ? " (already launched)" : ""}`);

  for (const [stepId, raw] of Object.entries(preset.decisions)) {
    const value = typeof raw === "function" ? raw() : raw;
    await request("PUT", `/api/builds/${build.id}/decisions`, { stepId, value });
  }
  console.log(`    decisions      ${Object.keys(preset.decisions).length} saved`);

  // The step the previous seed skipped. Idempotent server-side: re-running
  // awards 0 rather than double-counting, so this is safe to repeat.
  let xp = 0;
  let awarded = 0;
  for (const missionId of MISSION_IDS) {
    const result = await request("PATCH", `/api/builds/${build.id}/progress`, {
      completeMissionId: missionId,
    });
    xp = result.xp;
    awarded += result.awarded;
  }
  console.log(`    xp             ${xp} banked${awarded === 0 ? " (already awarded)" : ` (+${awarded} now)`}`);

  if (xp === 0) {
    // Loud, because this is the exact failure that renders as "Agent launched ·
    // 0 XP" and looks like the product is broken.
    console.log(`    ⚠  0 XP — the campaigns page will read "0 XP". Check MISSION_IDS matches the campaign.`);
  }

  if (!options.launch) {
    console.log(`    launch         skipped (pass --launch)`);
    return { campaignId, buildId: build.id, xp, shareUrl: null };
  }

  let agentName = build.agent?.name ?? null;
  if (build.status === "launched") {
    console.log(`    launch         reused existing agent "${agentName}"`);
  } else {
    process.stdout.write(`    launch         creating agent… `);
    const started = Date.now();
    const result = await request("POST", `/api/builds/${build.id}/launch`, {});
    agentName = result.build?.agent?.name ?? "(unnamed)";
    console.log(`"${agentName}" in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  if (!options.share) return { campaignId, buildId: build.id, xp, agentName, shareUrl: null };

  const { share } = await request("POST", `/api/builds/${build.id}/share`, {});
  const shareUrl = `${options.baseUrl}/a/${share.token}`;
  console.log(`    share          ${shareUrl}`);

  return { campaignId, buildId: build.id, xp, agentName, shareUrl };
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

const options = parseArgs(process.argv.slice(2));

console.log(`\n  Seeding ${options.baseUrl}`);
console.log(`  Account: ${options.email}`);

if (options.dryRun) {
  console.log(`\n  --dry-run: would seed ${options.campaigns.join(", ")}`);
  for (const id of options.campaigns) {
    console.log(`    ${PRESETS[id].label}: ${Object.keys(PRESETS[id].decisions).length} decisions, ${MISSION_IDS.length} missions`);
  }
  console.log(`    launch: ${options.launch}, share: ${options.share}\n`);
  process.exit(0);
}

const request = createClient(options.baseUrl);

try {
  const { user } = await request("POST", "/api/auth/session", { email: options.email });
  console.log(`  Signed in as ${user.handle} <${user.email}>`);

  const results = [];
  for (const campaignId of options.campaigns) {
    results.push(await seedCampaign(request, campaignId, options));
  }

  console.log(`\n  Done.\n`);
  for (const result of results) {
    if (result.shareUrl) {
      console.log(`  ${result.campaignId}: ${result.shareUrl}`);
      console.log(`    Open this on your phone to test the QR before the demo.`);
    }
  }
  console.log();
} catch (error) {
  fail(error.message);
}
