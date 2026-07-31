"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/states";

/**
 * The share link as a scannable code.
 *
 * Exists for one reason: a URL nobody will type becomes "point your phone at
 * this" — which turns a link into something an audience actually uses.
 *
 * Two deliberate choices:
 *
 *   1. **Dark modules on white**, inside a white plate, rather than inverted to
 *      match the dark UI. Inverted codes scan unreliably on a lot of phone
 *      cameras, and a code that looks on-brand but fails to scan is worse than
 *      an ugly one that works.
 *   2. **`qrcode` is imported dynamically**, inside the effect. It's ~50KB and
 *      needed on exactly one panel behind a toggle, so it stays out of the main
 *      bundle until someone asks for it.
 */
export function ShareQr({ url }: { url: string }) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);

    void (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        // Rendered at 2x the display size so it stays crisp, and at error
        // correction "M" — enough redundancy to survive a phone camera at an
        // angle across a room without bloating the module count.
        //
        // `margin: 2` rather than the library's tighter default: the QR spec
        // wants a quiet zone around the code, and scanners genuinely fail
        // without one. Combined with the white plate below it there's ample
        // clear space, and 192px display keeps each module ~5px, which is what
        // makes it scannable from a few feet rather than only up close.
        const dataUrl = await toDataURL(url, {
          width: 384,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#08080c", light: "#ffffff" },
        });
        if (alive) setSrc(dataUrl);
      } catch {
        // Never a blank box: the URL above it is still copyable, so this
        // degrades to "use the link" rather than to a broken-looking panel.
        if (alive) setFailed(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [url]);

  if (failed) {
    return (
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-mute">
        Couldn&rsquo;t render a QR code here — the link above still works.
      </p>
    );
  }

  return (
    <div className="mt-2.5 flex flex-col items-center gap-2 rounded-(--radius-card) border border-line bg-surface-2 p-3">
      {/* Sized identically to the image so nothing shifts when it arrives. */}
      {src ? (
        <img
          src={src}
          alt={`QR code linking to ${url}`}
          width={192}
          height={192}
          className="size-48 rounded-[6px] bg-white p-1.5"
        />
      ) : (
        <Skeleton className="size-48 rounded-[6px]" />
      )}
      <p className="text-[10.5px] text-ink-mute">Scan to open on a phone</p>
    </div>
  );
}
