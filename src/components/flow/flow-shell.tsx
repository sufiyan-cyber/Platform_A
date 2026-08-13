"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Zap } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { campaignProgress, formatElapsed, type Stage } from "@/lib/flow";
import { totalXp } from "@/campaigns/types";
import { OrientationScreen } from "@/components/flow/orientation-screen";
import {
  LevelCompleteScreen,
  LevelIntroScreen,
  MissionCompleteScreen,
  MissionPreviewScreen,
} from "@/components/flow/level-screens";
import { MissionScreen } from "@/components/flow/mission-screen";
import { LaunchScreen } from "@/components/flow/launch-screen";
import { ChatScreen } from "@/components/flow/chat-screen";
import { ModeToggle } from "@/components/build/mode-toggle";
import { UserBadge } from "@/components/shell/user-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The guided shell: persistent chrome and the stage router.
 *
 * Session-level concerns (the timer, URL sync, the sync banner, the Mentor) sit
 * one level up in `BuildWorkspace`, because they belong to the build rather than
 * to this way of working through it — switching to the editor must not restart
 * the clock.
 */
export function FlowShell({ handle }: { handle: string }) {
  const stage = useBuildStore((s) => s.stage);
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[380px] aurora" />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <TopBar handle={handle} />

        <main id="main" className="mt-6">
          {/*
            One transition rhythm for every screen change: forward motion is
            up-and-in, which reads as progression.

            Enter-only, driven by the `key` change, rather than AnimatePresence
            with an exit. Exit animations are the fragile half of the API — if
            an exit never settles under `mode="wait"`, the incoming screen never
            mounts and the flow is simply stuck. A screen transition is not
            worth that failure mode, and the outgoing 200ms fade was never the
            part anyone noticed.
          */}
          <motion.div
            key={stage}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <StageView stage={stage} />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/**
 * The stage router. Kept as a plain switch with no animation of its own — the
 * `motion.div` wrapping it is a *direct* child of `AnimatePresence`, which is
 * what lets the exit animation resolve. Nesting the motion component inside a
 * custom child leaves `mode="wait"` waiting forever for a removal signal it
 * never receives.
 */
function StageView({ stage }: { stage: Stage }) {
  switch (stage) {
    case "orientation":
      return <OrientationScreen />;
    case "level-intro":
      return <LevelIntroScreen />;
    case "mission-preview":
      return <MissionPreviewScreen />;
    case "mission":
      return <MissionScreen />;
    case "mission-complete":
      return <MissionCompleteScreen />;
    case "level-complete":
      return <LevelCompleteScreen />;
    case "launch":
      return <LaunchScreen />;
    case "chat":
      return <ChatScreen />;
  }
}

/* ── Top bar ───────────────────────────────────────────────────────────────── */

function TopBar({ handle }: { handle: string }) {
  const campaign = useBuildStore((s) => s.campaign);
  const xp = useBuildStore((s) => s.build.xp);
  const decisions = useBuildStore((s) => s.build.decisions);
  const elapsedMs = useBuildStore((s) => s.elapsedMs);

  const progress = campaignProgress(campaign, decisions);
  const max = totalXp(campaign);

  return (
    <header className="sticky top-0 z-40 -mx-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/campaigns" aria-label="Back to campaigns">
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[14px] font-semibold">{campaign.name}</p>
            <UserBadge handle={handle} compact className="mt-0.5" />
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-5">
          <ModeToggle />

          <div className="hidden w-40 lg:block">
            <div className="flex items-center justify-between text-[10px] text-ink-mute">
              <span className="label-caps">Progress</span>
              <span className="font-mono tnum">{Math.round(progress * 100)}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Campaign progress"
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <motion.div
                className="h-full rounded-full bg-accent-bright"
                initial={false}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>

          <Stat label="Elapsed" value={formatElapsed(elapsedMs)} tone="live" />
          <Stat label="XP" value={`${xp}`} suffix={`/ ${max}`} tone="accent" icon={Zap} />
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: "accent" | "live";
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="label-caps">{label}</span>
      <span
        className={cn(
          "mt-0.5 inline-flex items-baseline gap-1 font-mono text-[15px] font-semibold tnum",
          tone === "accent" ? "text-accent-text" : "text-live",
        )}
      >
        {Icon && <Icon className="size-3.5 self-center" aria-hidden />}
        {value}
        {suffix && <span className="text-[11px] font-normal text-ink-mute">{suffix}</span>}
      </span>
    </div>
  );
}
