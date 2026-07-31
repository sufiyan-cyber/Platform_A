// Test stub for the `server-only` package.
//
// In the app, importing `server-only` from a client component is a build error —
// that guard is what keeps LYZR_API_KEY out of the browser bundle. Under Vitest
// there are no server/client boundaries, so the real package's unconditional
// throw would just make server modules untestable. Aliased in vitest.config.ts.
export {};
