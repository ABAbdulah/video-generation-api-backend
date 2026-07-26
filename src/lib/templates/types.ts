/**
 * The AI-authored control schema. Every tunable value a template exposes is one
 * ParamSchema entry; the UI renders a control from it and the component reads
 * the value from `params[key]` — nothing tunable is ever hardcoded in the code.
 * The same shape is what the model must emit alongside generated code (spec §5).
 */
export type ParamType = "text" | "color" | "number" | "select" | "duration";

export interface ParamSchema {
  key: string;
  label: string;
  type: ParamType;
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export type TemplateCategory =
  | "text"
  | "graphics"
  | "overlays"
  | "logos"
  | "social"
  | "charts-data"
  | "money"
  | "app-website"
  | "ui-elements"
  | "launch-videos";

export interface TemplateDef {
  /** Stable id used for idempotent re-seeding. */
  slug: string;
  title: string;
  prompt: string;
  category: TemplateCategory;
  durationInFrames: number;
  fps: number;
  params: ParamSchema[];
  /** Remotion component source. Must pass the validation gate. */
  code: string;
}
