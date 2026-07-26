import type { ParamSchema } from "@/lib/templates/types";
import type { ParamValues } from "./types";
import type { ExtractedSlots } from "./slots";

/** Build the key→value object a component receives as its `params` prop. */
export function paramsToValues(params: ParamSchema[]): ParamValues {
  return Object.fromEntries(params.map((p) => [p.key, p.default]));
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (typeof min === "number") v = Math.max(min, v);
  if (typeof max === "number") v = Math.min(max, v);
  return v;
}

/**
 * Map extracted slots onto a template's param schema, returning a NEW schema
 * with updated `default` values (the schema itself is the record; defaults are
 * the filled values the UI/renderer reads). Positional by type:
 *   - quoted text → the first `text` param
 *   - colours     → `color` params in order
 *   - numbers     → `number` params in order (clamped to min/max)
 *
 * NOTE: `duration`-type params are intentionally NOT filled from the prompt.
 * A prompt's "4 seconds" almost always means the total clip length (which the
 * Mini tier can't change — that's fixed by the template), and forcing it onto a
 * sub-animation duration (e.g. a rise/wipe) positionally produces motion that
 * never settles. Duration slots are still extracted for the paid tiers to use.
 */
export function fillParams(
  schema: ParamSchema[],
  slots: ExtractedSlots,
): ParamSchema[] {
  const out = schema.map((p) => ({ ...p }));

  if (slots.text) {
    const t = out.find((p) => p.type === "text");
    if (t) t.default = slots.text;
  }

  const colorParams = out.filter((p) => p.type === "color");
  slots.colors.forEach((c, i) => {
    if (colorParams[i]) colorParams[i].default = c;
  });

  const numberParams = out.filter((p) => p.type === "number");
  slots.numbers.forEach((n, i) => {
    const p = numberParams[i];
    if (p) p.default = clamp(n, p.min, p.max);
  });

  return out;
}
