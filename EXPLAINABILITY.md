# Explainability

Agent Forge is a platform for building agents, and it contains one agent of its own.

- **The Mentor** is the agent this repository ships and runs: an in-product assistant that
  coaches a developer through each agent-design decision. It is defined in
  [`src/server/mentor.ts`](src/server/mentor.ts).
- **The built agent** is whatever the developer creates. Agent Forge collects their decisions,
  assembles them into a payload ([`src/lib/assemble.ts`](src/lib/assemble.ts)), and creates the
  agent on the Lyzr Agent API. Its behaviour is authored by the developer, not by this platform.

Both are covered below.

## How it decides things

The Mentor's behaviour is set by a single fixed instruction block, written in plain text in
`src/server/mentor.ts` and unchanged at runtime. Its governing rule is **guide, do not solve**:
when a developer asks what to put in a field, the Mentor names the trade-off the step is about,
asks one question about the developer's own product, and offers a shape or a partial example —
never a finished value to paste. If pushed a second time it gives a worked example for a
*different* product and says so, so the developer adapts rather than copies. It runs at
temperature 0.4, so phrasing varies between turns while the substance does not.

Every reply is conditioned on a server-built CONTEXT block prepended to the developer's message.
That block names the current campaign, screen, mission and step, the reason the step exists, the
available options where the step is a choice, and every decision the developer has already made
(each truncated to 220 characters). The Mentor never decides anything on the developer's behalf:
it cannot write to the build, save a decision, award XP, or launch an agent. Those are separate
HTTP routes that only a human action can trigger.

The platform's own decisions are not model-driven at all. Whether a value is acceptable, which
mission unlocks next, and whether a build can launch are decided by deterministic code: validation
rules are declared as data per step and compiled to Zod ([`src/lib/validation.ts`](src/lib/validation.ts)),
progression is derived from persisted decisions ([`src/lib/flow.ts`](src/lib/flow.ts)), and the same
rules run on the client for feedback and again on the server as the authority. A built agent's own
decisions are governed by the instructions the developer wrote, composed into one string at
assembly time and visible to them before launch.

## Data Sources

The Mentor receives exactly three things per turn: the CONTEXT block described above, the
developer's typed message, and — through Lyzr short-term memory keyed to a session id of
`mentor-<userId>-<buildId>` — the earlier turns of that same conversation. Sessions are per user
and per build, so one developer's context never reaches another's. Nothing else about the user is
sent: no email address, no other builds, no platform-wide data.

What the platform stores is small and relational (Prisma; SQLite by default, Postgres in
production): an email address claimed at sign-in (**no password is handled, stored, or
transmitted**), one build row per user per campaign, one row per decision, elapsed time and
position, the launched agent's id and payload, and an optional share token. Unsaved editor text
is deliberately *not* sent to the server — valid fields are already persisted, so what remains is
the half-written paragraph, which stays in the browser. Decisions persist until the user or the
record is deleted; deleting a user cascades to their builds, decisions and share links.

Outbound calls go to two third parties, both server-side only. The Lyzr Agent API creates and
runs agents; `LYZR_API_KEY` is read in exactly one module (`src/server/lyzr.ts`, marked
`server-only`) so a client import fails the build, and no agent credential can reach a browser
bundle. Tavily provides web search for campaigns that declare `retrieval`; without
`TAVILY_API_KEY` those agents still answer, without sources, and say so. A published build at
`/a/<token>` exposes a hand-built projection — the agent, its config, and the decisions behind it
— which never includes the owner's email; the page is `noindex`, and revoking sets the token to
`NULL` so the link becomes unresolvable rather than merely flagged.

## Limitations

The Mentor is a language model and can be wrong. It may state something inaccurate about a model
id, an API field, or a trade-off with the same confident tone it uses when it is right, and
nothing in the platform fact-checks it. It reads only the CONTEXT block, so it does not know your
actual codebase, your users, your data, or any constraint you have not typed into the flow, and
long earlier decisions reach it truncated. It is also deliberately unhelpful in one specific way:
it will refuse to write your answer for you, which is the intended behaviour and not a fault.

Agents built here are only as good as the decisions behind them. The platform validates shape —
length, type, allowed values — but cannot tell whether your instructions are wise, whether your
grounding facts are true, or whether the agent will stay inside them; `samples/` includes a test
script precisely because that has to be checked empirically. Memory is short-term only, so an
agent remembers a conversation but not a user across sessions. Retrieval quality depends on
Tavily and is absent without a key.

Operationally: identity is a signed cookie over a claimed email address with no password check —
this is the one seam intended to be replaced with a real IdP before any sensitive use. There is no
automated content moderation on what a developer writes into an agent, and no evaluation harness
that scores a built agent's answers. Visitor chat on a shared link is bounded by a per-IP rate
limit and a 100-message total, which caps cost but does not authenticate anyone. Human control is
the real safety mechanism throughout: nothing is created, launched, published, or revoked except
by an explicit action from the person who owns the build, and the two available stops — revoking a
share token, and removing `LYZR_API_KEY` — take effect immediately.
