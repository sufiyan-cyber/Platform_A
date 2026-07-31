import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-md rounded-(--radius-panel) border border-line bg-surface p-7 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-(--radius-card) border border-line bg-surface-2">
          <Compass className="size-5 text-ink-mute" aria-hidden />
        </div>

        <h1 className="mt-5 font-display text-[21px] font-semibold">Nothing here.</h1>
        <p className="mx-auto mt-2.5 max-w-[40ch] text-[13px] leading-relaxed text-ink-dim">
          That campaign doesn&rsquo;t exist, or it isn&rsquo;t open yet. Everything you&rsquo;ve
          already built is safe on the campaign list.
        </p>

        <Button asChild className="mt-7">
          <Link href="/campaigns">See campaigns</Link>
        </Button>
      </div>
    </main>
  );
}
