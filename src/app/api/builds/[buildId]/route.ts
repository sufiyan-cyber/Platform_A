import { handler } from "@/server/http";
import { requireUser } from "@/server/auth";
import { loadOwnedBuild, type BuildState } from "@/server/builds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ buildId: string }> };

/** Re-reads the authoritative build state — used to reconcile after a refresh. */
export function GET(_request: Request, { params }: Params) {
  return handler<{ build: BuildState }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    return { build: await loadOwnedBuild(user.id, buildId) };
  });
}
