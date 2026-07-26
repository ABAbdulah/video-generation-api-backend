/**
 * Downloads Chrome Headless Shell into node_modules/.remotion at Docker BUILD
 * time (see the Dockerfile). Run standalone, it's also the way to pre-warm a
 * fresh dev machine: `node scripts/ensure-browser.mjs`.
 *
 * Deliberately dependency-free and outside the TS build: it runs before the
 * app source is even copied into the image.
 */
import { ensureBrowser } from "@remotion/renderer";

const status = await ensureBrowser({
  logLevel: "info",
  onBrowserDownload: () => ({
    version: null,
    onProgress: ({ percent }) => {
      // One line per 10% — Docker build logs don't render carriage returns.
      const pct = Math.round(percent * 100);
      if (pct % 10 === 0) console.log(`  chrome headless shell: ${pct}%`);
    },
  }),
});

console.log(`chrome ready: ${status.type}${"path" in status ? ` (${status.path})` : ""}`);
