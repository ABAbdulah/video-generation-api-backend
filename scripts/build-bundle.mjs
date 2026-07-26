/**
 * Pre-builds the Remotion webpack bundle of the render composition at Docker
 * BUILD time, so the first production export doesn't pay ~10s of bundling
 * (and every render child process can reuse it read-only).
 *
 * Output dir is REMOTION_BUNDLE_DIR, defaulting to ./.remotion-bundle —
 * the same path src/render/render-job.ts looks for.
 */
import path from "node:path";
import { bundle } from "@remotion/bundler";

const outDir = process.env.REMOTION_BUNDLE_DIR ?? path.join(process.cwd(), ".remotion-bundle");

const result = await bundle({
  entryPoint: path.join(process.cwd(), "src/render/composition/index.ts"),
  outDir,
  onProgress: (percent) => {
    if (percent % 25 === 0) console.log(`  bundling: ${percent}%`);
  },
});

console.log(`bundle ready: ${result}`);
