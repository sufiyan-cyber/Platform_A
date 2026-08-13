"use client";

import * as React from "react";
import type { TokenClass } from "@/campaigns/types";
import { highlightDocument, type Language, type Piece } from "@/components/ide/highlight";
import { cn } from "@/lib/cn";

/**
 * The editor.
 *
 * A transparent `<textarea>` sitting exactly on top of a highlighted render of
 * the same text — which is how you get real editing (native caret, selection,
 * undo, IME, spellcheck control, screen-reader support) with syntax colour on
 * top, in a few hundred lines and no dependency.
 *
 * Alignment between the two layers is the whole trick, so it is enforced rather
 * than hoped for: identical font, identical padding, and a fixed
 * `LINE_HEIGHT` applied to both layers. Every soft-wrapping opportunity is
 * removed (`wrap="off"`, `white-space: pre`) because a wrapped line would put
 * the caret one row away from its own text and desynchronise the gutter.
 *
 * What this deliberately does *not* do: hijack Tab. This codebase is keyboard
 * operable end to end, and swallowing the key that leaves a control to save two
 * spaces of indentation in a format that has no indentation would be a bad
 * trade. Ctrl/Cmd+S saves; everything else is the platform's own text editing.
 */

/** Both layers use this exact value. Changing one and not the other misaligns the caret. */
const LINE_HEIGHT = 21;

const TOKEN_COLOR: Record<TokenClass, string> = {
  kw: "text-[#c792ea]",
  str: "text-[#d7d9e6]",
  fn: "text-[#a78bfa]",
  prop: "text-[#82aaff]",
  punc: "text-[#6a6a85]",
  cmt: "text-[#6f9470]", // 5.7:1 on --color-code
  plain: "text-ink-dim",
};

export type EditorMarker = {
  /** 1-based. */
  line: number;
  severity: "error" | "warning";
};

export type CodeEditorHandle = {
  focus: () => void;
  /** Puts the caret on a line, selects it, and scrolls it into view. */
  goToLine: (line: number) => void;
};

export const CodeEditor = React.forwardRef<
  CodeEditorHandle,
  {
    value: string;
    language?: Language;
    onChange?: (value: string) => void;
    onSave?: () => void;
    /** Reports the 1-based line the caret is on, for the field inspector. */
    onCaretLine?: (line: number) => void;
    markers?: EditorMarker[];
    readOnly?: boolean;
    label: string;
    className?: string;
  }
>(function CodeEditor(
  { value, language = "agent", onChange, onSave, onCaretLine, markers, readOnly, label, className },
  ref,
) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [caretLine, setCaretLine] = React.useState(1);

  const lines = React.useMemo(() => highlightDocument(value, language), [value, language]);

  const markerFor = React.useMemo(() => {
    const map = new Map<number, "error" | "warning">();
    for (const marker of markers ?? []) {
      // An error on a line outranks a warning on the same line.
      if (marker.severity === "error" || !map.has(marker.line)) map.set(marker.line, marker.severity);
    }
    return map;
  }, [markers]);

  const reportCaret = React.useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    const line = element.value.slice(0, element.selectionStart).split("\n").length;
    setCaretLine(line);
    onCaretLine?.(line);
  }, [onCaretLine]);

  React.useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    goToLine: (line: number) => {
      const element = textareaRef.current;
      const scroller = scrollRef.current;

      if (scroller) {
        // Land the target a third of the way down rather than at the very top —
        // a line pinned to the edge of the viewport reads as "somewhere above
        // here" instead of "here".
        const target = (line - 1) * LINE_HEIGHT - scroller.clientHeight / 3;
        scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      }

      if (!element) return;

      const all = element.value.split("\n");
      const start = all.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0);
      const end = start + (all[line - 1]?.length ?? 0);

      element.focus({ preventScroll: true });
      element.setSelectionRange(start, end);
      setCaretLine(line);
      onCaretLine?.(line);
    },
  }));

  const padding = "py-3 pl-4 pr-10";

  return (
    <div
      ref={scrollRef}
      // Read-only files have no textarea to focus, so the scroll container
      // itself becomes the keyboard-reachable region — otherwise the generated
      // payload and instruction previews would be unreadable without a mouse.
      {...(readOnly ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
      className={cn("relative overflow-auto bg-code", className)}
    >
      <div className="flex min-h-full min-w-max">
        {/*
          The gutter rides *inside* the horizontal scroll container and stays
          pinned with `sticky`, so line numbers remain readable while a long
          pasted line scrolls sideways underneath them — and vertical sync needs
          no JavaScript at all, because both columns are in the same scroller.
        */}
        <div
          aria-hidden
          className={cn(
            "sticky left-0 z-20 shrink-0 select-none border-r border-line bg-code",
            "py-3 pr-2.5 pl-3 text-right font-mono text-[12px] text-ink-mute tnum",
          )}
          style={{ lineHeight: `${LINE_HEIGHT}px` }}
        >
          {lines.map((_, index) => {
            const line = index + 1;
            const severity = markerFor.get(line);
            return (
              <div
                key={line}
                style={{ height: LINE_HEIGHT }}
                className={cn(
                  "relative pl-3",
                  severity === "error" && "text-danger",
                  severity === "warning" && "text-warn",
                  !severity && line === caretLine && !readOnly && "text-ink-dim",
                )}
              >
                {severity && (
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full",
                      severity === "error" ? "bg-danger" : "bg-warn",
                    )}
                  />
                )}
                {line}
              </div>
            );
          })}
        </div>

        <div className="relative min-w-max flex-1">
          <pre
            // Hidden from assistive tech only when the textarea above it carries
            // the same text; on a read-only file this *is* the content.
            aria-hidden={!readOnly}
            className={cn("min-w-max font-mono text-[12.5px]", padding)}
            style={{ lineHeight: `${LINE_HEIGHT}px`, tabSize: 2 }}
          >
            {lines.map((pieces, index) => {
              const line = index + 1;
              const severity = markerFor.get(line);
              return (
                <div
                  key={line}
                  style={{ height: LINE_HEIGHT }}
                  className={cn(
                    "-mx-4 whitespace-pre px-4",
                    severity === "error" && "bg-danger-soft/70",
                    severity === "warning" && "bg-warn-soft/50",
                    !severity && !readOnly && line === caretLine && "bg-surface-2/50",
                  )}
                >
                  {pieces.length === 0 ? (
                    " "
                  ) : (
                    pieces.map((piece, pieceIndex) => (
                      <PieceView key={pieceIndex} piece={piece} />
                    ))
                  )}
                </div>
              );
            })}
          </pre>

          {!readOnly && (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => {
                onChange?.(event.target.value);
                reportCaret();
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                  event.preventDefault();
                  onSave?.();
                  return;
                }
                // Arrow keys move the caret *after* the default action, so the
                // active-line highlight is read on the next frame.
                requestAnimationFrame(reportCaret);
              }}
              onClick={reportCaret}
              onSelect={reportCaret}
              onFocus={reportCaret}
              aria-label={label}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              wrap="off"
              className={cn(
                "absolute inset-0 block h-full w-full resize-none overflow-hidden whitespace-pre",
                "border-0 bg-transparent font-mono text-[12.5px] text-transparent outline-none",
                padding,
              )}
              style={{
                lineHeight: `${LINE_HEIGHT}px`,
                tabSize: 2,
                caretColor: "var(--color-accent-bright)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

function PieceView({ piece }: { piece: Piece }) {
  return <span className={TOKEN_COLOR[piece.cls]}>{piece.text}</span>;
}

export { LINE_HEIGHT };
