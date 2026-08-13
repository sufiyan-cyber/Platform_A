"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Braces,
  BookOpen,
  Check,
  CircleAlert,
  CircleDot,
  FileCode,
  MessageSquare,
  Play,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  Zap,
} from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { totalXp } from "@/campaigns/types";
import {
  analyzeAgentSource,
  appendMissingFields,
  fieldAtLine,
  fieldsByMission,
  setFieldValue,
  sourceIsDirty,
  type SourceField,
} from "@/lib/agent-source";
import { formatElapsed } from "@/lib/flow";
import {
  docsFile,
  ideFiles,
  instructionsFile,
  payloadFile,
  type IdeFileKey,
} from "@/components/ide/files";
import { CodeEditor, type CodeEditorHandle } from "@/components/ide/code-editor";
import { FieldInspector } from "@/components/ide/field-inspector";
import { ProblemsPanel } from "@/components/ide/problems-panel";
import { ModeToggle } from "@/components/build/mode-toggle";
import { Conversation } from "@/components/flow/chat-screen";
import { UserBadge } from "@/components/shell/user-badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { ErrorBlock } from "@/components/ui/states";
import { cn } from "@/lib/cn";

/**
 * The editor workspace — the second way through a campaign.
 *
 * Same build, same decisions, same launch. What changes is the shape of the
 * work: instead of being asked one question at a time you get the whole agent as
 * a file, in campaign order, and you edit whichever part you like in whatever
 * order you like. For someone who already knows what an agent config is, that is
 * the difference between being walked through a form and just writing the thing.
 *
 * Three things carry over from the guided flow rather than being reinvented, and
 * they're the reason this isn't just a textarea:
 *
 *   • Validation is the campaign's own rules, live, with the campaign's own
 *     messages — in the gutter, in Problems, and again on the server at save.
 *   • The guidance follows the cursor. Nobody trades the *why* for the file.
 *   • XP, missions, and launch behave identically, because they're computed from
 *     the decisions rather than from which screen wrote them.
 */
export function IdeShell({ handle }: { handle: string }) {
  const campaign = useBuildStore((s) => s.campaign);
  const build = useBuildStore((s) => s.build);
  const source = useBuildStore((s) => s.source);
  const launch = useBuildStore((s) => s.launch);
  const elapsedMs = useBuildStore((s) => s.elapsedMs);
  const setSourceText = useBuildStore((s) => s.setSourceText);
  const saveSource = useBuildStore((s) => s.saveSource);
  const hydrateSource = useBuildStore((s) => s.hydrateSource);
  const doLaunch = useBuildStore((s) => s.doLaunch);

  const [activeFile, setActiveFile] = React.useState<IdeFileKey>("source");
  const [caretLine, setCaretLine] = React.useState(1);
  const [problemsOpen, setProblemsOpen] = React.useState(true);
  const [sidePanel, setSidePanel] = React.useState<"field" | "run">("field");
  const [pendingLine, setPendingLine] = React.useState<number | null>(null);

  const editorRef = React.useRef<CodeEditorHandle>(null);

  React.useEffect(() => {
    if (pendingLine === null) return;
    editorRef.current?.goToLine(pendingLine);
    setPendingLine(null);
  }, [pendingLine]);

  // Restores an unsaved buffer from this browser, or regenerates the file from
  // whatever the guided screens have saved since. Effect, not initialiser:
  // localStorage doesn't exist during the server render.
  React.useEffect(() => {
    hydrateSource();
  }, [hydrateSource]);

  const analysis = React.useMemo(
    () => analyzeAgentSource(campaign, source.text),
    [campaign, source.text],
  );

  const dirty = sourceIsDirty(analysis, build.decisions);
  const activeField = fieldAtLine(analysis, caretLine);
  const validCount = analysis.fields.filter((f) => f.status === "valid").length;
  const ready = validCount === analysis.fields.length;
  const files = React.useMemo(() => ideFiles(campaign), [campaign]);
  const file = files.find((f) => f.key === activeFile) ?? files[0]!;

  const content = React.useMemo(() => {
    switch (activeFile) {
      case "payload":
        return payloadFile(campaign, analysis);
      case "instructions":
        return instructionsFile(campaign, analysis);
      case "docs":
        return docsFile(campaign);
      default:
        return source.text;
    }
  }, [activeFile, analysis, campaign, source.text]);

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const save = React.useCallback(async () => {
    const result = await saveSource();
    if (!result.ok) return false;

    const gained = result.awarded.reduce((sum, award) => sum + award.xp, 0);
    const rejected = Object.keys(result.invalid).length;

    if (gained > 0) {
      toast.success(`Saved. +${gained} XP`);
    } else if (rejected > 0) {
      toast(
        `Saved what's valid. ${rejected} field${rejected === 1 ? "" : "s"} still ${
          rejected === 1 ? "has" : "have"
        } a problem.`,
      );
    } else {
      toast.success("Saved.");
    }

    return true;
  }, [saveSource]);

  // Unsaved *text* only lives in this browser. Valid fields are already on the
  // server, so this is about the paragraph someone is mid-way through writing —
  // which is precisely the thing worth one browser dialog.
  React.useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function launchAgent() {
    if (dirty && !(await save())) return;

    const rebuild = Boolean(build.agent);
    const ok = await doLaunch({ rebuild });
    if (!ok) return;

    setSidePanel("run");
    toast.success(rebuild ? "Rebuilt. Talk to the new one." : "It's live. Talk to it.");
  }

  /**
   * Every jump — from the outline, from Problems, from an inserted starter —
   * goes through a pending line rather than touching the editor directly.
   *
   * Two reasons. The editor may be about to remount (jumping out of a generated
   * file), and the text may be about to change (an insert), so the DOM the jump
   * needs doesn't exist yet at call time. An effect runs after that commit; a
   * `requestAnimationFrame` would too, except in a background tab, where no
   * frames are painted and the jump would simply never arrive.
   */
  function goToLine(line: number) {
    setActiveFile("source");
    setPendingLine(line);
  }

  function insert(stepId: string, value: string) {
    const next = setFieldValue(campaign, source.text, stepId, value);
    setSourceText(next);

    const field = analyzeAgentSource(campaign, next).fields.find((f) => f.step.id === stepId);
    if (field?.section) goToLine(field.section.headerLine);
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[240px] aurora opacity-60" />

      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
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

          <div className="flex items-center gap-4">
            <ModeToggle />
            <div className="hidden flex-col items-end leading-tight sm:flex">
              <span className="label-caps">Elapsed</span>
              <span className="mt-0.5 font-mono text-[15px] font-semibold text-live tnum">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
            <div className="flex flex-col items-end leading-tight">
              <span className="label-caps">XP</span>
              <span className="mt-0.5 inline-flex items-baseline gap-1 font-mono text-[15px] font-semibold text-accent-text tnum">
                <Zap className="size-3.5 self-center" aria-hidden />
                {build.xp}
                <span className="text-[11px] font-normal text-ink-mute">/ {totalXp(campaign)}</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="relative mx-auto w-full max-w-[1600px] px-4 pb-16 sm:px-6">
        {/*
          Three regions, each rendered exactly once and placed with grid
          coordinates rather than duplicated behind responsive visibility — the
          outline and the guidance would otherwise appear twice in the
          accessibility tree. Narrow screens get the same regions stacked in
          reading order: file, guidance, outline.
        */}
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[214px_minmax(0,1fr)_340px]">
          <OutlineRail
            onSelect={goToLine}
            activeStepId={activeField?.step.id}
            fields={analysis.fields}
            className="order-3 xl:order-none xl:col-start-1 xl:row-start-1"
          />

          <div className="order-1 flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-1">
            <Panel className="overflow-hidden">
              {/* ── Tabs ───────────────────────────────────────────────── */}
              <div
                role="tablist"
                aria-label="Files"
                className="flex overflow-x-auto border-b border-line bg-surface-2"
              >
                {files.map((entry) => {
                  const active = entry.key === activeFile;
                  const Icon = FILE_ICON[entry.key];
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveFile(entry.key)}
                      className={cn(
                        "inline-flex shrink-0 cursor-pointer items-center gap-2 border-r border-line px-3.5 py-2.5",
                        "font-mono text-[11.5px] transition-colors duration-200",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-bright",
                        active
                          ? "bg-code text-ink"
                          : "text-ink-mute hover:bg-surface-3 hover:text-ink-dim",
                      )}
                    >
                      <Icon
                        className={cn("size-3.5", active ? "text-accent-text" : "text-ink-mute")}
                        aria-hidden
                      />
                      {entry.name}
                      {entry.key === "source" && dirty && (
                        <span
                          aria-label="unsaved changes"
                          className="size-1.5 rounded-full bg-accent-bright"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="border-b border-line bg-code px-4 py-2 text-[11.5px] leading-relaxed text-ink-mute">
                {file.note}
              </p>

              <CodeEditor
                key={file.key}
                ref={editorRef}
                value={content}
                language={file.language}
                readOnly={file.readOnly}
                label={file.name}
                onChange={setSourceText}
                onSave={() => void save()}
                onCaretLine={setCaretLine}
                markers={file.key === "source" ? analysis.diagnostics : undefined}
                className="h-[min(58dvh,620px)] min-h-[320px]"
              />

              {file.key === "source" && (
                <ProblemsPanel
                  diagnostics={analysis.diagnostics}
                  open={problemsOpen}
                  onToggle={() => setProblemsOpen((open) => !open)}
                  onSelect={goToLine}
                  canAddMissing={analysis.fields.some((f) => f.status === "missing")}
                  onAddMissing={() => {
                    setSourceText(appendMissingFields(campaign, source.text));
                    toast("Missing fields appended at the end of the file.");
                  }}
                />
              )}

              {/* ── Status bar ─────────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface-2 px-3 py-2">
                <span className="font-mono text-[11px] text-ink-mute tnum">Ln {caretLine}</span>

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 font-mono text-[11px] tnum",
                    ready ? "text-live" : "text-ink-mute",
                  )}
                >
                  {ready ? (
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  ) : (
                    <CircleAlert className="size-3.5" aria-hidden />
                  )}
                  {validCount}/{analysis.fields.length} fields valid
                </span>

                <span className="font-mono text-[11px] text-ink-mute">
                  {source.saving
                    ? "Saving…"
                    : dirty
                      ? "Unsaved changes"
                      : source.lastSavedAt
                        ? "Saved"
                        : "In sync"}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => void save()}
                    loading={source.saving}
                    disabled={!dirty}
                  >
                    <Save className="size-3.5" aria-hidden />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void launchAgent()}
                    loading={launch.pending}
                    disabled={!ready}
                    title={ready ? undefined : "Every field has to be valid first."}
                  >
                    {build.agent ? (
                      <RefreshCw className="size-3.5" aria-hidden />
                    ) : (
                      <Rocket className="size-3.5" aria-hidden />
                    )}
                    {build.agent ? "Rebuild" : "Launch"}
                  </Button>
                </div>
              </div>
            </Panel>

            {source.error && (
              <ErrorBlock error={source.error} onRetry={source.error.retryable ? () => void save() : undefined} />
            )}
            {launch.error && (
              <ErrorBlock
                error={launch.error}
                onRetry={launch.error.retryable ? () => void launchAgent() : undefined}
              />
            )}
          </div>

          {/* ── Side panel ───────────────────────────────────────────────── */}
          <div className="order-2 flex min-w-0 flex-col gap-3 xl:col-start-3 xl:row-start-1">
            <div role="tablist" aria-label="Side panel" className="flex gap-1">
              <SideTab
                active={sidePanel === "field"}
                onClick={() => setSidePanel("field")}
                icon={BookOpen}
                label="Field"
              />
              <SideTab
                active={sidePanel === "run"}
                onClick={() => setSidePanel("run")}
                icon={MessageSquare}
                label={build.agent ? "Run" : "Run · not live"}
              />
            </div>

            {sidePanel === "field" ? (
              <FieldInspector field={activeField} onInsert={insert} onJump={goToLine} />
            ) : build.agent ? (
              <Conversation
                buildId={build.id}
                agentName={build.agent.name}
                grounded={campaign.retrieval?.kind === "web"}
                onEscalated={() =>
                  toast.success("Handed off. The record is on the finale screen in guided mode.")
                }
              />
            ) : (
              <Panel className="p-4">
                <PanelTitle>Run</PanelTitle>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-mute">
                  {ready
                    ? "Every field is valid. Launch creates the real agent on Lyzr and the conversation opens right here."
                    : `${analysis.fields.length - validCount} field${
                        analysis.fields.length - validCount === 1 ? "" : "s"
                      } still ${
                        analysis.fields.length - validCount === 1 ? "has" : "have"
                      } a problem. Fix them and this becomes a live chat.`}
                </p>
                <Button
                  size="sm"
                  className="mt-3.5 w-full"
                  onClick={() => void launchAgent()}
                  loading={launch.pending}
                  disabled={!ready}
                >
                  <Play className="size-3.5" aria-hidden />
                  Launch agent
                </Button>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const FILE_ICON: Record<IdeFileKey, typeof FileCode> = {
  source: FileCode,
  payload: Braces,
  instructions: ScrollText,
  docs: BookOpen,
};

/* ── Outline ───────────────────────────────────────────────────────────────── */

/**
 * The file's structure, grouped by the mission each field belongs to.
 *
 * Missions are the campaign's own unit of progress — the thing XP is banked
 * against — so the outline keeps them visible even though the editor lets you
 * work in any order at all.
 */
function OutlineRail({
  fields,
  activeStepId,
  onSelect,
  className,
}: {
  fields: SourceField[];
  activeStepId?: string;
  onSelect: (line: number) => void;
  className?: string;
}) {
  const campaign = useBuildStore((s) => s.campaign);
  const completed = useBuildStore((s) => s.build.completedMissionIds);

  const groups = React.useMemo(() => fieldsByMission(campaign, fields), [campaign, fields]);

  return (
    <Panel className={cn("p-4 xl:sticky xl:top-20", className)}>
      <PanelTitle>Outline</PanelTitle>
      <nav aria-label="Fields" className="mt-3 flex flex-col gap-3.5">
        {groups.map((group) => (
          <div key={group.missionId}>
            <p className="flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-wider text-ink-mute">
              {completed.includes(group.missionId) && (
                <Check className="size-3 text-live" strokeWidth={3} aria-hidden />
              )}
              {group.title}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {group.fields.map((field) => {
                const active = field.step.id === activeStepId;
                return (
                  <li key={field.step.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(field.line)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1.5",
                        "font-mono text-[11.5px] transition-colors duration-200",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                        active
                          ? "bg-accent-soft text-accent-text"
                          : "text-ink-mute hover:bg-surface-2 hover:text-ink-dim",
                      )}
                    >
                      <StatusDot status={field.status} />
                      <span className="truncate">{field.step.id}</span>
                    </button>
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

function StatusDot({ status }: { status: SourceField["status"] }) {
  if (status === "valid") {
    return <Check className="size-3 shrink-0 text-live" strokeWidth={3} aria-hidden />;
  }
  if (status === "missing") {
    return <CircleDot className="size-3 shrink-0 text-warn" aria-hidden />;
  }
  return <CircleAlert className="size-3 shrink-0 text-danger" aria-hidden />;
}

function SideTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-(--radius-control)",
        "border px-3 py-2 text-[12px] font-semibold transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
        active
          ? "border-accent-line bg-accent-soft text-accent-text"
          : "border-line bg-surface-2 text-ink-mute hover:text-ink",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
