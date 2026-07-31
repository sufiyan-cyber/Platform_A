import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  createShareLink,
  revokeShareLink,
  setShareChat,
  type ShareState,
} from "@/server/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ buildId: string }> };

/**
 * Owner-side control of the public link.
 *
 * All three verbs go through `createShareLink`/`revokeShareLink`/`setShareChat`,
 * which each re-check ownership themselves. The route never queries the build
 * directly, so there is no path here that could read a build the caller doesn't
 * own — the check isn't a step that could be reordered away.
 */

/** Creates the link, or returns the existing one. Safe to double-click. */
export function POST(_request: Request, { params }: Params) {
  return handler<{ share: ShareState }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    return { share: await createShareLink(user.id, buildId) };
  });
}

const PatchBody = z.object({ chatEnabled: z.boolean() });

/** Turns visitor replies on or off without touching the link itself. */
export function PATCH(request: Request, { params }: Params) {
  return handler<{ share: ShareState }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    const { chatEnabled } = await parseBody(request, PatchBody);
    return { share: await setShareChat(user.id, buildId, chatEnabled) };
  });
}

/** Revokes the link. The old URL stops resolving immediately. */
export function DELETE(_request: Request, { params }: Params) {
  return handler<{ share: ShareState }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    return { share: await revokeShareLink(user.id, buildId) };
  });
}
