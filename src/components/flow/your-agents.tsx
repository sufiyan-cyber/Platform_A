"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Copy } from "lucide-react";
import type { Campaign } from "@/campaigns/types";
import type { BuildSummary } from "@/server/builds";
import { CampaignIcon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/**
 * Everything this developer has actually shipped, on the screen they land on.
 *
 * None of this is new state — launch details, XP and the share token were always
 * persisted per user per campaign, and reopening a finished campaign already
 * dropped you back on its finale. What was missing was anywhere that *showed*
 * it, so durability was a claim rather than something you could see.
 *
 * Renders nothing at all until the first launch: a new developer should see the
 * campaign picker, not an empty shelf explaining what they haven't done.
 */
export function YourAgents({
  campaigns,
  summaries,
  className,
}: {
  campaigns: Campaign[];
  summaries: BuildSummary[];
  className?: string;
}) {
  const launched = summaries
    .filter((s) => s.status === "launched" && s.agentName)
    .map((summary) => ({
      summary,
      campaign: campaigns.find((c) => c.id === summary.campaignId),
    }))
    .filter((row): row is { summary: BuildSummary; campaign: Campaign } => Boolean(row.campaign));

  if (launched.length === 0) return null;

  return (
    <Panel className={cn("overflow-hidden", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3.5">
        <PanelTitle>Your agents</PanelTitle>
        <span className="font-mono text-[10.5px] text-ink-mute tnum">
          {launched.length} live
        </span>
      </div>

      <ul className="divide-y divide-line">
        {launched.map(({ summary, campaign }) => (
          <AgentRow key={summary.campaignId} summary={summary} campaign={campaign} />
        ))}
      </ul>
    </Panel>
  );
}

function AgentRow({ summary, campaign }: { summary: BuildSummary; campaign: Campaign }) {
  const [copied, setCopied] = React.useState(false);

  async function copyLink() {
    if (!summary.shareToken) return;
    // Origin read at click time, not render time — `window` doesn't exist while
    // this is server-rendered, and a click can only happen in a browser.
    const url = `${window.location.origin}/a/${summary.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Public link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — open the agent and copy it from the share panel.");
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-(--radius-control) border border-live-line bg-live-soft">
        <CampaignIcon iconKey={campaign.iconKey} className="size-4.5 text-live" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{summary.agentName}</p>
        <p className="truncate text-[11px] text-ink-mute">
          {campaign.name}
          {summary.launchedAt && (
            <>
              {" · "}
              <time dateTime={summary.launchedAt}>
                {new Date(summary.launchedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </>
          )}
          {summary.xp > 0 && ` · ${summary.xp} XP`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {summary.shareToken ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyLink()}
            aria-label={`Copy public link for ${summary.agentName}`}
            // The label is hidden below `sm`, leaving an icon-only button that
            // `px-3` alone sizes to 38px. `size="sm"` already grows to 44px tall
            // on a coarse pointer but never widens, so the floor goes here.
            className="min-w-11"
          >
            {copied ? (
              <Check className="size-3.5 text-live" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          </Button>
        ) : (
          // Honest about why there's no button, rather than showing a dead one.
          <span className="hidden text-[11px] text-ink-mute sm:inline">Not shared</span>
        )}

        <Button asChild variant="subtle" size="sm">
          <Link href={`/build/${campaign.id}`}>
            Open
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </li>
  );
}
