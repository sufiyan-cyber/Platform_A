"use client";

import * as React from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { WifiOff, X } from "lucide-react";
import { useBuildStore, useBuildStoreApi } from "@/store/build-provider";
import { isStage } from "@/lib/flow";
import { isBuildMode, MODE_PARAM } from "@/lib/mode";

/**
 * The three background concerns that belong to a build session rather than to
 * any one way of working through it.
 *
 * They live here, above the shell switch, so the timer keeps counting and the
 * URL keeps up whether the developer is on the guided screens or in the editor —
 * moving between the two must not restart a session.
 */

/**
 * Elapsed time.
 *
 * Ticks locally every second but persists at most every 20s, and once more on
 * unload — frequent enough that a crash loses seconds, rare enough that it isn't
 * a write per tick.
 */
export function ElapsedTimer() {
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
 * Mirrors the stage and the build mode into the query string, so back/forward
 * and shared links land on the right screen in the right editor.
 *
 * Uses `history.pushState` directly rather than `router.replace`: the App
 * Router's navigation would re-run the server component on every stage change,
 * which both costs a round trip and risks re-seeding the store from a snapshot
 * taken before the position had finished persisting — i.e. the UI silently
 * rewinding a screen. A shallow history entry has neither problem, and Next
 * picks the new URL up on the next real navigation.
 */
export function UrlSync() {
  const store = useBuildStoreApi();
  const stage = useBuildStore((s) => s.stage);
  const mode = useBuildStore((s) => s.mode);

  // Store → URL.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("stage") === stage && url.searchParams.get(MODE_PARAM) === mode) {
      return;
    }

    url.searchParams.set("stage", stage);
    url.searchParams.set(MODE_PARAM, mode);
    window.history.pushState(window.history.state, "", url);
  }, [stage, mode]);

  // URL → store, for back/forward.
  React.useEffect(() => {
    const onPopState = () => {
      const params = new URL(window.location.href).searchParams;

      const fromUrl = params.get("stage");
      if (fromUrl && isStage(fromUrl) && fromUrl !== store.getState().stage) {
        store.getState().goToStage(fromUrl);
      }

      const modeFromUrl = params.get(MODE_PARAM);
      if (isBuildMode(modeFromUrl) && modeFromUrl !== store.getState().mode) {
        store.getState().setMode(modeFromUrl);
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
export function SyncBanner() {
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
