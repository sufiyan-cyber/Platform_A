"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, Check, Rocket, ShieldCheck } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { assembleAgentPayload, outstandingSteps, previewPayload } from "@/lib/assemble";
import { findMissionForStep, missionIndex } from "@/campaigns/types";
import { isReadyToLaunch } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { ErrorBlock } from "@/components/ui/states";
import { cn } from "@/lib/cn";

/**
 * The payoff screen.
 *
 * Two jobs: show the developer exactly what is about to be sent (no magic), then
 * make sending it feel like a launch. If anything is missing it says which
 * decision and offers a one-click jump back — never a dead button.
 */
export function LaunchScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const decisions = useBuildStore((s) => s.build.decisions);
  const launch = useBuildStore((s) => s.launch);
  const doLaunch = useBuildStore((s) => s.doLaunch);
  const goToStage = useBuildStore((s) => s.goToStage);

  const ready = isReadyToLaunch(campaign, decisions);
  const missing = ready ? [] : outstandingSteps(campaign, decisions);

  // Assembling can only throw when incomplete, which `ready` already covers.
  const payload = React.useMemo(() => {
    if (!ready) return null;
    try {
      return assembleAgentPayload(campaign, decisions);
    } catch {
      return null;
    }
  }, [campaign, decisions, ready]);

  return (
    <div className="mx-auto max-w-3xl">
      {/*
        Enter-only swap keyed on which branch is showing — see the note in
        flow-shell.tsx on why there are no exit animations in this codebase.
      */}
      {launch.pending ? (
        <motion.div
          key="sequence"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <LaunchSequence agentName={payload?.name ?? "your agent"} />
        </motion.div>
      ) : (
        <motion.div
          key="ready"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
            <Panel className="relative overflow-hidden p-6 sm:p-8">
              <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-60" />

              <div className="relative">
                <p className="label-caps">Final step</p>
                <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold sm:text-[32px]">
                  Make it real.
                </h1>
                <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-ink-dim">
                  Every decision you made assembles into the config below. Sending it creates a real
                  agent on Lyzr — and then you talk to it.
                </p>

                {!ready ? (
                  <div className="mt-7 rounded-(--radius-card) border border-warn/30 bg-warn-soft p-4">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-warn">
                      <AlertTriangle className="size-4" aria-hidden />
                      {missing.length} decision{missing.length === 1 ? "" : "s"} still open
                    </p>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {missing.map((step) => {
                        const mission = findMissionForStep(campaign, step.id);
                        return (
                          <li key={step.id}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!mission) return;
                                goToStage("mission", mission.id);
                              }}
                              className={cn(
                                "flex w-full cursor-pointer items-center justify-between gap-3 rounded-(--radius-control)",
                                "border border-line bg-surface px-3 py-2.5 text-left text-[12.5px] text-ink-dim",
                                "transition-colors duration-200 hover:border-accent-line hover:text-accent-text",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                              )}
                            >
                              <span>
                                {mission
                                  ? `Mission ${missionIndex(campaign, mission.id) + 1} · ${step.label}`
                                  : step.label}
                              </span>
                              <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  payload && (
                    <div className="mt-7">
                      <div className="flex items-center justify-between gap-3">
                        <PanelTitle>Exactly what gets sent</PanelTitle>
                        <span className="font-mono text-[10.5px] text-ink-mute">
                          POST /v3/agent
                        </span>
                      </div>
                      <pre className="mt-3 max-h-96 overflow-auto rounded-(--radius-card) border border-line bg-code p-4 font-mono text-[11.5px] leading-relaxed text-ink-dim">
                        {previewPayload(payload)}
                      </pre>
                      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-mute">
                        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
                        Sent from this platform&rsquo;s server, which attaches the API key. The
                        credential is never present in your browser.
                      </p>
                    </div>
                  )
                )}

                {launch.error && (
                  <ErrorBlock
                    error={launch.error}
                    onRetry={launch.error.retryable ? () => void doLaunch() : undefined}
                    className="mt-6"
                  />
                )}

                <div className="mt-8 flex justify-end border-t border-line pt-6">
                  <Button size="lg" onClick={() => void doLaunch()} disabled={!ready}>
                    <Rocket className="size-4" aria-hidden />
                    Launch {payload?.name ?? "agent"}
                  </Button>
                </div>
              </div>
            </Panel>
        </motion.div>
      )}
    </div>
  );
}

/**
 * The launch sequence.
 *
 * The steps are honest about what's happening rather than a decorative fake
 * progress bar — and it deliberately never claims completion, because the real
 * completion signal is the screen changing when the server answers.
 */
function LaunchSequence({ agentName }: { agentName: string }) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = React.useState(0);

  const steps = React.useMemo(
    () => [
      "Assembling your decisions into an agent config",
      "Sending it to the agent service",
      "Waiting for the agent to come up",
    ],
    [],
  );

  React.useEffect(() => {
    // Advances on a timer but stops at the last step — it never pretends to
    // finish. The real finish is this component unmounting.
    const timers = [
      setTimeout(() => setStage(1), 900),
      setTimeout(() => setStage(2), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Panel className="relative overflow-hidden p-8 text-center sm:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 aurora" />

        <div className="relative">
          <motion.div
            animate={
              reduceMotion ? {} : { y: [0, -10, 0], rotate: [0, -4, 0] }
            }
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto grid size-16 place-items-center rounded-2xl border border-accent-line bg-accent-soft"
          >
            <Rocket className="size-7 text-accent-text" strokeWidth={1.75} aria-hidden />
          </motion.div>

          <h1 className="mt-7 font-display text-[24px] font-semibold sm:text-[28px]">
            Building {agentName}
          </h1>

          <ul
            role="status"
            aria-live="polite"
            className="mx-auto mt-8 flex max-w-sm flex-col gap-3 text-left"
          >
            {steps.map((label, index) => {
              const done = index < stage;
              const active = index === stage;
              return (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-3 rounded-(--radius-control) border px-3.5 py-3 text-[12.5px]",
                    "transition-colors duration-300",
                    done
                      ? "border-live-line bg-live-soft text-live"
                      : active
                        ? "border-accent-line bg-accent-soft text-accent-text"
                        : "border-line bg-surface-2 text-ink-mute",
                  )}
                >
                  <span aria-hidden className="grid size-4 shrink-0 place-items-center">
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : active ? (
                      <span className="size-2 rounded-full bg-current animate-pulse-live" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current opacity-50" />
                    )}
                  </span>
                  {label}
                </li>
              );
            })}
          </ul>

          <p className="mt-7 text-[11.5px] text-ink-mute">
            This can take up to 30 seconds. Nothing is lost if it fails.
          </p>
        </div>
    </Panel>
  );
}
