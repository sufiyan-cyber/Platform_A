"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * All interactive surfaces meet the 44px touch-target minimum at `md` and above
 * in their default size; `sm` is only used inside already-generous rows.
 *
 * Press feedback is scale-only (never a layout change), and every disabled state
 * carries the semantic attribute as well as the visual treatment.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-sans font-semibold select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.98] motion-reduce:active:scale-100",
    "cursor-pointer disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-white shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_8px_24px_-8px_rgba(124,58,237,0.6)] hover:bg-accent-bright",
        outline:
          "border border-accent-line bg-accent-soft/50 text-accent-text hover:border-accent-bright hover:bg-accent-soft",
        ghost: "text-ink-dim hover:bg-surface-2 hover:text-ink",
        subtle: "border border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3",
        live: "bg-live-soft border border-live-line text-live hover:border-live",
        danger:
          "border border-danger-line bg-danger-soft text-danger hover:border-danger",
      },
      size: {
        // `sm` is 36px for pointer density, but grows to the 44px minimum on
        // touch devices — a compact row shouldn't cost anyone a mis-tap.
        sm: "h-9 pointer-coarse:h-11 rounded-[7px] px-3 text-[12.5px]",
        md: "h-11 rounded-(--radius-control) px-5 text-[13.5px]",
        lg: "h-12 rounded-(--radius-control) px-6 text-[14.5px]",
        icon: "size-11 rounded-(--radius-control)",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner and blocks interaction. Width is held so nothing jumps. */
    loading?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          {/* Label stays in flow so the button keeps its width while pending. */}
          <span className="invisible contents">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="sr-only">Working…</span>
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };
