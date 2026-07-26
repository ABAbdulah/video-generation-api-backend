import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { embed } from "@/lib/ai/embeddings";
import type { ParamSchema, TemplateCategory } from "./types";

export interface RetrievedTemplate {
  id: string;
  slug: string;
  title: string;
  category: TemplateCategory;
  code: string;
  params: ParamSchema[];
  durationInFrames: number;
  fps: number;
  /** Cosine similarity in [-1, 1]; higher is closer. */
  similarity: number;
}

export interface RetrieveOpts {
  k?: number;
  minSimilarity?: number;
  approvedOnly?: boolean;
}

/**
 * Top-k nearest templates to `query` by cosine similarity over pgvector.
 * Used by the Mini tier (M5) and as RAG few-shot exemplars on every paid tier (M7).
 */
export async function retrieveTemplates(
  query: string,
  opts: RetrieveOpts = {},
): Promise<RetrievedTemplate[]> {
  const { k = 3, minSimilarity = 0, approvedOnly = true } = opts;
  const qvec = await embed(query, "RETRIEVAL_QUERY");
  const distance = cosineDistance(templates.embedding, qvec);

  const conds = [isNotNull(templates.embedding)];
  if (approvedOnly) conds.push(eq(templates.status, "approved"));

  const rows = await db
    .select({
      id: templates.id,
      slug: templates.slug,
      title: templates.title,
      category: templates.category,
      code: templates.code,
      params: templates.params,
      durationInFrames: templates.durationInFrames,
      fps: templates.fps,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(templates)
    .where(and(...conds))
    .orderBy(distance)
    .limit(k);

  return rows
    .map((r) => ({
      ...r,
      slug: r.slug as string,
      category: r.category as TemplateCategory,
      params: r.params as ParamSchema[],
      similarity: Number(r.similarity),
    }))
    .filter((r) => r.similarity >= minSimilarity);
}
