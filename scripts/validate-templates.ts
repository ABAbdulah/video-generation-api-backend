/**
 * Validate every seed template against the validation gate.
 * Runs in CI and before seeding. Exits non-zero on the first bad template.
 *
 *   pnpm validate:templates
 */
import { SEED_TEMPLATES } from "@/lib/templates/seed";
import { validateTemplateCode } from "@/lib/templates/validate";

let failed = 0;
const seenSlugs = new Set<string>();

for (const t of SEED_TEMPLATES) {
  const problems: string[] = [];

  if (seenSlugs.has(t.slug)) problems.push(`duplicate slug "${t.slug}"`);
  seenSlugs.add(t.slug);

  const result = validateTemplateCode(t.code, t.params, t.durationInFrames);
  problems.push(...result.errors);

  if (problems.length > 0) {
    failed++;
    console.error(`✗ ${t.slug} (${t.category})`);
    for (const p of problems) console.error(`    - ${p}`);
  } else {
    console.log(`✓ ${t.slug} (${t.category})`);
  }
}

const categories = new Set(SEED_TEMPLATES.map((t) => t.category));
console.log(
  `\n${SEED_TEMPLATES.length} templates across ${categories.size} categories, ${failed} failing.`,
);

if (failed > 0) process.exit(1);
