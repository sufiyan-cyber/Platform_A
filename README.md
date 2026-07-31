# Agent Forge

A guided build experience for developers: you make one decision at a time, watch your agent config grow with each answer, and finish with a **real agent running on Lyzr that you can immediately chat with**.

You never write an agent from scratch. Each step asks for exactly one thing, explains the trade-off behind it, validates it, saves it, and drops it into an evolving artifact. At the end, every decision assembles into a live agent.

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env` (see [Environment](#environment)), then:

```bash
npm run setup
```

```bash
npm run dev
```

Open <http://localhost:3000>.

The Grounding mission asks you to paste the facts your agent is allowed to state.
If you don't have a real handbook to hand, `samples/` has a fictional company's —
plus the distilled block to paste and a test script for checking the agent
actually stayed inside it. Start at [`samples/README.md`](samples/README.md).

> Without `LYZR_API_KEY` the app still runs end to end — every screen, every decision, all persistence. Only the two agent-backed surfaces (launching your agent, and the Mentor) show an honest "not configured" state instead of failing.

---

## Environment

Everything is server-only. Nothing is prefixed `NEXT_PUBLIC_`, so nothing in this list can reach a browser bundle.

| Variable | Required | Purpose |
|---|---|---|
| `LYZR_API_KEY` | yes, to create/chat with agents | Your Lyzr Studio API key. Read in exactly one module: `src/server/lyzr.ts`. |
| `AUTH_SECRET` | yes in production | Signs the session cookie. Generate with the command below. |
| `DATABASE_URL` | no (defaults to SQLite) | Connection string. Defaults to `file:./dev.db`. |
| `LYZR_BASE_URL` | no | Agent API base. Defaults to `https://agent-prod.studio.lyzr.ai/v3`. |
| `LYZR_PROVIDER_ID` | no | Lyzr's `provider_id` — the *vendor*, lowercase. Defaults to `openai`. |
| `LYZR_MENTOR_MODEL` | no | Model for the platform's own Mentor agent. Defaults to `gpt-4o-mini`. |
| `TAVILY_API_KEY` | no | Web search for campaigns that declare `retrieval`. Read in exactly one module: `src/server/search.ts`. Absent ⇒ those agents still answer, without sources, and say so. |
| `TAVILY_BASE_URL` | no | Search API base. Defaults to `https://api.tavily.com`. |

A blank value (`KEY=`) counts as absent, not as an invalid one — copying `.env.example`
verbatim gives you a running app with the optional features switched off, rather than a
boot failure.

Generate an auth secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### The API key never reaches the browser

This is enforced structurally, not by convention:

- `src/server/lyzr.ts` is the only module that reads `LYZR_API_KEY`, and it starts with `import "server-only"` — if any client component ever imports it, even transitively, **the build fails**.
- Every browser-facing agent call goes through a route handler in `src/app/api/**`, which injects the key server-side.
- Nothing agent-related is ever passed to a client component as a prop.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Generates the Prisma client, then a production build |
| `npm run setup` | Generates the Prisma client and creates/syncs the database |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run db:studio` | Prisma Studio |

---

## How it fits together

```
Browser ──► /api/builds/*  ──►  src/server/lyzr.ts  ──►  Lyzr Agent API
                │                     ▲
                │                     └── the only place LYZR_API_KEY is read
                ▼
            Prisma ──► SQLite / Postgres
```

| Path | Responsibility |
|---|---|
| `src/campaigns/**` | Campaign content as **pure data** — levels, missions, steps, guidance, artifact, assembly rules |
| `src/lib/validation.ts` | Compiles a campaign's declarative rule into Zod. Same rule runs on client and server |
| `src/lib/assemble.ts` | Turns collected decisions into the Lyzr create-agent payload |
| `src/lib/flow.ts` | Derives all progression from persisted decisions |
| `src/server/lyzr.ts` | The Lyzr proxy: timeouts, retries, defensive response parsing |
| `src/server/mentor.ts` | The Mentor agent — created once, cached, context-injected per turn |
| `src/server/builds.ts` | Build persistence and the wire format the client sees |
| `src/server/share.ts` | Public share links: token lifecycle, the public projection, visitor-chat budget |
| `samples/**` | A fictional company's handbook plus the distilled block to paste into the Grounding mission, and a test script for checking the result |
| `src/store/build-store.ts` | Client flow state: server truth vs. local drafts, kept strictly separate |
| `src/components/flow/**` | The guided screens |

### Lyzr is the execution layer only

Lyzr creates and runs the agent the developer builds. The platform itself — the guided flow, validation, persistence, progression, gamification, the UI — is all built here. Two endpoints are used:

```
POST /v3/agents/                 → { agent_id }
  { name, provider_id, model, agent_role, agent_goal,
    agent_instructions, temperature, top_p, features, tools }

POST /v3/inference/chat/         → { response, module_outputs }
  { user_id, agent_id, session_id, message }
```

**Do not build this from the quickstart page.** It documents `POST /v3/agent` with `role` / `goal` / `instructions` / `provider`. That path returns `405 Method Not Allowed`, every field name is different, and the per-agent chat route doesn't exist at all. This project was built from the quickstart first and had to be corrected against the live spec:

```bash
curl -s https://agent-prod.studio.lyzr.ai/openapi.json
```

Three things that spec makes clear and the docs don't:

- **`features: []` is the default, and it means no memory.** An agent created without `{"type": "SHORT_TERM_MEMORY", "config": {}, "priority": 0}` evaluates every turn in isolation — it will ask for a customer's email, be given it, thank them, and ask again on the next message. Every agent this platform builds enables it. The type string is **case-sensitive and only validated at inference time**: `short_term_memory` is accepted by `POST /v3/agents/`, stored on the record, and silently does nothing. (`SESSION_MEMORY` at least fails loudly with `Invalid feature type`.) `GET /v3/features/` — which would list the valid types — returns a 500, so these were found by two-turn recall testing.

- **`provider_id` and `model` are separate.** `provider_id` is the vendor (`openai`); `model` is the model (`gpt-4o-mini`). Only the model is a developer decision in the flow — the vendor is campaign config.
- **`temperature` and `top_p` are required.** They come from per-campaign defaults in `assembly` (support desk 0.3, analyst 0.5) rather than being asked as a step. Promoting them to a real decision is a natural next mission.

Valid model ids are whatever your workspace has enabled, not whatever OpenAI has shipped — check before editing a campaign's options:

```bash
curl -H "x-api-key: $LYZR_API_KEY" "https://agent-prod.studio.lyzr.ai/v3/providers/type?provider_type=llm"
```

(Note `provider_type=llm` is lowercase; `LLM` silently returns `[]`.)

### The Mentor is itself a Lyzr agent

Dogfooding: the in-product assistant is created once via the same API, its id cached in `PlatformConfig`, and each developer gets their own `session_id`. Every turn is prefixed with a server-built context block naming their current mission, current step, and every decision made so far. Its instructions tell it to **guide, not solve** — ask it to write your answer and it hands back the question that unblocks you instead.

---

## Adding a campaign

A campaign is data. No flow logic changes.

1. Create `src/campaigns/your-campaign.ts` exporting a `Campaign` (see `support-desk.ts` as the reference — it's commented for this purpose).
2. Add it to the `CAMPAIGNS` array in `src/campaigns/index.ts`.

That's it. The flow shell, validation, artifact, checklist, guidance panel, progression, XP, launch and chat all read from the object.

The pieces you author:

- **`levels`** → `missions` → `steps`. One step is one decision.
- **`steps[].rule`** — a declarative validation descriptor (`string` / `number` / `enum`), compiled to Zod by `src/lib/validation.ts` and enforced on **both** sides of the wire.
- **`steps[].guidance`** — `why` (always visible), an optional `tradeoff`, `mistakes`, and `docs` links. This is what makes it guided rather than a form; don't skip it.
- **`steps[].input.starters`** — optional one-tap starting points. They fill the field and stay fully editable.
- **`artifact.lines`** — the config that grows. Each line names the mission it appears from, and `{ t: "slot", stepId }` tokens bind to steps.
- **`assembly`** — which step feeds `name` / `provider` / `role` / `goal`, and which steps compose into `instructions` under which headings.

Two guards worth knowing about: the test suite asserts that every artifact slot references a real step, every level references real missions, every mission belongs to exactly one level, and **every select option and every starter passes its own step's validation rule** — so a campaign can't ship a choice the server would reject.

> The model options in the shipped campaigns are OpenAI ids. They're campaign data — edit them to match what your Lyzr workspace actually has enabled.

---

## Sharing a built agent

A launched build can be published at `/a/<token>` — a page with no auth on it at
all, showing the agent, the config behind it, and every decision that produced it.
Visitors can talk to the real agent if the owner leaves that on.

Controls live in the **Share it** panel on the finale screen: create, copy, toggle
replies, revoke.

Four properties worth knowing, because they're what makes an unauthenticated,
money-spending route safe to ship:

- **The token is the capability.** Revoking sets `shareToken` back to `NULL`, so a
  revoked link is *unresolvable* rather than resolvable-but-flagged. There is no
  code path where a forgotten boolean check leaks a private build.
- **The public projection is built by hand**, field by field, in
  `loadSharedBuild`. It is not a filtered `BuildState`. Adding a column to `Build`
  therefore cannot accidentally publish it, and the owner's email address has no
  route to that page at all.
- **Visitor chat is capped twice**: a per-IP token bucket bounds the *rate*, and
  `SHARE_CHAT_LIMIT` (100 messages, reset when you re-share) bounds the *total*.
  A link passed around a group chat cannot drain your API key. The turn is booked
  before the upstream call and refunded if it fails, so a flaky agent service
  costs nothing.
- **Visitor messages are never persisted.** Multi-turn memory lives in the Lyzr
  session id the visitor's own browser holds for the length of the visit. The
  page is `noindex`, since an unguessable token is the only thing protecting it.

## Database

Defaults to SQLite so `npm run setup` works with no external services. The schema uses only types that exist on both SQLite and Postgres (no native JSON, arrays, or enums), so switching is mechanical:

1. Set `provider = "postgresql"` in `prisma/schema.prisma`.
2. Point `DATABASE_URL` at your Postgres instance.
3. `npm run db:push`.

Application code doesn't change — `src/server/db.ts` picks the driver adapter from the URL scheme.

**On Vercel (or any serverless host) you must use Postgres.** The filesystem is ephemeral there, so SQLite silently loses progress between invocations. The app logs a warning at startup if it detects this combination.

### Why Postgres and not MongoDB

This data is relational, and the schema leans on that in ways a document store
would make you hand-build:

- **Composite uniqueness is doing real work.** `@@unique([userId, campaignId])` is
  what makes "enter a campaign" idempotent, and `@@unique([buildId, stepId])` is
  what makes saving a decision an upsert — re-answering a step overwrites cleanly
  and a double-submit is harmless. In Mongo those become partial indexes you
  maintain plus application-level guards.
- **`onDelete: Cascade` across three tables** means deleting a user is one
  statement, not a fan-out you have to remember to keep in sync.
- **The visitor budget is an atomic `{ increment: 1 }`.** Two visitors arriving in
  the same millisecond must not both be handed the last message. Mongo can do
  `$inc` too, but the correctness argument gets weaker as soon as a second field
  has to move with it.
- **Nothing here is schemaless.** Every field is known ahead of time. The one
  place with variable shape — `launchPayload` — is a serialised string parsed
  defensively at the edge, which costs nothing.
- **It's already wired.** `@prisma/adapter-pg` is installed and `src/server/db.ts`
  picks the adapter from the URL scheme, so the move is the three steps above and
  no application code. Prisma's Mongo support would mean a schema rewrite and
  losing the constraints listed here.

Managed Postgres that works with this out of the box: Neon, Supabase, or Vercel
Postgres. Use a pooled connection string on serverless.

### Authentication

Identity is deliberately lightweight: a developer claims an email address and gets a signed, httpOnly session cookie. **No password is handled, stored, or transmitted.**

This is the one seam intended to be replaced. Swap `signIn` in `src/server/auth.ts` for your IdP's callback and everything downstream keeps working — every route only ever asks for a user id.

---

## Production behaviour

What "must not break" means concretely here:

- **Every** route handler goes through one wrapper (`src/server/http.ts`). Nothing can throw an unhandled rejection; every failure becomes a typed JSON error with a message written to be shown verbatim.
- **Every** client call goes through `src/lib/client-api.ts`, which never throws. Offline, an HTML error page from a proxy, and a clean 503 all arrive as the same typed error, so call sites are structurally forced to handle failure.
- Lyzr calls have bounded timeouts, retry transient failures (429/5xx/network) with jittered exponential backoff, and never retry a 4xx.
- Lyzr responses are parsed defensively — an unrecognised shape produces a clear error instead of writing `undefined` into the database to fail later.
- Per-user, per-operation token-bucket rate limiting on the agent-backed routes.
- Input is validated on the client for instant feedback and re-validated on the server as the authority. Assembly re-validates everything once more before spending an API call.
- XP is never taken from the client; the server re-checks the mission and the award is idempotent, so a double-click can't farm it.
- Decisions persist the moment they're made. Position and elapsed time persist continuously. Refresh, re-login, or open on another device and you land exactly where you left off.
- Route-level and root-level error boundaries mean a blank screen isn't reachable.

### Accessibility & responsiveness

- Dark-only by design; every foreground/background pair checked against WCAG AA, with the measured ratios recorded in `src/app/globals.css`.
- Visible focus on everything, never removed. Full keyboard operation. Skip link.
- Real labels on every input (never placeholder-only), persistent helper text, errors rendered below the field they belong to and announced via `role="alert"`.
- Constrained choices render as a real radio group of cards, so the consequence of each option is visible at the moment of choosing.
- 44px minimum touch targets; 16px minimum font size on mobile inputs to avoid iOS zoom-on-focus.
- `prefers-reduced-motion` honoured globally in CSS and read by Framer Motion.
- Responsive from 375px up; wide content scrolls inside its own container so the page body never scrolls sideways.

### A note on motion

There are no exit animations in this codebase, and that's deliberate. Under React 19, `AnimatePresence` exits didn't settle reliably — with `mode="wait"` that means the *incoming* screen never mounts and the flow is simply stuck. Transitions are enter-only, driven by `key` changes. A 200ms fade-out was never worth that failure mode. The note is repeated at the relevant call sites.

---

## Tests

```bash
npm test
```

97 tests over the critical path:

- **`tests/validation.test.ts`** — step validation across all rule kinds, plus structural assertions on the shipped campaign data.
- **`tests/assemble.test.ts`** — decisions → Lyzr payload, exact field shape, instruction composition, and refusal to build an incomplete config.
- **`tests/lyzr.test.ts`** — defensive response parsing, error retryability, rate limiting.
- **`tests/flow.test.ts`** — progression, resume position, artifact growth, progress maths.
- **`tests/share.test.ts`** — share-state shaping, and the display-name derivation in `src/lib/handle.ts`.

---

## Deploying

1. Provision Postgres and follow [Database](#database).
2. Set `LYZR_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL` — plus `TAVILY_API_KEY` if you want the grounded campaigns to cite live sources.

Seed a demo account against any environment, local or deployed:

```bash
npm run seed:demo -- --base-url https://your-app.example.com --email you@example.com --share
```

It drives the app's own HTTP routes with a real session, so a seeded build is
indistinguishable from a hand-made one. `npm run reset:demo -- --email you@example.com`
clears conversations and handoff records while leaving the agent and its share link intact.
3. Deploy. `npm run build` runs `prisma generate` first.
4. Run `npx prisma db push` against production once.
