/**
 * Campaign schema.
 *
 * Everything a campaign needs — its levels, missions, the single decision each
 * step asks for, how that decision is validated, the guidance shown beside it,
 * how the artifact grows, and how the finished decisions assemble into a Lyzr
 * agent — is expressed *here as data*. Flow logic never branches on a campaign
 * id, so adding a campaign is adding a file to `src/campaigns/` and one entry in
 * `src/campaigns/index.ts`.
 *
 * Hard rule: every type in this file must stay JSON-serialisable. Validation is
 * a declarative descriptor rather than a Zod schema precisely so the same
 * campaign object can be used by the client for instant feedback and by the
 * server as the authority. See src/lib/validation.ts.
 */

export type Difficulty = "Easy" | "Moderate" | "Advanced";

/** Lucide icon keys — resolved in src/components/ui/icon.tsx. No emoji as icons. */
export type IconKey = "headset" | "library" | "workflow" | "sparkles" | "bot";

/* ── Step input ────────────────────────────────────────────────────────────── */

export type StepInputKind = "select" | "text" | "textarea" | "number";

export type SelectOption = {
  value: string;
  label: string;
  /** One line on what picking this actually means. */
  hint: string;
  /** Terse comparison metadata, e.g. "fast · cheap". Rendered monospace. */
  meta?: string;
};

export type StepInput = {
  kind: StepInputKind;
  placeholder?: string;
  /** `select` only. */
  options?: SelectOption[];
  /** `textarea` only. */
  rows?: number;
  /**
   * One-tap starting points. Choosing one fills the field and leaves it fully
   * editable — the developer still owns the decision, they just don't start
   * from a blank box.
   */
  starters?: { label: string; value: string }[];
};

/* ── Validation ────────────────────────────────────────────────────────────── */

export type ValidationRule =
  | {
      kind: "string";
      min?: number;
      max?: number;
      /** Serialised RegExp source, compiled at both ends. */
      pattern?: string;
      patternMessage?: string;
      /** Reject input that is only the placeholder-ish filler, e.g. "todo". */
      forbid?: string[];
    }
  | { kind: "number"; min?: number; max?: number; integer?: boolean }
  | { kind: "enum"; values: string[] };

/* ── Guidance (this is what makes it guided rather than a form) ────────────── */

export type TradeoffColumn = {
  label: string;
  /** Short, scannable. 3–4 max. */
  points: string[];
  /** "cheap" leans neutral-good, "costly" leans warn. Purely presentational. */
  tone?: "neutral" | "good" | "costly";
};

export type Guidance = {
  /** Why this decision exists at all. Always shown. */
  why: string;
  tradeoff?: { title: string; columns: TradeoffColumn[] };
  mistakes: string[];
  docs: { label: string; href: string }[];
};

/* ── Step ──────────────────────────────────────────────────────────────────── */

export type Step = {
  /** Stable and globally unique — persisted as `Decision.stepId`. Never renumber. */
  id: string;
  /** Short name in trackers and previews. */
  label: string;
  /** One line of "what you'll decide" for the no-input preview screen. */
  sub: string;
  /** The actual question, asked in second person. */
  prompt: string;
  input: StepInput;
  rule: ValidationRule;
  checklistLabel: string;
  guidance: Guidance;
};

/* ── Mission & level ───────────────────────────────────────────────────────── */

export type Mission = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  xp: number;
  difficulty: Difficulty;
  estMinutes: number;
  steps: Step[];
};

export type Level = {
  id: string;
  title: string;
  subtitle: string;
  missionIds: string[];
  /** What finishing this level opens up. Shown on the intro screen. */
  reward: string;
};

/* ── The evolving artifact ─────────────────────────────────────────────────── */

export type TokenClass = "kw" | "str" | "fn" | "prop" | "punc" | "cmt" | "plain";

export type ArtifactToken =
  | { t: "text"; v: string; cls?: TokenClass }
  /** Renders the live input for `stepId` while active, the committed value after. */
  | { t: "slot"; stepId: string };

export type ArtifactLine = {
  id: string;
  indent: 0 | 1 | 2;
  tokens: ArtifactToken[];
  /**
   * The line stays hidden until this mission is reached, which is what makes
   * the artifact visibly grow. Use the campaign's first mission id for lines
   * that are present from the start (the "given" boilerplate).
   */
  fromMissionId: string;
};

/* ── Assembly: decisions → Lyzr create-agent payload ───────────────────────── */

/**
 * Which step feeds which Lyzr field. `agent_instructions` is composed from
 * several steps in order, each under its own heading, so the developer can see
 * their own sentences in the final agent.
 *
 * Note that Lyzr separates the *vendor* (`provider_id`, e.g. "openai") from the
 * *model* (`model`, e.g. "gpt-4o-mini"). Only the model is a developer decision;
 * the vendor is campaign configuration, because "which company hosts this" isn't
 * an interesting choice to put in front of someone building their first agent.
 */
export type AgentAssembly = {
  nameStepId: string;
  /** Supplies Lyzr's `model`. */
  modelStepId: string;
  roleStepId: string;
  goalStepId: string;
  /** Lyzr's `provider_id`. Fixed per campaign, not a step. */
  providerId: string;
  /**
   * Required by Lyzr's schema. Set per campaign rather than asked as a step:
   * a support desk wants near-deterministic answers, an analyst benefits from a
   * little more range. Promoting these to a real decision would be a natural
   * next mission.
   */
  temperature: number;
  topP: number;
  instructionsPreamble: string;
  instructions: { stepId: string; heading: string }[];
};

/* ── Campaign ──────────────────────────────────────────────────────────────── */

export type Campaign = {
  id: string;
  name: string;
  tagline: string;
  /** Two or three sentences on the campaign select card. */
  description: string;
  iconKey: IconKey;
  /** Terse stack line, e.g. "Lyzr · GPT-4o mini". */
  badge: string;
  difficulty: Difficulty;
  estMinutes: number;
  /** The concrete thing they walk away with. */
  outcome: string;
  /** Present ⇒ the card is a future slot, not startable. */
  locked?: { reason: string };
  /**
   * Live retrieval for this campaign's agent.
   *
   * Present ⇒ every chat turn runs a web search first and the results are
   * injected as context, with the citations shown under the reply. Absent ⇒
   * nothing about the turn changes.
   *
   * This is a *campaign data* field rather than a check on the campaign id, per
   * the hard rule at the top of this file: the chat routes ask "does this
   * campaign declare retrieval?", never "is this the research analyst?". Opting
   * another campaign in is adding two lines to its data file. Opting this one
   * back out — if the provider is down five minutes before a demo — is deleting
   * them, with no route or component touched.
   *
   * Note that retrieval changes what the agent can *look up*, never what it can
   * *do*: NO_ACTIONS_CLAUSE in src/lib/assemble.ts still applies in full.
   */
  retrieval?: { kind: "web"; maxSources: number };
  levels: Level[];
  missions: Mission[];
  artifact: { filename: string; lines: ArtifactLine[] };
  assembly: AgentAssembly;
};

/* ── Derived helpers (pure, used on both sides of the wire) ────────────────── */

export function allSteps(campaign: Campaign): Step[] {
  return campaign.missions.flatMap((m) => m.steps);
}

export function findStep(campaign: Campaign, stepId: string): Step | undefined {
  return allSteps(campaign).find((s) => s.id === stepId);
}

export function findMissionForStep(campaign: Campaign, stepId: string): Mission | undefined {
  return campaign.missions.find((m) => m.steps.some((s) => s.id === stepId));
}

export function missionById(campaign: Campaign, missionId: string): Mission | undefined {
  return campaign.missions.find((m) => m.id === missionId);
}

export function levelForMission(campaign: Campaign, missionId: string): Level | undefined {
  return campaign.levels.find((l) => l.missionIds.includes(missionId));
}

export function missionIndex(campaign: Campaign, missionId: string): number {
  return campaign.missions.findIndex((m) => m.id === missionId);
}

export function totalXp(campaign: Campaign): number {
  return campaign.missions.reduce((sum, m) => sum + m.xp, 0);
}

export function levelXp(campaign: Campaign, level: Level): number {
  return level.missionIds.reduce((sum, id) => sum + (missionById(campaign, id)?.xp ?? 0), 0);
}
