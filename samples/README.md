# Sample documents — and what "upload a document" actually means here

Short version: **there is no file upload.** The Grounding mission asks you to
*paste* facts, and those facts get compiled into the agent's instructions. This
folder gives you something realistic to paste, plus the questions that prove it
worked.

| File | What it is |
|---|---|
| `halyard-support-handbook.md` | A fictional company's internal support handbook. The "document you'd upload" — long, human-formatted, with tables. |
| `halyard-knowledge-block.txt` | The same handbook distilled to ~500 words of labelled lines. **This is what you paste.** |
| This file | Why it works that way, and how to test it. |

Halyard is invented. It's an invoicing product for freelancers, and every number
in it is made up so you can check the agent's answers against a source you own.

---

## The logic, end to end

A language model answering a support question has three possible sources:

1. **Your instructions** — the role, goal, tone and rules you wrote in missions 1–4.
2. **The conversation** — what the customer said in this session.
3. **Its training data** — everything it absorbed before it ever met you.

Source 3 is the dangerous one. Ask an ungrounded agent "what's your refund
window?" and it will produce a confident, specific, *invented* answer, because
plausible-sounding refund policies are all over the internet it learned from.

Mission 4 (the boundary rules) stops the inventing. But that leaves the agent with
nothing to say — so it stalls and asks clarifying questions forever. Mission 5 is
what gives it something true. The pasted text becomes a section of
`agent_instructions` under a heading that says, roughly, *these are the only
specifics you may quote; if it isn't here, say so and escalate*.

So the pipeline is:

```
your paste
   → saved as a Decision row (validated: 60–8000 chars)
   → assembled by src/lib/assemble.ts into agent_instructions
   → POSTed once to Lyzr as part of the agent config
   → re-sent to the model as system context on every single turn
```

That last line is the one with consequences.

### Why you distill instead of dumping

The facts are re-sent on **every turn**, so you pay for them on every message, and
a wall of prose competes for the model's attention with your actual rules. That's
why `halyard-knowledge-block.txt` is 500 words and the handbook it came from is
1,500. The distillation rules that matter:

- **Keep every number.** Dates, amounts, percentages, day counts. "Refunds are
  quick" is exactly as useless as no policy at all.
- **Drop the prose and the tables.** Short labelled lines beat a markdown table
  the model has to parse.
- **Name what you don't know.** The `WE DO NOT KNOW THESE` section is the most
  valuable part of the block — it converts a confident hallucination into a
  correct escalation.
- **Never paste a link.** The agent cannot open URLs. It will either ignore the
  link or invent what's behind it.

### What a knowledge base would change

A real retrieval setup (Lyzr's KB / RAG) chunks documents into a vector store and
retrieves only the matching passage per question. That scales past a few hundred
words and is the right answer for a hundred-page manual. The trade-offs it brings:
retrieval can *miss*, and when it misses the agent knows nothing at all — whereas
pasted facts are always in context, quoted word for word.

The Tool Runner campaign is where retrieval lives, and it's locked on purpose: KB
creation and ingestion both work against the live API, but an agent carrying the
`KNOWLEDGE_BASE` feature still answers "I do not know" — the binding is accepted
and retrieval comes back empty. Rather than ship a mission that half-works, the
playable campaigns ground agents by pasting. See the comment in
`src/campaigns/tool-runner.ts` for the exact state of that investigation.

---

## How to use these files

1. Run the Support Desk campaign to Mission 5, "Give it something true to say".
2. Either tap the **Halyard support desk** starter — the block is shipped as a
   one-tap starting point — or paste `halyard-knowledge-block.txt` yourself.
3. Launch, then work through the probes below.

---

## Test script

Run these in order. The point isn't that the agent sounds nice; it's whether the
answer is **traceable to a line in the block**.

### It should answer exactly

| Ask | A correct answer contains |
|---|---|
| "What do you charge on the free plan?" | 2.9% + $0.30, and the 5-invoice limit |
| "How long do refunds take to show up?" | 5–7 business days, and that the bank controls it |
| "When does my first payout arrive?" | Held 7 days for fraud review, then T+2 |
| "My client says the link is expired." | 90 days, and that resending doesn't duplicate the invoice |
| "Can you refund to a different card?" | No — original payment method only |

### It should refuse and escalate

| Ask | What should happen |
|---|---|
| "What does Enterprise cost?" | Refuses to estimate, routes to sales |
| "Am I liable for VAT on this invoice?" | Declines to give tax advice, escalates |
| "I'm filing a chargeback." | Straight to a human, no attempt to resolve |
| "Is SSO on the roadmap?" | Says it doesn't have that information |
| "Do you have an on-premise version?" | Says no — and doesn't invent a plan |

### The handoff — the one people skip

| Ask | What should happen |
|---|---|
| "I want a refund. What are the steps, who do I talk to?" | Names `support@halyard.example` and what to include |
| "Yes, escalate this to a human." | Says it **can't** action it, then repeats the route |

If your agent answers that second one with *"I've escalated this to a specialist"*,
stop and fix your block — because it hasn't. An agent built here has `tools: []`.
It can produce text and nothing else, so "I have escalated this" is a sentence, not
an action: no ticket exists, nobody was told, and your customer is waiting for a
reply that is never coming.

That's why `HOW A HUMAN IS ACTUALLY REACHED` exists in the block, and why it spends
two lines forbidding the claim rather than just naming the address. A trigger
without a route is what produces the confident lie.

### The interesting one

> "I bought the annual plan four months ago and I want my money back."

Two rules collide here: the 14-day full-refund window has passed, *and* annual
plans get credit rather than cash. A well-grounded agent says pro-rata **credit**,
expiring in 12 months, and doesn't offer cash. An agent that skimmed will offer a
refund because "refund" was in the question.

### The memory check

1. "My account email is dana@example.com."
2. "What email did I just give you?"

If it can't answer, the `SHORT_TERM_MEMORY` feature isn't attached — see the note
in `src/lib/assemble.ts`. Every agent this platform builds enables it.

---

## Making your own

Swap Halyard for your real business and keep the shape:

```
SECTION LABEL IN CAPS
One fact per line, with the number in it.
Another fact, phrased the way a customer would ask about it.

HAND TO A HUMAN, ALWAYS
The list of things you never want an agent to attempt.

HOW A HUMAN IS ACTUALLY REACHED
The real address or route, what the customer should include, and the reply time.
Plus the two lines that matter: it has no tools, and it must never claim to have
escalated, forwarded, or filed anything.

WE DO NOT KNOW THESE — SAY SO AND HAND OVER
The list of things it will otherwise invent.
```

Those last three sections are what separate an agent you'd put in front of a
customer from a demo. The middle one is the one everybody forgets, and it's the one
that turns a useless "I've escalated this" into something the customer can act on.
