import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getOrCreateBuild, type BuildState } from "@/server/builds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ campaignId: z.string().min(1) });

/**
 * Enter a campaign. Idempotent: returns the existing build if there is one, so
 * the flow can call it unconditionally on mount without worrying about
 * duplicating progress.
 */
export function POST(request: Request) {
  return handler<{ build: BuildState }>(async () => {
    const user = await requireUser();
    const { campaignId } = await parseBody(request, Body);
    return { build: await getOrCreateBuild(user.id, campaignId) };
  });
}
