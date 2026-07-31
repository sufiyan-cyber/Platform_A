"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Award, Check, Gift, Rocket, Sparkles, Zap } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import {
  levelForMission,
  levelXp,
  missionById,
  missionIndex,
  type Level,
} from "@/campaigns/types";
import { isReadyToLaunch, isLastMissionOfLevel } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════════
   Level intro — sets anticipation before any input is asked for.
   ═══════════════════════════════════════════════════════════════════════════ */

export function LevelIntroScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const missionId = useBuildStore((s) => s.missionId);
  const completed = useBuildStore((s) => s.build.completedMissionIds);
  const goToStage = useBuildStore((s) => s.goToStage);

  const level = levelForMission(campaign, missionId) ?? campaign.levels[0];
  if (!level) return null;

  const levelNumber = campaign.levels.indexOf(level) + 1;

  return (
    <div className="mx-auto max-w-3xl">
      <Panel className="p-6 sm:p-8">
        <p className="font-mono text-[11px] text-ink-mute">
          <span className="text-accent-text">Level {levelNumber}</span> · {level.title}
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-(--radius-card) border border-accent-line bg-accent-soft font-display text-[20px] font-bold text-accent-text tnum">
            {String(levelNumber).padStart(2, "0")}
          </div>
          <div>
            <h1 className="font-display text-[26px] leading-tight font-semibold sm:text-[30px]">
              {level.title}
            </h1>
            <p className="mt-1 max-w-[58ch] text-[13.5px] leading-relaxed text-ink-dim">
              {level.subtitle}
            </p>
          </div>
        </div>

        <ul className="mt-7 flex flex-col">
          {level.missionIds.map((id, index) => {
            const mission = missionById(campaign, id);
            if (!mission) return null;
            const done = completed.includes(id);

            return (
              <li
                key={id}
                className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[11px] tnum",
                    done
                      ? "border-live bg-live-soft text-live"
                      : "border-line bg-surface-2 text-ink-mute",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-ink">{mission.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-mute">
                    {mission.steps.length} decisions · {mission.tagline}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11.5px] text-accent-text tnum">
                  +{mission.xp} XP
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-start gap-2.5 rounded-(--radius-card) border border-accent-line bg-accent-soft p-4">
          <Gift className="mt-px size-4 shrink-0 text-accent-text" aria-hidden />
          <div>
            <p className="text-[12.5px] font-medium text-accent-text">Reward</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-dim">{level.reward}</p>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <span className="font-mono text-[12px] text-ink-mute tnum">
            {levelXp(campaign, level)} XP available in this level
          </span>
          <Button size="lg" onClick={() => goToStage("mission-preview")}>
            Start level
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Mission preview — a no-input walkthrough of the decisions coming up, so
   nothing in the editor is a surprise.
   ═══════════════════════════════════════════════════════════════════════════ */

export function MissionPreviewScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const missionId = useBuildStore((s) => s.missionId);
  const goToStage = useBuildStore((s) => s.goToStage);
  const reduceMotion = useReducedMotion();

  const mission = missionById(campaign, missionId);
  if (!mission) return null;

  const level = levelForMission(campaign, mission.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Panel className="p-6 sm:p-8">
        <p className="font-mono text-[11px] text-ink-mute">
          <span className="text-accent-text">{level?.title}</span> · Mission{" "}
          {missionIndex(campaign, mission.id) + 1} of {campaign.missions.length}
        </p>

        <h1 className="mt-3.5 font-display text-[26px] leading-tight font-semibold sm:text-[30px]">
          {mission.title}
        </h1>
        <p className="mt-2.5 max-w-[66ch] text-[14px] leading-relaxed text-ink-dim">
          {mission.description}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Chip tone="accent">
            <Zap className="size-3" aria-hidden />+{mission.xp} XP
          </Chip>
          <Chip tone="warn">{mission.difficulty}</Chip>
          <Chip>~{mission.estMinutes} min</Chip>
          <Chip>{mission.steps.length} decisions</Chip>
        </div>

        <div className="mt-7">
          <PanelTitle>What you&rsquo;ll decide</PanelTitle>
          <ol className="relative mt-4 flex flex-col">
            {mission.steps.map((step, index) => (
              <motion.li
                key={step.id}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: reduceMotion ? 0 : index * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative flex gap-4 pb-5 last:pb-0"
              >
                {/* Connector rail between steps. */}
                {index < mission.steps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-8 bottom-0 left-[15px] w-px bg-line"
                  />
                )}
                <span className="relative z-1 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-mono text-[12px] text-ink-dim tnum">
                  {index + 1}
                </span>
                <div className="pt-1">
                  <p className="text-[13.5px] font-medium text-ink">{step.label}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-mute">{step.sub}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <div className="mt-7 flex justify-end border-t border-line pt-5">
          <Button size="lg" onClick={() => goToStage("mission")}>
            Begin mission
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Completion screens
   ═══════════════════════════════════════════════════════════════════════════ */

export function MissionCompleteScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const missionId = useBuildStore((s) => s.missionId);
  const xp = useBuildStore((s) => s.build.xp);
  const startNextMission = useBuildStore((s) => s.startNextMission);

  const mission = missionById(campaign, missionId);
  const next = campaign.missions[missionIndex(campaign, missionId) + 1];
  if (!mission) return null;

  return (
    <CelebrationPanel
      eyebrow="Mission complete"
      title={mission.title}
      body={
        next
          ? `Banked. Next up: ${next.title.toLowerCase()} — ${next.tagline.toLowerCase()}.`
          : "That's the last mission. Your agent is ready to build."
      }
      xpAwarded={mission.xp}
      totalXp={xp}
      icon={Sparkles}
      action={
        <Button size="lg" onClick={startNextMission}>
          {next ? "Next mission" : "Go to launch"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      }
    />
  );
}

export function LevelCompleteScreen() {
  const campaign = useBuildStore((s) => s.campaign);
  const missionId = useBuildStore((s) => s.missionId);
  const xp = useBuildStore((s) => s.build.xp);
  const decisions = useBuildStore((s) => s.build.decisions);
  const startNextMission = useBuildStore((s) => s.startNextMission);
  const goToStage = useBuildStore((s) => s.goToStage);

  const mission = missionById(campaign, missionId);
  const level = levelForMission(campaign, missionId);
  if (!mission || !level) return null;

  const ready = isReadyToLaunch(campaign, decisions);
  const levelNumber = campaign.levels.indexOf(level) + 1;

  return (
    <CelebrationPanel
      eyebrow={`Level ${levelNumber} complete`}
      title={level.title}
      body={
        ready
          ? "Every decision is made. Your config is complete — time to make it real."
          : level.reward
      }
      xpAwarded={mission.xp}
      totalXp={xp}
      icon={Award}
      badges={campaign.levels.slice(0, levelNumber).map((l) => l.title)}
      action={
        ready ? (
          <Button size="lg" onClick={() => goToStage("launch")}>
            <Rocket className="size-4" aria-hidden />
            Launch your agent
          </Button>
        ) : (
          <Button size="lg" onClick={startNextMission}>
            Continue to Level {levelNumber + 1}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )
      }
    />
  );
}

function CelebrationPanel({
  eyebrow,
  title,
  body,
  xpAwarded,
  totalXp,
  icon: Icon,
  badges,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  xpAwarded: number;
  totalXp: number;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  badges?: string[];
  action: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="mx-auto max-w-2xl">
      <Panel className="relative overflow-hidden p-8 text-center sm:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-70" />

        <div className="relative">
          <motion.div
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            // Spring, not a curve — completion should feel physical.
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto grid size-16 place-items-center rounded-2xl border border-live-line bg-live-soft"
          >
            <Icon className="size-7 text-live" strokeWidth={1.75} aria-hidden />
          </motion.div>

          <p className="mt-6 label-caps">{eyebrow}</p>
          <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold sm:text-[32px]">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-relaxed text-ink-dim">
            {body}
          </p>

          <motion.p
            initial={reduceMotion ? false : { y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 font-mono text-[40px] font-semibold text-live tnum"
          >
            +{xpAwarded}
            <span className="ml-1.5 text-[16px] text-ink-mute">XP</span>
          </motion.p>
          <p className="mt-1 font-mono text-[12px] text-ink-mute tnum">{totalXp} XP total</p>

          {badges && badges.length > 0 && (
            <ul className="mt-6 flex flex-wrap justify-center gap-2">
              {badges.map((badge) => (
                <li key={badge}>
                  <Chip tone="accent">
                    <Award className="size-3" aria-hidden />
                    {badge}
                  </Chip>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-9 flex justify-center">{action}</div>
        </div>
      </Panel>
    </div>
  );
}

export type { Level };
export { isLastMissionOfLevel };
