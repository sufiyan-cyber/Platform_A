import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client.
 *
 * Prisma 7 requires a driver adapter, and we pick it from the shape of
 * DATABASE_URL. Both adapters are installed so moving from the zero-setup local
 * default to a hosted Postgres (required on Vercel — serverless filesystems are
 * ephemeral, so SQLite silently loses data there) is an env-var change plus the
 * one-line `provider` swap in prisma/schema.prisma. Nothing in application code
 * moves.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

function createAdapter() {
  const isPostgres = /^postgres(ql)?:\/\//i.test(DATABASE_URL);

  if (isPostgres) {
    return new PrismaPg({ connectionString: DATABASE_URL });
  }

  // Skipped during `next build`, where NODE_ENV is production but no request
  // will ever be served by this process.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    console.warn(
      "[db] Using SQLite in production. On serverless hosts the filesystem is " +
        "ephemeral and progress WILL be lost between invocations — point " +
        "DATABASE_URL at Postgres and set provider = \"postgresql\" in prisma/schema.prisma.",
    );
  }

  return new PrismaBetterSqlite3({ url: DATABASE_URL });
}

/**
 * Next's dev server re-evaluates modules on every hot reload; without the global
 * cache that leaks a connection pool per reload until the driver refuses handles.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
