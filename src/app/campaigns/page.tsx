import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { listBuildSummaries } from "@/server/builds";
import { isLyzrConfigured } from "@/server/env";
import { CAMPAIGNS } from "@/campaigns";
import { CampaignGrid } from "@/components/flow/campaign-grid";
import { YourAgents } from "@/components/flow/your-agents";
import { AccountBar } from "@/components/shell/account-bar";

export const metadata: Metadata = { title: "Choose a campaign" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await getUser();
  if (!user) redirect("/");

  const summaries = await listBuildSummaries(user.id);

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] aurora" />

      <div className="relative mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <AccountBar handle={user.handle} email={user.email} />

        <main id="main" className="mt-12">
          <p className="label-caps">Season 1 · AI Agent Odyssey</p>
          <h1 className="mt-2.5 text-balance font-display text-[32px] leading-tight font-semibold sm:text-[38px]">
            Pick what you want to build.
          </h1>
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-ink-dim">
            Each campaign is a different shape of problem. Your progress is saved per campaign —
            leaving one to try another loses nothing.
          </p>

          {!isLyzrConfigured && (
            <div
              role="status"
              className="mt-7 rounded-(--radius-card) border border-warn/30 bg-warn-soft px-4 py-3.5 text-[12.5px] leading-relaxed text-warn"
            >
              <span className="font-semibold">Agent service not configured.</span> Every screen and
              every decision works, but the launch step and the Mentor need a{" "}
              <span className="font-mono">LYZR_API_KEY</span> in your environment.
            </div>
          )}

          {/* Renders nothing until the first launch — see YourAgents. */}
          <YourAgents campaigns={CAMPAIGNS} summaries={summaries} className="mt-9" />

          <CampaignGrid campaigns={CAMPAIGNS} summaries={summaries} className="mt-9" />
        </main>
      </div>
    </div>
  );
}
