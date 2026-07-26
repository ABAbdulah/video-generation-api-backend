/**
 * Slot extraction for the Mini tier: pull concrete values out of a prompt with
 * regex + heuristics (no LLM call), to fill a retrieved template's params.
 *
 * Deliberately simple and predictable. It won't understand everything — that's
 * what the paid tiers are for — but it reliably captures the obvious knobs:
 * quoted text, colours (hex or named), numbers, and durations.
 */
export interface ExtractedSlots {
  colors: string[]; // normalized #rrggbb, in order of appearance
  numbers: number[]; // standalone numbers, in order
  durationFrames?: number;
  text?: string; // quoted content, if any
}

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  green: "#22c55e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  indigo: "#6366f1",
  purple: "#a855f7",
  violet: "#8b5cf6",
  pink: "#ec4899",
  gold: "#d4af37",
  silver: "#c0c0c0",
  gray: "#6b7280",
  grey: "#6b7280",
};

const HEX_RE = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function normalizeHex(hex: string): string {
  let h = hex.toLowerCase();
  if (h.length === 4) {
    h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

export function extractSlots(prompt: string, fps = 60): ExtractedSlots {
  const colors: string[] = [];

  // hex colours
  for (const m of prompt.matchAll(HEX_RE)) colors.push(normalizeHex(m[0]));

  // named colours (word-boundary, case-insensitive)
  const lower = prompt.toLowerCase();
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) colors.push(hex);
  }

  // duration: frames win over seconds if both present
  const FRAME_RE = /(\d+)\s*frames?\b/i;
  const SEC_RE = /(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i;
  let durationFrames: number | undefined;
  const frameMatch = prompt.match(FRAME_RE);
  const secMatch = prompt.match(SEC_RE);
  if (frameMatch) durationFrames = parseInt(frameMatch[1], 10);
  else if (secMatch) durationFrames = Math.round(parseFloat(secMatch[1]) * fps);

  // quoted text
  const quoted = prompt.match(/["'“”‘’]([^"'“”‘’]{1,80})["'“”‘’]/);
  const text = quoted ? quoted[1].trim() : undefined;

  // standalone numbers — strip hex AND duration phrases first, so "#123456"
  // and the "4" in "4 seconds" don't leak in as generic numbers.
  const numbers: number[] = [];
  const stripped = prompt
    .replace(HEX_RE, " ")
    .replace(/(\d+)\s*frames?\b/gi, " ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/gi, " ");
  for (const m of stripped.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    numbers.push(Number(m[0]));
  }

  return { colors: dedupe(colors), numbers, durationFrames, text };
}
