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
  kb: {
    label: "Lyzr — grounding & knowledge",
    href: "https://docs.lyzr.ai/enterprise/get-started/concepts/rag-knowledge",
  },
};

/**
 * Campaign 02 — Research Analyst.
 *
 * Deliberately a different *shape* of problem from the support campaign: the
 * hard part here is epistemics (what counts as knowing something) rather than
 * boundaries. It also exercises the `number` input kind, which proves the flow
 * is genuinely data-driven and not tuned to one campaign's step types.
 */
export const researchAnalystCampaign: Campaign = {
  id: "research-analyst",
  name: "Research Analyst",
  tagline: "An analyst that reasons from what it's given — and admits what it isn't.",
  description:
    "Build an agent that turns a messy brief into structured analysis. The whole campaign is about calibration: how it weighs evidence, how deep it reasons, and how it signals uncertainty instead of hiding it.",
  iconKey: "library",
  badge: "Lyzr · OpenAI",
  difficulty: "Moderate",
  estMinutes: 20,
  outcome: "A live analyst agent that produces structured, uncertainty-aware briefings.",

  /**
   * This analyst reads the live web before it answers.
   *
   * Five sources, one round — not a multi-round research loop. A loop reads as
   * more sophisticated and takes 30–60s, which the person waiting experiences as
   * a broken page; one round lands in about two seconds. The honest name for
   * this is grounded search with citations, and that is what the UI calls it.
   */
  retrieval: { kind: "web", maxSources: 5 },

  levels: [
    {
      id: "l1",
      title: "Identity",
      subtitle: "Decide what kind of analyst this is and what it's pointed at.",
      missionIds: ["m1", "m2"],
      reward: "Unlocks the method level — how it actually thinks.",
    },
    {
      id: "l2",
      title: "Method",
      subtitle: "Decide how it reasons, how long it talks, and how it handles not knowing.",
      missionIds: ["m3", "m4"],
      reward: "Unlocks grounding — the material it's actually allowed to reason from.",
    },
    {
      id: "l3",
      title: "Grounding",
      subtitle: "Supply the material your evidence standard keeps referring to.",
      missionIds: ["m5"],
      reward: "Unlocks launch — your analyst goes live on Lyzr.",
    },
  ],

  missions: [
    /* ───────────────────────────── Mission 1 ─────────────────────────────── */
    {
      id: "m1",
      title: "Establish the analyst",
      tagline: "Name, model, and expertise",
      description:
        "Analysis is one of the few jobs where model choice genuinely changes the output quality — not just the latency. Three decisions to set that up.",
      xp: 40,
      difficulty: "Easy",
      estMinutes: 5,
      steps: [
        {
          id: "name",
          label: "Name it",
          sub: "How this analyst shows up in your workspace",
          prompt: "What should we call this agent?",
          input: {
            kind: "text",
            placeholder: "Market Signal",
            starters: [
              { label: "Market Signal", value: "Market Signal" },
              { label: "Due Diligence Desk", value: "Due Diligence Desk" },
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
            why: "The name is for you and your logs — the model never reads it. Name it after the *question it answers*, not the technology behind it.",
            mistakes: [
              "Naming it after the model. You'll change models; the name will lie.",
              "\"Research Agent v2\" — versions belong in git, not in names.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "provider",
          label: "Pick the model",
          sub: "For analysis, this one genuinely matters",
          prompt: "Which model should run this analyst?",
          input: {
            kind: "select",
            options: [
              {
                value: "gpt-4o-mini",
                label: "gpt-4o-mini",
                hint: "Fine for summarising and reformatting material you supply. Will flatten nuance.",
                meta: "fast · cheapest",
              },
              {
                value: "gpt-4.1",
                label: "gpt-4.1",
                hint: "The pragmatic middle. Holds a long brief together without the top-tier bill.",
                meta: "mid · mid",
              },
              {
                value: "gpt-4o",
                label: "gpt-4o",
                hint: "The default for real analysis. Notices tension between sources instead of averaging them.",
                meta: "slower · priciest",
              },
            ],
          },
          // Must match Lyzr's OpenAI catalogue exactly — see
          // GET /v3/providers/type?provider_type=llm
          rule: { kind: "enum", values: ["gpt-4o-mini", "gpt-4.1", "gpt-4o"] },
          checklistLabel: "Model selected",
          guidance: {
            why: "Support agents mostly retrieve and rephrase — small models do that well. Analysis requires holding several claims in tension and noticing when they conflict, which is exactly the capability that scales with model size. This is the campaign where paying more actually buys something.",
            tradeoff: {
              title: "Where the money goes",
              columns: [
                {
                  label: "gpt-4o-mini",
                  tone: "good",
                  points: [
                    "Cheap enough to run on everything",
                    "Good at extraction and summary",
                    "Averages conflicting sources instead of flagging them",
                  ],
                },
                {
                  label: "gpt-4o",
                  tone: "costly",
                  points: [
                    "Spots contradictions between claims",
                    "Holds a long brief coherently",
                    "Several times the cost",
                    "Slower first token",
                  ],
                },
              ],
            },
            mistakes: [
              "Reaching for the cheapest model then blaming the prompt when the analysis reads generic.",
              "Assuming a bigger model removes the need for an uncertainty policy. It doesn't — it just makes the confident errors rarer and harder to catch.",
            ],
            docs: [DOCS.agents, DOCS.quickstart],
          },
        },
        {
          id: "role",
          label: "Write the role",
          sub: "The expertise it reasons from",
          prompt: "What kind of analyst is this? Write it as expertise, not as a task.",
          input: {
            kind: "textarea",
            rows: 3,
            placeholder:
              "A competitive intelligence analyst covering B2B SaaS, used to reading pricing pages, changelogs, and funding announcements for signal.",
            starters: [
              {
                label: "Competitive intel",
                value:
                  "A competitive intelligence analyst covering B2B SaaS, used to reading pricing pages, changelogs, and funding announcements for signal.",
              },
              {
                label: "Technical due diligence",
                value:
                  "A technical due-diligence analyst who evaluates engineering organisations from their public artifacts: repositories, incident history, and documentation quality.",
              },
            ],
          },
          rule: { kind: "string", min: 25, max: 400, forbid: ["todo", "tbd"] },
          checklistLabel: "Role defined",
          guidance: {
            why: "Naming a *specialism* changes which patterns the model reaches for. \"A competitive intelligence analyst\" pulls in a different frame — and different default questions — than \"a research assistant\".",
            mistakes: [
              "\"An expert researcher.\" Expert in what? The word does no work on its own.",
              "Describing the deliverable here instead of the expertise. The deliverable is the goal.",
            ],
            docs: [DOCS.agents],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 2 ─────────────────────────────── */
    {
      id: "m2",
      title: "Point it at something",
      tagline: "Goal and evidence standard",
      description:
        "An analyst without an evidence standard is a very articulate guesser. Two decisions: what it's for, and what it's allowed to treat as known.",
      xp: 40,
      difficulty: "Moderate",
      estMinutes: 5,
      steps: [
        {
          id: "goal",
          label: "Set the goal",
          sub: "The decision its output should support",
          prompt: "What should this analyst produce, and for whose decision?",
          input: {
            kind: "textarea",
            rows: 3,
            placeholder:
              "Give a product manager enough grounded detail about a competitor's positioning to decide whether to respond, in under five minutes of reading.",
            starters: [
              {
                label: "Support a product call",
                value:
                  "Give a product manager enough grounded detail about a competitor's positioning to decide whether to respond, in under five minutes of reading.",
              },
              {
                label: "Support an investment call",
                value:
                  "Give an investor a defensible read on a company's technical maturity and its biggest unknowns, sufficient to decide whether to go deeper.",
              },
            ],
          },
          rule: { kind: "string", min: 30, max: 400, forbid: ["todo", "tbd"] },
          checklistLabel: "Goal set",
          guidance: {
            why: "Analysis has no natural stopping point — a model will happily produce another section forever. Naming the *decision* the output serves is what tells it when it's done.",
            mistakes: [
              "\"Research the topic thoroughly.\" There's no finish line in that sentence.",
              "Omitting the reader. Analysis for an engineer and analysis for a board member are different documents.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "evidence",
          label: "Set the evidence bar",
          sub: "What counts as knowing something",
          prompt: "What is this analyst allowed to treat as established fact?",
          input: {
            kind: "select",
            options: [
              {
                value:
                  "Treat only what the user has supplied in this conversation as established. Anything from your own training is background context and must be labelled as such — never presented as a current fact.",
                label: "Supplied material only",
                hint: "Strictest. Best when accuracy matters more than coverage.",
                meta: "strict",
              },
              {
                value:
                  "Treat supplied material as established. You may add well-known general context from your training, but mark it explicitly as background and note that it may be out of date.",
                label: "Supplied + labelled background",
                hint: "The practical default for most analysis work.",
                meta: "balanced",
              },
              {
                value:
                  "Reason freely from supplied material and general knowledge, but flag every claim you could not trace back to something the user gave you.",
                label: "Open, with claims flagged",
                hint: "Widest coverage. Requires a reader who checks the flags.",
                meta: "exploratory",
              },
            ],
          },
          rule: { kind: "string", min: 20, max: 600 },
          checklistLabel: "Evidence bar set",
          guidance: {
            why: "A model has no built-in sense of which of its statements came from you and which came from its weights. This decision is what forces that line to exist — and it is the difference between an analyst and a plausible-sounding text generator.",
            tradeoff: {
              title: "Strict vs. open",
              columns: [
                {
                  label: "Supplied only",
                  tone: "good",
                  points: [
                    "Almost nothing fabricated",
                    "Every claim traceable",
                    "Thin when you supply little",
                  ],
                },
                {
                  label: "Open",
                  tone: "costly",
                  points: [
                    "Much richer output",
                    "Fills gaps you didn't know existed",
                    "Stale training data reads as current fact",
                  ],
                },
              ],
            },
            mistakes: [
              "Choosing \"open\" for anything with a date in it. Training cutoffs turn confident claims into confident errors.",
              "Assuming \"strict\" removes the need for the uncertainty policy in the next level. It doesn't.",
            ],
            docs: [DOCS.kb, DOCS.agents],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 3 ─────────────────────────────── */
    {
      id: "m3",
      title: "Set the method",
      tagline: "Reasoning depth and length budget",
      description:
        "How hard it thinks before answering, and how much room it gets to say it. These two fight each other — that's the point.",
      xp: 45,
      difficulty: "Moderate",
      estMinutes: 5,
      steps: [
        {
          id: "depth",
          label: "Choose reasoning depth",
          sub: "How much work happens before the first word",
          prompt: "How should this analyst approach a question?",
          input: {
            kind: "select",
            options: [
              {
                value:
                  "Answer directly from the material. Do not enumerate alternatives or work through competing readings — state the strongest reading and move on.",
                label: "Direct read",
                hint: "Fast and cheap. Best when the material is unambiguous.",
                meta: "1 pass",
              },
              {
                value:
                  "Before answering, identify the two or three readings the material could support, then commit to the best-supported one and say briefly why the others lose.",
                label: "Weigh the alternatives",
                hint: "The default for genuine analysis.",
                meta: "2 passes",
              },
              {
                value:
                  "Build the strongest case for your conclusion, then argue against it, then revise. Present the revised conclusion and the strongest surviving objection.",
                label: "Argue against yourself",
                hint: "Slowest and priciest. Best for high-stakes, contested calls.",
                meta: "3 passes",
              },
            ],
          },
          rule: { kind: "string", min: 20, max: 600 },
          checklistLabel: "Depth chosen",
          guidance: {
            why: "Depth is bought with tokens — and tokens are latency and money. \"Argue against yourself\" can double or triple the cost of a turn. Choose it where being wrong is expensive, not everywhere.",
            tradeoff: {
              title: "What depth costs",
              columns: [
                {
                  label: "Direct read",
                  tone: "good",
                  points: ["Cheapest per answer", "Sub-second feel", "Misses ambiguity entirely"],
                },
                {
                  label: "Self-critique",
                  tone: "costly",
                  points: [
                    "Catches its own weak reasoning",
                    "2–3× the tokens",
                    "Noticeably slower",
                    "Can read as hedging",
                  ],
                },
              ],
            },
            mistakes: [
              "Selecting the deepest option by default. You pay that on every trivial question too.",
              "Pairing deep reasoning with a tight word budget — it thinks hard, then has no room to show you any of it.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "budget",
          label: "Set the length budget",
          sub: "A hard ceiling, in words",
          prompt: "What's the maximum length of a reply, in words?",
          input: { kind: "number", placeholder: "250" },
          rule: { kind: "number", min: 50, max: 1200, integer: true },
          checklistLabel: "Length budget set",
          guidance: {
            why: "A number is the only length instruction models reliably respect — \"be concise\" is interpreted very differently across models and even across turns. A ceiling also forces prioritisation, which is most of what makes analysis useful.",
            mistakes: [
              "Setting it under about 120 words alongside a multi-section format. The format wins and the analysis gets crushed out.",
              "Setting no ceiling at all. Unbounded analysis drifts into restating the question.",
              "Confusing words with tokens — roughly 1 word ≈ 1.3 tokens, so 250 words is around 325 tokens of output.",
            ],
            docs: [DOCS.agents],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 4 ─────────────────────────────── */
    {
      id: "m4",
      title: "Handle not knowing",
      tagline: "Output structure and uncertainty",
      description:
        "The final two. What the briefing looks like, and — the decision that separates a useful analyst from a dangerous one — what it does when it doesn't know.",
      xp: 50,
      difficulty: "Advanced",
      estMinutes: 5,
      steps: [
        {
          id: "structure",
          label: "Shape the briefing",
          sub: "The skeleton of every reply",
          prompt: "How should a briefing be structured?",
          input: {
            kind: "select",
            options: [
              {
                value:
                  "Structure every reply as: **Bottom line** (one sentence), **Why** (the two or three strongest supporting points), **What would change my mind** (the specific evidence that would flip the conclusion).",
                label: "Bottom line / why / what would change it",
                hint: "Decision-first. Best for busy readers.",
                meta: "executive",
              },
              {
                value:
                  "Structure every reply as: **What we know** (established from supplied material), **What we're inferring** (reasoning, clearly marked as inference), **What we don't know** (the gaps that matter).",
                label: "Known / inferred / unknown",
                hint: "Epistemics-first. Best when the reader will act on the detail.",
                meta: "rigorous",
              },
              {
                value:
                  "Answer in continuous prose with no headings or bullets. Lead with the conclusion in the first sentence and build the argument from there.",
                label: "Continuous prose",
                hint: "Best for short, single-question briefs where structure is overhead.",
                meta: "narrative",
              },
            ],
          },
          rule: { kind: "string", min: 20, max: 600 },
          checklistLabel: "Structure chosen",
          guidance: {
            why: "Structure is where an analyst's honesty becomes visible. A format with a dedicated slot for \"what we don't know\" makes omitting it feel wrong to the model — far more effective than an instruction telling it to be humble.",
            mistakes: [
              "Choosing a three-section structure with a 100-word budget. Check your Mission 3 number against this.",
              "Structure with no slot for uncertainty — the gaps then quietly disappear from every briefing.",
            ],
            docs: [DOCS.agents],
          },
        },
        {
          id: "uncertainty",
          label: "Write the uncertainty policy",
          sub: "What it does when it doesn't know",
          prompt: "What must this analyst do when the evidence is thin or absent?",
          input: {
            kind: "textarea",
            rows: 5,
            placeholder:
              "State plainly that the material doesn't support a conclusion. Name the specific thing you would need. Never fill a gap with a plausible-sounding guess.",
            starters: [
              {
                label: "Name the gap",
                value:
                  "When the supplied material doesn't support a conclusion, say so in the first sentence rather than the last.\nName the specific artifact or data point that would resolve it.\nNever fill a gap with a plausible-sounding guess, and never present an inference with the same confidence as a supplied fact.\nIf asked for a number you were not given, refuse the number and explain what it would take to get it.",
              },
              {
                label: "Label every claim",
                value:
                  "Tag every substantive claim as [given], [inferred], or [unknown].\nIf more than half your claims are [inferred], say so explicitly at the top of the briefing.\nWhen asked to speculate, do it — but label the entire section as speculation and keep it separate from the analysis.",
              },
            ],
          },
          rule: { kind: "string", min: 40, max: 1200, forbid: ["todo", "tbd", "none"] },
          checklistLabel: "Uncertainty policy written",
          guidance: {
            why: "This is the decision that makes the whole campaign worth doing. A model's confidence is a property of its prose style, not of its knowledge — it reads exactly as certain when it's guessing. Only an explicit policy forces that distinction into the output where a human can see it.",
            mistakes: [
              "\"Say if you're unsure.\" Models are never subjectively unsure — you have to name the observable condition, like \"when the material doesn't contain the number\".",
              "Putting the caveat at the end. Readers stop at the conclusion; the caveat has to be adjacent to the claim it qualifies.",
              "Forbidding speculation entirely. Then you get hedged mush. Allow it, but make it wear a label.",
            ],
            docs: [DOCS.agents, DOCS.kb],
          },
        },
      ],
    },

    /* ───────────────────────────── Mission 5 ─────────────────────────────── */
    {
      id: "m5",
      title: "Supply the material",
      tagline: "The evidence itself",
      description:
        "In Mission 2 you set an evidence standard — what counts as established. But nothing has been supplied for it to stand on, so 'supplied material only' currently means 'nothing at all'. This is where the analyst gets something to analyse.",
      xp: 50,
      difficulty: "Moderate",
      estMinutes: 6,
      steps: [
        {
          id: "knowledge",
          label: "Paste the standing material",
          sub: "The reference facts every briefing can rely on",
          prompt:
            "Paste the reference material this analyst should treat as established for every question.",
          input: {
            kind: "textarea",
            rows: 10,
            placeholder:
              "MARKET\nThe workflow-automation segment grew ~18% in the last reported year.\nThree incumbents hold roughly 60% combined share; the long tail is fragmented.\n\nOUR POSITION\nWe compete on time-to-first-value, not feature count.\nMedian onboarding is 4 days against an segment average of 3 weeks.\n\nKNOWN UNKNOWNS\nWe have no reliable data on churn for competitors under 50 employees.",
            starters: [
              {
                label: "Competitive brief example",
                value:
                  "MARKET\nThe workflow-automation segment grew roughly 18% in the last reported year.\nThree incumbents hold about 60% combined share; the remainder is highly fragmented.\nBuyers are increasingly consolidating tools rather than adding them.\n\nOUR POSITION\nWe compete on time-to-first-value, not feature count.\nMedian onboarding is 4 days against a segment average of about 3 weeks.\nWe do not currently offer on-premise deployment; two large incumbents do.\n\nKNOWN UNKNOWNS\nNo reliable churn data for competitors under 50 employees.\nPricing for enterprise tiers is not public for any incumbent.",
              },
              {
                label: "Technical diligence example",
                value:
                  "ENGINEERING SIGNALS\nPublic repo shows 40+ contributors and a 2-week median PR merge time.\nStatus page reports 3 Sev-1 incidents in the last 12 months, all resolved under 90 minutes.\nDocumentation covers every public endpoint; no versioning policy is published.\n\nTEAM\nEngineering headcount roughly 35, up from 20 a year ago.\nNo publicly named CTO since the last one departed 8 months ago.\n\nKNOWN UNKNOWNS\nNo visibility into test coverage, internal tooling, or on-call load.\nPrivate repos are not observable at all.",
              },
            ],
          },
          rule: { kind: "string", min: 60, max: 8000, forbid: ["todo", "tbd", "none", "n/a"] },
          checklistLabel: "Material supplied",
          guidance: {
            why: "Your evidence standard from Mission 2 draws a line between what was supplied and what came from training. That line is meaningless if nothing is ever supplied — the analyst either refuses everything or quietly falls back on stale training data, which is the exact failure the standard existed to prevent. This section is what makes it real.",
            tradeoff: {
              title: "Standing material vs. per-question material",
              columns: [
                {
                  label: "Pasted here",
                  tone: "good",
                  points: [
                    "Applies to every question automatically",
                    "Never missed by a retrieval step",
                    "Costs tokens on every single turn",
                    "Capped at roughly 1,200 words",
                  ],
                },
                {
                  label: "Pasted into the chat",
                  tone: "neutral",
                  points: [
                    "Unlimited, per-conversation",
                    "Only paid for when used",
                    "Has to be re-pasted every session",
                  ],
                },
              ],
            },
            mistakes: [
              "Putting question-specific material here. This is the *standing* context — the things true across every briefing. One-off documents belong in the conversation.",
              "Omitting the known unknowns. An analyst told only what you know will infer confidently across every gap. Naming the gaps is what makes your uncertainty policy enforceable.",
              "Undated figures. \"Grew 18%\" with no period is a claim the analyst will happily present as current forever.",
            ],
            docs: [DOCS.kb, DOCS.agents],
          },
        },
      ],
    },
  ],

  /* ── The artifact that grows ───────────────────────────────────────────── */
  artifact: {
    filename: "research-analyst.agent.ts",
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
          { t: "text", v: "// At launch this becomes the exact POST body sent to Lyzr.", cls: "cmt" },
        ],
      },
      { id: "a3", indent: 0, fromMissionId: "m1", tokens: [] },
      {
        id: "a4",
        indent: 0,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "export const ", cls: "kw" },
          { t: "text", v: "analyst", cls: "fn" },
          { t: "text", v: " = {", cls: "punc" },
        ],
      },
      {
        id: "a5",
        indent: 1,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "name: ", cls: "prop" },
          { t: "slot", stepId: "name" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a6",
        indent: 1,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "provider: ", cls: "prop" },
          { t: "slot", stepId: "provider" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a7",
        indent: 1,
        fromMissionId: "m1",
        tokens: [
          { t: "text", v: "role: ", cls: "prop" },
          { t: "slot", stepId: "role" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      { id: "a8", indent: 0, fromMissionId: "m2", tokens: [] },
      {
        id: "a9",
        indent: 1,
        fromMissionId: "m2",
        tokens: [
          { t: "text", v: "goal: ", cls: "prop" },
          { t: "slot", stepId: "goal" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      { id: "a10", indent: 0, fromMissionId: "m2", tokens: [] },
      {
        id: "a11",
        indent: 1,
        fromMissionId: "m2",
        tokens: [
          { t: "text", v: "method", cls: "prop" },
          { t: "text", v: ": {", cls: "punc" },
          { t: "text", v: "  // composed into instructions at launch", cls: "cmt" },
        ],
      },
      {
        id: "a12",
        indent: 2,
        fromMissionId: "m2",
        tokens: [
          { t: "text", v: "evidenceBar: ", cls: "prop" },
          { t: "slot", stepId: "evidence" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a13",
        indent: 2,
        fromMissionId: "m3",
        tokens: [
          { t: "text", v: "reasoningDepth: ", cls: "prop" },
          { t: "slot", stepId: "depth" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a14",
        indent: 2,
        fromMissionId: "m3",
        tokens: [
          { t: "text", v: "maxWords: ", cls: "prop" },
          { t: "slot", stepId: "budget" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a15",
        indent: 2,
        fromMissionId: "m4",
        tokens: [
          { t: "text", v: "briefingShape: ", cls: "prop" },
          { t: "slot", stepId: "structure" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a16",
        indent: 2,
        fromMissionId: "m4",
        tokens: [
          { t: "text", v: "onNotKnowing: ", cls: "prop" },
          { t: "slot", stepId: "uncertainty" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a17",
        indent: 1,
        fromMissionId: "m2",
        tokens: [{ t: "text", v: "},", cls: "punc" }],
      },
      { id: "a19", indent: 0, fromMissionId: "m5", tokens: [] },
      {
        id: "a20",
        indent: 1,
        fromMissionId: "m5",
        tokens: [
          { t: "text", v: "standingMaterial: ", cls: "prop" },
          { t: "slot", stepId: "knowledge" },
          { t: "text", v: ",", cls: "punc" },
        ],
      },
      {
        id: "a18",
        indent: 0,
        fromMissionId: "m1",
        tokens: [{ t: "text", v: "};", cls: "punc" }],
      },
    ],
  },

  assembly: {
    nameStepId: "name",
    modelStepId: "provider",
    roleStepId: "role",
    goalStepId: "goal",
    providerId: "openai",
    // Slightly more range than the support desk: weighing competing readings
    // benefits from not always taking the single highest-probability path.
    temperature: 0.5,
    topP: 0.95,
    instructionsPreamble:
      "Follow every section below exactly. They define how you are permitted to reason, not merely how to format an answer. Where a section constrains you, the constraint wins over producing a fuller-sounding response.",
    instructions: [
      {
        stepId: "knowledge",
        heading:
          "Supplied material — this is what 'supplied' means in your evidence standard below. Anything not derivable from here is inference or unknown, and must be labelled as such",
      },
      { stepId: "evidence", heading: "Evidence standard — what counts as known" },
      { stepId: "depth", heading: "Reasoning method" },
      { stepId: "structure", heading: "Briefing structure" },
      { stepId: "uncertainty", heading: "Uncertainty policy — non-negotiable" },
      { stepId: "budget", heading: "Hard length ceiling (words). Never exceed this." },
    ],
  },
};
