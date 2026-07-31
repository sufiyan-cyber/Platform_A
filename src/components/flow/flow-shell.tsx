"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, WifiOff, X, Zap } from "lucide-react";
import { useBuildStore, useBuildStoreApi } from "@/store/build-provider";
import { campaignProgress, formatElapsed, isStage, type Stage } from "@/lib/flow";
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
import { MentorDock } from "@/components/shell/mentor-dock";
import { UserBadge } from "@/components/shell/user-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The flow shell: persistent chrome, the stage router, and the two background
 * concerns (elapsed time and URL sync) that would otherwise be scattered.
 */
export function FlowShell({ handle }: { handle: string }) {
  const stage = useBuildStore((s) => s.stage);
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[380px] aurora" />

      <ElapsedTimer />
      <UrlSync />
      <SyncBanner />

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

      <MentorDock />
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

        <div className="flex items-center gap-5">
          <div className="hidden w-40 sm:block">
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

/* ── Background concerns ───────────────────────────────────────────────────── */

/**
 * Elapsed time.
 *
 * Ticks locally every second but persists at most every 20s, and once more on
 * unload — frequent enough that a crash loses seconds, rare enough that it isn't
 * a write per tick.
 */
function ElapsedTimer() {
  const store = useBuildStoreApi();

  React.useEffect(() => {
    let sinceFlush = 0;

    const interval = setInterval(() => {
      // Pause while the tab is hidden: counting time the developer isn't here
      // would make the number a lie.
      if (document.visibilityState !== "visible") return;

      store.getState().tick(1000);
      sinceFlush += 1000;

      if (sinceFlush >= 20_000) {
        sinceFlush = 0;
        void store.getState().flushElapsed();
      }
    }, 1000);

    const onHide = () => {
      if (document.visibilityState === "hidden") void store.getState().flushElapsed();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      void store.getState().flushElapsed();
    };
  }, [store]);

  return null;
}

/**
 * Mirrors the stage into `?stage=` so back/forward and shared links land on the
 * right screen.
 *
 * Uses `history.pushState` directly rather than `router.replace`: the App
 * Router's navigation would re-run the server component on every stage change,
 * which both costs a round trip and risks re-seeding the store from a snapshot
 * taken before the position had finished persisting — i.e. the UI silently
 * rewinding a screen. A shallow history entry has neither problem, and Next
 * picks the new URL up on the next real navigation.
 */
function UrlSync() {
  const store = useBuildStoreApi();
  const stage = useBuildStore((s) => s.stage);

  // Store → URL.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("stage") === stage) return;

    url.searchParams.set("stage", stage);
    window.history.pushState(window.history.state, "", url);
  }, [stage]);

  // URL → store, for back/forward.
  React.useEffect(() => {
    const onPopState = () => {
      const fromUrl = new URL(window.location.href).searchParams.get("stage");
      if (fromUrl && isStage(fromUrl) && fromUrl !== store.getState().stage) {
        store.getState().goToStage(fromUrl);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [store]);

  return null;
}

/**
 * Background-sync failures. Surfaced once, dismissible, and never blocking —
 * the developer's decisions are still in the browser and will retry on the next
 * action.
 */
function SyncBanner() {
  const syncError = useBuildStore((s) => s.syncError);
  const clear = useBuildStore((s) => s.clearSyncError);
  const refresh = useBuildStore((s) => s.refresh);

  React.useEffect(() => {
    if (syncError?.code === "unauthorized") {
      toast.error("Your session expired. Sign in again to keep going.");
    }
  }, [syncError]);

  if (!syncError) return null;

  return (
    <motion.div
      role="status"
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="fixed inset-x-0 top-0 z-90 flex justify-center px-4 pt-3"
    >
      <div className="flex items-center gap-3 rounded-full border border-warn/30 bg-warn-soft px-4 py-2.5 shadow-lg">
        <WifiOff className="size-4 shrink-0 text-warn" aria-hidden />
        <p className="text-[12.5px] text-warn">{syncError.message}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="cursor-pointer text-[12px] font-semibold text-warn underline underline-offset-4"
        >
          Resync
        </button>
        <button
          type="button"
          onClick={clear}
          aria-label="Dismiss"
          className="cursor-pointer text-warn/70 hover:text-warn"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}
