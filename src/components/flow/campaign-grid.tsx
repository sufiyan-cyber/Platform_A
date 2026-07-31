"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Clock, Lock, Radio, Zap } from "lucide-react";
import type { Campaign } from "@/campaigns/types";
import { totalXp } from "@/campaigns/types";
import type { BuildSummary } from "@/server/builds";
import { CampaignIcon } from "@/components/ui/icon";
import { Chip } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export function CampaignGrid({
  campaigns,
  summaries,
  className,
}: {
  campaigns: Campaign[];
  summaries: BuildSummary[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <ul className={cn("grid gap-4 md:grid-cols-2", className)}>
      {campaigns.map((campaign, index) => (
        <motion.li
          key={campaign.id}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          // Staggered entrance at 45ms — enough to read as sequence, not delay.
          transition={{ duration: 0.35, delay: reduceMotion ? 0 : index * 0.045, ease: [0.22, 1, 0.36, 1] }}
        >
          <CampaignCard
            campaign={campaign}
            summary={summaries.find((s) => s.campaignId === campaign.id)}
          />
        </motion.li>
      ))}
    </ul>
  );
}

function CampaignCard({ campaign, summary }: { campaign: Campaign; summary?: BuildSummary }) {
  const router = useRouter();
  const [navigating, setNavigating] = React.useState(false);

  const locked = Boolean(campaign.locked);
  const xpMax = totalXp(campaign);
  const stepCount = campaign.missions.reduce((sum, m) => sum + m.steps.length, 0);
  const answered = summary?.answeredStepIds.length ?? 0;
  const progress = stepCount > 0 ? answered / stepCount : 0;
  const launched = summary?.status === "launched";

  function open() {
    if (locked || navigating) return;
    setNavigating(true);
    router.push(`/build/${campaign.id}`);
  }

  const Wrapper = locked ? "div" : "button";

  return (
    <Wrapper
      {...(locked
        ? { "aria-disabled": true }
        : { type: "button" as const, onClick: open, "aria-busy": navigating || undefined })}
      className={cn(
        "group relative flex h-full w-full flex-col rounded-(--radius-panel) border p-5 text-left",
        "transition-[border-color,background-color,transform] duration-250",
        locked
          ? "cursor-not-allowed border-line bg-surface/40"
          : [
              "cursor-pointer border-line bg-surface hover:-translate-y-0.5 hover:border-accent-bright",
              "motion-reduce:hover:translate-y-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
            ],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-(--radius-card) border",
            locked
              ? "border-line bg-surface-2 text-ink-mute"
              : "border-accent-line bg-accent-soft text-accent-text",
          )}
        >
          <CampaignIcon iconKey={campaign.iconKey} className="size-5" />
        </div>

        {launched ? (
          <Chip tone="live">
            <Radio className="size-3" aria-hidden />
            Live
          </Chip>
        ) : locked ? (
          <Chip>
            <Lock className="size-3" aria-hidden />
            Coming soon
          </Chip>
        ) : (
          <Chip tone="accent">{campaign.badge}</Chip>
        )}
      </div>

      <h2
        className={cn(
          "mt-4 font-display text-[17px] font-semibold",
          locked ? "text-ink-dim" : "text-ink",
        )}
      >
        {campaign.name}
      </h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-accent-text/80">{campaign.tagline}</p>
      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-dim">{campaign.description}</p>

      {locked ? (
        <p className="mt-5 flex items-start gap-2 rounded-(--radius-control) border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-mute">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
          {campaign.locked?.reason}
        </p>
      ) : (
        <>
          {/* Progress rail only appears once there is progress to show. */}
          {answered > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] text-ink-mute">
                <span>
                  {launched ? "Agent launched" : `${answered} of ${stepCount} decisions made`}
                </span>
                <span className="font-mono tnum text-accent-text">{summary?.xp ?? 0} XP</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${campaign.name} progress`}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    launched ? "bg-live" : "bg-accent-bright",
                  )}
                  style={{ width: `${Math.max(4, progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-mute">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden />~{campaign.estMinutes} min
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="size-3.5" aria-hidden />
                {xpMax} XP
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5" aria-hidden />
                {campaign.difficulty}
              </span>
            </div>

            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold",
                "text-accent-text transition-transform duration-200",
                "group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0",
              )}
            >
              {launched ? "Open" : answered > 0 ? "Resume" : "Start"}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </div>
        </>
      )}
    </Wrapper>
  );
}
