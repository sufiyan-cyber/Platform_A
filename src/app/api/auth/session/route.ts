import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { getUser, signIn, signOut, type SessionUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignInBody = z.object({
  email: z.string().trim().toLowerCase().email("That doesn't look like an email address."),
});

/** Current session, or null. Never 401s — "signed out" is a valid answer here. */
export function GET() {
  return handler<{ user: SessionUser | null }>(async () => ({ user: await getUser() }));
}

export function POST(request: Request) {
  return handler<{ user: SessionUser }>(async () => {
    const { email } = await parseBody(request, SignInBody);
    return { user: await signIn(email) };
  });
}

export function DELETE() {
  return handler<{ signedOut: true }>(async () => {
    await signOut();
    return { signedOut: true };
  });
}
