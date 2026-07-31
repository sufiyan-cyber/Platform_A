import {
  Bot,
  Headset,
  Library,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/campaigns/types";

/**
 * Campaign icons.
 *
 * Icons are resolved from a key rather than stored in campaign data, because
 * campaign data has to stay serialisable and because this keeps every icon in
 * the product coming from one family at one stroke weight — no emoji, no mixed
 * icon sets.
 */
const ICONS: Record<IconKey, LucideIcon> = {
  headset: Headset,
  library: Library,
  workflow: Workflow,
  sparkles: Sparkles,
  bot: Bot,
};

export function CampaignIcon({
  iconKey,
  className,
}: {
  iconKey: IconKey;
  className?: string;
}) {
  const Icon = ICONS[iconKey] ?? Bot;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
