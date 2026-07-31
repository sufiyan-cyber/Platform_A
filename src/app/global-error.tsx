"use client";

/**
 * Catches failures in the root layout itself, where `app/error.tsx` can't run.
 * It has to render its own <html>/<body>, and it deliberately uses inline styles
 * — if the layout failed, the stylesheet may not have loaded either.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#08080c",
          color: "#ecedf5",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0 }}>The app failed to start.</h1>
          <p style={{ color: "#a0a0b4", fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
            Your saved progress is untouched. Reload to try again — if it keeps happening, check the
            server logs.
          </p>
          {error.digest && (
            <p style={{ color: "#7c7c93", fontSize: 11, marginTop: 14, fontFamily: "monospace" }}>
              ref {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 26,
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              padding: "11px 22px",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
