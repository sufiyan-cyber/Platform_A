"use client";

import { ArrowRight, Cloud, Code2, KeyRound, Rocket, Route, Save } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { totalXp } from "@/campaigns/types";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { CampaignIcon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Level 0 — orientation. No gating, no XP, no input.
 *
 * Everything runs in-platform (Lyzr executes the agent), so there is nothing to
 * clone and nothing to install. This screen exists purely to set expectations so
 * the first real decision doesn't arrive cold.
 */
export function OrientationScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const goToStage = useBuildStore((s) => s.goToStage);
  const setMode = useBuildStore((s) => s.setMode);
  const decisionCount = campaign.missions.reduce((sum, m) => sum + m.steps.length, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Panel className="p-6 sm:p-8">
        <p className="font-mono text-[11px] text-ink-mute">
          <span className="text-accent-text">Level 0</span> · Orientation
        </p>

        <div className="mt-4 flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-(--radius-card) border border-accent-line bg-accent-soft text-accent-text">
            <CampaignIcon iconKey={campaign.iconKey} className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-[26px] leading-tight font-semibold sm:text-[30px]">
              {campaign.name}
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-accent-text/80">
              {campaign.tagline}
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-[68ch] text-[14px] leading-relaxed text-ink-dim">
          {campaign.description}
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Cloud,
              title: "Nothing to install",
              body: "No repo to clone, no environment to set up. Your agent runs on Lyzr.",
            },
            {
              icon: Save,
              title: "Nothing to lose",
              body: "Every decision saves the moment you make it. Close the tab whenever.",
            },
            {
              icon: Rocket,
              title: "It ends live",
              body: `${decisionCount} decisions, then a real agent you can talk to.`,
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-(--radius-card) border border-line bg-surface-2 p-4">
              <Icon className="size-4 text-accent-text" strokeWidth={1.75} aria-hidden />
              <p className="mt-2.5 font-display text-[13px] font-semibold">{title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 rounded-(--radius-card) border border-line bg-surface-2 p-4">
          <PanelTitle>What you&rsquo;ll walk out with</PanelTitle>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">{campaign.outcome}</p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Chip tone="accent">{totalXp(campaign)} XP available</Chip>
            <Chip>{campaign.levels.length} levels</Chip>
            <Chip>{campaign.missions.length} missions</Chip>
            <Chip>~{campaign.estMinutes} min</Chip>
          </div>
        </div>

        <p className="mt-5 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-mute">
          <KeyRound className="mt-px size-3.5 shrink-0" aria-hidden />
          Your agent is created through this platform&rsquo;s server. The Lyzr credentials never
          reach your browser.
        </p>

        {/*
          The choice is made here, once, in the open — rather than left to a
          toggle in the header that a first-time visitor has no reason to notice.
          Neither option is a commitment: the header toggle switches at any
          point, and both write to the same build.
        */}
        <div className="mt-7 border-t border-line pt-6">
          <PanelTitle>Two ways to build it</PanelTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PathCard
              icon={Route}
              title="Guided"
              body={`${decisionCount} decisions, one at a time, each with the trade-off behind it explained beside the field.`}
              action="Start Level 1"
              recommended
              onClick={() => goToStage("level-intro")}
            />
            <PathCard
              icon={Code2}
              title="Code"
              body="The whole agent as one file in an editor. Same fields, same rules, same launch — in any order you like."
              action="Open the editor"
              onClick={() => setMode("code")}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function PathCard({
  icon: Icon,
  title,
  body,
  action,
  recommended,
  onClick,
}: {
  icon: typeof Route;
  title: string;
  body: string;
  action: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer flex-col rounded-(--radius-card) border p-4 text-left",
        "transition-[border-color,background-color] duration-250",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
        recommended
          ? "border-accent-line bg-accent-soft/40 hover:border-accent-bright"
          : "border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={cn("size-4", recommended ? "text-accent-text" : "text-ink-dim")}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="font-display text-[14px] font-semibold">{title}</span>
        {recommended && <Chip tone="accent">start here</Chip>}
      </span>

      <span className="mt-2 flex-1 text-[12.5px] leading-relaxed text-ink-mute">{body}</span>

      <span
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold",
          "transition-transform duration-200 group-hover:translate-x-0.5",
          "motion-reduce:group-hover:translate-x-0",
          recommended ? "text-accent-text" : "text-ink-dim",
        )}
      >
        {action}
        <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}
