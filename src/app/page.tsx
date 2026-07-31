import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import { getUser } from "@/server/auth";
import { isLyzrConfigured } from "@/server/env";
import { SignInForm } from "@/components/auth/sign-in-form";
import { CAMPAIGNS } from "@/campaigns";
import { totalXp } from "@/campaigns/types";

export default async function LandingPage() {
  const user = await getUser();
  if (user) redirect("/campaigns");

  const playable = CAMPAIGNS.filter((c) => !c.locked);
  const xpAvailable = playable.reduce((sum, c) => sum + totalXp(c), 0);

  return (
    <main id="main" className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 aurora" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] grid-noise" />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-[9px] bg-linear-to-br from-accent-bright to-accent font-display text-[15px] font-bold text-white">
            F
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold">Agent Forge</p>
            <p className="text-[11px] text-ink-mute">Guided agent engineering</p>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:py-20">
          {/* ── Pitch ─────────────────────────────────────────────────────── */}
          <div className="max-w-[62ch]">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1.5 font-mono text-[11px] text-accent-text">
              <Sparkles className="size-3.5" aria-hidden />
              Season 1 · {playable.length} campaigns · {xpAvailable} XP
            </p>

            <h1 className="text-balance font-display text-[38px] leading-[1.08] font-semibold sm:text-[52px]">
              Build a real AI agent,
              <br />
              <span className="text-accent-text">one decision at a time.</span>
            </h1>

            <p className="mt-6 text-pretty text-[15px] leading-relaxed text-ink-dim">
              You never write an agent from scratch here. Each step asks for exactly one thing,
              explains the trade-off behind it, and drops your answer into a config that grows as
              you go. At the end it deploys — and you&rsquo;re talking to the agent you just built.
            </p>

            <ul className="mt-9 grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Terminal,
                  title: "One decision per step",
                  body: "No wall of fields. Boilerplate is handled for you.",
                },
                {
                  icon: Sparkles,
                  title: "Guidance, not hand-holding",
                  body: "The trade-off and the common mistakes, at the moment you choose.",
                },
                {
                  icon: ShieldCheck,
                  title: "It actually runs",
                  body: "Your decisions become a live agent on Lyzr you can chat with.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-(--radius-card) border border-line bg-surface/70 p-4">
                  <Icon className="size-4 text-accent-text" strokeWidth={1.75} aria-hidden />
                  <p className="mt-2.5 font-display text-[13.5px] font-semibold">{title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">{body}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Sign in ───────────────────────────────────────────────────── */}
          <div className="rounded-(--radius-panel) border border-line bg-surface/90 p-6 backdrop-blur-sm sm:p-7">
            <h2 className="font-display text-[19px] font-semibold">Start building</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
              Your progress, decisions and XP are saved against this address — close the tab and
              come back whenever.
            </p>

            <SignInForm className="mt-6" />

            <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-mute">
              <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              No password, and none is ever asked for. The address identifies your saved progress,
              nothing more.
            </p>

            {!isLyzrConfigured && (
              <p className="mt-4 rounded-(--radius-control) border border-warn/30 bg-warn-soft px-3.5 py-3 text-[12px] leading-relaxed text-warn">
                This deployment has no <span className="font-mono">LYZR_API_KEY</span> set. You can
                walk the whole flow, but launching a live agent will be unavailable until it&rsquo;s
                added.
              </p>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-5 text-[11.5px] text-ink-mute">
          <span>Agents execute on Lyzr.</span>
          <a
            href="https://docs.lyzr.ai/enterprise/get-started/quickstart"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-accent-text underline-offset-4 hover:underline"
          >
            Read their docs
            <ArrowRight className="size-3" aria-hidden />
          </a>
        </footer>
      </div>
    </main>
  );
}
