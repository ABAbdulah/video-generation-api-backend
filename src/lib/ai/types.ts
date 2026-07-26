import type { ParamSchema } from "@/lib/templates/types";

/** The single envelope every model/tier returns (spec §5). */
export interface GenerationEnvelope {
  code: string;
  durationInFrames: number;
  fps: number;
  params: ParamSchema[];
  reasoning?: string;
}

/** What the caller hands to generate(). */
export interface GenerationRequest {
  prompt: string;
  imageUrl?: string;
}

/** Extra metadata the local (Mini) tier attaches so the UI can be honest. */
export interface MiniResult extends GenerationEnvelope {
  source: "template-fill" | "closest-fallback";
  templateSlug: string;
  similarity: number;
  /** User-facing note when we fell back below the confidence threshold. */
  note?: string;
}

/** A concrete key→value map passed to a component as its `params` prop. */
export type ParamValues = Record<string, string | number>;
