import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias from tsconfig.json (native since Vite 7).
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on import outside a React Server Component. It is a
      // build-time guard for the app, not a runtime dependency — stub it so the
      // server modules it protects can still be unit-tested.
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
