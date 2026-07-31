"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserBadge } from "@/components/shell/user-badge";
import { api } from "@/lib/client-api";

export function AccountBar({ handle, email }: { handle: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function signOut() {
    setPending(true);
    await api.del("/api/auth/session");
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link
        href="/campaigns"
        className="flex items-center gap-2.5 rounded-(--radius-control) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-bright"
      >
        <div className="grid size-8 place-items-center rounded-[9px] bg-linear-to-br from-accent-bright to-accent font-display text-[15px] font-bold text-white">
          F
        </div>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold">Agent Forge</p>
          <p className="text-[11px] text-ink-mute">Guided agent engineering</p>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <UserBadge handle={handle} email={email} />
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          loading={pending}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
