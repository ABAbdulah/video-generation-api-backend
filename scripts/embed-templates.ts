/**
 * Populate the `embedding` column for every template.
 * Idempotent — just re-updates. Uses Gemini when GEMINI_API_KEY is set,
 * otherwise the deterministic offline embedding.
 *
 *   pnpm embed:templates
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { embed, usingRealEmbeddings } from "@/lib/ai/embeddings";

async function main() {
  const rows = await db
    .select({ id: templates.id, title: templates.title, prompt: templates.prompt })
    .from(templates);

  for (const row of rows) {
    const vec = await embed(`${row.title}\n${row.prompt}`, "RETRIEVAL_DOCUMENT");
    await db.update(templates).set({ embedding: vec }).where(eq(templates.id, row.id));
  }

  console.log(
    `Embedded ${rows.length} templates using ${
      usingRealEmbeddings() ? "Gemini" : "offline"
    } embeddings.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
