import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Cpu, Sparkles, Thermometer } from "lucide-react";
import { loadSharedBuild, type SharedAgentView } from "@/server/share";
import { CampaignIcon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { ShareChat } from "@/components/share/share-chat";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

/**
 * The public receipt for a launched agent.
 *
 * No session, no cookie, no auth. It resolves an unguessable token to a
 * hand-built projection (see src/server/share.ts) — so the page physically
 * cannot render something the owner didn't publish.
 *
 * `noindex` because the token is the only thing protecting it: a link its owner
 * pasted in a DM should not turn up in a search result.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await safeLoad(params);
  if (!view) return { title: "Link not found", robots: { index: false, follow: false } };

  return {
    title: view.agentName,
    description: `${view.agentName} — an AI agent built decision by decision on Agent Forge.`,
    robots: { index: false, follow: false },
  };
}

async function safeLoad(params: Props["params"]): Promise<SharedAgentView | null> {
  const { token } = await params;
  try {
    return await loadSharedBuild(token);
  } catch {
    // Any failure to resolve is the same thing to a visitor: no such link.
    return null;
  }
}

export default async function SharedAgentPage({ params }: Props) {
  const { token } = await params;
  const view = await safeLoad(params);
  if (!view) notFound();

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[380px] aurora" />

      <div className="relative mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-(--radius-control) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-bright"
          >
            <div className="grid size-8 place-items-center rounded-[9px] bg-linear-to-br from-accent-bright to-accent font-display text-[15px] font-bold text-white">
              F
            </div>
            <div className="leading-tight">
              <p className="font-display text-[15px] font-semibold">Agent Forge</p>
              <p className="text-[11px] text-ink-mute">Guided agent engineering</p>
            </div>
          </Link>

          <Button asChild size="sm" variant="subtle">
            <Link href="/">
              Build your own
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </header>

        <main id="main" className="mt-10">
          {/* ── Hero ────────────────────────────────────────────────────── */}
          <Panel className="relative overflow-hidden p-6 sm:p-8">
            <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-60" />

            <div className="relative flex flex-wrap items-start gap-5">
              <div className="grid size-12 shrink-0 place-items-center rounded-(--radius-card) border border-accent-line bg-accent-soft">
                <CampaignIcon iconKey={view.campaign.iconKey} className="size-6 text-accent-text" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="label-caps">Built on Agent Forge</p>
                <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold sm:text-[32px]">
                  {view.agentName}
                </h1>
                <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-dim">
                  {view.campaign.tagline}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Chip tone="live">
                    <span aria-hidden className="size-1.5 rounded-full bg-live" />
                    live on Lyzr
                  </Chip>
                  <Chip>
                    <Cpu className="size-3" aria-hidden />
                    {view.config.model}
                  </Chip>
                  <Chip>
                    <Thermometer className="size-3" aria-hidden />
                    temp {view.config.temperature}
                  </Chip>
                  {/* Hidden at zero: a public page that boasts "0 XP" reads as
                      broken rather than modest. */}
                  {view.xp > 0 && (
                    <Chip tone="accent">
                      <Sparkles className="size-3" aria-hidden />
                      {view.xp}/{view.xpTotal} XP
                    </Chip>
                  )}
                </div>

                <p className="mt-4 text-[12px] text-ink-mute">
                  Built by <span className="font-medium text-ink-dim">{view.builderHandle}</span> ·
                  launched{" "}
                  <time dateTime={view.launchedAt}>
                    {new Date(view.launchedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </p>
              </div>
            </div>
          </Panel>

          {/* ── Chat + config ───────────────────────────────────────────── */}
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <ShareChat
              token={token}
              agentName={view.agentName}
              enabled={view.chat.enabled}
              remaining={view.chat.remaining}
              grounded={view.campaign.grounded}
            />

            <div className="flex flex-col gap-5">
              <Panel className="p-4">
                <PanelTitle>What it&rsquo;s for</PanelTitle>
                <dl className="mt-3 flex flex-col gap-3 text-[12.5px] leading-relaxed">
                  <div>
                    <dt className="text-ink-mute">Role</dt>
                    <dd className="mt-0.5 text-ink-dim">{view.config.role}</dd>
                  </div>
                  <div className="border-t border-line pt-3">
                    <dt className="text-ink-mute">Goal</dt>
                    <dd className="mt-0.5 text-ink-dim">{view.config.goal}</dd>
                  </div>
                </dl>
              </Panel>

              <Panel className="overflow-hidden">
                <div className="border-b border-line px-4 py-3.5">
                  <PanelTitle>The decisions behind it</PanelTitle>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-mute">
                    Every one of these was a separate question, asked one at a time.
                  </p>
                </div>
                <ol className="divide-y divide-line">
                  {view.decisions.map((decision, index) => (
                    <li key={decision.stepId} className="px-4 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[10.5px] text-ink-mute tnum">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <p className="text-[12.5px] font-medium">{decision.label}</p>
                      </div>
                      <p className="mt-1 line-clamp-4 pl-6 text-[11.5px] leading-relaxed whitespace-pre-line text-ink-mute">
                        {decision.value}
                      </p>
                    </li>
                  ))}
                </ol>
              </Panel>

              <Panel className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                  <PanelTitle>Its instructions</PanelTitle>
                  {view.config.memory && (
                    <span className="font-mono text-[10px] text-ink-mute">memory on</span>
                  )}
                </div>
                <pre className="max-h-96 overflow-auto p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-mute">
                  {view.config.instructions}
                </pre>
              </Panel>
            </div>
          </div>

          {/* ── CTA ─────────────────────────────────────────────────────── */}
          <Panel inset className="mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold">
                {view.campaign.outcome}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-dim">
                Same campaign, about {view.decisions.length} decisions. No agent code to write.
              </p>
            </div>
            <Button asChild>
              <Link href="/">
                Start building
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </Panel>
        </main>
      </div>
    </div>
  );
}
