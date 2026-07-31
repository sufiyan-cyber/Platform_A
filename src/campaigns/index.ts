import type { Campaign } from "@/campaigns/types";
import { supportDeskCampaign } from "@/campaigns/support-desk";
import { researchAnalystCampaign } from "@/campaigns/research-analyst";
import { toolRunnerCampaign } from "@/campaigns/tool-runner";

/**
 * The campaign registry — the only file that changes when you add a campaign.
 *
 * Order here is the order on the select screen.
 */
export const CAMPAIGNS: Campaign[] = [
  supportDeskCampaign,
  researchAnalystCampaign,
  toolRunnerCampaign,
];

export function getCampaign(id: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

/** Throws-if-missing variant for route handlers, which map this to a 404. */
export function getCampaignOrThrow(id: string): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error(`Unknown campaign: ${id}`);
  return campaign;
}

export function isPlayable(campaign: Campaign): boolean {
  return !campaign.locked;
}

export * from "@/campaigns/types";
