import type { Campaign } from "@/campaigns/types";

const DOCS = {
  agents: {
    label: "Lyzr — agent concepts",
    href: "https://docs.lyzr.ai/enterprise/get-started/concepts/agents",
  },
  quickstart: {
    label: "Lyzr — REST quickstart",
    href: "https://docs.lyzr.ai/enterprise/get-started/quickstart",
  },
  studio: {
    label: "Lyzr — choosing a model",
    href: "https://docs.lyzr.ai/enterprise/agent-studio/agents/studio",
  },
  kb: {
    label: "Lyzr — grounding & knowledge",
    href: "https://docs.lyzr.ai/enterprise/get-started/concepts/rag-knowledge",
  },
};

/**
 * Campaign 01 — Support Desk Agent.
 *
 * Eight decisions across four missions. Two map straight onto Lyzr's `role` and
 * `goal`; five compose into `instructions`; one picks the `provider`. Nothing
 * here is code — adding or reordering a step means editing this object.
 */
export const supportDeskCampaign: Campaign = {
  id: "support-desk",
  name: "Support Desk Agent",
  tagline: "A front-line agent that answers customers without inventing policy.",
  description:
    "Build a customer-facing support agent end to end: who it is, what it's for, how it speaks, and — most importantly — where it stops. You'll finish with a real agent you can talk to.",
  iconKey: "headset",
  badge: "Lyzr · OpenAI",
  difficulty: "Easy",
  estMinutes: 18,
  outcome: "A live support agent, deployed on Lyzr, that you can chat with immediately.",

  levels: [
    {
      id: "l1",
      title: "Identity",
      subtitle: "Decide who this agent is and what it exists to do.",
      missionIds: ["m1", "m2"],
      reward: "Unlocks the behaviour level — tone, rules, and boundaries.",
    },
    {
      id: "l2",
      title: "Behaviour",
      subtitle: "Decide how it speaks, what it refuses, and what its answers look like.",
      missionIds: ["m3", "m4"],
      reward: "Unlocks grounding — the difference between a persona and a useful agent.",
    },
    {
      id: "l3",
      title: "Grounding",
      subtitle: "Give it something true to say.",
      missionIds: ["m5"],
      reward: "Unlocks launch — your agent goes live on Lyzr.",
    },
  ],

  missions: [
    /* ───────────────────────────── Mission 1 ─────────────────────────────── */
    {
      id: "m1",
      title: "Give it an identity",
      tagline: "Name, model, and persona",
      description:
        "Three decisions that shape everything after them. The name is for you; the model is a real cost-versus-reasoning trade-off; the role is the first thing the model reads on every single call.",
      xp: 40,
      difficulty: "Easy",
      estMinutes: 5,
      steps: [
        {
          id: "name",
          label: "Name it",
          sub: "How this agent shows up in your Lyzr workspace",
          prompt: "What should we call this agent?",
          input: {
            kind: "text",
            placeholder: "Aurora Support",
            starters: [
              { label: "Aurora Support", value: "Aurora Support" },
              { label: "Tier-1 Desk", value: "Tier-1 Desk" },
            ],
          },
          rule: {
            kind: "string",
            min: 2,
            max: 60,
            pattern: "^[\\w\\s.\\-']+$",
            patternMessage: "Letters, numbers, spaces, hyphens and apostrophes only.",
            forbid: ["agent", "test", "todo", "untitled"],
          },
          checklistLabel: "Agent named",
          guidance: {
            why: "The name is the handle you'll use to find this agent later in Lyzr, in logs, and in your own code. It's the one decision here that the model never sees — so optimise it for you, not for the LLM.",
            mistakes: [
              "Calling it \"Agent\" or \"Test\" — you'll have six of them by Friday.",
              "Encoding the model into the name (\"SupportGPT4o\"); you'll switch models and the name will lie.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "provider",
          label: "Pick the model",
          sub: "A genuine cost-versus-reasoning trade-off",
          prompt: "Which model should run this agent?",
          input: {
            kind: "select",
            options: [
              {
                value: "gpt-4o-mini",
                label: "gpt-4o-mini",
                hint: "The default for support. Handles scripted, well-scoped questions at a fraction of the cost.",
                meta: "fast · cheapest",
              },
              {
                value: "gpt-4.1",
                label: "gpt-4.1",
                hint: "Better instruction-following than 4o-mini. Worth it when your rule list gets long.",
                meta: "mid · mid",
              },
              {
                value: "gpt-4o",
                label: "gpt-4o",
                hint: "Strongest reasoning. Worth it when questions are ambiguous or multi-part.",
                meta: "slower · priciest",
              },
            ],
          },
          // Must match Lyzr's OpenAI catalogue exactly — see
          // GET /v3/providers/type?provider_type=llm
          rule: { kind: "enum", values: ["gpt-4o-mini", "gpt-4.1", "gpt-4o"] },
          checklistLabel: "Model selected",
          guidance: {
            why: "Support traffic is mostly repetitive and well-scoped, which is exactly where small models shine. Reach for a bigger model when the *questions* are hard — not because bigger feels safer.",
            tradeoff: {
              title: "Small model vs. large model",
              columns: [
                {
                  label: "gpt-4o-mini",
                  tone: "good",
                  points: [
                    "Sub-second first token",
                    "Cheapest per conversation",
                    "Great at following explicit rules",
                    "Struggles with ambiguity",
                  ],
                },
                {
                  label: "gpt-4o",
                  tone: "costly",
                  points: [
                    "Handles vague, multi-part questions",
                    "Noticeably slower",
                    "Many times the cost per turn",
                    "Overkill for FAQ traffic",
                  ],
                },
              ],
            },
            mistakes: [
              "Defaulting to the largest model \"to be safe\" — you pay for it on every single turn, forever.",
              "Choosing a model before writing the instructions. Tight rules often make a small model good enough.",
            ],
            docs: [DOCS.studio, DOCS.quickstart],
          },
        },
        {
          id: "role",
          label: "Write the role",
          sub: "Who the agent believes it is",
          prompt: "Who is this agent? Write it as an identity, not a task list.",
          input: {
            kind: "textarea",
            rows: 3,
            placeholder:
              "A front-line support specialist for a subscription billing product, speaking directly to paying customers.",
            starters: [
              {
                label: "Billing support",
                value:
                  "A front-line support specialist for a subscription billing product, speaking directly to paying customers.",
              },
              {
                label: "Technical support",
                value:
                  "A technical support engineer for a developer API product, helping engineers debug failing integrations.",
              },
            ],
          },
          rule: { kind: "string", min: 25, max: 400, forbid: ["todo", "tbd"] },
          checklistLabel: "Role defined",
          guidance: {
            why: "`role` is prepended to every call. It sets the model's default assumptions — vocabulary, formality, what it considers obvious. A role written as an identity (\"a billing specialist\") anchors far harder than one written as a job description (\"answers billing questions\").",
            mistakes: [
              "Writing tasks here instead of identity — tasks belong in the goal and the rules.",
              "Being vague (\"a helpful assistant\"). Every model already thinks it's that; you've told it nothing.",
              "Stuffing the whole spec into the role. You have four more decisions for that.",
            ],
            docs: [DOCS.agents],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 2 ─────────────────────────────── */
    {
      id: "m2",
      title: "Give it a purpose",
      tagline: "Goal and scope",
      description:
        "An agent that will attempt anything is an agent you can't trust. Here you decide what success means and, just as importantly, where the edges are.",
      xp: 35,
      difficulty: "Easy",
      estMinutes: 4,
      steps: [
        {
          id: "goal",
          label: "Set the goal",
          sub: "What a good conversation ends with",
          prompt: "What does this agent exist to achieve?",
          input: {
            kind: "textarea",
            rows: 3,
            placeholder:
              "Resolve billing and account questions in a single reply, or hand the customer to a human with the context already gathered.",
            starters: [
              {
                label: "Resolve or escalate",
                value:
                  "Resolve billing and account questions in a single reply, or hand the customer to a human with the context already gathered.",
              },
              {
                label: "Unblock developers",
                value:
                  "Get a developer from a failing API call to a working one, using error messages and request details they provide.",
              },
            ],
          },
          rule: { kind: "string", min: 25, max: 400, forbid: ["todo", "tbd"] },
          checklistLabel: "Goal set",
          guidance: {
            why: "`goal` is what the model optimises toward when your rules don't cover the situation — and they never cover everything. A goal phrased as an *outcome* gives it something to steer by; a goal phrased as an activity (\"help customers\") gives it nothing.",
            mistakes: [
              "Writing an activity instead of an outcome. \"Answer questions\" is not a goal; \"resolve the question in one reply\" is.",
              "Setting a goal the agent has no ability to reach (\"reduce churn\").",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "scope",
          label: "Draw the edges",
          sub: "The topics that are explicitly not yours",
          prompt: "What is explicitly out of scope for this agent?",
          input: {
            kind: "textarea",
            rows: 3,
            placeholder:
              "Anything requiring account changes, refunds, legal or contractual commitments, or access to systems the customer hasn't already described.",
            starters: [
              {
                label: "No money, no legal",
                value:
                  "Refunds, discounts, contract terms, legal questions, and any change to a customer's account or subscription.",
              },
              {
                label: "No unverified specifics",
                value:
                  "Anything requiring access to internal systems, order history, or personal data the customer hasn't provided in this conversation.",
              },
            ],
          },
          rule: { kind: "string", min: 20, max: 400, forbid: ["todo", "none", "n/a"] },
          checklistLabel: "Scope bounded",
          guidance: {
            why: "This is the single highest-leverage line in a support agent. Without it, a model asked about a refund will confidently invent your refund policy — and it will sound exactly as certain as when it's right.",
            mistakes: [
              "Leaving it empty because \"the model should just know\". It doesn't, and it will guess.",
              "Listing only topics, not capabilities. \"No access to order history\" prevents a whole class of fabrication.",
            ],
            docs: [DOCS.agents],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 3 ─────────────────────────────── */
    {
      id: "m3",
      title: "Write the operating rules",
      tagline: "Tone and hard rules",
      description:
        "Everything from here composes into the agent's `instructions` — the section the model rereads on every turn. Two decisions: how it sounds, and what it must always do.",
      xp: 45,
      difficulty: "Moderate",
      estMinutes: 5,
      steps: [
        {
          id: "tone",
          label: "Choose the voice",
          sub: "How replies sound before you've read a word",
          prompt: "How should this agent sound?",
          input: {
            kind: "select",
            options: [
              {
                value:
                  "Warm and plain-spoken. Short sentences, no jargon, no corporate hedging. Acknowledge the frustration before solving the problem.",
                label: "Warm & plain-spoken",
                hint: "Best for consumer support where people arrive annoyed.",
                meta: "consumer",
              },
              {
                value:
                  "Precise and technical. Assume the reader is an engineer. Lead with the cause, then the fix. No pleasantries, no apologising for things that aren't broken.",
                label: "Precise & technical",
                hint: "Best for developer support where padding wastes the reader's time.",
                meta: "developer",
              },
              {
                value:
                  "Formal and measured. Complete sentences, neutral register, no contractions or humour. Suitable for regulated or enterprise contexts.",
                label: "Formal & measured",
                hint: "Best for finance, healthcare, or enterprise accounts.",
                meta: "regulated",
              },
            ],
          },
          rule: { kind: "string", min: 20, max: 500 },
          checklistLabel: "Voice chosen",
          guidance: {
            why: "Tone is not decoration — it sets how much the model hedges. A \"warm\" agent over-apologises; a \"precise\" one may read as curt to an upset customer. Pick for your reader on their worst day, not their average one.",
            tradeoff: {
              title: "Warm vs. precise",
              columns: [
                {
                  label: "Warm",
                  tone: "neutral",
                  points: ["Defuses frustration", "Reads as human", "Can bury the actual answer"],
                },
                {
                  label: "Precise",
                  tone: "neutral",
                  points: ["Answer is in line one", "Respects expert time", "Can read as cold"],
                },
              ],
            },
            mistakes: [
              "Picking the tone you like rather than the one your users need.",
              "Asking for \"friendly and professional\" — that's every model's default. It changes nothing.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "rules",
          label: "Set the hard rules",
          sub: "The non-negotiables, one per line",
          prompt: "What must this agent always do? One rule per line.",
          input: {
            kind: "textarea",
            rows: 6,
            placeholder:
              "Ask for the account email before discussing any specific account.\nIf you are not certain, say so and offer to escalate.\nNever state a price, date, or policy you were not given.",
            starters: [
              {
                label: "Safety-first set",
                value:
                  "Ask for the account email before discussing any specific account.\nIf you are not certain of an answer, say so plainly and offer to escalate to a human.\nNever state a price, date, refund window, or policy that was not given to you in this conversation.\nIf the customer is angry, acknowledge it once, then move to the fix.",
              },
              {
                label: "Developer-support set",
                value:
                  "Ask for the exact error message and the request payload before proposing a cause.\nGive the most likely cause first, then one fallback.\nNever invent an endpoint, parameter, or status code.\nIf the fix requires a change on our side, say so and escalate.",
              },
            ],
          },
          rule: { kind: "string", min: 40, max: 1500, forbid: ["todo", "tbd"] },
          checklistLabel: "Rules written",
          guidance: {
            why: "These are the lines the model actually follows turn after turn. Phrase them as observable behaviours — something you could tell from a transcript whether it happened. \"Be accurate\" fails that test; \"never state a price you weren't given\" passes it.",
            mistakes: [
              "Writing aspirations (\"be helpful\") instead of behaviours. Unenforceable, and it dilutes the rules that matter.",
              "Twenty rules. Past roughly eight, the model starts trading them off against each other. Rank ruthlessly.",
              "Only negative rules. Pair each \"never\" with the \"instead, do this\" — otherwise it just stops, mid-conversation.",
            ],
            docs: [DOCS.agents, DOCS.quickstart],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 4 ─────────────────────────────── */
    {
      id: "m4",
      title: "Shape the output",
      tagline: "Format and first move",
      description:
        "The last two decisions. What a reply physically looks like, and what the agent does before it knows anything about the problem.",
      xp: 40,
      difficulty: "Moderate",
      estMinutes: 4,
      steps: [
        {
          id: "format",
          label: "Pick the reply shape",
          sub: "Structure the customer sees every time",
          prompt: "What should a typical reply look like?",
          input: {
            kind: "select",
            options: [
              {
                value:
                  "Answer in at most four sentences of plain prose. No bullet lists, no headings, no preamble — open with the answer itself.",
                label: "Four sentences, no lists",
                hint: "Fastest to read. Best when most questions have one answer.",
                meta: "terse",
              },
              {
                value:
                  "Open with a one-sentence answer, then numbered steps if the fix requires more than one action. Keep the whole reply under 150 words.",
                label: "Answer, then numbered steps",
                hint: "Best when customers have to *do* something.",
                meta: "procedural",
              },
              {
                value:
                  "Structure every reply as: **What's happening** (one sentence), **What to do** (steps or a single action), **If that doesn't work** (the escalation path).",
                label: "Cause / fix / fallback",
                hint: "Best for technical support where the first fix often misses.",
                meta: "diagnostic",
              },
            ],
          },
          rule: { kind: "string", min: 20, max: 500 },
          checklistLabel: "Format chosen",
          guidance: {
            why: "Left unspecified, models default to padded, bulleted, over-hedged answers — because that's what most of their training data rewards. An explicit shape is the cheapest quality win available to you.",
            mistakes: [
              "Asking for structure without a length cap. \"Use bullets\" produces fourteen of them.",
              "Forcing headings onto one-line answers. Match the structure to the question's actual complexity.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "opening",
          label: "Define the first move",
          sub: "What it does before it knows anything",
          prompt: "What should the agent do on the very first message?",
          input: {
            kind: "textarea",
            rows: 3,
            placeholder:
              "Greet once, in one line, then ask the single most useful clarifying question. Never ask more than one question at a time.",
            starters: [
              {
                label: "One question at a time",
                value:
                  "Greet once in a single line, then ask the one clarifying question most likely to unblock the issue. Never ask more than one question in a message.",
              },
              {
                label: "Answer first, ask second",
                value:
                  "If the question is answerable as asked, answer it immediately and ask nothing. Only ask a clarifying question when the answer genuinely depends on it.",
              },
            ],
          },
          rule: { kind: "string", min: 25, max: 400, forbid: ["todo", "tbd"] },
          checklistLabel: "Opening defined",
          guidance: {
            why: "The first turn sets the pattern for the whole conversation. An agent that opens with five questions trains the customer to write essays; one that opens with a confident wrong answer trains them not to trust it.",
            mistakes: [
              "Stacking clarifying questions. People answer the first and ignore the rest.",
              "A long scripted greeting. It's read once and skipped forever after.",
            ],
            docs: [DOCS.agents],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 5 ─────────────────────────────── */
    {
      id: "m5",
      title: "Give it something true to say",
      tagline: "The source of truth",
      description:
        "Everything so far shaped how your agent behaves. None of it told it a single fact about your business. Right now it can only ask questions it has no way to act on — this is the decision that fixes that.",
      xp: 50,
      difficulty: "Moderate",
      estMinutes: 6,
      steps: [
        {
          id: "knowledge",
          label: "Paste the source of truth",
          sub: "The facts it's allowed to state — and the only ones",
          prompt: "Paste the facts this agent is allowed to quote. Policy, pricing, FAQ answers.",
          input: {
            kind: "textarea",
            rows: 10,
            placeholder:
              "REFUNDS\nFull refund within 14 days of purchase, no questions asked.\nAfter 14 days: pro-rata credit only, no cash refunds.\nRefunds are processed in 5–7 business days to the original payment method.\n\nPLANS\nStarter $19/mo · Team $49/mo per seat · Enterprise: contact sales.\nPlan changes take effect at the next billing cycle.\n\nESCALATION\nAnything involving a chargeback, or a customer asking twice, goes to a human.",
            starters: [
              {
                // The distilled form of samples/halyard-support-handbook.md — see
                // samples/README.md for how it was cut down and why.
                label: "Halyard support desk",
                value:
                  "PLANS\nSolo: free, 2.9% + $0.30 per payment, 1 seat, up to 5 invoices/month.\nStudio: $18/mo, 1.9% + $0.30, 5 seats, unlimited invoices, custom branding.\nAgency: $59/mo, 1.4% + $0.30, 25 seats, multi-currency and approval workflows.\nEnterprise: pricing is not public. Never estimate it — route to sales.\nAnnual billing costs 10 months instead of 12. Billed in USD only.\nUpgrades apply immediately; downgrades apply at period end and are never pro-rated.\n\nSUBSCRIPTION REFUNDS\nFull refund within 14 days of the first charge, no reason needed.\nAfter 14 days: account credit at pro-rata value, expiring 12 months from issue. No cash.\nRefunds go to the original payment method only — never a different card or a bank transfer.\nRefunds take 5-7 business days to appear on a statement; the bank controls that timing.\nAnnual plans cancelled mid-term get credit, not cash, regardless of the 14-day rule.\nA genuine duplicate charge is refunded in full, and is the only refund made outside the 14-day rule.\n\nPAYOUTS (a customer's own money — not our subscription)\nStandard schedule: 2 business days after the payer's funds clear.\nThe first payout on a new account is held 7 days for fraud review. Every new account. Not negotiable.\nMinimum payout is $10; anything smaller rolls into the next payout.\nPayouts run at 14:00 UTC, so a Friday afternoon payout lands Tuesday.\nA failed payout returns to the Halyard balance within 5 business days and triggers an email.\n\nCOMMON ISSUES\nPayment links expire 90 days after sending. Resending makes a new link, not a duplicate invoice.\n\"Declined but charged\" is an authorisation hold. It clears in 3-5 business days and we cannot release it manually.\nCharged twice: check the invoice payment history first — two people at the client's company paying once each is common.\nTax IDs live in Settings > Business details and only apply to invoices created after the change.\nSent invoices cannot be edited. They must be voided and reissued.\nLogin is passwordless: a magic link valid for 15 minutes, single use. It often lands in spam.\n\nHAND TO A HUMAN, ALWAYS\nChargebacks or any dispute filed with a bank.\nAny legal language: lawyer, court, sue, subpoena, GDPR request.\nAccount access changes: email change, ownership transfer, death of an owner.\nSuspected fraud or account takeover, including \"I didn't create this account\".\nAnyone who has asked the same question twice without a resolution.\nEnterprise pricing or contract terms.\nAny request to waive a fee — only a human can approve that.\n\nHOW A HUMAN IS ACTUALLY REACHED\nYou have no tools. You cannot open a ticket, send an email, or notify anyone.\nNever say you have escalated, opened a ticket, flagged, forwarded, or alerted anyone. All of that would be false.\nSay instead: \"I can't action this myself, but here is who can.\" Then give the route.\nThe route: reply to any Halyard invoice email, or write to support@halyard.example.\nTell them to include their account email and the invoice number, and what they've already tried.\nA human answers within one business day, 09:00-18:00 UTC Monday to Friday.\nIf asked \"who do I talk to\" or \"what are the steps\", give that address and that list. Do not offer to do it for them.\n\nWE DO NOT KNOW THESE — SAY SO AND ESCALATE\nChurn, revenue, or any internal business numbers.\nWhether a feature is on the roadmap, and any dates.\nWhy a specific bank held a specific transfer.\nTax advice of any kind. We state what appears on an invoice; we do not advise on liability.\nSelf-hosted or on-premise deployment. We do not offer it.\n\nHOURS\nStaffed 09:00-18:00 UTC, Monday to Friday. Out of hours, first reply within one business day.\nThere is no phone support on any plan.",
              },
              {
                label: "Billing policy example",
                value:
                  "REFUNDS\nFull refund within 14 days of purchase, no questions asked.\nAfter 14 days: pro-rata credit only, no cash refunds.\nRefunds are processed in 5–7 business days to the original payment method.\nWe cannot refund to a different payment method than the original.\n\nPLANS\nStarter $19/mo · Team $49/mo per seat · Enterprise: contact sales.\nPlan changes take effect at the next billing cycle; downgrades are not pro-rated.\n\nINVOICES\nInvoices are issued on the 1st of each month and emailed to the account owner only.\nVAT is added for EU customers at their local rate.\n\nESCALATION\nAnything involving a chargeback, a legal threat, or a customer asking the same thing twice goes to a human.\nYou have no tools. You cannot open a ticket, send email, or notify anyone.\nNever say you have escalated, forwarded, flagged, or notified a human — that would be false.\nSay you cannot action it yourself, then ask the customer to reply here with their account email and what they have already tried, so a human can pick it up within one business day.",
              },
              {
                label: "API support example",
                value:
                  "RATE LIMITS\nFree tier: 60 requests/minute. Pro: 600/minute. Enterprise: negotiated.\nExceeding the limit returns HTTP 429 with a Retry-After header in seconds.\n\nAUTH\nAll requests need an Authorization: Bearer <token> header.\n401 means the token is invalid or revoked. 403 means the token is valid but lacks scope.\n\nCOMMON ERRORS\n422 means the request body failed validation; the response names the field.\n500s are our fault — tell the customer to retry with backoff and escalate if it persists past 5 minutes.\n\nESCALATION\nAnything requiring a token reset, quota increase, or account-level change goes to a human.\nYou have no tools. You cannot open a ticket, send email, or notify anyone.\nNever say you have escalated, forwarded, flagged, or notified a human — that would be false.\nSay you cannot action it yourself, then ask the customer to reply here with their account email and what they have already tried, so a human can pick it up within one business day.",
              },
            ],
          },
          rule: { kind: "string", min: 60, max: 8000, forbid: ["todo", "tbd", "none", "n/a"] },
          checklistLabel: "Source of truth provided",
          guidance: {
            why: "Until now your agent had three sources: your instructions, the conversation, and whatever the model absorbed in training. That last one is the dangerous one — it will produce a confident, plausible, invented refund policy. Your rule 'never state a price you weren't given' stops the invention but leaves it with nothing to say, so it stalls and asks another question forever. This is the text that finally lets it answer.",
            tradeoff: {
              title: "Pasted facts vs. a retrieval index",
              columns: [
                {
                  label: "Pasted here",
                  tone: "good",
                  points: [
                    "Always in context — never 'missed' by a search",
                    "Quoted exactly, word for word",
                    "Works today, nothing to configure",
                    "Capped at roughly 1,200 words",
                  ],
                },
                {
                  label: "A knowledge base",
                  tone: "costly",
                  points: [
                    "Scales to hundreds of pages",
                    "Only the matching chunk reaches the model",
                    "Retrieval can miss, and then it knows nothing",
                    "Needs a vector store configured",
                  ],
                },
              ],
            },
            mistakes: [
              "Pasting a whole handbook. This text is re-sent on every single turn — you pay for all of it, every message. Put the twenty most-asked facts here, not the manual.",
              "Pasting a link instead of the content. The agent cannot open URLs; it will either ignore it or invent what's behind it.",
              "Formatting for humans. Drop the marketing prose and the tables — short labelled lines beat prose the model has to parse.",
              "Leaving out the numbers. Vague policy (\"refunds are quick\") is exactly as useless as no policy. Dates, amounts, and day counts are the whole point.",
              "Naming an escalation trigger but no route. Told only to \"escalate to a human\", your agent will cheerfully announce that it has — it has no tools, so producing that sentence is the entire action, and your customer waits for a reply nobody knows to send. Give the contact address and what to include, and forbid it from ever claiming it forwarded, flagged, or filed anything.",
            ],
            docs: [DOCS.agents, DOCS.kb],
          },
        },
      ],
    },
  ],

  /* ── The artifact that grows ───────────────────────────────────────────── */
  artifact: {
    filename: "support-desk.agent.ts",
    lines: [
      {
        id: "a1",
        indent: 0,
        fromMissionId: "m1",
        tokens: [{ t: "text", v: "// Assembled live from your decisions.", cls: "cmt" }],
      },
      {
        id: "a2",
        indent: 0,
        fromMissionId: "m1",
        tokens: [
          {
            t: "text",
            v: "// Boilerplate is ours; the highlighted slots are yours.",
            cls: "cmt",
          },
        ],
      },
      {
        id: "a3",
        indent: 0,
        fromMissionId: "m1",
        tokens: [
          {
            t: "text",
            v: "// At launch this becomes the exact POST body sent to Lyzr.",
            cls: "cmt",
          },
        ],
      },
      { id: "a4", indent: 0, fromMissionId: "m1", tokens: [] },
      {
        id: "a5",
        indent: 0,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "export const ", cls: "kw" },
          { t: "text", v: "agent", cls: "fn" },
          { t: "text", v: " = {", cls: "punc" },
        ],
      },
      {
        id: "a6",
        indent: 1,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "name: ", cls: "prop" },
          { t: "slot", stepId: "name" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a7",
        indent: 1,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "provider: ", cls: "prop" },
          { t: "slot", stepId: "provider" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a8",
        indent: 1,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "role: ", cls: "prop" },
          { t: "slot", stepId: "role" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      { id: "a9", indent: 0, fromMissionId: "m2", tokens: [] },
      {
        id: "a10",
        indent: 1,
        fromMissionId: "m2",
        tokens: [
          { t: "text", v: "goal: ", cls: "prop" },
          { t: "slot", stepId: "goal" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a11",
        indent: 1,
        fromMissionId: "m2",
        tokens: [
          { t: "text", v: "outOfScope: ", cls: "prop" },
          { t: "slot", stepId: "scope" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      { id: "a12", indent: 0, fromMissionId: "m3", tokens: [] },
      {
        id: "a13",
        indent: 1,
        fromMissionId: "m3",
        tokens: [
          { t: "text", v: "instructions", cls: "prop" },
          { t: "text", v: ": {", cls: "punc" },
          { t: "text", v: "  // composed into one field at launch", cls: "cmt" },
        ],
      },
      {
        id: "a14",
        indent: 2,
        fromMissionId: "m3",
        tokens: [
          { t: "text", v: "voice: ", cls: "prop" },
          { t: "slot", stepId: "tone" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a15",
        indent: 2,
        fromMissionId: "m3",
        tokens: [
          { t: "text", v: "hardRules: ", cls: "prop" },
          { t: "slot", stepId: "rules" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a16",
        indent: 2,
        fromMissionId: "m4",
        tokens: [
          { t: "text", v: "replyFormat: ", cls: "prop" },
          { t: "slot", stepId: "format" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a17",
        indent: 2,
        fromMissionId: "m4",
        tokens: [
          { t: "text", v: "firstMove: ", cls: "prop" },
          { t: "slot", stepId: "opening" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a18",
        indent: 1,
        fromMissionId: "m3",
        tokens: [{ t: "text", v: "},", cls: "punc" }],
      },
      { id: "a20", indent: 0, fromMissionId: "m5", tokens: [] },
      {
        id: "a21",
        indent: 1,
        fromMissionId: "m5",
        tokens: [
          { t: "text", v: "knownFacts: ", cls: "prop" },
          { t: "slot", stepId: "knowledge" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a19",
        indent: 0,
        fromMissionId: "m1",
        tokens: [{ t: "text", v: "};", cls: "punc" }],
      },
    ],
  },

  /* ── How decisions become a Lyzr agent ─────────────────────────────────── */
  assembly: {
    nameStepId: "name",
    modelStepId: "provider",
    roleStepId: "role",
    goalStepId: "goal",
    providerId: "openai",
    // Support answers should be near-deterministic: the same question a week
    // later should get the same policy back.
    temperature: 0.3,
    topP: 0.9,
    instructionsPreamble:
      "Follow every section below exactly. They were written by the developer who deployed you and they override any conflicting instinct. When a request falls outside your stated scope, say so plainly instead of guessing.",
    // Facts first, behaviour after. The reference material goes up top so every
    // rule below is read in its light, and the behavioural constraints stay
    // closest to the incoming question.
    instructions: [
      {
        stepId: "knowledge",
        heading:
          "Known facts — the ONLY source you may quote specifics from. If an answer is not derivable from this section, say so and escalate; never fill the gap from memory",
      },
      { stepId: "tone", heading: "Voice" },
      { stepId: "rules", heading: "Hard rules — always follow these" },
      { stepId: "scope", heading: "Out of scope — refuse and explain, never improvise" },
      { stepId: "format", heading: "Reply format" },
      { stepId: "opening", heading: "First message behaviour" },
    ],
  },
};
