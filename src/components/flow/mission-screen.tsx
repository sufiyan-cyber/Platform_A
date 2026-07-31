"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Circle, Clock, Lock, Zap } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { missionById, missionIndex, levelForMission, type Mission, type Step } from "@/campaigns/types";
import { validateStep } from "@/lib/validation";
import { ArtifactPanel } from "@/components/flow/artifact-panel";
import { DecisionInput } from "@/components/flow/decision-input";
import { GuidancePanel } from "@/components/flow/guidance-panel";
import { Button } from "@/components/ui/button";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/**
 * The step experience — where developers spend almost all their time.
 *
 * Layout is a three-column workspace on large screens (mission rail · artifact +
 * decision · guidance) that collapses to a single column on small ones, with
 * guidance moving below the decision rather than being hidden behind a control
 * nobody would find.
 */
export function MissionScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const decisions = useBuildStore((s) => s.build.decisions);
  const drafts = useBuildStore((s) => s.drafts);
  const fieldErrors = useBuildStore((s) => s.fieldErrors);
  const missionId = useBuildStore((s) => s.missionId);
  const stepIndex = useBuildStore((s) => s.stepIndex);
  const savingStepId = useBuildStore((s) => s.savingStepId);
  const setDraft = useBuildStore((s) => s.setDraft);
  const advance = useBuildStore((s) => s.advance);
  const goToStep = useBuildStore((s) => s.goToStep);

  const inputRef = React.useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const mission = missionById(campaign, missionId);
  const step = mission?.steps[stepIndex];

  if (!mission || !step) return null;

  const level = levelForMission(campaign, mission.id);
  const draft = drafts[step.id] ?? "";
  const error = fieldErrors[step.id];
  const saving = savingStepId === step.id;

  const outcome = validateStep(step, draft);
  const canContinue = outcome.valid && !saving;
  const isLastStep = stepIndex === mission.steps.length - 1;

  return (
    /*
      Three columns on wide screens, one on narrow — but each region is rendered
      exactly once and placed with grid coordinates rather than being duplicated
      behind responsive visibility classes. Duplicating would put the guidance
      copy in the accessibility tree twice.
     */
    <div className="grid items-start gap-5 xl:grid-cols-[204px_minmax(0,1fr)_288px]">
      {/* ── Mission rail ───────────────────────────────────────────────────── */}
      <MissionRail className="max-xl:hidden xl:col-start-1 xl:row-span-2 xl:row-start-1" />

      {/* ── Workspace ──────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-1">
        <Panel className="p-5 sm:p-6">
          <nav aria-label="Breadcrumb" className="font-mono text-[11px] text-ink-mute">
            <span className="text-accent-text">{level?.title ?? "Level"}</span>
            <span aria-hidden> · </span>
            <span>
              Mission {missionIndex(campaign, mission.id) + 1} of {campaign.missions.length}
            </span>
          </nav>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[22px] leading-tight font-semibold sm:text-[25px]">
                {mission.title}
              </h1>
              <p className="mt-1.5 max-w-[64ch] text-[13px] leading-relaxed text-ink-dim">
                {mission.description}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Chip tone="accent">
                <Zap className="size-3" aria-hidden />+{mission.xp} XP
              </Chip>
              <Chip tone="warn">{mission.difficulty}</Chip>
              <Chip>
                <Clock className="size-3" aria-hidden />~{mission.estMinutes}m
              </Chip>
            </div>
          </div>

          <StepTracker
            steps={mission.steps}
            activeIndex={stepIndex}
            decisions={decisions}
            onSelect={goToStep}
            className="mt-5"
          />
        </Panel>

        <ArtifactPanel
          campaign={campaign}
          decisions={decisions}
          currentMissionId={mission.id}
          activeStepId={step.id}
          draft={draft}
          onSlotActivate={() => inputRef.current?.focus()}
        />

        {/* ── The decision ─────────────────────────────────────────────────── */}
        <Panel className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <PanelTitle>
              Decision {stepIndex + 1} of {mission.steps.length}
            </PanelTitle>
            <span className="font-mono text-[10.5px] text-ink-mute">{step.label}</span>
          </div>

          {/*
            Keyed on step id so the whole decision slides in when it changes —
            the spatial cue that this is a *new* question, not an edit of the
            old one. Enter-only: see the note in flow-shell.tsx on why exits are
            deliberately absent.
          */}
          <motion.div
            key={step.id}
            initial={reduceMotion ? false : { opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4"
          >
            <DecisionInput
              step={step}
              value={draft}
              error={error}
              saved={decisions[step.id] !== undefined && outcome.valid}
              disabled={saving}
              onChange={(value) => setDraft(step.id, value)}
              onSubmit={() => void advance()}
              inputRef={inputRef}
            />
          </motion.div>
        </Panel>

      </div>

      {/* ── Guidance ───────────────────────────────────────────────────────── */}
      <GuidancePanel step={step} className="xl:col-start-3 xl:row-start-1 xl:sticky xl:top-6" />

      {/* ── Checklist + continue ─────────────────────────────────────────────
          Last in DOM order, which is also the right reading order on mobile:
          reference material first, the action that moves you on last. */}
      <div className="xl:col-start-2 xl:row-start-2">
        <Panel inset className="p-5 sm:p-6">
          <PanelTitle>Mission checklist</PanelTitle>
          <ul className="mt-3 flex flex-col">
            {mission.steps.map((missionStep, index) => {
              const done = validateStep(missionStep, decisions[missionStep.id]).valid;
              const active = index === stepIndex;
              return (
                <li
                  key={missionStep.id}
                  className={cn(
                    "flex items-center gap-3 border-b border-line py-2.5 last:border-b-0",
                    "text-[13px]",
                    done ? "text-ink" : active ? "text-ink" : "text-ink-mute",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4.5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-250",
                      done
                        ? "border-live bg-live text-[#06140c]"
                        : active
                          ? "border-accent-bright bg-accent-soft"
                          : "border-line-strong",
                    )}
                  >
                    {done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{missionStep.checklistLabel}</span>
                  {done && <span className="sr-only">complete</span>}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToStep(stepIndex - 1)}
                disabled={stepIndex === 0}
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back
              </Button>
              <span className="font-mono text-[11.5px] text-ink-mute tnum">
                {mission.steps.filter((s) => validateStep(s, decisions[s.id]).valid).length} /{" "}
                {mission.steps.length} complete
              </span>
            </div>

            <Button onClick={() => void advance()} disabled={!canContinue} loading={saving}>
              {isLastStep ? "Complete mission" : "Continue"}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>

          {/* Explains the disabled button rather than leaving it inert and mute. */}
          {!outcome.valid && !error && (
            <p className="mt-3 text-[11.5px] text-ink-mute">{outcome.message}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ── Mission rail ──────────────────────────────────────────────────────────── */

function MissionRail({ className }: { className?: string }) {
  const campaign = useBuildStore((s) => s.campaign);
  const decisions = useBuildStore((s) => s.build.decisions);
  const currentMissionId = useBuildStore((s) => s.missionId);
  const currentIndex = missionIndex(campaign, currentMissionId);

  return (
    <Panel className={cn("sticky top-6 p-4", className)}>
      <PanelTitle>Campaign</PanelTitle>
      <nav aria-label="Missions" className="mt-3 flex flex-col gap-3">
        {campaign.levels.map((level) => (
          <div key={level.id}>
            <p className="px-1 font-mono text-[10px] uppercase tracking-wider text-ink-mute">
              {level.title}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {level.missionIds.map((id) => {
                const mission = missionById(campaign, id);
                if (!mission) return null;

                const index = missionIndex(campaign, id);
                const done = mission.steps.every((s) => validateStep(s, decisions[s.id]).valid);
                const active = id === currentMissionId;
                const locked = index > currentIndex && !done;

                return (
                  <li key={id}>
                    <div
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12px]",
                        active && "bg-accent-soft text-accent-text",
                        !active && done && "text-ink-dim",
                        !active && !done && "text-ink-mute",
                      )}
                    >
                      <span aria-hidden className="shrink-0">
                        {done ? (
                          <Check className="size-3.5 text-live" strokeWidth={2.5} />
                        ) : locked ? (
                          <Lock className="size-3" />
                        ) : (
                          <Circle className="size-3 fill-current" />
                        )}
                      </span>
                      <span className="truncate">{mission.tagline}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </Panel>
  );
}

/* ── Step tracker ──────────────────────────────────────────────────────────── */

function StepTracker({
  steps,
  activeIndex,
  decisions,
  onSelect,
  className,
}: {
  steps: Step[];
  activeIndex: number;
  decisions: Record<string, string | number>;
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-wrap gap-2", className)}>
      {steps.map((step, index) => {
        const done = validateStep(step, decisions[step.id]).valid;
        const active = index === activeIndex;
        // Only answered steps and the current one are reachable — you can't skip
        // ahead past a decision the next one depends on.
        const reachable = done || index <= activeIndex;

        return (
          <li key={step.id} className="flex-1 basis-40">
            <button
              type="button"
              onClick={() => reachable && onSelect(index)}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              className={cn(
                "w-full rounded-(--radius-control) border px-3 py-2 text-left transition-colors duration-250",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                reachable ? "cursor-pointer" : "cursor-not-allowed",
                active
                  ? "border-accent-bright bg-accent-soft"
                  : done
                    ? "border-live-line bg-live-soft"
                    : "border-line bg-surface-2",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "font-mono text-[10px] tnum",
                    active ? "text-accent-text" : done ? "text-live" : "text-ink-mute",
                  )}
                >
                  {index + 1}
                </span>
                {done && <Check className="size-3 text-live" strokeWidth={3} aria-hidden />}
              </span>
              <span
                className={cn(
                  "mt-0.5 block truncate text-[11.5px]",
                  active ? "text-accent-text" : done ? "text-ink-dim" : "text-ink-mute",
                )}
              >
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export type { Mission };
