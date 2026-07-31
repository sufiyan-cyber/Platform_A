import { cn } from "@/lib/cn";
import { initialsFor } from "@/lib/handle";

/**
 * How the signed-in developer is shown, in one place.
 *
 * Before this, two surfaces disagreed: the account bar printed a raw handle over
 * a full email address, and the build header printed the bare handle alone under
 * the campaign name, where it read like a subtitle rather than an identity.
 *
 * The email is deliberately demoted rather than removed — knowing *which* account
 * you're in matters, but it's reference information, not a headline. It truncates
 * with the full value on hover, so a long address can't push the layout around.
 */

export function Avatar({
  handle,
  className,
}: {
  handle: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        "border border-accent-line bg-accent-soft font-display font-semibold text-accent-text",
        className,
      )}
    >
      {initialsFor(handle)}
    </span>
  );
}

export function UserBadge({
  handle,
  email,
  compact,
  className,
}: {
  handle: string;
  /** Omitted in compact contexts, where there's no room and no need. */
  email?: string;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <Avatar handle={handle} className="size-[18px] text-[8.5px]" />
        <span className="truncate text-[11px] text-ink-mute">{handle}</span>
      </span>
    );
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar handle={handle} className="size-9 text-[12.5px]" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-medium text-ink">{handle}</span>
        {email && (
          <span
            title={email}
            className="block max-w-[180px] truncate text-[11px] text-ink-mute sm:max-w-[220px]"
          >
            {email}
          </span>
        )}
      </span>
    </span>
  );
}
