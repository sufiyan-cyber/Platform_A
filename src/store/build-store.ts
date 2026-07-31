"use client";

import { createStore } from "zustand";
import type { Campaign } from "@/campaigns/types";
import { missionById, missionIndex } from "@/campaigns/types";
import type { BuildState, StoredMessage } from "@/server/builds";
import type { ApiError } from "@/lib/api-error";
import type { LyzrAgentPayload } from "@/lib/assemble";
import { api } from "@/lib/client-api";
import { validateStep } from "@/lib/validation";
import {
  activeMissionId,
  firstOpenStepIndex,
  isLastMissionOfLevel,
  isMissionComplete,
  nextMissionId,
  type Stage,
} from "@/lib/flow";

/**
 * The guided flow's client state.
 *
 * Split deliberately into two kinds of state:
 *
 *   • `build` — the server's authoritative record. Only ever replaced with what
 *     the server returned. Never optimistically edited.
 *   • `drafts` — what the developer is typing right now. Local, disposable,
 *     promoted into `build.decisions` only once the server has accepted it.
 *
 * That split is what makes the whole thing refresh-safe: `build` is exactly what
 * a reload would fetch, so there is no divergence to reconcile.
 */

export type BuildStoreState = {
  campaign: Campaign;
  build: BuildState;

  /** Raw in-progress input, keyed by step id. Strings — inputs speak strings. */
  drafts: Record<string, string>;
  fieldErrors: Record<string, string>;
  savingStepId: string | null;

  stage: Stage;
  missionId: string;
  stepIndex: number;

  elapsedMs: number;
  /** Set when a background persist fails, so the shell can surface it once. */
  syncError: ApiError | null;

  launch: {
    pending: boolean;
    error: ApiError | null;
    payload: LyzrAgentPayload | null;
  };

  mentor: {
    open: boolean;
    loaded: boolean;
    pending: boolean;
    messages: StoredMessage[];
    error: ApiError | null;
  };

  /* ── actions ──────────────────────────────────────────────────────────── */
  setDraft: (stepId: string, value: string) => void;
  commitStep: (stepId: string) => Promise<boolean>;
  goToStage: (stage: Stage, missionId?: string) => void;
  goToStep: (index: number) => void;
  advance: () => Promise<void>;
  bankMission: (missionId: string) => Promise<number>;
  startNextMission: () => void;
  doLaunch: (options?: { rebuild?: boolean }) => Promise<boolean>;
  renameAgent: (name: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  tick: (deltaMs: number) => void;
  flushElapsed: () => Promise<void>;
  clearSyncError: () => void;

  toggleMentor: (open?: boolean) => void;
  loadMentorHistory: () => Promise<void>;
  askMentor: (message: string) => Promise<void>;
};

export type BuildStore = ReturnType<typeof createBuildStore>;

/**
 * Per-mount store instance rather than a module singleton — a module-level store
 * would be shared across concurrent SSR renders, which is a cross-user data leak
 * waiting to happen.
 */
export function createBuildStore(campaign: Campaign, build: BuildState) {
  const initialMission = build.currentMissionId ?? activeMissionId(campaign, build.decisions);
  const initialStepIndex = Math.max(0, firstOpenStepIndex(campaign, initialMission, build.decisions));

  return createStore<BuildStoreState>()((set, get) => {
    /** Seeds drafts from persisted decisions so fields are pre-filled on return. */
    const draftsFromBuild = (state: BuildState): Record<string, string> => {
      const drafts: Record<string, string> = {};
      for (const [stepId, value] of Object.entries(state.decisions)) {
        drafts[stepId] = String(value);
      }
      return drafts;
    };

    const buildPath = (suffix = "") => `/api/builds/${build.id}${suffix}`;

    /** Fire-and-forget position persist. A failure here must never block the UI. */
    const persistPosition = async (patch: {
      stage?: Stage;
      currentMissionId?: string | null;
      elapsedMs?: number;
    }) => {
      const result = await api.patch<{ xp: number; completedMissionIds: string[] }>(
        buildPath("/progress"),
        patch,
      );
      if (!result.ok) set({ syncError: result.error });
    };

    return {
      campaign,
      build,
      drafts: draftsFromBuild(build),
      fieldErrors: {},
      savingStepId: null,

      stage: build.stage,
      missionId: initialMission,
      stepIndex: initialStepIndex,

      elapsedMs: build.elapsedMs,
      syncError: null,

      launch: { pending: false, error: null, payload: build.launchPayload },
      mentor: { open: false, loaded: false, pending: false, messages: [], error: null },

      /* ── decisions ──────────────────────────────────────────────────────── */

      setDraft: (stepId, value) =>
        set((state) => ({
          drafts: { ...state.drafts, [stepId]: value },
          // Clear the error the moment they start fixing it — errors are for
          // "you tried and it didn't work", not "you're mid-keystroke".
          fieldErrors: state.fieldErrors[stepId]
            ? omit(state.fieldErrors, stepId)
            : state.fieldErrors,
        })),

      commitStep: async (stepId) => {
        const state = get();
        const step = state.campaign.missions.flatMap((m) => m.steps).find((s) => s.id === stepId);
        if (!step) return false;

        const outcome = validateStep(step, state.drafts[stepId]);
        if (!outcome.valid) {
          set({ fieldErrors: { ...state.fieldErrors, [stepId]: outcome.message } });
          return false;
        }

        set({ savingStepId: stepId });

        const result = await api.put<{ stepId: string; value: string | number }>(
          buildPath("/decisions"),
          {
            stepId,
            value: outcome.value,
            stage: state.stage,
            currentMissionId: state.missionId,
            elapsedMs: Math.round(state.elapsedMs),
          },
        );

        if (!result.ok) {
          set({
            savingStepId: null,
            fieldErrors: {
              ...get().fieldErrors,
              ...(result.error.fields ?? { [stepId]: result.error.message }),
            },
            // Non-field failures (offline, 503) belong in the shell banner too.
            syncError: result.error.code === "invalid_input" ? null : result.error,
          });
          return false;
        }

        set((current) => ({
          savingStepId: null,
          fieldErrors: omit(current.fieldErrors, stepId),
          build: {
            ...current.build,
            decisions: { ...current.build.decisions, [result.data.stepId]: result.data.value },
          },
        }));

        return true;
      },

      /* ── navigation ─────────────────────────────────────────────────────── */

      goToStage: (stage, missionId) => {
        set((state) => ({
          stage,
          missionId: missionId ?? state.missionId,
          stepIndex:
            missionId && missionId !== state.missionId
              ? Math.max(0, firstOpenStepIndex(state.campaign, missionId, state.build.decisions))
              : state.stepIndex,
        }));
        void persistPosition({ stage, currentMissionId: missionId ?? get().missionId });
      },

      goToStep: (index) => {
        const mission = missionById(get().campaign, get().missionId);
        if (!mission) return;
        set({ stepIndex: Math.min(Math.max(0, index), mission.steps.length - 1) });
      },

      /**
       * Commits the current step, then moves on: next step, or — when the mission
       * is finished — into the completion screen. One entry point so the
       * "continue" button can never advance past an invalid step.
       */
      advance: async () => {
        const state = get();
        const mission = missionById(state.campaign, state.missionId);
        if (!mission) return;

        const step = mission.steps[state.stepIndex];
        if (!step) return;

        const saved = await state.commitStep(step.id);
        if (!saved) return;

        const isLastStep = state.stepIndex === mission.steps.length - 1;
        if (!isLastStep) {
          set({ stepIndex: state.stepIndex + 1 });
          return;
        }

        // Mission finished — bank XP, then show the right celebration.
        await get().bankMission(mission.id);

        const nextStage: Stage = isLastMissionOfLevel(state.campaign, mission.id)
          ? "level-complete"
          : "mission-complete";
        get().goToStage(nextStage);
      },

      /** Returns XP actually awarded (0 on replay), so the UI can stay honest. */
      bankMission: async (missionId) => {
        const result = await api.patch<{
          xp: number;
          completedMissionIds: string[];
          awarded: number;
        }>(buildPath("/progress"), {
          completeMissionId: missionId,
          elapsedMs: Math.round(get().elapsedMs),
        });

        if (!result.ok) {
          set({ syncError: result.error });
          return 0;
        }

        set((state) => ({
          build: {
            ...state.build,
            xp: result.data.xp,
            completedMissionIds: result.data.completedMissionIds,
          },
        }));

        return result.data.awarded;
      },

      startNextMission: () => {
        const state = get();
        const next = nextMissionId(state.campaign, state.missionId);

        if (!next) {
          get().goToStage("launch");
          return;
        }

        // A new level gets its own intro; another mission in the same level goes
        // straight to the preview.
        const crossesLevel = !sameLevel(state.campaign, state.missionId, next);
        get().goToStage(crossesLevel ? "level-intro" : "mission-preview", next);
      },

      /* ── launch ─────────────────────────────────────────────────────────── */

      doLaunch: async (options) => {
        set((state) => ({ launch: { ...state.launch, pending: true, error: null } }));

        const result = await api.post<{ build: BuildState; payload: LyzrAgentPayload }>(
          buildPath("/launch"),
          { rebuild: options?.rebuild ?? false },
        );

        if (!result.ok) {
          set((state) => ({ launch: { ...state.launch, pending: false, error: result.error } }));
          return false;
        }

        set({
          build: result.data.build,
          launch: { pending: false, error: null, payload: result.data.payload },
          stage: "chat",
        });
        return true;
      },

      renameAgent: async (name) => {
        const result = await api.patch<{ build: BuildState }>(buildPath("/launch"), { name });
        if (!result.ok) {
          set({ syncError: result.error });
          return false;
        }
        set({ build: result.data.build });
        return true;
      },

      /* ── sync ───────────────────────────────────────────────────────────── */

      refresh: async () => {
        const result = await api.get<{ build: BuildState }>(buildPath());
        if (!result.ok) {
          set({ syncError: result.error });
          return;
        }
        set((state) => ({
          build: result.data.build,
          drafts: { ...draftsFromBuild(result.data.build), ...state.drafts },
          syncError: null,
        }));
      },

      tick: (deltaMs) => set((state) => ({ elapsedMs: state.elapsedMs + deltaMs })),

      flushElapsed: async () => {
        await persistPosition({ elapsedMs: Math.round(get().elapsedMs) });
      },

      clearSyncError: () => set({ syncError: null }),

      /* ── mentor ─────────────────────────────────────────────────────────── */

      toggleMentor: (open) => {
        const next = open ?? !get().mentor.open;
        set((state) => ({ mentor: { ...state.mentor, open: next } }));
        if (next && !get().mentor.loaded) void get().loadMentorHistory();
      },

      loadMentorHistory: async () => {
        const result = await api.get<{ messages: StoredMessage[] }>(buildPath("/mentor"));
        if (!result.ok) {
          set((state) => ({ mentor: { ...state.mentor, loaded: true, error: result.error } }));
          return;
        }

        set((state) => ({
          mentor: {
            ...state.mentor,
            loaded: true,
            // Merge rather than replace. Someone can send a message before this
            // request lands, and overwriting would silently swallow it — the
            // history is older than anything already on screen, never newer.
            messages: mergeMessages(result.data.messages, state.mentor.messages),
          },
        }));
      },

      askMentor: async (message) => {
        const state = get();
        const mission = missionById(state.campaign, state.missionId);
        const step = mission?.steps[state.stepIndex];

        // Echo the developer's message immediately; it's their own text, so
        // showing it before the round trip is always safe.
        const localEcho: StoredMessage = {
          id: `local-${Date.now()}`,
          role: "user",
          content: message,
          createdAt: new Date().toISOString(),
        };

        set((current) => ({
          mentor: {
            ...current.mentor,
            pending: true,
            error: null,
            messages: [...current.mentor.messages, localEcho],
          },
        }));

        const result = await api.post<{ user: StoredMessage; reply: StoredMessage }>(
          buildPath("/mentor"),
          {
            message,
            stage: state.stage,
            missionId: state.missionId,
            ...(step ? { stepId: step.id } : {}),
          },
        );

        if (!result.ok) {
          set((current) => ({
            mentor: { ...current.mentor, pending: false, error: result.error },
          }));
          return;
        }

        set((current) => ({
          mentor: {
            ...current.mentor,
            pending: false,
            error: null,
            // Swap the echo for the server's canonical rows.
            messages: [
              ...current.mentor.messages.filter((m) => m.id !== localEcho.id),
              result.data.user,
              result.data.reply,
            ],
          },
        }));
      },
    };
  });
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function omit(record: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/**
 * Server history first, then anything the client added that the server hasn't
 * echoed back yet (optimistic sends, and messages whose upstream call failed).
 */
export function mergeMessages(
  fromServer: StoredMessage[],
  current: StoredMessage[],
): StoredMessage[] {
  const known = new Set(fromServer.map((m) => m.id));
  return [...fromServer, ...current.filter((m) => !known.has(m.id))];
}

function sameLevel(campaign: Campaign, a: string, b: string): boolean {
  const levelA = campaign.levels.find((l) => l.missionIds.includes(a));
  const levelB = campaign.levels.find((l) => l.missionIds.includes(b));
  return Boolean(levelA && levelB && levelA.id === levelB.id);
}

/** Re-exported for components that need mission ordering without importing types. */
export { missionIndex, isMissionComplete };
