"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Eye, Link2, QrCode, Trash2 } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { api } from "@/lib/client-api";
import type { ShareState } from "@/server/share";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { ShareQr } from "@/components/flow/share-qr";
import { cn } from "@/lib/cn";

/**
 * Owner-side controls for the public link.
 *
 * The copy here is deliberately blunt about what publishing exposes — the
 * instructions include the facts the developer pasted in the Grounding mission,
 * which is exactly the sort of thing someone would regret sharing by accident.
 * Saying so once, at the moment of the decision, is cheaper than a support
 * conversation later.
 *
 * `ShareState` is a *type-only* import: it carries no runtime code, so this
 * client component doesn't pull `server-only` into the browser bundle.
 */
export function SharePanel() {
  const buildId = useBuildStore((s) => s.build.id);
  const serverShare = useBuildStore((s) => s.build.share);

  const [share, setShare] = React.useState<ShareState>(serverShare);
  const [pending, setPending] = React.useState<"create" | "revoke" | "toggle" | null>(null);
  const [copied, setCopied] = React.useState(false);
  // Open by default: the QR is the point of the panel once a link exists, and on
  // a screen you're showing someone, it should already be there rather than
  // behind a click. The toggle is for collapsing it, not for finding it.
  const [qrOpen, setQrOpen] = React.useState(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Re-sync if the server's copy changes underneath us (a rebuild reloads the
  // build). Keyed on the token so local toggles aren't clobbered.
  React.useEffect(() => {
    setShare(serverShare);
  }, [serverShare]);

  // The absolute URL is built from the browser's own origin rather than an env
  // var, so it is always right — localhost in dev, the real host in production,
  // with no NEXT_PUBLIC_SITE_URL to drift.
  //
  // `window` does not exist while Next server-renders this client component, so
  // the origin arrives after mount. Until it does we show the path, which is a
  // perfectly valid href — and `copy()` reads `window` directly, since a click
  // can only happen in a browser.
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  const path = share.token ? `/a/${share.token}` : null;
  const url = path ? `${origin}${path}` : null;

  async function create() {
    setPending("create");
    const result = await api.post<{ share: ShareState }>(`/api/builds/${buildId}/share`);
    setPending(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setShare(result.data.share);
    toast.success("Public link created.");
  }

  async function revoke() {
    setPending("revoke");
    const result = await api.del<{ share: ShareState }>(`/api/builds/${buildId}/share`);
    setPending(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setShare(result.data.share);
    toast.success("Link revoked. It stops working immediately.");
  }

  async function toggleChat() {
    const next = !share.chatEnabled;
    setPending("toggle");
    // Optimistic: this is a switch, and a switch that waits feels broken.
    setShare((current) => ({ ...current, chatEnabled: next }));
    const result = await api.patch<{ share: ShareState }>(`/api/builds/${buildId}/share`, {
      chatEnabled: next,
    });
    setPending(null);
    if (!result.ok) {
      setShare((current) => ({ ...current, chatEnabled: !next }));
      toast.error(result.error.message);
      return;
    }
    setShare(result.data.share);
  }

  async function copy() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and blocked outright in some contexts.
      // Selecting the text for them is a real fallback, not a dead end.
      inputRef.current?.select();
      toast.error("Couldn't copy automatically — the link is selected, press Ctrl/⌘+C.");
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-2">
        <PanelTitle>Share it</PanelTitle>
        {share.token && (
          <span className="font-mono text-[10px] text-ink-mute tnum">
            {share.chatUsed}/{share.chatLimit} messages used
          </span>
        )}
      </div>

      {!share.token ? (
        <>
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-dim">
            Publish a read-only page anyone can open — your agent, its config, and the decisions
            behind it. They can talk to it too, if you let them.
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-mute">
            <Eye className="mt-px size-3 shrink-0" aria-hidden />
            Visible to anyone with the link, including the facts you pasted. Your email is never
            shown.
          </p>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => void create()}
            loading={pending === "create"}
            className="mt-3 w-full justify-start"
          >
            <Link2 className="size-3.5" aria-hidden />
            Create a public link
          </Button>
        </>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <label htmlFor="share-url" className="sr-only">
              Public link to your agent
            </label>
            <input
              ref={inputRef}
              id="share-url"
              readOnly
              value={url ?? ""}
              onFocus={(event) => event.currentTarget.select()}
              className={cn(
                "min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface-2",
                "px-2.5 py-2 font-mono text-[11px] text-ink-dim",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
              )}
            />
            <Button
              size="icon"
              variant="subtle"
              onClick={() => void copy()}
              aria-label="Copy link"
              title="Copy link"
              className="size-9 shrink-0 pointer-coarse:size-11"
            >
              {copied ? (
                <Check className="size-3.5 text-live" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
            </Button>
          </div>

          {/*
            Gated on `origin`, not just on the token: before mount the URL is a
            relative path, and a QR code encoding "/a/<token>" scans to nothing.
          */}
          {origin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQrOpen((open) => !open)}
                aria-expanded={qrOpen}
                className="mt-2.5 w-full justify-start"
              >
                <QrCode className="size-3.5" aria-hidden />
                {qrOpen ? "Hide QR code" : "Show QR code"}
              </Button>
              {qrOpen && url && <ShareQr url={url} />}
            </>
          )}

          <button
            type="button"
            onClick={() => void toggleChat()}
            disabled={pending === "toggle"}
            aria-pressed={share.chatEnabled}
            className={cn(
              "mt-2.5 flex w-full cursor-pointer items-center justify-between gap-3",
              "rounded-(--radius-control) border border-line bg-surface-2 px-3 py-2.5 text-left",
              "transition-colors duration-200 hover:border-line-strong",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <span className="min-w-0">
              <span className="block text-[12px] font-medium">Let visitors chat</span>
              <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-mute">
                Capped at {share.chatLimit} messages per link
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                share.chatEnabled ? "bg-accent" : "bg-surface-3 border border-line",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white transition-[left] duration-200",
                  share.chatEnabled ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
          </button>

          <div className="mt-2.5 flex gap-2">
            <Button asChild variant="ghost" size="sm" className="flex-1 justify-center">
              <a href={path ?? "#"} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="size-3.5" aria-hidden />
                Preview
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void revoke()}
              loading={pending === "revoke"}
              className="flex-1 justify-center text-danger hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Revoke
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
