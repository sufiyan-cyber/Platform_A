import { defineConfig } from "prisma/config";

/**
 * Prisma 7 keeps the connection string out of schema.prisma. DATABASE_URL is
 * read here (server-only, never bundled) and defaults to a local SQLite file so
 * `npm run setup` works with zero external services.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
