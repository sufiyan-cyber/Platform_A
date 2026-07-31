import { handler } from "@/server/http";
import { db } from "@/server/db";
import { isLyzrConfigured } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness. Deliberately leaks nothing: booleans only, no key fragments, no
 * connection strings, no error text from the database.
 *
 * The UI uses `lyzr` to decide whether to show the "add your key" banner up
 * front rather than letting a developer reach the launch screen and fail there.
 */
export function GET() {
  return handler<{ database: boolean; lyzr: boolean }>(async () => {
    let database = false;
    try {
      await db.$queryRaw`SELECT 1`;
      database = true;
    } catch (error) {
      console.error("[health] database check failed:", error);
    }

    return { database, lyzr: isLyzrConfigured };
  });
}
