/**
 * Seed the built-in template corpus into the database (idempotent — upserts on
 * slug). Validates first; refuses to write anything if any template is invalid.
 *
 *   pnpm db:seed
 *
 * Env is loaded via node's --env-file (see package.json) so DATABASE_URL is
 * present before @/lib/db is evaluated on import.
 */
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { SEED_TEMPLATES } from "@/lib/templates/seed";
import { validateTemplateCode } from "@/lib/templates/validate";

async function main() {
  // Gate: never seed invalid code.
  const invalid = SEED_TEMPLATES.filter(
    (t) => !validateTemplateCode(t.code, t.params, t.durationInFrames).ok,
  );
  if (invalid.length > 0) {
    console.error(
      `Refusing to seed: ${invalid.length} invalid template(s): ${invalid
        .map((t) => t.slug)
        .join(", ")}`,
    );
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;

  for (const t of SEED_TEMPLATES) {
    const values = {
      slug: t.slug,
      title: t.title,
      prompt: t.prompt,
      category: t.category,
      code: t.code,
      params: t.params,
      durationInFrames: t.durationInFrames,
      fps: t.fps,
      status: "approved" as const,
    };

    const result = await db
      .insert(templates)
      .values(values)
      .onConflictDoUpdate({ target: templates.slug, set: values })
      .returning({ createdAt: templates.createdAt, updatedAt: templates.updatedAt });

    const row = result[0];
    if (row && row.createdAt.getTime() === row.updatedAt.getTime()) inserted++;
    else updated++;
  }

  console.log(
    `Seeded ${SEED_TEMPLATES.length} templates (${inserted} inserted, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
