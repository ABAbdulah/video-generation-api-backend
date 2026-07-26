/**
 * Embedding façade.
 *
 * Provider is chosen at call time:
 *   - GEMINI_API_KEY set  → real Gemini embeddings (gemini-embedding-001 @ 768d)
 *   - otherwise           → deterministic offline embedding (feature hashing)
 *
 * Both return an L2-normalized number[] of length EMBEDDING_DIM, so cosine
 * distance behaves correctly against the pgvector HNSW `vector_cosine_ops` index
 * regardless of which provider produced the vector. gemini-embedding-001 does
 * NOT auto-normalize when truncated below 3072 dims, so we normalize manually.
 *
 * The offline path gives real lexical-overlap similarity (shared words → higher
 * cosine), which is enough to build, seed, and test the whole retrieval + Mini
 * pipeline with no API key. Add the key for production-grade semantic quality —
 * no other code changes needed.
 */
export const EMBEDDING_DIM = 768;
export const EMBEDDING_MODEL = "gemini-embedding-001";

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export function usingRealEmbeddings(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function embed(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_QUERY",
): Promise<number[]> {
  return usingRealEmbeddings()
    ? geminiEmbed(text, taskType)
    : localEmbed(text);
}

// --- normalization ---------------------------------------------------------

function l2normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

// --- offline provider: signed feature hashing ------------------------------

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function localEmbed(text: string): number[] {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  for (const tok of tokens) {
    const idx = fnv1a(tok) % EMBEDDING_DIM;
    const sign = fnv1a(tok + "") & 1 ? 1 : -1;
    vec[idx] += sign;
  }
  return l2normalize(vec);
}

// --- real provider: Gemini -------------------------------------------------

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
}

async function geminiEmbed(
  text: string,
  taskType: EmbedTaskType,
): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIM,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini embed failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as GeminiEmbedResponse;
  const values = json.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIM) {
    throw new Error(
      `Gemini embed returned ${values?.length ?? 0} dims, expected ${EMBEDDING_DIM}`,
    );
  }
  // Manual L2 normalization is required for 001 below 3072 dims.
  return l2normalize(values);
}
