import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { getOrCreateBuild } from "@/server/builds";
import { getCampaign } from "@/campaigns";
import { isStage } from "@/lib/flow";
import { isBuildMode, MODE_COOKIE, MODE_PARAM, type BuildMode } from "@/lib/mode";
import { BuildStoreProvider } from "@/store/build-provider";
import { BuildWorkspace } from "@/components/build/build-workspace";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { campaignId } = await params;
  const campaign = getCampaign(campaignId);
  return { title: campaign?.name ?? "Build" };
}

/**
 * Server entry for the guided flow.
 *
 * The build is loaded (or created) here and handed to the client store as
 * initial state, so the first paint already shows the developer exactly where
 * they left off — no loading flash, no client-side fetch waterfall on the most
 * important screen in the product.
 */
export default async function BuildPage({ params, searchParams }: Props) {
  const { campaignId } = await params;

  const user = await getUser();
  if (!user) redirect("/");

  const campaign = getCampaign(campaignId);
  if (!campaign || campaign.locked) notFound();

  const build = await getOrCreateBuild(user.id, campaign.id);

  // An explicit, valid `?stage=` wins over the saved position: that's what makes
  // a shared link, a bookmark, and the browser's back button all land where the
  // reader expects. Anything unrecognised is ignored rather than trusted, and
  // with no param at all we resume exactly where they left off.
  const query = await searchParams;
  const stage = isStage(query.stage) ? query.stage : build.stage;

  return (
    <BuildStoreProvider campaign={campaign} build={{ ...build, stage }} mode={await resolveMode(query)}>
      <BuildWorkspace handle={user.handle} />
    </BuildStoreProvider>
  );
}

/**
 * Guided screens or the editor, decided before the first byte of HTML.
 *
 * The URL wins so a link can name the surface it means; the cookie is the
 * fallback so a developer who chose the editor last week doesn't get dropped
 * back into the guided flow. Resolving it here rather than in a client effect is
 * what stops the wrong shell rendering for a frame on every load.
 */
async function resolveMode(
  query: Record<string, string | string[] | undefined>,
): Promise<BuildMode> {
  const requested = query[MODE_PARAM];
  if (isBuildMode(requested)) return requested;

  const remembered = (await cookies()).get(MODE_COOKIE)?.value;
  return isBuildMode(remembered) ? remembered : "guided";
}
