"use client";

import { useBuildStore } from "@/store/build-provider";
import { ElapsedTimer, SyncBanner, UrlSync } from "@/components/build/session";
import { FlowShell } from "@/components/flow/flow-shell";
import { IdeShell } from "@/components/ide/ide-shell";
import { MentorDock } from "@/components/shell/mentor-dock";

/**
 * One build, two ways to work on it.
 *
 * The switch is at the top so everything that belongs to the *session* rather
 * than to a way of working — the timer, the URL, sync failures, the Mentor —
 * survives moving between them. Both shells read the same store and write the
 * same decisions; neither owns the build.
 */
export function BuildWorkspace({ handle }: { handle: string }) {
  const mode = useBuildStore((s) => s.mode);

  return (
    <>
      <ElapsedTimer />
      <UrlSync />
      <SyncBanner />

      {mode === "code" ? <IdeShell handle={handle} /> : <FlowShell handle={handle} />}

      <MentorDock />
    </>
  );
}
