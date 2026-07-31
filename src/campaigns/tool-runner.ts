import type { Campaign } from "@/campaigns/types";

/**
 * Campaign 03 — Tool Runner. A future slot.
 *
 * Present as data so the select screen has a real "what's next" without any
 * placeholder handling in the flow. It carries a `locked` reason, which is the
 * only thing that makes it unstartable — everything else is a normal campaign
 * and it becomes playable the moment that field is removed and the missions are
 * filled in.
 */
export const toolRunnerCampaign: Campaign = {
  id: "tool-runner",
  name: "Tool Runner",
  tagline: "An agent that calls real systems instead of describing them.",
  description:
    "Connect an agent to external tools and a knowledge base, then decide when it's allowed to act rather than answer. The hard decisions here are about permission, not prose.",
  iconKey: "workflow",
  badge: "Lyzr · Tools + KB",
  difficulty: "Advanced",
  estMinutes: 30,
  outcome: "An agent that can retrieve from your documents and call external tools.",
  locked: {
    // Status, verified against the live API rather than assumed:
    //   • KB creation works with Lyzr-managed credentials
    //     (POST rag-prod.../v3/rag/ with lyzr_openai + lyzr_qdrant) — no setup.
    //   • Ingestion works: POST rag-prod.../v3/rag/train/{rag_id}/ with
    //     [{ id_, text, metadata: { source, file_name } }].
    //   • KNOWLEDGE_BASE is a valid agent feature type (RAG and
    //     OPENAI_VECTOR_STORE are rejected).
    //   • UNRESOLVED: an agent carrying that feature still answers "I do not
    //     know" — the config binding is accepted but retrieval returns nothing.
    // Until that last step is proven, the campaigns ground agents by pasting
    // facts into instructions instead. See the "Grounding" level.
    reason:
      "Retrieval-backed agents are still being wired up. Until then, the Grounding level in the campaigns above puts your facts directly into the agent.",
  },

  levels: [
    {
      id: "l1",
      title: "Grounding",
      subtitle: "Attach a knowledge base and decide how it retrieves.",
      missionIds: [],
      reward: "Unlocks the tool level.",
    },
    {
      id: "l2",
      title: "Action",
      subtitle: "Connect a tool and decide when the agent is allowed to use it.",
      missionIds: [],
      reward: "Unlocks launch.",
    },
  ],

  missions: [],

  artifact: { filename: "tool-runner.agent.ts", lines: [] },

  assembly: {
    nameStepId: "name",
    modelStepId: "provider",
    roleStepId: "role",
    goalStepId: "goal",
    providerId: "openai",
    temperature: 0.4,
    topP: 0.9,
    instructionsPreamble: "",
    instructions: [],
  },
};
