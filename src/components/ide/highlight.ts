import type { TokenClass } from "@/campaigns/types";

/**
 * Syntax highlighting, at exactly the size this product needs.
 *
 * Three tiny tokenisers instead of a highlighting library: the editor holds one
 * format we designed ourselves plus two read-only previews we generate, so a
 * general-purpose grammar engine would be several hundred kilobytes of browser
 * download to colour text whose shape we already know.
 *
 * Colours come from the same `TokenClass` palette the artifact panel uses, so
 * the file in the editor and the config in the guided flow read as one product.
 */

export type Piece = { text: string; cls: TokenClass };

export type Language = "agent" | "json" | "markdown" | "plain";

/**
 * The header of a field block. Kept in sync with the parser's own `HEADER` in
 * src/lib/agent-source.ts — if these two ever disagree, the file would be
 * coloured as something other than what it means.
 */
const HEADER = /^\[([A-Za-z0-9_.-]+)\][ \t]*(#.*)?$/;

/**
 * Colours a whole document at once rather than a line at a time, because the
 * agent format is context-sensitive: `# something` is a comment in the preamble
 * and *content* inside a field block. Showing pasted policy text in comment grey
 * would be a lie about what the agent is going to be told.
 */
export function highlightDocument(text: string, language: Language): Piece[][] {
  const lines = text.split("\n");

  switch (language) {
    case "agent":
      return highlightAgent(lines);
    case "json":
      return lines.map(highlightJsonLine);
    case "markdown":
      return lines.map(highlightMarkdownLine);
    case "plain":
      return lines.map((line) => [{ text: line, cls: "plain" as TokenClass }]);
  }
}

function highlightAgent(lines: string[]): Piece[][] {
  let inBlock = false;

  return lines.map((line) => {
    const header = HEADER.exec(line);

    if (header) {
      inBlock = true;
      const [, id, comment] = header;
      const pieces: Piece[] = [
        { text: "[", cls: "punc" },
        { text: id!, cls: "fn" },
        { text: "]", cls: "punc" },
      ];
      if (comment) {
        const gap = line.slice(line.indexOf("]") + 1, line.lastIndexOf(comment));
        if (gap) pieces.push({ text: gap, cls: "plain" });
        pieces.push({ text: comment, cls: "cmt" });
      }
      return pieces;
    }

    // Before the first header the file is ours to annotate; after it, every line
    // belongs to a field and is shown as the value it is.
    if (!inBlock && line.trimStart().startsWith("#")) {
      return [{ text: line, cls: "cmt" as TokenClass }];
    }

    return [{ text: line, cls: inBlock ? ("str" as TokenClass) : ("plain" as TokenClass) }];
  });
}

const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}[\],])/g;

function highlightJsonLine(line: string): Piece[] {
  // The generated payload carries `//` notes above the body — JSON with comments,
  // the way an editor's own generated files usually are.
  if (line.trimStart().startsWith("//")) return [{ text: line, cls: "cmt" }];

  const pieces: Piece[] = [];
  let cursor = 0;

  for (const match of line.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push({ text: line.slice(cursor, index), cls: "plain" });

    const [whole, quoted, colon, literal, numeric, punctuation] = match;

    if (quoted) {
      // A quoted string followed by a colon is a key, and keys are the thing
      // you scan a payload for.
      pieces.push({ text: quoted, cls: colon ? "prop" : "str" });
      if (colon) pieces.push({ text: colon, cls: "punc" });
    } else if (literal) {
      pieces.push({ text: literal, cls: "kw" });
    } else if (numeric) {
      pieces.push({ text: numeric, cls: "kw" });
    } else if (punctuation) {
      pieces.push({ text: punctuation, cls: "punc" });
    }

    cursor = index + whole.length;
  }

  if (cursor < line.length) pieces.push({ text: line.slice(cursor), cls: "plain" });
  return pieces.length > 0 ? pieces : [{ text: line, cls: "plain" }];
}

function highlightMarkdownLine(line: string): Piece[] {
  if (/^\s*<!--/.test(line)) return [{ text: line, cls: "cmt" }];
  if (/^#{1,6}\s/.test(line)) return [{ text: line, cls: "fn" }];
  if (/^\s*[-*]\s/.test(line)) {
    const marker = line.slice(0, line.indexOf(line.trim()[0]!) + 1);
    return [
      { text: marker, cls: "punc" },
      { text: line.slice(marker.length), cls: "plain" },
    ];
  }
  if (/^\s*\d+\.\s/.test(line)) return [{ text: line, cls: "plain" }];
  if (/^\s*>/.test(line)) return [{ text: line, cls: "cmt" }];
  return [{ text: line, cls: "plain" }];
}
