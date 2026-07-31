import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/server/db";
import { authSecret, env } from "@/server/env";
import { AppError } from "@/lib/api-error";
import { handleFromEmail } from "@/lib/handle";

/**
 * Identity.
 *
 * Deliberately minimal: a developer claims an email, we mint a signed httpOnly
 * cookie, and progress is keyed to the resulting user row. No passwords are
 * handled, stored, or transmitted — which keeps this build free of credential
 * handling entirely while still satisfying "progress survives a re-login".
 *
 * This is the one seam intended to be replaced: swap `signIn` for your IdP's
 * callback and everything downstream (`requireUser`, every route, the whole
 * flow) keeps working unchanged, because they only ever ask for a user id.
 */

const COOKIE_NAME = "af_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  email: string;
  handle: string;
};

/** Creates (or reuses) the user row and sets the session cookie. */
export async function signIn(rawEmail: string): Promise<SessionUser> {
  const email = rawEmail.trim().toLowerCase();

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, handle: handleFromEmail(email) },
  });

  const token = await new SignJWT({ email: user.email, handle: user.handle })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(authSecret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return { id: user.id, email: user.email, handle: user.handle };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Reads the current user, or null. Never throws — a tampered, expired, or
 * missing cookie all mean the same thing to callers: nobody is signed in.
 */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, authSecret());
    const id = payload.sub;
    if (!id) return null;

    // Verify against the DB rather than trusting the cookie's copy: the row is
    // the authority, and this also catches users deleted since sign-in.
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return null;

    return { id: user.id, email: user.email, handle: user.handle };
  } catch {
    return null;
  }
}

/** Route-handler guard. Throws the 401 that `handler()` turns into JSON. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new AppError("unauthorized");
  return user;
}
