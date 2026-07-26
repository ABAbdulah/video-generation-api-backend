/**
 * MANUAL smoke test for the paid tiers (Milestone 7). Costs real money
 * (a few cents) — deliberately NOT part of the vitest suite, which strips
 * provider keys to stay deterministic and free.
 *
 *   pnpm smoke:llm            # runs Starter + Best
 *   pnpm smoke:llm pro        # also runs Pro (Opus-class, priciest)
 *
 * Requires OPENROUTER_API_KEY (and/or GEMINI_API_KEY) in .env.local.
 */
import { generate } from "@/lib/ai/generate";
import { validateTemplateCode } from "@/lib/templates/validate";
import { getModelByTier } from "@/lib/ai/models";
import type { Tier } from "@/lib/ai/contract";

const PROMPT =
  'A bold kinetic headline reading "Ship It Today" in #FF0055 with a subtle light sweep';

async function run(tier: Tier) {
  const model = getModelByTier(tier)!;
  const started = Date.now();
  process.stdout.write(`→ ${tier} (${model.id}) ... `);
  try {
    const env = await generate(model.id, { prompt: PROMPT });
    const v = validateTemplateCode(env.code, env.params, env.durationInFrames);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `${v.ok ? "OK" : "INVALID"} in ${secs}s — ${env.durationInFrames}f @ ${env.fps}fps, ` +
        `${env.params.length} params, ${env.code.length} chars of code` +
        (v.ok ? "" : `\n  validator: ${v.errors.join("; ")}`),
    );
    if (process.env.SMOKE_VERBOSE) console.log(env.code);
  } catch (e) {
    console.log(`FAILED — ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const tiers: Tier[] = ["starter", "best"];
if (process.argv.includes("pro")) tiers.push("pro");
for (const t of tiers) await run(t);
